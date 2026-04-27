from __future__ import annotations

import json
import re
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path


def _load_graphify() -> None:
    python_hint = Path("graphify-out/.graphify_python")
    if python_hint.exists():
        sys.path.append(str(Path(python_hint.read_text().strip()).parent.parent / "Lib" / "site-packages"))


_load_graphify()

from networkx.readwrite import json_graph

from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.cluster import cluster, score_all
from graphify.export import to_html
from graphify.report import generate
from graphify.wiki import to_wiki


GENERIC_SEGMENTS = {
    "",
    "app",
    "page",
    "layout",
    "route",
    "edit",
}

ROOT_PRIORITY = {
    "api": "API",
    "hr": "HR",
    "me": "Me",
}


def _split_words(text: str) -> list[str]:
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    text = text.replace("-", " ").replace("_", " ")
    return [part for part in text.split() if part]


def _normalize_segment(segment: str) -> str | None:
    if not segment:
        return None
    if segment.startswith("(") and segment.endswith(")"):
        inner = segment[1:-1].strip()
        return inner if inner and inner != "app" else None
    if segment.startswith("[") and segment.endswith("]"):
        inner = segment[1:-1].strip()
        return " ".join(_split_words(inner)) if inner else None

    stem = Path(segment).stem
    if stem.lower() in GENERIC_SEGMENTS:
        return None

    stem = stem.replace("...", " ")
    words = _split_words(stem)
    if not words:
        return None
    joined = " ".join(words)
    return None if joined.lower() in GENERIC_SEGMENTS else joined


def _source_segments(source_file: str) -> list[str]:
    raw_parts = source_file.replace("/", "\\").split("\\")
    segments: list[str] = []
    for part in raw_parts:
        normalized = _normalize_segment(part)
        if normalized:
            segments.append(normalized)
    return segments


def _title(segment: str) -> str:
    if segment.upper() in {"API", "HR"}:
        return segment.upper()
    return " ".join(word.upper() if word.upper() == "API" else word.capitalize() for word in segment.split())


def _join_topics(topics: list[str]) -> str:
    titled = [_title(topic) for topic in topics if topic]
    if not titled:
        return ""
    if len(titled) == 1:
        return titled[0]
    if len(titled) == 2:
        return f"{titled[0]} and {titled[1]}"
    return f"{titled[0]}, {titled[1]}, and {titled[2]}"


def _single_file_label(segments: list[str]) -> str:
    if not segments:
        return "Unlabeled Community"
    if segments[0].lower() == "api":
        return _join_topics(["API", *segments[1:4]])
    return _join_topics(segments[:4])


def _fallback_file_label(source_file: str) -> str:
    normalized = source_file.replace("/", "\\")
    if normalized == "app\\layout.tsx":
        return "Root Layout"
    if normalized == "app\\page.tsx":
        return "Root Page"
    if normalized == "app\\(app)\\layout.tsx":
        return "App Layout"
    if normalized.endswith("\\route.ts"):
        return "API Route"
    if normalized.endswith("\\page.tsx"):
        return "Page"
    if normalized.endswith("\\layout.tsx"):
        return "Layout"
    return "Unlabeled Community"


def _derive_label(community_id: int, source_files: list[str]) -> str:
    if not source_files:
        return f"Community {community_id}"

    unique_files = sorted(set(source_files))
    if len(unique_files) == 1:
        segments = _source_segments(unique_files[0])
        return _single_file_label(segments) if segments else _fallback_file_label(unique_files[0])

    segment_lists = [_source_segments(source_file) for source_file in source_files]
    segment_lists = [segments for segments in segment_lists if segments]
    if not segment_lists:
        return f"Community {community_id}"

    first_counts = Counter(segments[0] for segments in segment_lists if segments)
    root, root_count = first_counts.most_common(1)[0]

    if root_count / len(segment_lists) >= 0.6:
        prefix = ROOT_PRIORITY.get(root.lower(), _title(root))
        subtopic_counts = Counter()
        for segments in segment_lists:
            if segments[0] != root:
                continue
            if len(segments) > 1:
                subtopic_counts[segments[1]] += 1
        topics = [topic for topic, _ in subtopic_counts.most_common(3) if topic.lower() != root.lower()]
        if topics:
            return f"{prefix} {_join_topics(topics)}"
        return prefix

    topics = [topic for topic, _ in first_counts.most_common(3)]
    return _join_topics(topics) or f"Community {community_id}"


def _build_communities(graph_data: dict) -> dict[int, list[str]]:
    communities: dict[int, list[str]] = defaultdict(list)
    for node in graph_data.get("nodes", []):
        community = node.get("community")
        node_id = node.get("id")
        if community is not None and node_id:
            communities[int(community)].append(node_id)
    return dict(sorted(communities.items()))


def relabel_graph(graph_dir: Path) -> dict[int, str]:
    graph_path = graph_dir / "graph.json"
    if not graph_path.exists():
        raise FileNotFoundError(f"Graph not found: {graph_path}")

    graph_data = json.loads(graph_path.read_text(encoding="utf-8"))
    communities = _build_communities(graph_data)
    graph = json_graph.node_link_graph(graph_data, edges="links")
    cohesion = score_all(graph, communities)

    source_files_by_community: dict[int, list[str]] = defaultdict(list)
    for node in graph_data.get("nodes", []):
        community = node.get("community")
        source_file = node.get("source_file")
        if community is not None and source_file:
            source_files_by_community[int(community)].append(source_file)

    labels = {
        community_id: _derive_label(community_id, source_files_by_community.get(community_id, []))
        for community_id in communities
    }

    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)
    questions = suggest_questions(graph, communities, labels)

    detection = {
        "total_files": len({source for sources in source_files_by_community.values() for source in sources}),
        "total_words": 0,
        "warning": None,
    }
    cost = {"input": 0, "output": 0}

    report = generate(
        graph,
        communities,
        cohesion,
        labels,
        gods,
        surprises,
        detection,
        cost,
        str(graph_dir.parent.resolve()),
        suggested_questions=questions,
    )
    (graph_dir / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
    to_html(graph, communities, str(graph_dir / "graph.html"), community_labels=labels)
    wiki_dir = graph_dir / "wiki"
    if wiki_dir.exists():
        try:
            shutil.rmtree(wiki_dir)
        except OSError:
            # Windows can keep generated markdown files locked briefly.
            # Best-effort cleanup is enough because to_wiki will overwrite the files it regenerates.
            pass
    to_wiki(graph, communities, wiki_dir, community_labels=labels, cohesion=cohesion, god_nodes_data=gods)
    (graph_dir / "community-labels.json").write_text(json.dumps(labels, indent=2), encoding="utf-8")
    return labels


def main() -> None:
    graph_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("app/graphify-out")
    labels = relabel_graph(graph_dir)
    print(json.dumps(labels, indent=2))


if __name__ == "__main__":
    main()
