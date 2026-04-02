"use client";

import { useEffect, useMemo, useRef, useState } from "react";

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function dataUrlToImage(url: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function ImageCropDialog({
  open,
  onOpenChange,
  file,
  title = "Crop image",
  aspect = 1,
  outputWidth = 880,
  onCropped,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  file: File | null;
  title?: string;
  /** Width/height aspect ratio of the final image. */
  aspect?: number;
  /** Output width in pixels; height is derived from aspect. */
  outputWidth?: number;
  onCropped: (dataUrl: string) => void;
}) {
  const [src, setSrc] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [cx, setCx] = useState(0.5);
  const [cy, setCy] = useState(0.5);
  const [imgInfo, setImgInfo] = useState<{ w: number; h: number } | null>(null);
  const draggingRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const u = await fileToDataUrl(file);
        const img = await dataUrlToImage(u);
        if (cancelled) return;
        setSrc(u);
        setImgInfo({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
        setZoom(1);
        setCx(0.5);
        setCy(0.5);
      } catch {
        if (!cancelled) onOpenChange(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, file, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const canCrop = useMemo(() => Boolean(src && imgInfo), [src, imgInfo]);
  const outputHeight = useMemo(() => Math.max(1, Math.round(outputWidth / Math.max(0.0001, aspect))), [outputWidth, aspect]);
  const previewW = 320;
  const previewH = Math.round(previewW / Math.max(0.0001, aspect));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[160]">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute left-1/2 top-1/2 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-surface)] p-4 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[11px] opacity-60">Drag to reposition. Use zoom for framing.</div>
          </div>
          <button
            type="button"
            className="ml-auto rounded-lg px-2 py-1 text-xs opacity-70 hover:bg-[var(--ui-accent-muted)]/25 hover:opacity-100"
            onClick={() => onOpenChange(false)}
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center">
          <div
            role="presentation"
            className="relative overflow-hidden rounded-2xl border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40"
            style={{ width: previewW, height: previewH }}
            onPointerDown={(e) => {
              if (!canCrop) return;
              draggingRef.current = { sx: e.clientX, sy: e.clientY, cx, cy };
              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = draggingRef.current;
              if (!d || !imgInfo) return;
              const dx = e.clientX - d.sx;
              const dy = e.clientY - d.sy;
              // Convert pixels into normalized center shift (approx; good enough for framing).
              const scale = zoom;
              const nx = clamp(d.cx - dx / (256 * scale), 0, 1);
              const ny = clamp(d.cy - dy / (256 * scale), 0, 1);
              setCx(nx);
              setCy(ny);
            }}
            onPointerUp={(e) => {
              draggingRef.current = null;
              try {
                (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            }}
            onPointerCancel={() => {
              draggingRef.current = null;
            }}
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                draggable={false}
                className="absolute left-1/2 top-1/2 select-none"
                style={{
                  width: `${zoom * 120}%`,
                  height: "auto",
                  transform: `translate(-${cx * 100}%, -${cy * 100}%)`,
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] opacity-55">Loading…</div>
            )}
            <div className="pointer-events-none absolute inset-0 ring-1 ring-white/10" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-[11px] opacity-70">Zoom</span>
          <input
            type="range"
            min={1}
            max={2.5}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-12 text-right text-[11px] tabular-nums opacity-70">{Math.round(zoom * 100)}%</span>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-[color:var(--card-border)] px-3 py-2 text-xs hover:bg-[var(--ui-accent-muted)]/25"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canCrop}
            className="rounded-lg bg-[color:var(--ui-accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-45"
            onClick={async () => {
              if (!canCrop || !imgInfo) return;
              try {
                const img = await dataUrlToImage(src);
                const canvas = document.createElement("canvas");
                canvas.width = outputWidth;
                canvas.height = outputHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                const iw = img.naturalWidth || img.width;
                const ih = img.naturalHeight || img.height;
                // Crop with desired aspect using normalized center + zoom.
                const baseW = iw / ih > aspect ? ih * aspect : iw;
                const baseH = iw / ih > aspect ? ih : iw / aspect;
                const cropW = baseW / zoom;
                const cropH = baseH / zoom;
                const centerX = cx * iw;
                const centerY = cy * ih;
                const sx = clamp(centerX - cropW / 2, 0, iw - cropW);
                const sy = clamp(centerY - cropH / 2, 0, ih - cropH);
                ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, outputWidth, outputHeight);
                const out = canvas.toDataURL("image/png");
                onCropped(out);
                onOpenChange(false);
              } catch {
                /* ignore */
              }
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

