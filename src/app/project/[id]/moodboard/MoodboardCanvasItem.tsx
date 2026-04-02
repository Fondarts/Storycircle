"use client";

import { useDraggable } from "@dnd-kit/core";
import type { MoodboardItem, MoodboardShapeVariant } from "@/domain/models";
import {
  safeHref,
  safeImageSrc,
  videoPageToEmbedSrc,
} from "@/domain/moodboardEmbed";

export const MOODBOARD_DRAG_PREFIX = "mood:";

export type MoodboardGripMode =
  | "resize-se"
  | "resize-nw"
  | "resize-ne"
  | "resize-sw"
  | "rotate"
  | "line-a"
  | "line-b";

export function shapeVariantFromText(t: string): MoodboardShapeVariant {
  const s = (t ?? "").trim().toLowerCase();
  if (s === "ellipse" || s === "line" || s === "rect") return s;
  return "rect";
}

export function isLineLike(item: MoodboardItem) {
  return item.kind === "arrow" || (item.kind === "shape" && shapeVariantFromText(item.text) === "line");
}

export function lineBBox(item: MoodboardItem) {
  const x0 = item.x;
  const y0 = item.y;
  const x1 = item.x + item.width;
  const y1 = item.y + item.height;
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const w = Math.max(6, Math.abs(x1 - x0));
  const h = Math.max(6, Math.abs(y1 - y0));
  return { left, top, w, h, x0, y0, x1, y1 };
}

function buildItemTransform(
  dragTranslate: { x: number; y: number } | null,
  item: Pick<MoodboardItem, "rotationDeg" | "scale">,
  originW: number,
  originH: number,
): Pick<React.CSSProperties, "transform" | "transformOrigin"> {
  const t =
    dragTranslate && (dragTranslate.x !== 0 || dragTranslate.y !== 0)
      ? `translate3d(${dragTranslate.x}px,${dragTranslate.y}px,0)`
      : "";
  const parts = [t, `rotate(${item.rotationDeg}deg)`, `scale(${item.scale})`].filter(Boolean);
  return {
    transform: parts.join(" "),
    transformOrigin: `${originW / 2}px ${originH / 2}px`,
  };
}

/** Leader: dnd-kit transform. Followers during multi-drag: followDragPx from parent. */
function dragTranslatePx(
  dndTransform: { x: number; y: number } | null | undefined,
  followDragPx: { x: number; y: number } | null | undefined,
): { x: number; y: number } | null {
  if (followDragPx != null)
    return followDragPx.x !== 0 || followDragPx.y !== 0 ? followDragPx : null;
  if (dndTransform == null) return null;
  if (dndTransform.x === 0 && dndTransform.y === 0) return null;
  return { x: dndTransform.x, y: dndTransform.y };
}

function Handle({
  className,
  cursor,
  onDown,
  style,
}: {
  className: string;
  cursor: string;
  onDown: (e: React.PointerEvent) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-mood-handle
      className={[
        "pointer-events-auto absolute z-[80] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white bg-[color:var(--ui-accent)] shadow-md outline-none",
        className,
      ].join(" ")}
      style={{ cursor, ...style }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDown(e);
      }}
    />
  );
}

function FillStrokeChips({
  item,
  onPatch,
}: {
  item: MoodboardItem;
  onPatch: (id: string, patch: Partial<MoodboardItem>) => void;
}) {
  if (item.kind !== "shape" && item.kind !== "arrow") return null;
  const v = item.kind === "shape" ? shapeVariantFromText(item.text) : null;
  const showFill = item.kind === "arrow" || (v && v !== "line");
  return (
    <div
      className="pointer-events-auto absolute bottom-1 left-1 right-1 z-20 flex flex-wrap items-center gap-1 rounded-md bg-black/55 px-1 py-0.5 text-[10px] text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {showFill ? (
        <>
          <label className="flex items-center gap-0.5">
            <span className="opacity-80">Relleno</span>
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(item.color) ? item.color : "#c084fc"}
              onChange={(e) => onPatch(item.id, { color: e.target.value })}
              className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
            />
          </label>
          {item.kind === "shape" ? (
            <button
              type="button"
              className="rounded bg-white/20 px-1 py-0.5 hover:bg-white/35"
              onClick={() => onPatch(item.id, { color: "none" })}
            >
              Sin relleno
            </button>
          ) : null}
        </>
      ) : null}
      <label className="flex items-center gap-0.5">
        <span className="opacity-80">Trazo</span>
        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(item.strokeColor) ? item.strokeColor : "#475569"}
          onChange={(e) => onPatch(item.id, { strokeColor: e.target.value })}
          className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
        />
      </label>
      <label className="flex items-center gap-0.5">
        <span className="opacity-80">Grosor</span>
        <input
          type="number"
          min={1}
          max={24}
          value={item.strokeWidth}
          onChange={(e) => onPatch(item.id, { strokeWidth: Math.max(1, Number(e.target.value) || 2) })}
          className="w-10 rounded bg-white/90 px-1 text-[10px] text-black outline-none"
        />
      </label>
    </div>
  );
}

