from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.cluster import cluster, score_all
from graphify.export import to_html, to_json
from networkx.readwrite import json_graph


FILE_NODE_SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".md")
GENERIC_COMMUNITY_RE = re.compile(r"^Community \d+$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Normalize graphify output by deduplicating file nodes and reclustering."
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Project root that contains graphify-out/ (default: current directory).",
    )
    parser.add_argument(
        "--output-dir",
        default="graphify-out",
        help="Graphify output directory relative to --root (default: graphify-out).",
    )
    parser.add_argument(
        "--no-html",
        action="store_true",
        help="Skip graph.html regeneration.",
    )
    return parser.parse_args()


def normalize_source_file(path_str: str | None, project_root: Path) -> str:
    if not path_str:
        return ""

    raw = path_str.replace("/", "\\")
    candidate = Path(raw)
    try:
        if candidate.is_absolute():
            return str(candidate.resolve().relative_to(project_root)).replace("/", "\\")
    except Exception:
        pass
    return str(candidate).replace("/", "\\")


def is_file_wrapper(node_data: dict) -> bool:
    label = str(node_data.get("label", ""))
    return label.endswith(FILE_NODE_SUFFIXES)


def choose_keep_node(graph, node_ids: list[str], project_root: Path) -> str:
    def sort_key(node_id: str) -> tuple[int, int, str]:
        source_file = str(graph.nodes[node_id].get("source_file", ""))
        is_absolute = Path(source_file).is_absolute()
        return (1 if is_absolute else 0, len(node_id), node_id)

    return sorted(node_ids, key=sort_key)[0]


def merge_duplicate_file_nodes(graph, project_root: Path) -> int:
    by_source_file: dict[str, list[str]] = defaultdict(list)
    for node_id, node_data in graph.nodes(data=True):
        if not is_file_wrapper(node_data):
            continue
        normalized = normalize_source_file(node_data.get("source_file"), project_root)
        if normalized:
            by_source_file[normalized].append(node_id)

    removed = 0
    for normalized_source, node_ids in by_source_file.items():
        if len(node_ids) < 2:
            continue

        keep = choose_keep_node(graph, node_ids, project_root)
        graph.nodes[keep]["source_file"] = normalized_source
        for node_id in node_ids:
            if node_id == keep or node_id not in graph:
                continue

            for neighbor, edge_data in list(graph[node_id].items()):
                if neighbor == keep:
                    continue
                if not graph.has_edge(keep, neighbor):
                    graph.add_edge(keep, neighbor, **dict(edge_data))
            graph.remove_node(node_id)
            removed += 1

    return removed


def drop_isolated_file_nodes(graph) -> list[str]:
    isolated = []
    for node_id, node_data in list(graph.nodes(data=True)):
        if graph.degree(node_id) == 0 and is_file_wrapper(node_data):
            isolated.append(node_id)
    graph.remove_nodes_from(isolated)
    return isolated


def infer_labels_from_existing(
    graph,
    communities: dict[int, list[str]],
    labels_path: Path,
) -> dict[int, str]:
    prior_labels: dict[str, str] = {}
    if labels_path.exists():
        prior_labels = json.loads(labels_path.read_text(encoding="utf-8"))

    labels: dict[int, str] = {}
    for community_id, node_ids in communities.items():
        old_community_ids = [
            str(graph.nodes[node_id].get("community"))
            for node_id in node_ids
            if graph.nodes[node_id].get("community") is not None
        ]
        candidate_labels = [
            prior_labels.get(old_id, "")
            for old_id in old_community_ids
            if prior_labels.get(old_id)
        ]
        candidate_labels = [
            label for label in candidate_labels if not GENERIC_COMMUNITY_RE.match(label)
        ]

        if candidate_labels:
            labels[community_id] = Counter(candidate_labels).most_common(1)[0][0]
            continue

        labels[community_id] = fallback_label(graph, node_ids, community_id)

    return labels


def fallback_label(graph, node_ids: list[str], community_id: int) -> str:
    directory_counter: Counter[str] = Counter()
    symbol_counter: Counter[str] = Counter()

    for node_id in node_ids:
        node = graph.nodes[node_id]
        source_file = str(node.get("source_file", "")).replace("/", "\\")
        parts = [part for part in Path(source_file).parts if part not in {".", ""}]
        if len(parts) >= 2:
            directory_counter.update([parts[-2].replace("_", " ").title()])

        label = str(node.get("label", ""))
        if label and not is_file_wrapper(node):
            symbol_counter.update([label])

    if directory_counter:
        return directory_counter.most_common(1)[0][0]
    if symbol_counter:
        return symbol_counter.most_common(1)[0][0]
    return f"Community {community_id}"


