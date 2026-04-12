'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import type {
  DocumentTemplate,
  DocumentSection,
  DocumentPageStyle,
  SectionCanvasRect,
} from '@/lib/types/documentTemplate';
import {
  SECTION_PALETTE,
  createDefaultSection,
  getCanvasMoveIndicesForSection,
  getSectionOrderDisplay,
  getSectionOrderLabel,
  isSectionLocked,
} from '@/lib/types/documentTemplate';
import { CanvasPreview, DEFAULT_PREVIEW_WORKSPACE_BG } from './CanvasPreview';
import { SectionEditor } from './SectionEditor';
import { DataFieldsExplorer } from './DataFieldsExplorer';
import { PageChromeEditor } from './PageChromeEditor';
import {
  buildDeliveryNoteTemplateData,
  getMockData,
  type AnyTemplateDataContext,
  type TemplateDataContext,
} from '@/lib/utils/templateData';
import { formatDate } from '@/lib/utils/formatters';
import { getItemTypeLabel } from '@/lib/utils/itemTypeFields';
import {
  ensureCanvasRects,
  resolveCanvasRectsForSections,
  clampRectToContent,
  marginBleedBox,
  contentWidthMm,
  contentHeightMm,
  estimateSectionHeightMm,
  materializeCanvasZOrder,
  reorderCanvasRectZ,
} from '@/lib/utils/canvasLayout';
import { migrateLegacyDocumentSections } from '@/lib/utils/migrateDocumentSections';

/** Print layout is always freeform canvas (absolute rects per block). */
const CANVAS_MODE = true;

interface TemplateBuilderProps {
  template: DocumentTemplate;
  onSave: (template: DocumentTemplate) => Promise<void>;
  onClose?: () => void;
  letterheadUrl?: string;
  companyId?: string;
  companySnapshot?: Record<string, unknown> | null;
  /** Fires when layout dirty state changes (for beforeunload / route guards). */
  onDirtyChange?: (dirty: boolean) => void;
}

const DEFAULT_PAGE_MARGINS = { top: 10, right: 12, bottom: 10, left: 12 };

const PREVIEW_WORKSPACE_BG_STORAGE_KEY = 'amfgi-print-builder-preview-workspace-bg';
const PREVIEW_ZOOM_STORAGE_KEY = 'amfgi-print-builder-preview-zoom';
const CANVAS_SNAP_STORAGE_KEY = 'amfgi-print-builder-canvas-snap';
const CANVAS_SHRINK_BELOW_CONTENT_STORAGE_KEY = 'amfgi-print-builder-canvas-shrink-below';

function layoutSnapshotKey(
  margins: DocumentTemplate['pageMargins'],
  pageStyle: DocumentPageStyle | undefined,
  canvasMode: boolean,
  canvasRects: SectionCanvasRect[],
  sections: DocumentSection[]
) {
  return JSON.stringify({
    pageMargins: margins,
    pageStyle: pageStyle ?? null,
    canvasMode,
    canvasRects,
    sections,
  });
}

type EditorSnapshot = {
  margins: DocumentTemplate['pageMargins'];
  pageStyle: DocumentPageStyle | undefined;
  canvasMode: boolean;
  canvasRects: SectionCanvasRect[];
  sections: DocumentSection[];
};

function cloneEditorSnapshot(s: EditorSnapshot): EditorSnapshot {
  return {
    margins: { ...s.margins },
    pageStyle: s.pageStyle ? JSON.parse(JSON.stringify(s.pageStyle)) : undefined,
    canvasMode: s.canvasMode,
    canvasRects: s.canvasRects.map((r) => ({ ...r })),
    sections: JSON.parse(JSON.stringify(s.sections)) as DocumentSection[],
  };
}

const LAYOUT_VERSIONS_STORAGE_PREFIX = 'amfgi-print-layout-versions-v1:';
const MAX_LAYOUT_VERSIONS = 24;

function layoutVersionsStorageKey(templateId: string) {
  return `${LAYOUT_VERSIONS_STORAGE_PREFIX}${templateId}`;
}

type LayoutVersionEntry = {
  id: string;
  at: number;
  label: string;
  kind: 'saved' | 'checkpoint';
  layoutKey: string;
  snapshot: EditorSnapshot;
};

function persistLayoutVersions(templateId: string, versions: LayoutVersionEntry[]) {
  try {
    sessionStorage.setItem(
      layoutVersionsStorageKey(templateId),
      JSON.stringify({ versions })
    );
  } catch {
    toast.error('Could not store version history (storage full?)');
  }
}

function loadLayoutVersions(templateId: string): LayoutVersionEntry[] {
  try {
    const raw = sessionStorage.getItem(layoutVersionsStorageKey(templateId));
    if (!raw) return [];
    const p = JSON.parse(raw) as { versions?: unknown };
    if (!Array.isArray(p?.versions)) return [];
    const out: LayoutVersionEntry[] = [];
    for (const item of p.versions) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const snap = o.snapshot;
      if (!snap || typeof snap !== 'object') continue;
      try {
        const cloned = cloneEditorSnapshot(snap as EditorSnapshot);
        out.push({
          id: typeof o.id === 'string' ? o.id : `v-${Date.now()}-${out.length}`,
          at: typeof o.at === 'number' ? o.at : Date.now(),
          label: typeof o.label === 'string' ? o.label : 'Restore point',
          kind: o.kind === 'saved' ? 'saved' : 'checkpoint',
          layoutKey:
            typeof o.layoutKey === 'string'
              ? o.layoutKey
              : layoutSnapshotKey(
                  cloned.margins,
                  cloned.pageStyle,
                  cloned.canvasMode,
                  cloned.canvasRects,
                  cloned.sections
                ),
          snapshot: cloned,
        });
      } catch {
        /* skip corrupt row */
      }
    }
    return out;
  } catch {
    return [];
  }
}

type DispatchPreviewEntry = {
  entryId: string;
  jobNumber: string;
  dispatchDate: string;
  transactionIds: string[];
  materialsCount: number;
};

type RightPanel = 'properties' | 'data';

/** Layout / editor tools — labels live in the top bar; body shows in the left column */
type LeftNavTool =
  | 'preview-data'
  | 'preview-workspace'
  | 'canvas'
  | 'page-chrome'
  | 'section-order'
  | 'version-history';