function HoverDelete({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      type="button"
      className="pointer-events-auto absolute -right-1 -top-1 z-[70] flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-xs text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-red-600/90 group-hover:opacity-100"
      aria-label="Eliminar"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onDelete}
    >
      ×
    </button>
  );
}

function BoxTransformHandles({
  selected,
  beginGrip,
}: {
  selected: boolean;
  beginGrip: (mode: MoodboardGripMode, e: React.PointerEvent) => void;
}) {
  if (!selected) return null;
  return (
    <>
      <Handle className="left-0 top-0" cursor="nwse-resize" onDown={(e) => beginGrip("resize-nw", e)} />
      <Handle className="left-full top-0" cursor="nesw-resize" onDown={(e) => beginGrip("resize-ne", e)} />
      <Handle className="left-0 top-full" cursor="nesw-resize" onDown={(e) => beginGrip("resize-sw", e)} />
      <Handle className="left-full top-full" cursor="nwse-resize" onDown={(e) => beginGrip("resize-se", e)} />
      <Handle
        className="left-1/2 top-0"
        cursor="grab"
        style={{ top: -18 }}
        onDown={(e) => beginGrip("rotate", e)}
      />
    </>
  );
}

export type MoodboardCanvasItemProps = {
  item: MoodboardItem;
  selected: boolean;
  onSelect: (e: React.PointerEvent) => void;
  beginGrip: (mode: MoodboardGripMode, e: React.PointerEvent) => void;
  gripActive: boolean;
  /** Live translate during multi-item drag (non-leader only); same space as @dnd-kit transform. */
  followDragPx?: { x: number; y: number } | null;
  onPatch: (id: string, patch: Partial<MoodboardItem>) => void;
  onDelete: (id: string) => void;
};