def write_report(
    graph,
    communities: dict[int, list[str]],
    cohesion: dict[int, float],
    labels: dict[int, str],
    output_dir: Path,
    graph_path_label: str,
) -> None:
    graph_json_path = output_dir / "graph.json"
    report_path = output_dir / "GRAPH_REPORT.md"
    analysis_path = output_dir.parent / ".graphify_analysis.json"
    labels_path = output_dir.parent / ".graphify_labels.json"
    detect_path = output_dir.parent / ".graphify_detect.json"
    extract_path = output_dir.parent / ".graphify_extract.json"
    benchmark_path = output_dir / "benchmark.json"

    detection = (
        json.loads(detect_path.read_text(encoding="utf-8"))
        if detect_path.exists()
        else {"total_files": 0, "total_words": 0, "files": {}}
    )
    extraction = (
        json.loads(extract_path.read_text(encoding="utf-8"))
        if extract_path.exists()
        else {"input_tokens": 0, "output_tokens": 0}
    )

    tokens = {
        "input": extraction.get("input_tokens", 0),
        "output": extraction.get("output_tokens", 0),
    }
    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)
    questions = suggest_questions(graph, communities, labels)

    report = render_report(
        graph=graph,
        communities=communities,
        cohesion=cohesion,
        labels=labels,
        gods=gods,
        surprises=surprises,
        questions=questions,
        detection=detection,
        tokens=tokens,
        graph_path_label=graph_path_label,
    )
    report_path.write_text(report, encoding="utf-8")

    analysis = {
        "communities": {str(k): v for k, v in communities.items()},
        "cohesion": {str(k): v for k, v in cohesion.items()},
        "gods": gods,
        "surprises": surprises,
        "questions": questions,
    }
    analysis_path.write_text(json.dumps(analysis, indent=2), encoding="utf-8")
    labels_path.write_text(
        json.dumps({str(k): v for k, v in labels.items()}, indent=2),
        encoding="utf-8",
    )

    if benchmark_path.exists():
        benchmark = json.loads(benchmark_path.read_text(encoding="utf-8"))
        benchmark["cleaned"] = True
        benchmark_path.write_text(json.dumps(benchmark, indent=2), encoding="utf-8")

    to_json(graph, communities, str(graph_json_path))


