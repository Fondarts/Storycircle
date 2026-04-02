"use client";

import { useParams } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ScriptBlock, ScriptBlockType, ScriptDoc, Character } from "@/domain/models";
import { getOrCreateScriptDoc, toFountain, updateScriptDoc } from "@/db/repos/script";
import { listCharacters } from "@/db/repos/characters";
import { newId } from "@/db/ids";

/* ── Constants ───────────────────────────────────────────────────────── */

const TYPE_ORDER: ScriptBlockType[] = [
  "scene",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
];

const SCENE_PREFIXES = ["EXT.", "INT.", "INT./EXT.", "I/E.", "EST."];

const TIMES_OF_DAY = [
  "DAY",
  "NIGHT",
  "DAWN",
  "DUSK",
  "MORNING",
  "EVENING",
  "CONTINUOUS",
  "LATER",
  "MOMENTS LATER",
  "SAME",
];

/** ~54 lines at editor metrics (15px × 1.55); approx one US screenplay page. */
const SCRIPT_LINE_HEIGHT_PX = 15 * 1.55;
const SCRIPT_LINES_PER_PAGE = 54;
const PAGE_CONTENT_HEIGHT_PX = SCRIPT_LINE_HEIGHT_PX * SCRIPT_LINES_PER_PAGE;

function topRelativeToScroll(el: HTMLElement, scrollHost: HTMLElement): number {
  return el.getBoundingClientRect().top - scrollHost.getBoundingClientRect().top + scrollHost.scrollTop;
}

/* ── Types ───────────────────────────────────────────────────────────── */

type ACState = {
  blockId: string;
  items: string[];
  selectedIdx: number;
  field: "tod" | "location" | "character";
} | null;

/* ── Helpers ─────────────────────────────────────────────────────────── */

function nextType(t: ScriptBlockType) {
  const i = TYPE_ORDER.indexOf(t);
  return TYPE_ORDER[(i + 1) % TYPE_ORDER.length] ?? "action";
}

function prevType(t: ScriptBlockType) {
  const i = TYPE_ORDER.indexOf(t);
  return TYPE_ORDER[(i - 1 + TYPE_ORDER.length) % TYPE_ORDER.length] ?? "action";
}

function parseSceneHeading(text: string) {
  const t = (text ?? "").trim();
  const up = t.toUpperCase();
  let prefix = "";
  let rest = t;
  for (const p of SCENE_PREFIXES) {
    if (up.startsWith(p)) {
      prefix = p;
      rest = t.slice(p.length).trimStart();
      break;
    }
  }
  const di = rest.lastIndexOf(" - ");
  if (di >= 0) return { prefix, location: rest.slice(0, di).trim(), tod: rest.slice(di + 3).trim() };
  return { prefix, location: rest.trim(), tod: "" };
}

function detectTypeFromText(raw: string, fallback: ScriptBlockType): ScriptBlockType {
  const t = (raw ?? "").trim();
  const up = t.toUpperCase();
  if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.)\b/.test(up)) return "scene";
  if (/(TO:)$/.test(up) || /^(CUT TO:|SMASH TO:|FADE OUT\.|FADE IN:)/.test(up)) return "transition";
  if (/^\(.+\)$/.test(t)) return "parenthetical";
  if (t.length > 0 && t.length <= 28 && t === up && /^[A-Z0-9 '\-().]+$/.test(t)) return "character";
  return fallback;
}

/** True only when the line actually starts like a slugline (not merely because block.type is scene). */
function textStartsWithSceneHeadingPrefix(raw: string): boolean {
  const up = (raw ?? "").trim().toUpperCase();
  return /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.)\b/.test(up);
}

function blockStyle(type: ScriptBlockType): { wrap: string; label: string } {
  switch (type) {
    case "scene":
      return {
        label: "Scene heading",
        wrap: "w-full pl-6 pr-6 font-semibold tracking-wide uppercase",
      };
    case "action":
      return { label: "Action", wrap: "w-full pl-6 pr-6" };
    case "character":
      return {
        label: "Character",
        // Full script width so the cue is centered on the page; dialogue stays in a narrow column.
        wrap: "w-full px-6 uppercase font-semibold tracking-wide",
      };
    case "parenthetical":
      return {
        label: "Parenthetical",
        wrap: "mx-auto w-full max-w-[28rem] px-6 italic",
      };
    case "dialogue":
      return { label: "Dialogue", wrap: "mx-auto w-full max-w-[28rem] px-6" };
    case "transition":
      return {
        label: "Transition",
        wrap: "w-full pl-6 pr-6 uppercase font-semibold tracking-wide",
      };
    case "shot":
      return { label: "Shot", wrap: "w-full pl-6 pr-6 uppercase font-semibold tracking-wide" };
    default:
      return { label: "Block", wrap: "w-full pl-6 pr-6" };
  }
}

/**
 * Sluglines must stay left-aligned even if the block was left as "transition" after Tab-cycling.
 * Character cues stay centered; real transitions stay right.
 */
function resolveBlockTextAlign(
  type: ScriptBlockType,
  text: string,
): "center" | "left" | "right" {
  if (textStartsWithSceneHeadingPrefix(text)) return "left";
  if (type === "character") return "center";
  if (type === "transition") return "right";
  return "left";
}

