"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import type { Character, CharacterBoardNode, CharacterRelation } from "@/domain/models";
import { deleteCharacter, listCharacters } from "@/db/repos/characters";
import {
  createCharacterRelation,
  deleteCharacterRelation,
  deleteCharacterBoardNodeByCharacterId,
  deleteRelationsByCharacterId,
  listCharacterBoardNodes,
  listCharacterRelations,
  nextCharacterBoardZIndex,
  upsertCharacterBoardNode,
  updateCharacterRelation,
  updateCharacterBoardNode,
} from "@/db/repos/characterBoard";
import { CharacterCreateDialog } from "@/components/CharacterCreateDialog";
import { RelationEditDialog } from "@/components/RelationEditDialog";
import { CharacterEditDialog } from "@/components/CharacterEditDialog";

const BOARD_W = 2600;
const BOARD_H = 1800;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

function stackPos(index: number) {
  const n = index % 7;
  return { x: 80 + n * 220, y: 80 + n * 140 + Math.floor(index / 7) * 120 };
}

function centerOfNode(n: CharacterBoardNode) {
  // Card size fixed below
  return { x: n.x + 110, y: n.y + 94 };
}

function shortLabel(c: Character) {
  const r = (c.role ?? "").trim();
  return r ? `${c.name} · ${r}` : c.name;
}