def render_report(
    *,
    graph,
    communities: dict[int, list[str]],
    cohesion: dict[int, float],
    labels: dict[int, str],
    gods: list,
    surprises: list,
    questions: list,
    detection: dict,
    tokens: dict,
    graph_path_label: str,
) -> str:
    total_nodes = graph.number_of_nodes()
    total_edges = graph.number_of_edges()
    extracted_edges = sum(
        1 for _, _, data in graph.edges(data=True) if data.get("confidence") == "EXTRACTED"
    )
    inferred_edges = sum(
        1 for _, _, data in graph.edges(data=True) if data.get("confidence") == "INFERRED"
    )
    ambiguous_edges = sum(
        1 for _, _, data in graph.edges(data=True) if data.get("confidence") == "AMBIGUOUS"
    )

    total_confident = max(total_edges, 1)
    inferred_scores = [
        data.get("confidence_score", 0.0)
        for _, _, data in graph.edges(data=True)
        if data.get("confidence") == "INFERRED"
    ]
    avg_inferred_confidence = (
        sum(inferred_scores) / len(inferred_scores) if inferred_scores else 0.0
    )

    lines: list[str] = []
    lines.append(f"# Graph Report - {graph_path_label}  ({date.today().isoformat()})")
    lines.append("")
    lines.append("## Corpus Check")
    total_words = detection.get("total_words", 0)
    if total_words and total_words <= 28000:
        lines.append(
            f"- Corpus is ~{total_words:,} words - fits in a single context window. You may not need a graph."
        )
    else:
        lines.append(
            f"- {detection.get('total_files', 0)} files · ~{total_words:,} words"
        )
    lines.append("")
    lines.append("## Summary")
    lines.append(
        f"- {total_nodes} nodes · {total_edges} edges · {len(communities)} communities detected"
    )
    lines.append(
        "- Extraction: "
        f"{round(100 * extracted_edges / total_confident)}% EXTRACTED · "
        f"{round(100 * inferred_edges / total_confident)}% INFERRED · "
        f"{round(100 * ambiguous_edges / total_confident)}% AMBIGUOUS · "
        f"INFERRED: {inferred_edges} edges (avg confidence: {avg_inferred_confidence:.1f})"
    )
    lines.append(
        f"- Token cost: {tokens.get('input', 0)} input · {tokens.get('output', 0)} output"
    )
    lines.append("")
    lines.append("## Community Hubs (Navigation)")
    for community_id in sorted(communities):
        label = labels.get(community_id, f"Community {community_id}")
        lines.append(f"- [[_COMMUNITY_{label}|{label}]]")
    lines.append("")
    lines.append("## God Nodes (most connected - your core abstractions)")
    for idx, item in enumerate(gods[:10], start=1):
        if isinstance(item, dict):
            label = item.get("label") or item.get("node") or item.get("id")
            score = item.get("degree") or item.get("edges") or item.get("score")
        else:
            label = item[0]
            score = item[1] if len(item) > 1 else "?"
        lines.append(f"{idx}. `{label}` - {score} edges")
    lines.append("")
    lines.append("## Surprising Connections (you probably didn't know these)")
    for surprise in surprises[:5]:
        if isinstance(surprise, dict):
            source = surprise.get("source_label") or surprise.get("source")
            relation = surprise.get("relation", "related_to")
            target = surprise.get("target_label") or surprise.get("target")
            confidence = surprise.get("confidence", "UNKNOWN")
            source_file = surprise.get("source_file", "")
            target_file = surprise.get("target_file", "")
            lines.append(f"- `{source}` --{relation}--> `{target}`  [{confidence}]")
            if source_file or target_file:
                lines.append(f"  {source_file} → {target_file}".rstrip())
        else:
            lines.append(f"- {surprise}")
    lines.append("")
    lines.append("## Communities")
    for community_id in sorted(communities):
        label = labels.get(community_id, f"Community {community_id}")
        node_ids = communities[community_id]
        visible_labels = [
            graph.nodes[node_id].get("label", node_id)
            for node_id in node_ids
            if not is_file_wrapper(graph.nodes[node_id])
        ]
        preview = ", ".join(visible_labels[:8])
        if len(visible_labels) > 8:
            preview += f" (+{len(visible_labels) - 8} more)"
        lines.append("")
        lines.append(f'### Community {community_id} - "{label}"')
        lines.append(f"Cohesion: {cohesion.get(community_id, 0):.2f}")
        lines.append(f"Nodes ({len(visible_labels)}): {preview}")
    lines.append("")
    lines.append("## Suggested Questions")
    for question in questions[:5]:
        if isinstance(question, dict):
            prompt = question.get("question") or question.get("label") or str(question)
            detail = question.get("why") or question.get("reason") or ""
            lines.append(f"- **{prompt}**")
            if detail:
                lines.append(f"  _{detail}_")
        else:
            lines.append(f"- **{question}**")
    lines.append("")
    return "\n".join(lines)


def compact_communities(communities: dict[int, list[str]]) -> dict[int, list[str]]:
    compacted: dict[int, list[str]] = {}
    next_id = 0
    for _, node_ids in sorted(communities.items()):
        if not node_ids:
            continue
        compacted[next_id] = node_ids
        next_id += 1
    return compacted


def main() -> int:
    args = parse_args()
    project_root = Path(args.root).resolve()
    output_dir = (project_root / args.output_dir).resolve()
    graph_json_path = output_dir / "graph.json"
    labels_path = project_root / ".graphify_labels.json"

    if not graph_json_path.exists():
        raise SystemExit(f"Missing graph file: {graph_json_path}")

    data = json.loads(graph_json_path.read_text(encoding="utf-8"))
    graph = json_graph.node_link_graph(data, edges="links")

    removed_duplicates = merge_duplicate_file_nodes(graph, project_root)
    removed_isolates = drop_isolated_file_nodes(graph)

    communities = compact_communities(cluster(graph))
    labels = infer_labels_from_existing(graph, communities, labels_path)
    cohesion = score_all(graph, communities)

    for community_id, node_ids in communities.items():
        for node_id in node_ids:
            graph.nodes[node_id]["community"] = community_id

    write_report(
        graph,
        communities,
        cohesion,
        labels,
        output_dir,
        str(project_root.name),
    )

    if not args.no_html and graph.number_of_nodes() <= 5000:
        to_html(graph, communities, str(output_dir / "graph.html"), community_labels=labels)

    print(
        json.dumps(
            {
                "removed_duplicate_nodes": removed_duplicates,
                "removed_isolated_file_nodes": len(removed_isolates),
                "nodes": graph.number_of_nodes(),
                "edges": graph.number_of_edges(),
                "communities": len(communities),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