function setCaretToEnd(el: HTMLElement | null) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function getCaretOffsetIn(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function setCaretAtOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const walk = (node: Node, pos: number): { node: Node; off: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (pos <= len) return { node, off: pos };
      return null;
    }
    let remaining = pos;
    for (const c of node.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) {
        const len = c.textContent?.length ?? 0;
        if (remaining <= len) return { node: c, off: remaining };
        remaining -= len;
      } else if (c.nodeType === Node.ELEMENT_NODE) {
        const inner = walk(c, remaining);
        if (inner) return inner;
        const sub = c.textContent?.length ?? 0;
        remaining -= sub;
      }
    }
    return null;
  };
  if (el.childNodes.length === 0) el.appendChild(document.createTextNode(""));
  const found = walk(el, offset);
  if (!found) {
    setCaretToEnd(el);
    return;
  }
  const range = document.createRange();
  range.setStart(found.node, found.off);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertPlainTextAtSelection(text: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function findFocusedBlockId(root: HTMLElement | null): string | null {
  if (!root) return null;
  const sel = window.getSelection();
  if (!sel?.anchorNode) return null;
  let n: Node | null = sel.anchorNode;
  if (n.nodeType === Node.TEXT_NODE) n = n.parentNode;
  while (n && n !== root) {
    if (n instanceof HTMLElement && n.hasAttribute("data-block-id")) {
      return n.getAttribute("data-block-id");
    }
    n = n.parentNode;
  }
  return null;
}

function findAnchorBlockInEditor(
  root: HTMLElement,
  blocks: ScriptBlock[],
): { el: HTMLElement; idx: number; id: string } | null {
  const sel = window.getSelection();
  if (!sel?.anchorNode) return null;
  let n: Node | null = sel.anchorNode;
  if (n.nodeType === Node.TEXT_NODE) n = n.parentNode;
  while (n && n !== root) {
    if (n instanceof HTMLElement && n.hasAttribute("data-block-id")) {
      const id = n.getAttribute("data-block-id")!;
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx >= 0) return { el: n, idx, id };
      return null;
    }
    n = n.parentNode;
  }
  return null;
}

function readBlocksFromEditorDom(root: HTMLElement, prev: ScriptBlock[]): ScriptBlock[] {
  const nodes = [...root.querySelectorAll("[data-block-id]")];
  return nodes.map((node) => {
    const el = node as HTMLElement;
    const id = el.getAttribute("data-block-id")!;
    const old = prev.find((b) => b.id === id);
    const text = (el.textContent ?? "").replace(/\u00A0/g, " ");
    return { id, type: old?.type ?? "action", text };
  });
}

/**
 * Keeps the same block count/types when the browser merges or strips lines while deleting.
 * Only Enter (split) and explicit empty Backspace should reduce blocks.
 */
function normalizeBlocksFromEditorDom(
  root: HTMLElement,
  prev: ScriptBlock[],
): { next: ScriptBlock[]; domLostBlocks: boolean } {
  const raw = readBlocksFromEditorDom(root, prev);
  if (prev.length === 0) {
    return {
      next: raw.length ? raw : [{ id: newId("blk"), type: "scene", text: "" }],
      domLostBlocks: false,
    };
  }
  if (raw.length === 0) {
    return {
      next: prev.map((b) => ({ ...b, text: "" })),
      domLostBlocks: true,
    };
  }
  if (raw.length < prev.length) {
    const texts: Record<string, string> = {};
    root.querySelectorAll("[data-block-id]").forEach((node) => {
      const id = node.getAttribute("data-block-id")!;
      texts[id] = (node.textContent ?? "").replace(/\u00A0/g, " ");
    });
    return {
      next: prev.map((b) => ({ ...b, text: texts[b.id] ?? "" })),
      domLostBlocks: true,
    };
  }
  return { next: raw, domLostBlocks: false };
}

function looksLikeCharacterCue(line: string): boolean {
  const t = line.trim();
  const noExt = t.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!noExt || noExt.length < 2 || noExt.length > 40) return false;
  if (noExt !== noExt.toUpperCase()) return false;
  if (!/^[A-Z]/.test(noExt)) return false;
  if (/[.!?,;:]$/.test(noExt)) return false;
  if (!/^[A-Z0-9 '\-]+$/.test(noExt)) return false;
  if (noExt.split(/\s+/).length > 5) return false;
  return true;
}

function addScreenplayLineBreaks(text: string, knownChars: string[]): string {
  const chars = [...new Set(knownChars.map((c) => c.toUpperCase()))]
    .filter((c) => c.length >= 2)
    .sort((a, b) => b.length - a.length);

  let r = text;

  r = r.replace(
    /\s*((\d+\.\s+)?(?:INT|EXT|INT\.\/EXT|INT\/EXT|I\/E|EST)\.\s)/gi,
    "\n\n$1",
  );

  const tods = [
    "MOMENTS LATER", "CONTINUOUS", "MORNING", "EVENING",
    "LATER", "NIGHT", "DAWN", "DUSK", "SAME", "DAY",
  ];
  const todPat = tods.map((t) => t.replace(/\s+/g, "\\s+")).join("|");
  r = r.replace(
    new RegExp(
      `((?:INT\\.|EXT\\.|INT\\.\/EXT\\.|INT\/EXT\\.|I\/E\\.|EST\\.)\\s[^\\n]+?\\s-\\s(?:${todPat}))(?=\\s+\\S)`,
      "gi",
    ),
    "$1\n\n",
  );

  for (const name of chars) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    r = r.replace(new RegExp(`([.!?])\\s+(${esc})\\b`, "g"), "$1\n\n$2");
  }

  r = r.replace(
    /([.!?])\s+([A-Z][A-Z0-9'\-]+(?:\s+[A-Z0-9'\-]+){0,2})\s+(?=[a-z(]|[A-Z][a-z])/g,
    "$1\n\n$2\n",
  );

  r = r.replace(
    /^([A-Z][A-Z0-9'\-]+(?:\s+[A-Z0-9'\-]+){0,3})\s+(\([^)]+\))\s*/gm,
    "$1\n$2\n",
  );

  for (const name of chars) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    r = r.replace(new RegExp(`^(${esc})[ \\t]+(?!\\n|\\()`, "gm"), "$1\n");
  }

  r = r.replace(
    /^([A-Z][A-Z0-9'\-]+(?:\s+[A-Z0-9'\-]+){0,2})[ \t]+(?=[a-z]|[A-Z][a-z])/gm,
    "$1\n",
  );

  return r.trim();
}