function CharacterNode({
  node,
  character,
  selected,
  connectMode,
  onSelect,
  onConnectClick,
  onEdit,
  onDelete,
  gripActive,
  followDragPx,
}: {
  node: CharacterBoardNode;
  character: Character;
  selected: boolean;
  connectMode: boolean;
  onSelect: (e: React.PointerEvent) => void;
  onConnectClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  gripActive: boolean;
  followDragPx: { x: number; y: number } | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `char:${node.characterId}`,
    data: { type: "charNode", characterId: node.characterId },
    disabled: gripActive,
  });

  const dx = followDragPx?.x ?? transform?.x ?? 0;
  const dy = followDragPx?.y ?? transform?.y ?? 0;

  const moved = Math.hypot(dx, dy) > 2;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect(e);
        if (connectMode && !moved) onConnectClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      style={{
        left: node.x,
        top: node.y,
        width: 220,
        height: 188,
        zIndex: 20 + node.zIndex,
        transform: dx || dy ? `translate3d(${dx}px,${dy}px,0)` : undefined,
      }}
      className={[
        "group absolute select-none rounded-2xl border bg-[var(--card-surface)]/90 shadow-lg backdrop-blur-md",
        selected ? "border-[color:var(--ui-accent)] ring-2 ring-[color:var(--ui-accent)]/40" : "border-[color:var(--card-border)]",
        isDragging ? "opacity-90" : "",
      ].join(" ")}
    >
      <button
        type="button"
        className="pointer-events-auto absolute -right-2 -top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-xs text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-red-600/90 group-hover:opacity-100"
        aria-label="Delete character"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        ×
      </button>
      <button
        type="button"
        className={[
          "absolute inset-0 z-10 rounded-2xl",
          connectMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
        ].join(" ")}
        {...listeners}
      />
      <div className="relative z-0 flex h-full flex-col gap-2 p-3">
        <div className="h-[120px] w-full overflow-hidden rounded-xl border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40">
          {character.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={character.imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] opacity-45">Photo</div>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{character.name}</div>
          <div className="truncate text-[11px] opacity-60">{character.role || "Character"}</div>
          {character.logline ? <div className="mt-1 line-clamp-2 text-[11px] opacity-80">{character.logline}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function CharactersPage() {
  const params = useParams();
  const projectId = typeof params.id === "string" ? params.id : null;

  const [characters, setCharacters] = useState<Character[]>([]);
  const [nodes, setNodes] = useState<CharacterBoardNode[]>([]);
  const [rels, setRels] = useState<CharacterRelation[]>([]);
  const [zoom, setZoom] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [editRelId, setEditRelId] = useState<string | null>(null);
  const [editCharId, setEditCharId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const nodesRef = useRef(nodes);
  const selectedRef = useRef(selectedIds);
  nodesRef.current = nodes;
  selectedRef.current = selectedIds;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const canvasScaleModifier = useMemo<Modifier>(
    () => (args) => {
      const z = zoom;
      if (!z || z === 1) return args.transform;
      return { ...args.transform, x: args.transform.x / z, y: args.transform.y / z };
    },
    [zoom],
  );

  const charById = useMemo(() => Object.fromEntries(characters.map((c) => [c.id, c])) as Record<string, Character>, [characters]);
  const nodeByChar = useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.characterId, n])) as Record<string, CharacterBoardNode>,
    [nodes],
  );

  const ensureNodesForCharacters = useCallback(
    async (chs: Character[], ns: CharacterBoardNode[]) => {
      if (!projectId) return;
      const have = new Set(ns.map((n) => n.characterId));
      const created: CharacterBoardNode[] = [];
      let idx = 0;
      for (const c of chs) {
        if (have.has(c.id)) continue;
        const pos = stackPos(idx++);
        const z = await nextCharacterBoardZIndex(projectId);
        const row = await upsertCharacterBoardNode({
          projectId,
          characterId: c.id,
          x: pos.x,
          y: pos.y,
          zIndex: z,
        });
        created.push(row);
      }
      if (created.length) setNodes((prev) => [...prev, ...created]);
    },
    [projectId],
  );

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const [chs, ns, rs] = await Promise.all([
        listCharacters(projectId),
        listCharacterBoardNodes(projectId),
        listCharacterRelations(projectId),
      ]);
      if (cancelled) return;
      setCharacters(chs);
      setNodes(ns);
      setRels(rs);
      await ensureNodesForCharacters(chs, ns);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, ensureNodesForCharacters]);

  // NOTE: no polling here — it was resetting controlled inputs while editing.

  const selectChar = useCallback((id: string, e: React.PointerEvent) => {
    const additive = e.ctrlKey || e.metaKey;
    setSelectedIds((prev) => {
      if (additive) return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (prev.includes(id) && prev.length > 1) return prev;
      return [id];
    });
  }, []);

  const onDeleteChar = useCallback(
    async (id: string) => {
      if (!projectId) return;
      await deleteCharacter(id);
      await deleteCharacterBoardNodeByCharacterId(projectId, id);
      await deleteRelationsByCharacterId(projectId, id);
      setCharacters((prev) => prev.filter((c) => c.id !== id));
      setNodes((prev) => prev.filter((n) => n.characterId !== id));
      setRels((prev) => prev.filter((r) => r.fromCharacterId !== id && r.toCharacterId !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      if (connectFrom === id) setConnectFrom(null);
    },
    [projectId, connectFrom],
  );

  const [multiDragVisual, setMultiDragVisual] = useState<{
    activeId: string;
    followerIds: string[];
    delta: { x: number; y: number };
  } | null>(null);

  const resolveMoveIds = useCallback((itemId: string) => {
    const sel = selectedRef.current;
    if (sel.includes(itemId) && sel.length > 1) return sel;
    return [itemId];
  }, []);

  const onWheelZoom = useCallback((e: React.WheelEvent) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.deltaY > 0 ? -1 : 1;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + dir * ZOOM_STEP) * 100) / 100)));
  }, []);

  const onDragStart = useCallback((e: DragStartEvent) => {
    const id = String(e.active.id);
    if (!id.startsWith("char:")) return;
    const charId = id.slice("char:".length);
    const moveIds = resolveMoveIds(charId);
    if (moveIds.length > 1) {
      setMultiDragVisual({
        activeId: charId,
        followerIds: moveIds.filter((x) => x !== charId),
        delta: { x: 0, y: 0 },
      });
    } else {
      setMultiDragVisual(null);
    }
  }, [resolveMoveIds]);

  const onDragMove = useCallback((e: DragMoveEvent) => {
    const id = String(e.active.id);
    if (!id.startsWith("char:")) return;
    const charId = id.slice("char:".length);
    const d = e.delta;
    setMultiDragVisual((prev) => {
      if (prev && prev.activeId === charId) return { ...prev, delta: { x: d.x, y: d.y } };
      // single drag: still track delta so lines can follow in real-time
      return { activeId: charId, followerIds: [], delta: { x: d.x, y: d.y } };
    });
  }, []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const id = String(e.active.id);
      setMultiDragVisual(null);
      if (!id.startsWith("char:")) return;
      const charId = id.slice("char:".length);
      const moveIds = resolveMoveIds(charId);
      const { x: dx, y: dy } = e.delta;
      if (dx === 0 && dy === 0) return;

      setNodes((prev) => {
        let next = prev;
        for (const mid of moveIds) {
          const n = next.find((x) => x.characterId === mid);
          if (!n) continue;
          const nx = Math.round(n.x + dx);
          const ny = Math.round(n.y + dy);
          void updateCharacterBoardNode(n.id, { x: nx, y: ny });
          next = next.map((x) => (x.id === n.id ? { ...x, x: nx, y: ny } : x));
        }
        return next;
      });
    },
    [resolveMoveIds],
  );

  const onDragCancel = useCallback((_e: DragCancelEvent) => setMultiDragVisual(null), []);

  const editingRel = useMemo(() => rels.find((r) => r.id === editRelId) ?? null, [rels, editRelId]);

  const relationLines = useMemo(() => {
    const dv = multiDragVisual;
    const dxById: Record<string, { x: number; y: number }> = {};
    if (dv) {
      dxById[dv.activeId] = dv.delta;
      for (const fid of dv.followerIds) dxById[fid] = dv.delta;
    }
    return rels
      .map((r) => {
        const a = nodeByChar[r.fromCharacterId];
        const b = nodeByChar[r.toCharacterId];
        if (!a || !b) return null;
        const da = dxById[r.fromCharacterId];
        const db = dxById[r.toCharacterId];
        const ca0 = centerOfNode(a);
        const cb0 = centerOfNode(b);
        const ca = da ? { x: ca0.x + da.x, y: ca0.y + da.y } : ca0;
        const cb = db ? { x: cb0.x + db.x, y: cb0.y + db.y } : cb0;
        return {
          id: r.id,
          a: ca,
          b: cb,
          label: r.label,
          color: r.color,
          dashed: r.dashed,
          arrow: r.arrow,
        };
      })
      .filter(Boolean) as {
      id: string;
      a: { x: number; y: number };
      b: { x: number; y: number };
      label: string;
      color?: string;
      dashed?: boolean;
      arrow?: boolean;
    }[];
  }, [rels, nodeByChar, multiDragVisual]);

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
        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--card-border)]/50 bg-[var(--card-surface)]/80 px-3 py-2 backdrop-blur-md" onWheel={onWheelZoom}>
          <div className="mr-2 flex items-center gap-1 rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/50 p-0.5">
            <button type="button" className="rounded-md px-2 py-1 text-xs hover:bg-[var(--ui-accent-muted)]/30" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))}>
              −
            </button>
            <span className="min-w-[3.25rem] text-center text-[11px] tabular-nums opacity-80">{Math.round(zoom * 100)}%</span>
            <button type="button" className="rounded-md px-2 py-1 text-xs hover:bg-[var(--ui-accent-muted)]/30" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))}>
              +
            </button>
            <button type="button" className="ml-1 border-l border-[color:var(--card-border)] pl-2 text-[11px] opacity-70 hover:opacity-100" onClick={() => setZoom(1)}>
              Reset
            </button>
          </div>

          <button
            type="button"
            className="rounded-md px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
            onClick={() => setCreateOpen(true)}
          >
            + Character
          </button>
          <button
            type="button"
            className={[
              "rounded-md px-2 py-1 text-[11px]",
              connectMode ? "bg-[var(--ui-accent-muted)]/35" : "hover:bg-[var(--ui-accent-muted)]/25",
            ].join(" ")}
            onClick={() => {
              setConnectMode((v) => !v);
              setConnectFrom(null);
            }}
          >
            {connectMode ? "Conectar: ON" : "Conectar"}
          </button>

          <span className="text-[10px] opacity-45">
            Shift + wheel: zoom · Ctrl/Cmd + click: multi-select · {connectMode ? "click 2 characters to link" : "drag to move"}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto" onWheelCapture={onWheelZoom}>
          <div style={{ width: BOARD_W * zoom, height: BOARD_H * zoom, position: "relative" }}>
            <DndContext
              sensors={sensors}
              modifiers={[canvasScaleModifier]}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onDragCancel={onDragCancel}
            >
              <div
                role="presentation"
                className="absolute left-0 top-0 bg-[color:var(--hole-fill)]/30"
                style={{
                  width: BOARD_W,
                  height: BOARD_H,
                  transform: `scale(${zoom})`,
                  transformOrigin: "0 0",
                  backgroundImage:
                    "radial-gradient(circle, color-mix(in oklab, var(--foreground) 12%, transparent) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
                onPointerDown={() => {
                  setSelectedIds([]);
                  if (!connectMode) return;
                  setConnectFrom(null);
                }}
              >
                <svg className="absolute inset-0 h-full w-full">
                  <defs>
                    {rels.map((r) => (
                      <marker
                        key={`m-${r.id}`}
                        id={`relArrow-${r.id}`}
                        markerWidth="10"
                        markerHeight="7"
                        refX="9"
                        refY="3.5"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <polygon points="0 0, 10 3.5, 0 7" fill={r.color || "rgba(148,163,184,0.95)"} stroke="none" />
                      </marker>
                    ))}
                  </defs>
                  {relationLines.map((l) => (
                    <g key={l.id}>
                      <line
                        x1={l.a.x}
                        y1={l.a.y}
                        x2={l.b.x}
                        y2={l.b.y}
                        stroke={l.color || "rgba(148,163,184,0.9)"}
                        strokeWidth={2}
                        strokeDasharray={l.dashed ? "6 6" : undefined}
                        markerEnd={l.arrow ? `url(#relArrow-${l.id})` : undefined}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditRelId(l.id);
                        }}
                        className="cursor-pointer"
                      />
                      {l.label ? (
                        <text x={(l.a.x + l.b.x) / 2} y={(l.a.y + l.b.y) / 2 - 6} fontSize={11} fill="rgba(226,232,240,0.9)">
                          {l.label}
                        </text>
                      ) : null}
                    </g>
                  ))}
                </svg>

                {nodes
                  .slice()
                  .sort((a, b) => a.zIndex - b.zIndex)
                  .map((n) => {
                    const c = charById[n.characterId];
                    if (!c) return null;
                    return (
                      <CharacterNode
                        key={n.id}
                        node={n}
                        character={c}
                        selected={selectedIds.includes(c.id)}
                        connectMode={connectMode}
                        onSelect={(e) => selectChar(c.id, e)}
                        onConnectClick={async () => {
                          if (!connectMode) return;
                          if (!connectFrom) {
                            setConnectFrom(c.id);
                            setSelectedIds([c.id]);
                            return;
                          }
                          if (connectFrom === c.id) return;
                          const row = await createCharacterRelation({
                            projectId,
                            fromCharacterId: connectFrom,
                            toCharacterId: c.id,
                          });
                          setRels((prev) => [...prev, row]);
                          setConnectFrom(null);
                        }}
                        onEdit={() => setEditCharId(c.id)}
                        onDelete={() => void onDeleteChar(c.id)}
                        gripActive={false}
                        followDragPx={
                          multiDragVisual?.followerIds.includes(c.id) ? multiDragVisual.delta : null
                        }
                      />
                    );
                  })}
              </div>
            </DndContext>
          </div>
        </div>
      </div>

      <CharacterCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        onCreated={async (c) => {
          setCharacters((prev) => [c, ...prev]);
          const ns = await listCharacterBoardNodes(projectId);
          setNodes(ns);
          await ensureNodesForCharacters([c], ns);
          setSelectedIds([c.id]);
        }}
      />

      {editCharId && charById[editCharId] ? (
        <CharacterEditDialog
          open={true}
          onOpenChange={(v) => {
            if (!v) setEditCharId(null);
          }}
          character={charById[editCharId]!}
          onSaved={(next) => {
            setCharacters((prev) => prev.map((c) => (c.id === next.id ? next : c)));
          }}
          onDeleted={(id) => {
            void onDeleteChar(id);
          }}
        />
      ) : null}

      {editingRel ? (
        <RelationEditDialog
          open={Boolean(editRelId)}
          onOpenChange={(v) => setEditRelId(v ? editRelId : null)}
          fromLabel={shortLabel(charById[editingRel.fromCharacterId] ?? { name: "?", role: "" } as Character)}
          toLabel={shortLabel(charById[editingRel.toCharacterId] ?? { name: "?", role: "" } as Character)}
          initialLabel={editingRel.label}
          initialColor={editingRel.color}
          initialDashed={editingRel.dashed}
          initialArrow={editingRel.arrow}
          onSave={(patch) => {
            void updateCharacterRelation(editingRel.id, patch);
            setRels((prev) => prev.map((r) => (r.id === editingRel.id ? { ...r, ...patch } : r)));
          }}
          onDelete={() => {
            void deleteCharacterRelation(editingRel.id);
            setRels((prev) => prev.filter((r) => r.id !== editingRel.id));
            setEditRelId(null);
          }}
        />
      ) : null}
    </div>
  );
}