function NavChip({
  active,
  children,
  onClick,
  title: chipTitle,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={chipTitle}
      onClick={onClick}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium transition ${
        active
          ? 'border-sky-500 bg-sky-950/70 text-sky-100 shadow-[0_0_0_1px_rgba(14,165,233,0.25)]'
          : 'border-slate-600 bg-slate-800/90 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

export function TemplateBuilder({
  template,
  onSave,
  onClose,
  letterheadUrl,
  companyId,
  companySnapshot,
  onDirtyChange,
}: TemplateBuilderProps) {
  const [sections, setSections] = useState<DocumentSection[]>(() =>
    migrateLegacyDocumentSections(template.sections ?? [])
  );
  const [margins, setMargins] = useState(template.pageMargins ?? DEFAULT_PAGE_MARGINS);
  const [pageStyle, setPageStyle] = useState<DocumentPageStyle | undefined>(template.pageStyle);
  const [canvasRects, setCanvasRects] = useState<SectionCanvasRect[]>(() =>
    resolveCanvasRectsForSections(
      template.pageMargins ?? DEFAULT_PAGE_MARGINS,
      template.sections ?? [],
      template.canvasMode,
      template.canvasRects
    )
  );
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  /** Multi-select in Blocks (Ctrl/Cmd+click) for group / lock-group actions */
  const [sectionOrderSelection, setSectionOrderSelection] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>('properties');
  const [leftTool, setLeftTool] = useState<LeftNavTool>('section-order');
  const [previewScale, setPreviewScale] = useState(2.35);
  const [previewPrefsReady, setPreviewPrefsReady] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [allowShrinkBelowContent, setAllowShrinkBelowContent] = useState(false);
  const [dragSectionIdx, setDragSectionIdx] = useState<number | null>(null);
  const [showRuler, setShowRuler] = useState(false);
  const [showSectionOutlines, setShowSectionOutlines] = useState(true);
  const [orderHoverIdx, setOrderHoverIdx] = useState<number | null>(null);
  const [histTick, setHistTick] = useState(0);
  const [layoutVersions, setLayoutVersions] = useState<LayoutVersionEntry[]>([]);

  useEffect(() => {
    if (leftTool !== 'section-order') setOrderHoverIdx(null);
  }, [leftTool]);

  useEffect(() => {
    setLayoutVersions(loadLayoutVersions(template.id));
  }, [template.id]);

  const historyPast = useRef<EditorSnapshot[]>([]);
  const historyFuture = useRef<EditorSnapshot[]>([]);
  const lastSnapForHistory = useRef<EditorSnapshot | null>(null);
  const skipHistoryDebounceRef = useRef(false);
  const stateRef = useRef<EditorSnapshot>({
    margins: DEFAULT_PAGE_MARGINS,
    pageStyle: undefined,
    canvasMode: true,
    canvasRects: [],
    sections: [],
  });
  const [previewWsMode, setPreviewWsMode] = useState<'default' | 'transparent' | 'custom'>('default');
  const [previewWsColor, setPreviewWsColor] = useState(DEFAULT_PREVIEW_WORKSPACE_BG);
  const [previewWsReady, setPreviewWsReady] = useState(false);
  const [dnEntries, setDnEntries] = useState<DispatchPreviewEntry[]>([]);
  const [dnEntriesLoading, setDnEntriesLoading] = useState(false);
  const [dnEntriesError, setDnEntriesError] = useState<string | null>(null);
  const [dnSelectedEntryId, setDnSelectedEntryId] = useState('');
  const [liveTxnLoading, setLiveTxnLoading] = useState(false);
  const [livePreviewBase, setLivePreviewBase] = useState<TemplateDataContext | null>(null);

  const [savedLayoutKey, setSavedLayoutKey] = useState(() => {
    const m = template.pageMargins ?? DEFAULT_PAGE_MARGINS;
    const secs = migrateLegacyDocumentSections(template.sections ?? []);
    return layoutSnapshotKey(
      m,
      template.pageStyle,
      CANVAS_MODE,
      resolveCanvasRectsForSections(m, secs, template.canvasMode, template.canvasRects),
      secs
    );
  });

  useEffect(() => {
    if (template.itemType !== 'delivery-note' || !companyId) {
      setDnEntries([]);
      setDnEntriesError(null);
      return;
    }
    let cancelled = false;
    setDnEntriesLoading(true);
    setDnEntriesError(null);
    fetch('/api/materials/dispatch-history-entries?filterType=all')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) {
          setDnEntriesError(json.error || 'Could not load entries');
          setDnEntries([]);
          return;
        }
        const raw = json.data?.entries ?? [];
        const filtered: DispatchPreviewEntry[] = raw
          .filter((e: { isDeliveryNote?: boolean }) => e.isDeliveryNote)
          .map((e: Record<string, unknown>) => {
            const dd = e.dispatchDate as string | Date | undefined;
            const dispatchDate =
              typeof dd === 'string'
                ? dd
                : dd instanceof Date
                  ? dd.toISOString()
                  : '';
            const ids = (e.transactionIds as string[] | undefined) ?? [];
            return {
              entryId: String(e.entryId ?? e.id ?? ''),
              jobNumber: String(e.jobNumber ?? '—'),
              dispatchDate,
              transactionIds: ids,
              materialsCount: Number(e.materialsCount ?? 0),
            };
          })
          .filter((e: DispatchPreviewEntry) => e.transactionIds.length > 0);
        setDnEntries(filtered);
      })
      .catch(() => {
        if (!cancelled) {
          setDnEntriesError('Failed to load delivery entries');
          setDnEntries([]);
        }
      })
      .finally(() => {
        if (!cancelled) setDnEntriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [template.itemType, companyId, template.id]);

  useEffect(() => {
    if (template.itemType !== 'delivery-note') {
      setLeftTool((t) => (t === 'preview-data' ? 'section-order' : t));
    }
  }, [template.itemType]);

  useEffect(() => {
    if (!dnSelectedEntryId || template.itemType !== 'delivery-note') {
      setLivePreviewBase(null);
      return;
    }
    const entry = dnEntries.find((e) => e.entryId === dnSelectedEntryId);
    if (!entry?.transactionIds.length) {
      setLivePreviewBase(null);
      return;
    }
    let cancelled = false;
    setLiveTxnLoading(true);
    Promise.all(
      entry.transactionIds.map((id) => fetch(`/api/transactions/${id}`).then((r) => r.json()))
    )
      .then((jsons) => {
        if (cancelled) return;
        const txns = jsons.filter((j) => j.success && j.data).map((j) => j.data);
        const stockOuts = txns.filter((t: { type?: string }) => t.type === 'STOCK_OUT');
        if (!stockOuts.length) {
          setLivePreviewBase(null);
          return;
        }
        setLivePreviewBase(
          buildDeliveryNoteTemplateData(stockOuts, companySnapshot ?? {})
        );
      })
      .catch(() => {
        if (!cancelled) setLivePreviewBase(null);
      })
      .finally(() => {
        if (!cancelled) setLiveTxnLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dnSelectedEntryId, template.itemType, companySnapshot, dnEntries]);

  useEffect(() => {
    const m = template.pageMargins ?? DEFAULT_PAGE_MARGINS;
    const secs = migrateLegacyDocumentSections(template.sections ?? []);
    setSections(secs);
    setMargins(m);
    setPageStyle(template.pageStyle);
    setCanvasRects(resolveCanvasRectsForSections(m, secs, template.canvasMode, template.canvasRects));
    setSelectedIdx(null);
    setSectionOrderSelection([]);
    setDnSelectedEntryId('');
    setLivePreviewBase(null);
    setLeftTool('section-order');
    historyPast.current = [];
    historyFuture.current = [];
    lastSnapForHistory.current = null;
    setHistTick((x) => x + 1);
    setSavedLayoutKey(
      layoutSnapshotKey(
        m,
        template.pageStyle,
        CANVAS_MODE,
        resolveCanvasRectsForSections(m, secs, template.canvasMode, template.canvasRects),
        secs
      )
    );
  }, [template.id]);

  const currentLayoutKey = useMemo(
    () => layoutSnapshotKey(margins, pageStyle, CANVAS_MODE, canvasRects, sections),
    [margins, pageStyle, canvasRects, sections]
  );
  const dirty = currentLayoutKey !== savedLayoutKey;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    stateRef.current = {
      margins: { ...margins },
      pageStyle: pageStyle ? JSON.parse(JSON.stringify(pageStyle)) : undefined,
      canvasMode: CANVAS_MODE,
      canvasRects: canvasRects.map((r) => ({ ...r })),
      sections: JSON.parse(JSON.stringify(sections)) as DocumentSection[],
    };
  });

  useEffect(() => {
    const cur: EditorSnapshot = {
      margins: { ...margins },
      pageStyle: pageStyle ? JSON.parse(JSON.stringify(pageStyle)) : undefined,
      canvasMode: CANVAS_MODE,
      canvasRects: canvasRects.map((r) => ({ ...r })),
      sections: JSON.parse(JSON.stringify(sections)) as DocumentSection[],
    };

    if (lastSnapForHistory.current === null) {
      lastSnapForHistory.current = cloneEditorSnapshot(cur);
      return;
    }

    if (skipHistoryDebounceRef.current) {
      skipHistoryDebounceRef.current = false;
      lastSnapForHistory.current = cloneEditorSnapshot(cur);
      return;
    }

    if (JSON.stringify(lastSnapForHistory.current) === JSON.stringify(cur)) return;

    const t = window.setTimeout(() => {
      const c2: EditorSnapshot = {
        margins: { ...margins },
        pageStyle: pageStyle ? JSON.parse(JSON.stringify(pageStyle)) : undefined,
        canvasMode: CANVAS_MODE,
        canvasRects: canvasRects.map((r) => ({ ...r })),
        sections: JSON.parse(JSON.stringify(sections)) as DocumentSection[],
      };
      if (
        lastSnapForHistory.current &&
        JSON.stringify(lastSnapForHistory.current) !== JSON.stringify(c2)
      ) {
        historyPast.current.push(cloneEditorSnapshot(lastSnapForHistory.current));
        if (historyPast.current.length > 80) historyPast.current.shift();
        historyFuture.current = [];
        lastSnapForHistory.current = cloneEditorSnapshot(c2);
        setHistTick((x) => x + 1);
      }
    }, 450);

    return () => clearTimeout(t);
  }, [sections, margins, pageStyle, canvasRects]);

  const onCanvasInteractionEnd = useCallback(() => {
    const cur: EditorSnapshot = {
      margins: { ...margins },
      pageStyle: pageStyle ? JSON.parse(JSON.stringify(pageStyle)) : undefined,
      canvasMode: CANVAS_MODE,
      canvasRects: canvasRects.map((r) => ({ ...r })),
      sections: JSON.parse(JSON.stringify(sections)) as DocumentSection[],
    };
    if (lastSnapForHistory.current === null) {
      lastSnapForHistory.current = cloneEditorSnapshot(cur);
      return;
    }
    if (JSON.stringify(lastSnapForHistory.current) !== JSON.stringify(cur)) {
      historyPast.current.push(cloneEditorSnapshot(lastSnapForHistory.current));
      if (historyPast.current.length > 80) historyPast.current.shift();
      historyFuture.current = [];
      lastSnapForHistory.current = cloneEditorSnapshot(cur);
      setHistTick((x) => x + 1);
    }
  }, [margins, pageStyle, canvasRects, sections]);

  const pushLayoutVersion = useCallback(
    (label: string, kind: 'saved' | 'checkpoint') => {
      const snap = cloneEditorSnapshot(stateRef.current);
      const key = layoutSnapshotKey(
        snap.margins,
        snap.pageStyle,
        snap.canvasMode,
        snap.canvasRects,
        snap.sections
      );
      setLayoutVersions((prev) => {
        if (kind === 'saved' && prev[0]?.layoutKey === key) return prev;
        const id =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `v-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const entry: LayoutVersionEntry = {
          id,
          at: Date.now(),
          label,
          kind,
          layoutKey: key,
          snapshot: snap,
        };
        const next = [entry, ...prev].slice(0, MAX_LAYOUT_VERSIONS);
        persistLayoutVersions(template.id, next);
        return next;
      });
    },
    [template.id]
  );

  const removeLayoutVersion = useCallback(
    (versionId: string) => {
      setLayoutVersions((prev) => {
        const next = prev.filter((v) => v.id !== versionId);
        persistLayoutVersions(template.id, next);
        return next;
      });
    },
    [template.id]
  );

  const clearLayoutVersions = useCallback(() => {
    if (!window.confirm('Remove all saved layout versions for this template?')) return;
    setLayoutVersions(() => {
      persistLayoutVersions(template.id, []);
      return [];
    });
  }, [template.id]);

  const restoreLayoutVersion = useCallback((entry: LayoutVersionEntry) => {
    if (
      !window.confirm(
        'Restore this version? The current layout will be replaced and Undo/Redo will be cleared.'
      )
    )
      return;
    const snap = cloneEditorSnapshot(entry.snapshot);
    skipHistoryDebounceRef.current = true;
    historyPast.current = [];
    historyFuture.current = [];
    setMargins({ ...snap.margins });
    setPageStyle(snap.pageStyle);
    setCanvasRects(snap.canvasRects.map((r) => ({ ...r })));
    setSections(JSON.parse(JSON.stringify(snap.sections)) as DocumentSection[]);
    lastSnapForHistory.current = cloneEditorSnapshot(snap);
    setHistTick((x) => x + 1);
    setSelectedIdx(null);
    setSectionOrderSelection([]);
    toast.success('Layout restored from history');
  }, []);

  const saveCheckpoint = useCallback(() => {
    const name = window.prompt('Checkpoint label (optional):', '');
    if (name === null) return;
    const label = name.trim() || `Checkpoint · ${new Date().toLocaleString()}`;
    pushLayoutVersion(label, 'checkpoint');
    toast.success('Checkpoint saved to history');
  }, [pushLayoutVersion]);

  const undo = useCallback(() => {
    if (historyPast.current.length === 0) return;
    const prev = historyPast.current.pop()!;
    const cur = cloneEditorSnapshot(stateRef.current);
    historyFuture.current.unshift(cur);
    skipHistoryDebounceRef.current = true;
    setMargins({ ...prev.margins });
    setPageStyle(prev.pageStyle);
    setCanvasRects(prev.canvasRects.map((r) => ({ ...r })));
    setSections(JSON.parse(JSON.stringify(prev.sections)) as DocumentSection[]);
    lastSnapForHistory.current = cloneEditorSnapshot(prev);
    setHistTick((x) => x + 1);
    setSelectedIdx(null);
    setSectionOrderSelection([]);
  }, []);

  const redo = useCallback(() => {
    if (historyFuture.current.length === 0) return;
    const next = historyFuture.current.shift()!;
    const cur = cloneEditorSnapshot(stateRef.current);
    historyPast.current.push(cur);
    skipHistoryDebounceRef.current = true;
    setMargins({ ...next.margins });
    setPageStyle(next.pageStyle);
    setCanvasRects(next.canvasRects.map((r) => ({ ...r })));
    setSections(JSON.parse(JSON.stringify(next.sections)) as DocumentSection[]);
    lastSnapForHistory.current = cloneEditorSnapshot(next);
    setHistTick((x) => x + 1);
    setSelectedIdx(null);
    setSectionOrderSelection([]);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedIdx === null) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      )
        return;
      const k = e.key;
      if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
      e.preventDefault();
      const stepMm = e.shiftKey ? 2 : 0.5;
      const cw = contentWidthMm(margins);
      const ch = contentHeightMm(margins);
      let dx = 0;
      let dy = 0;
      if (k === 'ArrowLeft') dx = -stepMm;
      if (k === 'ArrowRight') dx = stepMm;
      if (k === 'ArrowUp') dy = -stepMm;
      if (k === 'ArrowDown') dy = stepMm;
      setCanvasRects((prev) => {
        if (selectedIdx === null || selectedIdx >= prev.length) return prev;
        const moveIdx = getCanvasMoveIndicesForSection(sections, selectedIdx);
        if (moveIdx.length === 0) return prev;
        return prev.map((x, i) => {
          if (!moveIdx.includes(i)) return x;
          return clampRectToContent(
            { ...x, xMm: x.xMm + dx, yMm: x.yMm + dy },
            cw,
            ch,
            8,
            6,
            marginBleedBox(sections[i], margins)
          );
        });
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIdx, margins, sections]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREVIEW_WORKSPACE_BG_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { kind?: string; value?: string };
        if (p.kind === 'transparent') setPreviewWsMode('transparent');
        else if (p.kind === 'color' && typeof p.value === 'string' && p.value) {
          setPreviewWsMode('custom');
          setPreviewWsColor(p.value);
        }
      }
    } catch {
      /* ignore */
    }
    setPreviewWsReady(true);
  }, []);

  useEffect(() => {
    try {
      const z = localStorage.getItem(PREVIEW_ZOOM_STORAGE_KEY);
      if (z) {
        const n = Number(z);
        if (Number.isFinite(n) && n >= 1 && n <= 4) setPreviewScale(n);
      }
      if (localStorage.getItem(CANVAS_SNAP_STORAGE_KEY) === '0') setSnapEnabled(false);
      if (localStorage.getItem(CANVAS_SHRINK_BELOW_CONTENT_STORAGE_KEY) === '1') {
        setAllowShrinkBelowContent(true);
      }
    } catch {
      /* ignore */
    }
    setPreviewPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!previewPrefsReady) return;
    try {
      localStorage.setItem(PREVIEW_ZOOM_STORAGE_KEY, String(previewScale));
    } catch {
      /* ignore */
    }
  }, [previewPrefsReady, previewScale]);

  useEffect(() => {
    if (!previewPrefsReady) return;
    try {
      localStorage.setItem(CANVAS_SNAP_STORAGE_KEY, snapEnabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [previewPrefsReady, snapEnabled]);

  useEffect(() => {
    if (!previewPrefsReady) return;
    try {
      localStorage.setItem(
        CANVAS_SHRINK_BELOW_CONTENT_STORAGE_KEY,
        allowShrinkBelowContent ? '1' : '0'
      );
    } catch {
      /* ignore */
    }
  }, [previewPrefsReady, allowShrinkBelowContent]);

  useEffect(() => {
    if (!previewWsReady) return;
    try {
      const payload =
        previewWsMode === 'transparent'
          ? { kind: 'transparent' }
          : previewWsMode === 'custom'
            ? { kind: 'color', value: previewWsColor }
            : { kind: 'default' };
      localStorage.setItem(PREVIEW_WORKSPACE_BG_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [previewWsReady, previewWsMode, previewWsColor]);

  useEffect(() => {
    setCanvasRects((prev) =>
      ensureCanvasRects(
        {
          ...template,
          pageMargins: margins,
          sections,
        },
        prev
      )
    );
  }, [
    sections.length,
    margins.top,
    margins.right,
    margins.bottom,
    margins.left,
    template.id,
  ]);

  const previewData = useMemo(() => {
    const mockData = getMockData(template.itemType);
    const letter = letterheadUrl || mockData.company?.letterheadUrl || '';
    if (template.itemType === 'delivery-note' && dnSelectedEntryId && livePreviewBase) {
      return {
        ...livePreviewBase,
        company: {
          ...livePreviewBase.company,
          letterheadUrl: letter || livePreviewBase.company.letterheadUrl,
        },
      } as AnyTemplateDataContext;
    }
    return {
      ...mockData,
      company: {
        ...mockData.company,
        letterheadUrl: letter,
      },
    } as AnyTemplateDataContext;
  }, [template.itemType, dnSelectedEntryId, livePreviewBase, letterheadUrl]);

  const previewTemplate: DocumentTemplate = {
    ...template,
    pageMargins: margins,
    pageStyle,
    sections,
    canvasMode: CANVAS_MODE,
    canvasRects,
  };

  const previewWorkspaceBackground =
    previewWsMode === 'transparent'
      ? 'transparent'
      : previewWsMode === 'custom'
        ? previewWsColor
        : undefined;

  const updateSection = useCallback((idx: number, updated: DocumentSection) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? updated : s)));
  }, []);

  const removeSection = useCallback((idx: number) => {
    setSections((prev) => prev.filter((_, i) => i !== idx));
    setCanvasRects((r) => {
      if (!r.length) return r;
      return r.filter((_, i) => i !== idx);
    });
    setSelectedIdx(null);
    setSectionOrderSelection([]);
  }, []);

  const moveSection = useCallback((from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0) return;
    setSections((prev) => {
      if (to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      setCanvasRects((rects) => {
        if (!rects || rects.length !== next.length) return rects;
        const nr = [...rects];
        [nr[from], nr[to]] = [nr[to], nr[from]];
        return nr;
      });
      return next;
    });
    setSelectedIdx((cur) => {
      if (cur === from) return from + dir;
      if (cur === from + dir) return from;
      return cur;
    });
    setSectionOrderSelection((prev) =>
      prev.map((i) => {
        if (i === from) return from + dir;
        if (i === from + dir) return from;
        return i;
      })
    );
  }, []);

  const addSection = useCallback(
    (type: DocumentSection['type']) => {
      const newSection = createDefaultSection(type);
      setSections((prev) => {
        const next = [...prev, newSection];
        const ni = next.length - 1;
        setSelectedIdx(ni);
        setSectionOrderSelection([ni]);
        return next;
      });
      setCanvasRects((r) => {
        const cw = contentWidthMm(margins);
        const h = estimateSectionHeightMm(newSection, cw);
        const y = r.length ? r[r.length - 1].yMm + r[r.length - 1].heightMm + 2 : 0;
        const maxZ = r.reduce((m, rr, i) => Math.max(m, rr.zIndex ?? i), -1);
        return materializeCanvasZOrder([
          ...r,
          { xMm: 0, yMm: y, widthMm: cw, heightMm: h, zIndex: maxZ + 1 },
        ]);
      });
      setRightPanel('properties');
    },
    [margins]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        ...template,
        pageMargins: margins,
        pageStyle,
        sections,
        canvasMode: CANVAS_MODE,
        canvasRects: canvasRects.length === sections.length ? canvasRects : [],
      });
      setSavedLayoutKey(
        layoutSnapshotKey(margins, pageStyle, CANVAS_MODE, canvasRects, sections)
      );
      const ts = new Date().toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      pushLayoutVersion(`Saved · ${ts}`, 'saved');
    } catch {
      /* parent shows toast */
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (dirty) {
      if (!window.confirm('You have unsaved layout changes. Leave without saving?')) return;
    }
    onClose?.();
  };

  const selectedSection = selectedIdx !== null ? sections[selectedIdx] : null;

  const onDropSection = useCallback(
    (targetIdx: number) => {
      if (dragSectionIdx === null || dragSectionIdx === targetIdx) {
        setDragSectionIdx(null);
        return;
      }
      const from = dragSectionIdx;
      setSections((prev) => {
        if (from >= prev.length) return prev;
        const next = [...prev];
        const [removed] = next.splice(from, 1);
        next.splice(targetIdx, 0, removed);
        setCanvasRects((rects) => {
          if (!rects || rects.length !== prev.length) return rects;
          const nr = [...rects];
          const [r0] = nr.splice(from, 1);
          nr.splice(targetIdx, 0, r0);
          return nr;
        });
        return next;
      });
      setSelectedIdx(targetIdx);
      setSectionOrderSelection([targetIdx]);
      setDragSectionIdx(null);
    },
    [dragSectionIdx]
  );

  const bringCanvasForward = useCallback(() => {
    if (selectedIdx === null) return;
    if (isSectionLocked(sections[selectedIdx])) return;
    setCanvasRects((prev) => reorderCanvasRectZ(prev, selectedIdx, 'forward'));
  }, [selectedIdx, sections]);

  const sendCanvasBackward = useCallback(() => {
    if (selectedIdx === null) return;
    if (isSectionLocked(sections[selectedIdx])) return;
    setCanvasRects((prev) => reorderCanvasRectZ(prev, selectedIdx, 'backward'));
  }, [selectedIdx, sections]);

  const duplicateSelectedSection = useCallback(() => {
    if (selectedIdx === null) return;
    const idx = selectedIdx;
    const ch = contentHeightMm(margins);
    setSections((prev) => {
      if (idx >= prev.length) return prev;
      const dupSec = JSON.parse(JSON.stringify(prev[idx])) as DocumentSection;
      delete dupSec.groupId;
      delete dupSec.locked;
      return [...prev.slice(0, idx + 1), dupSec, ...prev.slice(idx + 1)];
    });
    setCanvasRects((prev) => {
      if (idx >= prev.length) return prev;
      const base = prev[idx];
      const maxZ = prev.reduce((m, r, i) => Math.max(m, r.zIndex ?? i), -1);
      const dupR: SectionCanvasRect = {
        ...base,
        yMm: Math.min(base.yMm + 4, ch - base.heightMm),
        zIndex: maxZ + 1,
      };
      return materializeCanvasZOrder([...prev.slice(0, idx + 1), dupR, ...prev.slice(idx + 1)]);
    });
    setSelectedIdx(idx + 1);
    setSectionOrderSelection([idx + 1]);
    setRightPanel('properties');
  }, [selectedIdx, margins]);

  const newSectionGroupId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `grp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const groupSelectedSections = useCallback(() => {
    const ids = [...new Set(sectionOrderSelection)].filter((i) => i >= 0 && i < sections.length).sort((a, b) => a - b);
    if (ids.length < 2) {
      toast.error('Select at least two blocks (Ctrl/Cmd+click) to group.');
      return;
    }
    const gid = newSectionGroupId();
    setSections((prev) =>
      prev.map((s, i) => (ids.includes(i) ? { ...s, groupId: gid } : s))
    );
    toast.success(`Grouped ${ids.length} blocks`);
  }, [sectionOrderSelection, sections.length]);

  const ungroupSelection = useCallback(() => {
    const gids = new Set(
      sectionOrderSelection
        .map((i) => sections[i]?.groupId)
        .filter((x): x is string => Boolean(x))
    );
    if (gids.size === 0) {
      toast.error('Selected blocks are not in a group.');
      return;
    }
    setSections((prev) =>
      prev.map((s) => (s.groupId && gids.has(s.groupId) ? { ...s, groupId: undefined } : s))
    );
    toast.success('Ungrouped');
  }, [sectionOrderSelection, sections]);

  const toggleLockSelected = useCallback(() => {
    if (selectedIdx === null) return;
    const s = sections[selectedIdx];
    if (!s) return;
    updateSection(selectedIdx, { ...s, locked: !s.locked });
  }, [selectedIdx, sections, updateSection]);

  const lockGroupOfPrimary = useCallback(() => {
    if (selectedIdx === null) return;
    const gid = sections[selectedIdx]?.groupId;
    if (!gid) {
      toast.error('Primary block is not in a group.');
      return;
    }
    setSections((prev) =>
      prev.map((s) => (s.groupId === gid ? { ...s, locked: true } : s))
    );
    toast.success('Group locked');
  }, [selectedIdx, sections]);

  const unlockGroupOfPrimary = useCallback(() => {
    if (selectedIdx === null) return;
    const gid = sections[selectedIdx]?.groupId;
    if (!gid) {
      toast.error('Primary block is not in a group.');
      return;
    }
    setSections((prev) =>
      prev.map((s) => (s.groupId === gid ? { ...s, locked: false } : s))
    );
    toast.success('Group unlocked');
  }, [selectedIdx, sections]);

  const deleteSelectedSection = useCallback(() => {
    if (selectedIdx === null) return;
    removeSection(selectedIdx);
  }, [selectedIdx, removeSection]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-slate-950 text-white">
      <header className="shrink-0 border-b border-slate-700 bg-slate-900" data-hist={histTick}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-2 py-2 sm:px-3">
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="min-w-28 px-3 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 rounded text-white"
            >
              {saving ? 'Saving…' : 'Save template'}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={requestClose}
                className="shrink-0 rounded bg-slate-700 px-3 py-2 text-xs hover:bg-slate-600"
              >
                Back
              </button>
            )}
            <button
              type="button"
              title="Undo (Ctrl+Z)"
              onClick={undo}
              disabled={historyPast.current.length === 0}
              className="shrink-0 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-[10px] text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Undo
            </button>
            <button
              type="button"
              title="Redo (Ctrl+Shift+Z)"
              onClick={redo}
              disabled={historyFuture.current.length === 0}
              className="shrink-0 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-[10px] text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Redo
            </button>
            <button
              type="button"
              title="Save a restore point (also kept in this browser)"
              onClick={saveCheckpoint}
              className="shrink-0 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-[10px] text-slate-300 hover:bg-slate-700"
            >
              Checkpoint
            </button>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] text-slate-400">
              <input
                type="checkbox"
                checked={showRuler}
                onChange={(e) => setShowRuler(e.target.checked)}
                className="rounded border-slate-600"
              />
              Ruler
            </label>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] text-slate-400">
              <input
                type="checkbox"
                checked={showSectionOutlines}
                onChange={(e) => setShowSectionOutlines(e.target.checked)}
                className="rounded border-slate-600"
              />
              Section outlines
            </label>
          </div>

          <nav
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden py-0.5 [scrollbar-width:thin]"
            aria-label="Layout tools"
          >
            <span className="shrink-0 pl-1 text-[9px] font-bold uppercase tracking-wide text-slate-600">
              Layout
            </span>
            {template.itemType === 'delivery-note' && (
              <NavChip
                active={leftTool === 'preview-data'}
                onClick={() => setLeftTool('preview-data')}
                title="Pick a real delivery note for preview data"
              >
                Preview data
              </NavChip>
            )}
            <NavChip
              active={leftTool === 'preview-workspace'}
              onClick={() => setLeftTool('preview-workspace')}
              title="Editor canvas color (not printed)"
            >
              Workspace
            </NavChip>
            <NavChip
              active={leftTool === 'canvas'}
              onClick={() => setLeftTool('canvas')}
              title="Snap, resize limits, and canvas shortcuts"
            >
              Layout
            </NavChip>
            <NavChip
              active={leftTool === 'page-chrome'}
              onClick={() => setLeftTool('page-chrome')}
              title="Margins, page background, watermark"
            >
              Page / WM
            </NavChip>
            <NavChip
              active={leftTool === 'version-history'}
              onClick={() => setLeftTool('version-history')}
              title="Saved checkpoints and restore points for this template"
            >
              Versions
            </NavChip>
            <NavChip
              active={leftTool === 'section-order'}
              onClick={() => setLeftTool('section-order')}
              title="Layers: reorder blocks; click a row to edit on the right (like Canva’s stack)"
            >
              Blocks
            </NavChip>
          </nav>

          <div
            className="flex w-full min-w-0 shrink-0 flex-col justify-center sm:ml-auto sm:w-auto sm:max-w-40 sm:border-l sm:border-slate-800 sm:pl-3 lg:max-w-56 sm:text-right"
            title={template.name}
          >
            <p className="truncate text-[10px] text-slate-400">{template.name}</p>
            <div className="flex items-center gap-2 sm:justify-end">
              <p className="truncate text-[9px] text-slate-600">
                {getItemTypeLabel(String(template.itemType))}
              </p>
              {dirty && (
                <span className="shrink-0 text-[9px] font-medium text-amber-500/90">Unsaved</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-row">
        <div className="allow-text-select flex h-full min-h-0 w-72 shrink-0 flex-col border-r border-slate-700 bg-slate-900">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
            {leftTool === 'preview-data' && template.itemType === 'delivery-note' && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Preview data
                </p>
                <p className="text-[9px] leading-relaxed text-slate-600">
                  Pick a real delivery note to preview fields in the document.
                </p>
                {!companyId && (
                  <p className="text-[10px] text-amber-500/90">Active company required to load entries.</p>
                )}
                {companyId && (
                  <>
                    <label className="block text-[10px] text-slate-500">Delivery entry</label>
                    <select
                      value={dnSelectedEntryId}
                      onChange={(e) => setDnSelectedEntryId(e.target.value)}
                      className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white"
                      disabled={dnEntriesLoading}
                    >
                      <option value="">Sample / mock data</option>
                      {dnEntries.map((ent) => {
                        const d = ent.dispatchDate ? formatDate(ent.dispatchDate) : '—';
                        return (
                          <option key={ent.entryId} value={ent.entryId}>
                            {ent.jobNumber} · {d}
                            {ent.materialsCount > 1 ? ` (${ent.materialsCount} lines)` : ''}
                          </option>
                        );
                      })}
                    </select>
                    {dnEntriesLoading && <p className="text-[10px] text-slate-500">Loading entries…</p>}
                    {dnEntriesError && <p className="text-[10px] text-red-400">{dnEntriesError}</p>}
                    {!dnEntriesLoading &&
                      dnEntries.length === 0 &&
                      companyId &&
                      !dnEntriesError && (
                        <p className="text-[10px] text-slate-600">No delivery notes found yet.</p>
                      )}
                    {liveTxnLoading && dnSelectedEntryId && (
                      <p className="text-[10px] text-slate-500">Loading transactions…</p>
                    )}
                    {dnSelectedEntryId && !liveTxnLoading && !livePreviewBase && (
                      <p className="text-[10px] text-slate-600">Could not load that delivery note.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {leftTool === 'preview-workspace' && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Preview workspace
                </p>
                <p className="text-[9px] leading-relaxed text-slate-600">
                  Color behind the page in this editor only — not printed.
                </p>
                <label className="block text-[10px] text-slate-500">Background</label>
                <select
                  value={previewWsMode}
                  onChange={(e) =>
                    setPreviewWsMode(e.target.value as 'default' | 'transparent' | 'custom')
                  }
                  className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white"
                >
                  <option value="default">Default gray</option>
                  <option value="transparent">Transparent</option>
                  <option value="custom">Custom color</option>
                </select>
                {previewWsMode === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={previewWsColor.match(/^#[0-9a-fA-F]{6}$/) ? previewWsColor : '#64748b'}
                      onChange={(e) => setPreviewWsColor(e.target.value)}
                      className="h-8 w-12 cursor-pointer rounded border border-slate-600 bg-slate-800"
                    />
                    <input
                      type="text"
                      value={previewWsColor}
                      onChange={(e) => setPreviewWsColor(e.target.value)}
                      className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-[11px] text-white"
                      placeholder="#64748b"
                    />
                  </div>
                )}
                <p className="text-[9px] leading-relaxed text-slate-600">
                  Stored in this browser only.
                </p>
              </div>
            )}

            {leftTool === 'canvas' && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Block layout
                </p>
                <p className="text-[9px] leading-relaxed text-slate-600">
                  Each block has its own frame on the page. Drag to move, use the green handle to resize.
                  Arrow keys nudge the selected block (Shift = 2&nbsp;mm).
                </p>
                <div className="space-y-2 border-t border-slate-800 pt-2">
                  <p className="text-[9px] leading-relaxed text-slate-600">
                    Same options as the preview bar: snap to margins and neighbors; allow shrinking below
                    measured content (clip inside the cell).
                  </p>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={snapEnabled}
                      onChange={(e) => setSnapEnabled(e.target.checked)}
                      className="rounded border-slate-600"
                    />
                    Snap while move / resize
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={allowShrinkBelowContent}
                      onChange={(e) => setAllowShrinkBelowContent(e.target.checked)}
                      className="rounded border-slate-600"
                    />
                    Allow resize smaller than content
                  </label>
                </div>
              </div>
            )}

            {leftTool === 'page-chrome' && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Page & watermark
                </p>
                <PageChromeEditor
                  itemType={String(template.itemType)}
                  pageStyle={pageStyle}
                  onChange={setPageStyle}
                  pageMargins={margins}
                  onMarginsChange={setMargins}
                />
              </div>
            )}

            {leftTool === 'version-history' && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Layout versions ({layoutVersions.length})
                </p>
                <p className="text-[9px] leading-relaxed text-slate-600">
                  Each successful <span className="text-slate-400">Save</span> and manual{' '}
                  <span className="text-slate-400">Checkpoint</span> stores a copy in this browser. Restore
                  replaces the current layout (Undo/Redo resets).
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={saveCheckpoint}
                    className="flex-1 rounded border border-slate-600 bg-slate-800 py-1.5 text-[10px] text-slate-300 hover:bg-slate-700"
                  >
                    New checkpoint
                  </button>
                  <button
                    type="button"
                    onClick={clearLayoutVersions}
                    disabled={layoutVersions.length === 0}
                    className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-[10px] text-slate-500 hover:text-red-300 disabled:opacity-30"
                  >
                    Clear all
                  </button>
                </div>
                {layoutVersions.length === 0 ? (
                  <p className="text-[10px] text-slate-600">No versions yet — save or add a checkpoint.</p>
                ) : (
                  <ul className="max-h-[min(420px,50vh)] space-y-1 overflow-y-auto pr-0.5">
                    {layoutVersions.map((v) => (
                      <li
                        key={v.id}
                        className="rounded border border-slate-800 bg-slate-900/80 px-2 py-1.5 text-[10px]"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-200" title={v.label}>
                              {v.label}
                            </p>
                            <p className="text-[9px] text-slate-600">
                              {v.kind === 'saved' ? 'Saved' : 'Checkpoint'} ·{' '}
                              {new Date(v.at).toLocaleString(undefined, {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => restoreLayoutVersion(v)}
                              className="rounded bg-sky-700 px-1.5 py-0.5 text-[9px] text-white hover:bg-sky-600"
                            >
                              Restore
                            </button>
                            <button
                              type="button"
                              onClick={() => removeLayoutVersion(v.id)}
                              className="rounded px-1.5 py-0.5 text-[9px] text-slate-500 hover:text-red-400"
                              title="Remove from list"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {leftTool === 'section-order' && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Section order ({sections.length})
                </p>
                <p className="text-[9px] leading-relaxed text-slate-600">
                  Drag to reorder. Click a row for properties.{' '}
                  <span className="text-slate-400">Ctrl/Cmd+click</span> to multi-select, then Group.
                  Locked blocks hide the dashed page outline; grouped blocks move together on the page.
                </p>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={groupSelectedSections}
                    disabled={sectionOrderSelection.length < 2}
                    className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[9px] text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                    title="Assign one group id to all selected blocks (canvas: move together)"
                  >
                    Group
                  </button>
                  <button
                    type="button"
                    onClick={ungroupSelection}
                    disabled={
                      !sectionOrderSelection.some((i) => Boolean(sections[i]?.groupId))
                    }
                    className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[9px] text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Ungroup
                  </button>
                  <button
                    type="button"
                    onClick={toggleLockSelected}
                    disabled={selectedIdx === null}
                    className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[9px] text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                    title="Lock or unlock the primary selected block (last single-click)"
                  >
                    {selectedIdx !== null && isSectionLocked(sections[selectedIdx]) ? 'Unlock' : 'Lock'}
                  </button>
                  <button
                    type="button"
                    onClick={lockGroupOfPrimary}
                    disabled={selectedIdx === null || !sections[selectedIdx]?.groupId}
                    className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[9px] text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                    title="Lock every block in the primary block's group"
                  >
                    Lock group
                  </button>
                  <button
                    type="button"
                    onClick={unlockGroupOfPrimary}
                    disabled={selectedIdx === null || !sections[selectedIdx]?.groupId}
                    className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[9px] text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Unlock group
                  </button>
                </div>
                {sectionOrderSelection.length > 1 && (
                  <p className="text-[9px] text-violet-400/90">{sectionOrderSelection.length} selected</p>
                )}
                <div className="space-y-1 pb-2">
                  {sections.map((sec, idx) => (
                    <div
                      key={idx}
                      draggable
                      onDragStart={() => setDragSectionIdx(idx)}
                      onDragEnd={() => {
                        setDragSectionIdx(null);
                        setOrderHoverIdx(null);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        onDropSection(idx);
                      }}
                      onMouseEnter={() => setOrderHoverIdx(idx)}
                      onMouseLeave={() => setOrderHoverIdx(null)}
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          e.stopPropagation();
                          setSectionOrderSelection((prev) => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx);
                            else next.add(idx);
                            let arr = [...next].sort((a, b) => a - b);
                            if (arr.length === 0) arr = [idx];
                            setSelectedIdx(arr.includes(idx) ? idx : arr[arr.length - 1]!);
                            return arr;
                          });
                        } else {
                          setSelectedIdx(idx);
                          setSectionOrderSelection([idx]);
                        }
                        setRightPanel('properties');
                      }}
                      className={`flex cursor-grab items-center gap-1.5 rounded border px-2 py-1.5 text-xs transition active:cursor-grabbing ${
                        selectedIdx === idx
                          ? 'border-emerald-600 bg-emerald-900/40 text-emerald-300'
                          : sectionOrderSelection.includes(idx)
                            ? 'border-violet-500/70 bg-violet-950/35 text-violet-100'
                            : orderHoverIdx === idx
                              ? 'border-sky-500/60 bg-sky-950/40 text-sky-100'
                              : 'border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          sec.groupId ? 'bg-violet-400' : 'bg-slate-700'
                        }`}
                        title={sec.groupId ? 'In canvas group' : 'Ungrouped'}
                        aria-hidden
                      />
                      <span className="w-5 shrink-0 text-center text-slate-500">{idx + 1}</span>
                      <span
                        className="flex min-w-0 flex-1 items-baseline gap-1 truncate text-left"
                        title={getSectionOrderLabel(sec)}
                      >
                        {(() => {
                          const d = getSectionOrderDisplay(sec);
                          if (d.kind === 'split') {
                            return (
                              <>
                                <span className="shrink-0 font-medium text-slate-400">{d.base}</span>
                                <span className="shrink-0 text-slate-500">-</span>
                                <span className="min-w-0 truncate">{d.suffix}</span>
                              </>
                            );
                          }
                          return <span className="truncate">{d.text}</span>;
                        })()}
                      </span>
                      {isSectionLocked(sec) && (
                        <span className="shrink-0 text-[10px] text-amber-500/90" title="Locked">
                          🔒
                        </span>
                      )}
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateSection(idx, { ...sec, locked: !sec.locked });
                          }}
                          className="px-1 text-[10px] text-slate-500 hover:text-amber-300"
                          title={isSectionLocked(sec) ? 'Unlock' : 'Lock'}
                        >
                          {isSectionLocked(sec) ? '🔓' : '🔒'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveSection(idx, -1);
                          }}
                          disabled={idx === 0}
                          className="px-1 text-[10px] text-slate-500 hover:text-white disabled:opacity-20"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveSection(idx, 1);
                          }}
                          disabled={idx === sections.length - 1}
                          className="px-1 text-[10px] text-slate-500 hover:text-white disabled:opacity-20"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSection(idx);
                          }}
                          className="px-1 text-[10px] text-red-500 hover:text-red-300"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-700 bg-slate-900/95 p-2">
            <p className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Add block
            </p>
            <div className="grid max-h-36 grid-cols-3 gap-1 overflow-y-auto overflow-x-hidden">
              {SECTION_PALETTE.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => addSection(item.type)}
                  className="flex flex-col items-center gap-0.5 rounded bg-slate-800 p-1.5 text-center text-slate-400 transition hover:bg-slate-700 hover:text-white"
                  title={item.description}
                >
                  <span className="text-sm leading-none">{item.icon}</span>
                  <span className="text-[9px] leading-tight">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${
            previewWsMode === 'transparent' ? 'bg-slate-950' : 'bg-slate-800'
          }`}
        >
          <div className="min-h-0 flex-1 overflow-auto">
            <CanvasPreview
              template={previewTemplate}
              data={previewData}
              selectedIdx={selectedIdx}
              onSelectSection={(idx) => {
                setSelectedIdx(idx);
                setSectionOrderSelection([idx]);
                setRightPanel('properties');
              }}
              onUpdateSection={updateSection}
              onCanvasRectsChange={setCanvasRects}
              onInteractionEnd={onCanvasInteractionEnd}
              scale={previewScale}
              workspaceBackground={previewWorkspaceBackground}
              showRuler={showRuler}
              showSectionOutlines={showSectionOutlines}
              orderHoverIdx={orderHoverIdx}
              snapEnabled={snapEnabled}
              allowShrinkBelowContent={allowShrinkBelowContent}
            />
          </div>
          <div
            className="flex shrink-0 flex-col gap-2 border-t border-slate-700 bg-slate-900/95 px-3 py-2"
            title="Preview zoom (editor only — not print scale)"
          >
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Layout
                </span>
                <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-400">
                  <input
                    type="checkbox"
                    checked={snapEnabled}
                    onChange={(e) => setSnapEnabled(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  Snap
                </label>
                <label
                  className="flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-400"
                  title="Off: width/height stop at measured content in the preview"
                >
                  <input
                    type="checkbox"
                    checked={allowShrinkBelowContent}
                    onChange={(e) => setAllowShrinkBelowContent(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  Shrink below content
                </label>
                {selectedIdx !== null && (
                  <>
                    <span className="hidden h-3 w-px bg-slate-700 sm:inline" aria-hidden />
                    <button
                      type="button"
                      onClick={bringCanvasForward}
                      disabled={
                        selectedIdx !== null && isSectionLocked(sections[selectedIdx])
                      }
                      className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                      title="Bring forward (stacking)"
                    >
                      Forward
                    </button>
                    <button
                      type="button"
                      onClick={sendCanvasBackward}
                      disabled={
                        selectedIdx !== null && isSectionLocked(sections[selectedIdx])
                      }
                      className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                      title="Send backward (stacking)"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={duplicateSelectedSection}
                      className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedSection}
                      className="rounded border border-red-900/60 bg-slate-800 px-2 py-0.5 text-[10px] text-red-400 hover:bg-slate-700"
                    >
                      Delete
                    </button>
                  </>
                )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Zoom
              </span>
              <button
                type="button"
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
                onClick={() => setPreviewScale((s) => Math.max(1, Math.round((s - 0.2) * 100) / 100))}
              >
                −
              </button>
              <input
                type="range"
                min={1}
                max={4}
                step={0.05}
                value={previewScale}
                onChange={(e) => setPreviewScale(Number(e.target.value))}
                className="h-1.5 w-36 cursor-pointer accent-emerald-600"
              />
              <button
                type="button"
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
                onClick={() => setPreviewScale((s) => Math.min(4, Math.round((s + 0.2) * 100) / 100))}
              >
                +
              </button>
              <span className="w-12 text-right font-mono text-[10px] text-slate-400">
                {Math.round(previewScale * 100)}%
              </span>
            </div>
          </div>
        </div>

        <div className="allow-text-select flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-slate-700 bg-slate-900">
          <div className="flex shrink-0 border-b border-slate-700">
            <button
              type="button"
              onClick={() => setRightPanel('properties')}
              className={`flex-1 py-2.5 text-xs font-medium ${
                rightPanel === 'properties'
                  ? 'border-b-2 border-emerald-500 bg-slate-900 text-emerald-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Block properties
            </button>
            <button
              type="button"
              onClick={() => setRightPanel('data')}
              className={`flex-1 py-2.5 text-xs font-medium ${
                rightPanel === 'data'
                  ? 'border-b-2 border-emerald-500 bg-slate-900 text-emerald-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Data dictionary
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {rightPanel === 'data' ? (
              <DataFieldsExplorer itemType={String(template.itemType)} sampleData={previewData} />
            ) : selectedSection ? (
              <SectionEditor
                section={selectedSection}
                itemType={template.itemType}
                locked={isSectionLocked(selectedSection)}
                companyId={companyId}
                canvasRect={
                  CANVAS_MODE && selectedIdx != null ? canvasRects[selectedIdx] ?? null : null
                }
                canvasRectIndex={CANVAS_MODE ? selectedIdx : null}
                contentWidthMm={CANVAS_MODE ? contentWidthMm(margins) : undefined}
                contentHeightMm={CANVAS_MODE ? contentHeightMm(margins) : undefined}
                onCanvasRectChange={(idx, rect) =>
                  setCanvasRects((prev) => prev.map((r, i) => (i === idx ? { ...rect } : r)))
                }
                onChange={(updated) => updateSection(selectedIdx!, updated)}
              />
            ) : (
              <div className="px-2 py-10 text-center text-xs leading-relaxed text-slate-500">
                <p className="mb-2">
                  Click a block on the page, or choose one under <span className="text-slate-400">Blocks</span>{' '}
                  on the left.
                </p>
                <p className="text-slate-600">
                  Select a block on the page, then use <span className="text-slate-400">Layout</span> for snap
                  options or drag and resize in the preview.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