function findSceneHeadingEnd(text: string): number {
  const up = text.toUpperCase();
  const sorted = [...TIMES_OF_DAY].sort((a, b) => b.length - a.length);
  for (const tod of sorted) {
    const pat = " - " + tod;
    const idx = up.lastIndexOf(pat);
    if (idx < 0) continue;
    const end = idx + pat.length;
    if (end >= up.length || /^[\s,.]/.test(up[end])) return end;
  }
  return -1;
}

function parseScreenplayText(raw: string): ScriptBlock[] {
  const lines = raw.split(/\r?\n/);
  const result: ScriptBlock[] = [];
  type PState = "neutral" | "after_character" | "in_dialogue";
  let state: PState = "neutral";
  let accum: string[] = [];
  let accumType: ScriptBlockType = "action";

  function flush() {
    if (accum.length === 0) return;
    const text = accum.join(" ").trim();
    if (text) result.push({ id: newId("blk"), type: accumType, text });
    accum = [];
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flush();
      state = "neutral";
      accumType = "action";
      continue;
    }

    const sceneStripped = trimmed.replace(/^\d+\.\s+/, "");
    if (/^(INT\.|EXT\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.|EST\.)\b/i.test(sceneStripped)) {
      flush();
      const headEnd = findSceneHeadingEnd(sceneStripped);
      if (headEnd > 0 && headEnd < sceneStripped.length) {
        result.push({ id: newId("blk"), type: "scene", text: sceneStripped.slice(0, headEnd).trim() });
        const rest = sceneStripped.slice(headEnd).trim();
        if (rest) {
          accum = [rest];
        }
      } else {
        result.push({ id: newId("blk"), type: "scene", text: sceneStripped });
      }
      state = "neutral";
      accumType = "action";
      continue;
    }

    const tUp = trimmed.toUpperCase();
    if (/(TO:)$/.test(tUp) || /^(FADE OUT\.|FADE IN:)/.test(tUp)) {
      flush();
      result.push({ id: newId("blk"), type: "transition", text: trimmed });
      state = "neutral";
      accumType = "action";
      continue;
    }

    if (state === "after_character") {
      if (/^\(.*\)$/.test(trimmed)) {
        result.push({ id: newId("blk"), type: "parenthetical", text: trimmed });
        continue;
      }
      accum = [trimmed];
      accumType = "dialogue";
      state = "in_dialogue";
      continue;
    }

    if (state === "in_dialogue") {
      if (/^\(.*\)$/.test(trimmed)) {
        flush();
        result.push({ id: newId("blk"), type: "parenthetical", text: trimmed });
        state = "after_character";
        continue;
      }
      if (looksLikeCharacterCue(trimmed)) {
        flush();
        result.push({ id: newId("blk"), type: "character", text: trimmed });
        state = "after_character";
        continue;
      }
      accum.push(trimmed);
      continue;
    }

    if (looksLikeCharacterCue(trimmed)) {
      flush();
      result.push({ id: newId("blk"), type: "character", text: trimmed });
      state = "after_character";
      continue;
    }

    accum.push(trimmed);
    accumType = "action";
  }

  flush();
  return result;
}

/** Only the text line — memoized so React does not reconcile browser-owned text nodes on every keystroke. */
const ScriptBlockTextLine = memo(
  function ScriptBlockTextLine({
    blockId,
    wrap,
    label,
    innerRef,
  }: {
    blockId: string;
    wrap: string;
    label: string;
    innerRef: (el: HTMLDivElement | null) => void;
  }) {
    return (
      <div
        ref={innerRef}
        data-block-id={blockId}
        data-script-block
        className={["min-h-[1.25rem] whitespace-pre-wrap break-words py-1 outline-none", wrap].join(" ")}
        style={{ direction: "ltr", unicodeBidi: "isolate" }}
        aria-label={label}
      />
    );
  },
  (a, b) => a.blockId === b.blockId && a.wrap === b.wrap && a.label === b.label,
);

/* ═════════════════════════════════════════════════════════════════════ */