export function MoodboardCanvasItem({
  item,
  selected,
  onSelect,
  beginGrip,
  gripActive,
  followDragPx = null,
  onPatch,
  onDelete,
}: MoodboardCanvasItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${MOODBOARD_DRAG_PREFIX}${item.id}`,
    data: { type: "moodItem", itemId: item.id },
    disabled: gripActive || item.locked,
  });

  const selRing = selected ? "ring-2 ring-[color:var(--ui-accent)] ring-offset-1 ring-offset-transparent" : "";
  const imgSrc = safeImageSrc(item.url);
  const href = safeHref(item.url);
  const embed = item.kind === "video" ? videoPageToEmbedSrc(item.url) : null;
  const sw = item.strokeWidth;

  const onItemPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-mood-handle]")) return;
    e.stopPropagation();
    onSelect(e);
  };

  if (item.kind === "arrow" || (item.kind === "shape" && shapeVariantFromText(item.text) === "line")) {
    const isArrow = item.kind === "arrow";
    const { left, top, w, h, x0, y0, x1, y1 } = lineBBox(item);
    const lx0 = x0 - left;
    const ly0 = y0 - top;
    const lx1 = x1 - left;
    const ly1 = y1 - top;
    const stroke = item.strokeColor?.trim() || "#475569";
    const headFill = item.color?.trim() || stroke;
    const mid = `head-${item.id}`.replace(/[^a-zA-Z0-9_-]/g, "");
    const dragPx = dragTranslatePx(transform, followDragPx);
    const tf = buildItemTransform(dragPx, { rotationDeg: 0, scale: 1 }, w, h);

    const style: React.CSSProperties = {
      left,
      top,
      width: w,
      height: h,
      zIndex: 10 + item.zIndex,
      ...tf,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={[
          "group touch-none absolute",
          isDragging || followDragPx != null ? "opacity-80" : "",
        ].join(" ")}
        {...attributes}
        onPointerDownCapture={(e) => {
          if ((e.target as HTMLElement).closest("[data-mood-handle]")) return;
          onSelect(e);
        }}
      >
        <HoverDelete onDelete={() => onDelete(item.id)} />
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
        >
          {isArrow ? (
            <defs>
              <marker
                id={mid}
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill={headFill} stroke="none" />
              </marker>
            </defs>
          ) : null}
          <line
            x1={lx0}
            y1={ly0}
            x2={lx1}
            y2={ly1}
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
            markerEnd={isArrow ? `url(#${mid})` : undefined}
          />
        </svg>
        <button
          type="button"
          className="absolute inset-0 z-[15] cursor-grab touch-none opacity-0 active:cursor-grabbing"
          aria-label={isArrow ? "Mover flecha" : "Mover línea"}
          {...listeners}
        />

        {selected && !item.locked ? (
          <>
            <Handle
              className=""
              cursor="crosshair"
              style={{ left: `${(lx0 / w) * 100}%`, top: `${(ly0 / h) * 100}%` }}
              onDown={(e) => beginGrip("line-a", e)}
            />
            <Handle
              className=""
              cursor="crosshair"
              style={{ left: `${(lx1 / w) * 100}%`, top: `${(ly1 / h) * 100}%` }}
              onDown={(e) => beginGrip("line-b", e)}
            />
          </>
        ) : null}

        <FillStrokeChips item={item} onPatch={onPatch} />
      </div>
    );
  }

  if (item.kind === "shape") {
    const variant = shapeVariantFromText(item.text);
    const noFill =
      variant === "line" ||
      !item.color?.trim() ||
      item.color === "none" ||
      item.color === "transparent";
    const fill = variant === "line" ? "none" : noFill ? "none" : item.color;
    const hasStroke = item.strokeColor?.trim() && item.strokeColor !== "none";
    let stroke = hasStroke ? item.strokeColor : "none";
    if (fill === "none" && stroke === "none") stroke = "#475569";

    const bw = Math.max(8, item.width);
    const bh = Math.max(8, item.height);
    const dragPx = dragTranslatePx(transform, followDragPx);
    const tf = buildItemTransform(dragPx, item, bw, bh);

    const style: React.CSSProperties = {
      left: item.x,
      top: item.y,
      width: bw,
      height: bh,
      zIndex: 10 + item.zIndex,
      ...tf,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={[
          "group touch-none absolute",
          selRing,
          isDragging || followDragPx != null ? "opacity-80" : "",
        ].join(" ")}
        {...attributes}
        onPointerDown={onItemPointerDown}
      >
        <HoverDelete onDelete={() => onDelete(item.id)} />
        <svg className="pointer-events-none h-full w-full" viewBox={`0 0 ${item.width} ${item.height}`}>
          {variant === "rect" ? (
            <rect
              x={sw / 2}
              y={sw / 2}
              width={Math.max(0, item.width - sw)}
              height={Math.max(0, item.height - sw)}
              rx={4}
              fill={fill}
              stroke={stroke === "none" ? undefined : stroke}
              strokeWidth={stroke === "none" ? 0 : sw}
            />
          ) : null}
          {variant === "ellipse" ? (
            <ellipse
              cx={item.width / 2}
              cy={item.height / 2}
              rx={Math.max(4, item.width / 2 - sw / 2)}
              ry={Math.max(4, item.height / 2 - sw / 2)}
              fill={fill}
              stroke={stroke === "none" ? undefined : stroke}
              strokeWidth={stroke === "none" ? 0 : sw}
            />
          ) : null}
        </svg>
        <button
          type="button"
          className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing"
          aria-label="Arrastrar"
          {...listeners}
        />
        <BoxTransformHandles selected={selected && !item.locked} beginGrip={beginGrip} />
        <FillStrokeChips item={item} onPatch={onPatch} />
      </div>
    );
  }

  const dragPx = dragTranslatePx(transform, followDragPx);
  const tf = buildItemTransform(dragPx, item, item.width, item.height);
  const style: React.CSSProperties = {
    left: item.x,
    top: item.y,
    width: item.width,
    height: item.height,
    zIndex: 20 + item.zIndex,
    ...tf,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "group absolute touch-none",
        selRing,
        isDragging || followDragPx != null ? "opacity-85" : "",
      ].join(" ")}
      {...attributes}
      onPointerDown={onItemPointerDown}
    >
      <HoverDelete onDelete={() => onDelete(item.id)} />
      <BoxTransformHandles selected={selected && !item.locked} beginGrip={beginGrip} />

      {item.kind === "text" ? (
        <div className="relative h-full min-h-[3rem]">
          <button
            type="button"
            className="absolute left-0 right-0 top-0 z-10 h-3 cursor-grab touch-none active:cursor-grabbing"
            aria-label="Arrastrar"
            {...listeners}
            disabled={item.locked}
          />
          <textarea
            value={item.text}
            onChange={(e) => onPatch(item.id, { text: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-full min-h-[3rem] w-full resize-none bg-transparent px-0.5 pb-1 pt-3.5 text-sm leading-snug text-[color:var(--foreground)] outline-none ring-0 placeholder:opacity-40"
            placeholder="Texto…"
          />
        </div>
      ) : null}

      {item.kind === "image" ? (
        <div className="relative flex h-full min-h-0 flex-col">
          <button
            type="button"
            className="absolute inset-0 z-[5] cursor-grab touch-none active:cursor-grabbing"
            aria-label="Arrastrar imagen"
            {...listeners}
            disabled={item.locked}
          />
          <div className="pointer-events-none min-h-0 flex-1 overflow-hidden rounded-sm">
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgSrc} alt="" className="h-full w-full object-contain" draggable={false} />
            ) : (
              <div className="flex h-full min-h-[4rem] items-center justify-center text-[11px] opacity-45">
                URL o archivo
              </div>
            )}
          </div>
          <div className="pointer-events-auto relative z-20 mt-1 flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <input
              value={item.url}
              onChange={(e) => onPatch(item.id, { url: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="https://…"
              className="w-full rounded border border-[color:var(--card-border)]/60 bg-[var(--card-surface)]/90 px-1.5 py-0.5 text-[10px] outline-none"
            />
            <label className="cursor-pointer text-center text-[10px] text-[color:var(--ui-accent)] hover:underline">
              Subir imagen
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const u = String(reader.result ?? "");
                    if (u) onPatch(item.id, { url: u });
                  };
                  reader.readAsDataURL(f);
                }}
              />
            </label>
          </div>
        </div>
      ) : null}

      {item.kind === "color" ? (
        <div className="relative h-full">
          <button
            type="button"
            className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing"
            aria-label="Arrastrar"
            {...listeners}
          />
          <div
            className="h-full w-full rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.2)] ring-1 ring-black/10 dark:ring-white/15"
            style={{ backgroundColor: item.color || "#64748b" }}
          />
          <div className="pointer-events-auto absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 gap-1 opacity-0 group-hover:opacity-100">
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(item.color) ? item.color : "#64748b"}
              onChange={(e) => onPatch(item.id, { color: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent"
            />
          </div>
        </div>
      ) : null}

      {item.kind === "link" ? (
        <div className="relative flex h-full flex-col justify-center gap-1">
          <button
            type="button"
            className="absolute left-0 right-0 top-0 z-10 h-3 cursor-grab touch-none active:cursor-grabbing"
            aria-label="Arrastrar"
            {...listeners}
          />
          <input
            value={item.text}
            onChange={(e) => onPatch(item.id, { text: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Título"
            className="mt-3 w-full border-0 bg-transparent text-sm font-medium outline-none ring-0"
          />
          <input
            value={item.url}
            onChange={(e) => onPatch(item.id, { url: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="https://…"
            className="w-full border-0 bg-transparent text-[11px] opacity-80 outline-none ring-0"
          />
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[11px] text-[color:var(--ui-accent)] hover:underline"
              onPointerDown={(e) => e.stopPropagation()}
            >
              Abrir →
            </a>
          ) : null}
        </div>
      ) : null}

      {item.kind === "video" ? (
        <div className="relative flex h-full flex-col">
          <button
            type="button"
            className="absolute left-0 right-0 top-0 z-10 h-3 cursor-grab touch-none active:cursor-grabbing"
            aria-label="Arrastrar"
            {...listeners}
          />
          <div className="min-h-0 flex-1 overflow-hidden rounded-sm bg-black pt-3">
            {embed ? (
              <iframe
                title="Video"
                src={embed}
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className="flex h-full items-center justify-center p-2 text-center text-[10px] text-white/75">
                YouTube / Vimeo URL
              </div>
            )}
          </div>
          <input
            value={item.url}
            onChange={(e) => onPatch(item.id, { url: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="URL del vídeo"
            className="pointer-events-auto mt-1 w-full border-0 bg-transparent text-[10px] opacity-0 outline-none ring-0 group-hover:opacity-100"
          />
        </div>
      ) : null}
    </div>
  );
}