export default function ScriptPage() {
  const params = useParams();
  const projectId = typeof params.id === "string" ? params.id : null;

  const [doc, setDoc] = useState<ScriptDoc | null>(null);
  const [blocks, setBlocks] = useState<ScriptBlock[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [ac, setAc] = useState<ACState>(null);
  const [pagination, setPagination] = useState<{
    breakBefore: Set<number>;
    blockPage: number[];
    totalPages: number;
  }>({ breakBefore: new Set(), blockPage: [], totalPages: 1 });
  const [layoutGen, setLayoutGen] = useState(0);
  const [cornerPage, setCornerPage] = useState(1);
  const [pageBreakOverlay, setPageBreakOverlay] = useState<{ key: string; top: number; page: number }[]>(
    [],
  );
  const [lineMountKey, setLineMountKey] = useState(0);
  const lineMountKeyRef = useRef(0);

  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const columnRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const paginationRef = useRef(pagination);
  paginationRef.current = pagination;
  const saveTimer = useRef<number | null>(null);
  const undoStack = useRef<ScriptBlock[][]>([]);
  const redoStack = useRef<ScriptBlock[][]>([]);
  const undoTimer = useRef<number | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const activeBlockId = blocks[activeIdx]?.id ?? null;
  const acRef = useRef(ac);
  acRef.current = ac;
  const allCharNamesRef = useRef<string[]>([]);

  /* ─ Load doc ─ */
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const d = await getOrCreateScriptDoc(projectId);
      if (cancelled) return;
      setDoc(d);
      setBlocks(d.blocks);
      setActiveIdx(0);
      lineMountKeyRef.current += 1;
      setLineMountKey(lineMountKeyRef.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /* ─ Load characters for autocomplete ─ */
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    listCharacters(projectId).then((r) => {
      if (!cancelled) setCharacters(r);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /*
   * Never assign el.textContent from React on every [blocks] tick — it races with contentEditable
   * and breaks commitPlacement (insertBefore). Only seed after a deliberate shell remount.
   */
  useLayoutEffect(() => {
    const root = editorRef.current;
    const bl = blocksRef.current;
    if (!root || bl.length === 0) return;
    for (const b of bl) {
      const el = [...root.querySelectorAll("[data-block-id]")].find(
        (n) => n.getAttribute("data-block-id") === b.id,
      ) as HTMLElement | undefined;
      if (el) el.textContent = b.text ?? "";
    }
  }, [lineMountKey]);

  /* Per-line alignment: style only (no child node replacement), deferred out of commit window. */
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const root = editorRef.current;
      if (!root) return;
      const bl = blocksRef.current;
      for (const b of bl) {
        const el = [...root.querySelectorAll("[data-block-id]")].find(
          (n) => n.getAttribute("data-block-id") === b.id,
        ) as HTMLElement | undefined;
        if (!el) continue;
        el.style.textAlign = resolveBlockTextAlign(
          b.type,
          (el.textContent ?? "").replace(/\u00A0/g, " "),
        );
      }
    });
    return () => cancelAnimationFrame(id);
  }, [blocks, lineMountKey]);

  /* Page-break decorations outside React’s contentEditable children (prevents removeChild conflicts) */
  useLayoutEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const marks: { key: string; top: number; page: number }[] = [];
    for (let idx = 0; idx < blocks.length; idx++) {
      if (!pagination.breakBefore.has(idx)) continue;
      const b = blocks[idx];
      const row = rowRefs.current[b.id];
      if (!row) continue;
      const page = pagination.blockPage[idx] ?? idx + 1;
      marks.push({ key: `pb-${b.id}`, top: Math.max(0, row.offsetTop - 6), page });
    }
    setPageBreakOverlay(marks);
  }, [blocks, pagination.breakBefore, pagination.blockPage, layoutGen]);

  /* ─ Screenplay page breaks (height-based) ─ */
  useLayoutEffect(() => {
    if (!projectId) return;
    const col = columnRef.current;
    if (!col) return;
    const ro = new ResizeObserver(() => setLayoutGen((g) => g + 1));
    ro.observe(col);
    return () => ro.disconnect();
  }, [projectId, blocks.length]);

  useLayoutEffect(() => {
    if (blocks.length === 0) {
      setPagination({ breakBefore: new Set(), blockPage: [], totalPages: 1 });
      return;
    }
    const breakBefore = new Set<number>();
    const blockPage: number[] = [];
    let used = 0;
    let pageNum = 1;

    for (let i = 0; i < blocks.length; i++) {
      const row = rowRefs.current[blocks[i].id];
      const h = row?.getBoundingClientRect().height ?? 28;
      if (i > 0 && used + h > PAGE_CONTENT_HEIGHT_PX) {
        breakBefore.add(i);
        pageNum++;
        used = h;
      } else {
        used += h;
      }
      blockPage.push(pageNum);
    }

    setPagination({ breakBefore, blockPage, totalPages: pageNum });
  }, [blocks, layoutGen, activeBlockId, ac, activeIdx]);

  const updateCornerPageFromScroll = useCallback(() => {
    const scroll = scrollAreaRef.current;
    const pag = paginationRef.current;
    const bl = blocksRef.current;
    if (!scroll || pag.blockPage.length !== bl.length) return;
    const anchor = scroll.scrollTop + 36;
    let page = 1;
    for (let i = 0; i < bl.length; i++) {
      const row = rowRefs.current[bl[i].id];
      if (!row) continue;
      const y = topRelativeToScroll(row, scroll);
      if (y <= anchor) page = pag.blockPage[i] ?? 1;
    }
    setCornerPage(page);
  }, []);

  useLayoutEffect(() => {
    updateCornerPageFromScroll();
  }, [pagination, updateCornerPageFromScroll]);

  useEffect(() => {
    const scroll = scrollAreaRef.current;
    if (!scroll) return;
    updateCornerPageFromScroll();
    scroll.addEventListener("scroll", updateCornerPageFromScroll, { passive: true });
    return () => scroll.removeEventListener("scroll", updateCornerPageFromScroll);
  }, [updateCornerPageFromScroll]);

  useEffect(() => {
    const pag = paginationRef.current;
    const p = pag.blockPage[activeIdx];
    if (p != null) setCornerPage(p);
  }, [activeIdx]);

  /* ─ Computed values ─ */

  const sceneNumbers = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const b of blocks) {
      if (b.type === "scene") m.set(b.id, ++n);
    }
    return m;
  }, [blocks]);

  const sceneList = useMemo(
    () =>
      blocks
        .filter((b) => b.type === "scene")
        .map((b) => ({ id: b.id, num: sceneNumbers.get(b.id) ?? 0, text: b.text })),
    [blocks, sceneNumbers],
  );

  const activeSceneId = useMemo(() => {
    for (let i = activeIdx; i >= 0; i--) {
      if (blocks[i]?.type === "scene") return blocks[i].id;
    }
    return null;
  }, [blocks, activeIdx]);

  const usedLocations = useMemo(() => {
    const s = new Set<string>();
    for (const b of blocks) {
      if (b.type !== "scene") continue;
      const { location } = parseSceneHeading(b.text);
      if (location) s.add(location.toUpperCase());
    }
    return [...s].sort();
  }, [blocks]);

  const allCharNames = useMemo(() => {
    const s = new Set(characters.map((c) => c.name.toUpperCase()).filter(Boolean));
    for (const b of blocks) {
      if (b.type === "character" && b.text.trim()) s.add(b.text.trim().toUpperCase());
    }
    return [...s].sort();
  }, [characters, blocks]);
  allCharNamesRef.current = allCharNames;

  /* ─ Persistence ─ */

  const queueSave = useCallback(
    (nextBlocks: ScriptBlock[]) => {
      if (!doc) return;
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        setSaving(true);
        try {
          await updateScriptDoc(doc.id, { blocks: nextBlocks });
        } finally {
          setSaving(false);
        }
      }, 450);
    },
    [doc],
  );

  const pushUndo = useCallback((snapshot: ScriptBlock[]) => {
    if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => {
      undoStack.current = [...undoStack.current.slice(-60), snapshot];
      redoStack.current = [];
    }, 400);
  }, []);

  const undo = useCallback(() => {
    const stack = undoStack.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    undoStack.current = stack.slice(0, -1);
    redoStack.current = [...redoStack.current, blocksRef.current];
    setBlocks(prev);
    queueSave(prev);
    lineMountKeyRef.current += 1;
    setLineMountKey(lineMountKeyRef.current);
  }, [queueSave]);

  const redo = useCallback(() => {
    const stack = redoStack.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    redoStack.current = stack.slice(0, -1);
    undoStack.current = [...undoStack.current, blocksRef.current];
    setBlocks(next);
    queueSave(next);
    lineMountKeyRef.current += 1;
    setLineMountKey(lineMountKeyRef.current);
  }, [queueSave]);

  const setBlockText = useCallback(
    (idx: number, text: string) => {
      pushUndo(blocksRef.current);
      setBlocks((prev) => {
        const next = prev.map((b, i) => (i === idx ? { ...b, text } : b));
        queueSave(next);
        return next;
      });
    },
    [queueSave, pushUndo],
  );

  const setBlockType = useCallback(
    (idx: number, type: ScriptBlockType) => {
      pushUndo(blocksRef.current);
      setBlocks((prev) => {
        const next = prev.map((b, i) => (i === idx ? { ...b, type } : b));
        queueSave(next);
        return next;
      });
    },
    [queueSave, pushUndo],
  );

  const insertBlockAfter = useCallback(
    (idx: number, type: ScriptBlockType) => {
      pushUndo(blocksRef.current);
      const id = newId("blk");
      const nb: ScriptBlock = { id, type, text: "" };
      setBlocks((prev) => {
        const next = [...prev.slice(0, idx + 1), nb, ...prev.slice(idx + 1)];
        queueSave(next);
        return next;
      });
      setActiveIdx(idx + 1);
      requestAnimationFrame(() => {
        editorRef.current?.focus();
        setCaretToEnd(blockRefs.current[id]);
      });
    },
    [queueSave, pushUndo],
  );

  const deleteBlockAt = useCallback(
    (idx: number) => {
      pushUndo(blocksRef.current);
      setBlocks((prev) => {
        if (prev.length <= 1) return prev.map((b, i) => (i === 0 ? { ...b, text: "" } : b));
        const next = prev.filter((_, i) => i !== idx);
        queueSave(next);
        return next;
      });
      setActiveIdx((i) => Math.max(0, Math.min(i, blocksRef.current.length - 2)));
    },
    [queueSave, pushUndo],
  );

  /* ─ Sidebar scroll ─ */

  const scrollToBlock = useCallback((bid: string) => {
    const el = blockRefs.current[bid];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      editorRef.current?.focus();
      setCaretAtOffset(el, 0);
    }
  }, []);

  /* ─ Autocomplete helpers ─ */

  const updateAc = useCallback(
    (blockId: string, type: ScriptBlockType, text: string) => {
      if (type === "scene") {
        const { prefix, location, tod } = parseSceneHeading(text);
        const hasSep = text.includes(" - ");
        if (prefix && hasSep) {
          const f = tod.toUpperCase();
          const items = TIMES_OF_DAY.filter((t) => t.startsWith(f) && t !== f);
          if (items.length > 0) {
            setAc({ blockId, items, selectedIdx: 0, field: "tod" });
            return;
          }
        } else if (prefix && location.length >= 1) {
          const f = location.toUpperCase();
          const items = usedLocations.filter((l) => l.includes(f) && l !== f);
          if (items.length > 0) {
            setAc({ blockId, items, selectedIdx: 0, field: "location" });
            return;
          }
        }
      } else if (type === "character") {
        const f = text.trim().toUpperCase();
        if (f.length >= 1) {
          const items = allCharNames.filter((n) => n.startsWith(f) && n !== f);
          if (items.length > 0) {
            setAc({ blockId, items, selectedIdx: 0, field: "character" });
            return;
          }
        }
      }
      setAc(null);
    },
    [usedLocations, allCharNames],
  );

  const acceptAc = useCallback(
    (idx: number, value: string) => {
      const cur = acRef.current;
      if (!cur) return;
      const b = blocksRef.current[idx];
      if (!b) return;
      const el = blockRefs.current[b.id];

      let nt = "";
      if (cur.field === "tod") {
        const { prefix, location } = parseSceneHeading(b.text);
        nt = `${prefix} ${location} - ${value}`;
      } else if (cur.field === "location") {
        const { prefix } = parseSceneHeading(b.text);
        nt = `${prefix} ${value}`;
      } else {
        nt = value;
      }

      if (el) {
        el.textContent = nt;
        setCaretToEnd(el);
      }
      setBlockText(idx, nt);
      setAc(null);
    },
    [setBlockText],
  );

  /* ─ Editor input / keydown (single contentEditable → multi-block selection) ─ */

  const handleEditorInput = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    const prev = blocksRef.current;
    pushUndo(prev);
    const info = findAnchorBlockInEditor(root, prev);
    if (info) {
      const { el, idx } = info;
      const b = prev[idx];
      if (b?.type === "scene") {
        const trimmed = (el.textContent ?? "").trim().toUpperCase();
        if (trimmed === "E") {
          el.textContent = "EXT. ";
          setCaretToEnd(el);
        } else if (trimmed === "I") {
          el.textContent = "INT. ";
          setCaretToEnd(el);
        }
      }
    }
    const { next, domLostBlocks } = normalizeBlocksFromEditorDom(root, prev);
    if (domLostBlocks) {
      lineMountKeyRef.current += 1;
      setLineMountKey(lineMountKeyRef.current);
    }
    setBlocks(next);
    queueSave(next);
    queueMicrotask(() => {
      const r = editorRef.current;
      if (!r) return;
      const hit = findAnchorBlockInEditor(r, next);
      if (hit) {
        setActiveIdx(hit.idx);
        const bb = next[hit.idx];
        if (bb) updateAc(bb.id, bb.type, bb.text);
      } else {
        setAc(null);
      }
    });
  }, [queueSave, updateAc, pushUndo]);

  const onEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const root = editorRef.current;
      if (!root) return;
      const info = findAnchorBlockInEditor(root, blocksRef.current);
      if (!info) return;
      const { el, idx } = info;
      const b = blocksRef.current[idx];
      if (!b) return;
      const liveText = (el.textContent ?? "").replace(/\u00A0/g, " ");
      const curAc = acRef.current;

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      if (curAc && curAc.blockId === b.id) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setAc((p) => (p ? { ...p, selectedIdx: Math.min(p.selectedIdx + 1, p.items.length - 1) } : null));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setAc((p) => (p ? { ...p, selectedIdx: Math.max(p.selectedIdx - 1, 0) } : null));
          return;
        }
        if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
          e.preventDefault();
          acceptAc(idx, curAc.items[curAc.selectedIdx]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setAc(null);
          return;
        }
      }

      if (e.key === "Tab" && e.altKey) {
        e.preventDefault();
        setAc(null);
        if (e.shiftKey) setBlockType(idx, prevType(b.type));
        else setBlockType(idx, nextType(b.type));
        return;
      }

      if (e.key === "Tab" && !e.shiftKey && textStartsWithSceneHeadingPrefix(liveText)) {
        e.preventDefault();
        if (b.type !== "scene") setBlockType(idx, "scene");
        const text = liveText.trim();
        const { prefix, location, tod } = parseSceneHeading(text);
        const hasSep = liveText.includes(" - ");

        if (prefix && location && !hasSep) {
          const nt = text + " - ";
          el.textContent = nt;
          setCaretToEnd(el);
          setBlockText(idx, nt);
          setAc({ blockId: b.id, items: TIMES_OF_DAY, selectedIdx: 0, field: "tod" });
          return;
        }
        if (prefix && hasSep && tod) {
          setAc(null);
          setBlockType(idx, nextType(b.type));
          return;
        }
        return;
      }

      if (e.key === "Tab" && !e.shiftKey && b.type === "action") {
        const raw = liveText.trim();
        const up = raw.toUpperCase();
        const looksLikeCharacter = detectTypeFromText(raw, "action") === "character";
        const isKnownCharacter = allCharNamesRef.current.includes(up);
        if ((looksLikeCharacter || isKnownCharacter) && raw.length > 0) {
          e.preventDefault();
          setAc(null);
          setBlockType(idx, "character");
          return;
        }
      }

      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) setBlockType(idx, prevType(b.type));
        else setBlockType(idx, nextType(b.type));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        setAc(null);
        pushUndo(blocksRef.current);
        const caret = getCaretOffsetIn(el);
        const before = liveText.slice(0, caret);
        const after = liveText.slice(caret);
        const nid = newId("blk");
        setBlocks((prev) => {
          const cur = prev[idx];
          if (!cur) return prev;
          const curText = before.trim();
          const detected = detectTypeFromText(before.trim(), cur.type);
          let nbType: ScriptBlockType = "action";
          if (detected === "character") nbType = "dialogue";
          else if (detected === "parenthetical") nbType = "dialogue";
          else if (detected === "dialogue") nbType = curText ? "dialogue" : "action";
          else if (detected === "scene") nbType = "action";
          else if (detected === "transition") nbType = "scene";
          if (!curText) nbType = "action";
          const line0: ScriptBlock = { ...cur, type: detected, text: before };
          const nb: ScriptBlock = { id: nid, type: nbType, text: after };
          const arr = [...prev.slice(0, idx), line0, nb, ...prev.slice(idx + 1)];
          queueSave(arr);
          return arr;
        });
        lineMountKeyRef.current += 1;
        setLineMountKey(lineMountKeyRef.current);
        setActiveIdx(idx + 1);
        requestAnimationFrame(() => {
          const line = blockRefs.current[nid];
          if (line) {
            editorRef.current?.focus();
            setCaretAtOffset(line, 0);
          }
        });
        return;
      }

      if (e.key === "Backspace") {
        if (liveText.length === 0 && idx > 0) {
          e.preventDefault();
          setAc(null);
          const prevId = blocksRef.current[idx - 1]?.id;
          deleteBlockAt(idx);
          if (prevId) {
            setActiveIdx(idx - 1);
            requestAnimationFrame(() => {
              editorRef.current?.focus();
              setCaretToEnd(blockRefs.current[prevId]);
            });
          }
        }
      }
    },
    [acceptAc, deleteBlockAt, setBlockText, setBlockType, queueSave, pushUndo, undo, redo],
  );

  useEffect(() => {
    const onSel = () => {
      const root = editorRef.current;
      if (!root || !document.contains(root)) return;
      const hit = findAnchorBlockInEditor(root, blocksRef.current);
      if (hit) setActiveIdx(hit.idx);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  /* ─ Smart screenplay paste ─ */

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;

      let textToParse = text;
      const hasParaBreaks = /\n\s*\n/.test(text);
      if (!hasParaBreaks) {
        const flat = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
        const restored = addScreenplayLineBreaks(flat, allCharNamesRef.current);
        if (restored !== flat) textToParse = restored;
      }

      const parsed = parseScreenplayText(textToParse);
      const hasStructure = parsed.length > 1 || parsed.some((b) => b.type !== "action");

      if (!hasStructure) {
        insertPlainTextAtSelection(text);
        requestAnimationFrame(() => handleEditorInput());
        return;
      }

      const prev = blocksRef.current;
      pushUndo(prev);
      const root = editorRef.current;
      const info = root ? findAnchorBlockInEditor(root, prev) : null;
      const idx = info?.idx ?? Math.max(0, prev.length - 1);
      const curBlockDomEmpty = info?.el
        ? (info.el.textContent ?? "").replace(/\u00A0/g, " ").trim() === ""
        : !prev[idx] || prev[idx].text.trim() === "";

      const sel = window.getSelection();
      let startIdx = idx;
      let endIdx = idx;
      if (sel && !sel.isCollapsed && root) {
        const findIdx = (node: Node | null) => {
          let n: Node | null = node;
          if (n?.nodeType === Node.TEXT_NODE) n = n.parentNode;
          while (n && n !== root) {
            if (n instanceof HTMLElement && n.hasAttribute("data-block-id")) {
              const id = n.getAttribute("data-block-id")!;
              const i = prev.findIndex((b) => b.id === id);
              if (i >= 0) return i;
              break;
            }
            n = n.parentNode;
          }
          return -1;
        };
        const si = findIdx(sel.anchorNode);
        const ei = findIdx(sel.focusNode);
        if (si >= 0 && ei >= 0) {
          startIdx = Math.min(si, ei);
          endIdx = Math.max(si, ei);
        }
      }

      let next: ScriptBlock[];
      let newActiveIdx: number;
      if (startIdx !== endIdx) {
        next = [...prev.slice(0, startIdx), ...parsed, ...prev.slice(endIdx + 1)];
        newActiveIdx = startIdx + parsed.length - 1;
      } else if (curBlockDomEmpty) {
        next = [...prev.slice(0, idx), ...parsed, ...prev.slice(idx + 1)];
        newActiveIdx = idx + parsed.length - 1;
      } else {
        next = [...prev.slice(0, idx + 1), ...parsed, ...prev.slice(idx + 1)];
        newActiveIdx = idx + parsed.length;
      }

      if (next.length === 0) {
        next = [{ id: newId("blk"), type: "scene", text: "" }];
      }

      setBlocks(next);
      queueSave(next);
      lineMountKeyRef.current += 1;
      setLineMountKey(lineMountKeyRef.current);
      setActiveIdx(Math.min(newActiveIdx, next.length - 1));

      requestAnimationFrame(() => {
        const last = parsed[parsed.length - 1];
        if (last) {
          const el = blockRefs.current[last.id];
          if (el) {
            editorRef.current?.focus();
            setCaretToEnd(el);
          }
        }
      });
    },
    [handleEditorInput, queueSave, pushUndo],
  );

  /* ─ Fountain export ─ */

  const onCopyFountain = useCallback(async () => {
    try {
      const txt = toFountain(blocksRef.current);
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      /* ignore */
    }
  }, []);

  /* ─ Render ─ */

  if (!projectId) {
    return (
      <div className="m-4 rounded-xl border border-dashed border-[color:var(--card-border)] p-6 text-sm">
        Missing project id.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent text-[color:var(--foreground)]">
      <div className="flex min-h-0 flex-1 flex-col pt-14">
        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--card-border)]/50 bg-[var(--card-surface)]/80 px-3 py-2 backdrop-blur-md">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Script</div>
            <div className="text-[11px] opacity-60">{doc?.title ?? "Script"}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-[color:var(--card-border)] px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25 disabled:opacity-30"
              disabled={undoStack.current.length === 0}
              onClick={undo}
              title="Undo (Ctrl+Z)"
            >
              Undo
            </button>
            <button
              type="button"
              className="rounded-md border border-[color:var(--card-border)] px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25 disabled:opacity-30"
              disabled={redoStack.current.length === 0}
              onClick={redo}
              title="Redo (Ctrl+Shift+Z)"
            >
              Redo
            </button>
            <button
              type="button"
              className="rounded-md border border-[color:var(--card-border)] px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
              onClick={() => {
                const b = blocksRef.current[activeIdx];
                if (!b) return;
                setBlockType(activeIdx, nextType(b.type));
              }}
            >
              Element: {blocks[activeIdx]?.type ?? "action"}
            </button>
            <button
              type="button"
              className="rounded-md border border-[color:var(--card-border)] px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
              onClick={() => insertBlockAfter(activeIdx, "action")}
            >
              + Action
            </button>
            <button
              type="button"
              className="rounded-md border border-[color:var(--card-border)] px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
              onClick={() => insertBlockAfter(activeIdx, "scene")}
            >
              + Scene
            </button>
            <button
              type="button"
              className="rounded-md border border-[color:var(--card-border)] px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
              onClick={() => void onCopyFountain()}
            >
              {copied ? "Copied" : "Copy Fountain"}
            </button>
            <span className="text-[10px] opacity-55">{saving ? "Saving…" : "Saved"}</span>
          </div>
        </div>

        {/* ── Body: sidebar + editor ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Scene sidebar */}
          <aside className="hidden w-52 shrink-0 flex-col overflow-auto border-r border-[color:var(--card-border)]/40 bg-[var(--card-surface)]/30 px-2 py-4 lg:flex">
            <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-wider opacity-50">
              Scenes
            </div>
            {sceneList.length === 0 && (
              <div className="px-2 text-[11px] opacity-40">No scenes yet</div>
            )}
            {sceneList.map((s) => {
              const h = parseSceneHeading(s.text);
              const disp = h.location ? `${h.prefix} ${h.location}`.trim() : s.text || "Untitled";
              return (
                <button
                  key={s.id}
                  type="button"
                  className={[
                    "mb-0.5 flex w-full items-start gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors",
                    s.id === activeSceneId
                      ? "bg-[var(--ui-accent-muted)]/30 font-medium"
                      : "hover:bg-[var(--ui-accent-muted)]/15",
                  ].join(" ")}
                  onClick={() => scrollToBlock(s.id)}
                >
                  <span className="mt-px shrink-0 font-mono text-[11px] font-bold opacity-50">
                    {s.num}
                  </span>
                  <span className="line-clamp-2 min-w-0 break-words leading-snug">{disp}</span>
                </button>
              );
            })}
          </aside>

          {/* Editor scroll area */}
          <div ref={scrollAreaRef} className="relative min-h-0 flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-[52rem] px-4 py-8" style={{ direction: "ltr" }}>
              <div className="pointer-events-none sticky top-3 z-30 -mb-2 flex justify-end pr-1">
                <span className="rounded-md border border-[color:var(--card-border)] bg-[var(--card-surface)]/95 px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums text-[color:var(--foreground)] shadow-sm backdrop-blur-md">
                  Page {cornerPage} / {Math.max(1, pagination.totalPages)}
                </span>
              </div>
              <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-surface)]/40 p-4 shadow-sm backdrop-blur-sm">
                <div className="rounded-xl bg-white/5 px-0 py-2">
                  <div
                    ref={columnRef}
                    className="relative font-mono text-[15px] leading-[1.55] text-[color:var(--foreground)]"
                    style={{ direction: "ltr", unicodeBidi: "isolate" }}
                  >
                    <div className="relative">
                      <div
                        key={`script-ed-${lineMountKey}`}
                        ref={editorRef}
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck={false}
                        dir="ltr"
                        className="relative z-0 outline-none"
                        onInput={handleEditorInput}
                        onKeyDown={onEditorKeyDown}
                        onBlur={() => setAc(null)}
                        onPaste={handlePaste}
                      >
                        {blocks.map((b, idx) => {
                          const s = blockStyle(b.type);
                          const sceneNum = b.type === "scene" ? sceneNumbers.get(b.id) : undefined;
                          return (
                            <div
                              key={b.id}
                              ref={(el) => {
                                rowRefs.current[b.id] = el;
                              }}
                              className={[
                                "relative group",
                                idx === activeIdx ? "bg-[var(--ui-accent-muted)]/10" : "",
                              ].join(" ")}
                              onPointerDown={() => setActiveIdx(idx)}
                            >
                              <ScriptBlockTextLine
                                blockId={b.id}
                                wrap={s.wrap}
                                label={s.label}
                                innerRef={(el) => {
                                  blockRefs.current[b.id] = el;
                                }}
                              />
                              {sceneNum != null && (
                                <div className="pointer-events-none absolute left-1 top-1 select-none font-mono text-[11px] font-bold opacity-30">
                                  {sceneNum}
                                </div>
                              )}
                              {ac && ac.blockId === b.id && (
                                <div className="absolute left-6 right-6 top-full z-50 mt-0.5 max-h-44 overflow-auto rounded-lg border border-[color:var(--card-border)] bg-[var(--card-surface)] shadow-xl backdrop-blur-xl">
                                  {ac.items.map((item, i) => (
                                    <div
                                      key={item}
                                      className={[
                                        "cursor-pointer px-3 py-1.5 font-mono text-[13px] transition-colors",
                                        i === ac.selectedIdx
                                          ? "bg-[var(--ui-accent-muted)]/30 font-semibold"
                                          : "hover:bg-[var(--ui-accent-muted)]/15",
                                      ].join(" ")}
                                      onMouseDown={(ev) => {
                                        ev.preventDefault();
                                        acceptAc(idx, item);
                                      }}
                                    >
                                      {item}
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="pointer-events-none absolute right-2 top-1 text-[10px] opacity-0 transition-opacity group-hover:opacity-50">
                                {s.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div
                        className="pointer-events-none absolute inset-0 z-[2] overflow-visible"
                        aria-hidden
                      >
                        {pageBreakOverlay.map((m) => (
                          <div
                            key={m.key}
                            className="absolute left-4 right-4 flex items-center gap-2 pt-1 text-[color:var(--foreground)]/35"
                            style={{ top: m.top }}
                          >
                            <div className="h-px flex-1 bg-[color:var(--card-border)]/60" />
                            <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-widest">
                              Page break · {m.page}
                            </span>
                            <div className="h-px flex-1 bg-[color:var(--card-border)]/60" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 text-[11px] opacity-55">
                Scene: type E/I for auto-prefix · Tab adds &ldquo; - &rdquo; on sluglines · ↑↓ pick
                suggestions · Tab / Shift+Tab cycle element · Enter adds next block · Alt+Tab always
                cycles type · Page breaks ≈ 54 lines at this font size (screen estimate)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
