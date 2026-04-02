/** Rotate vector (dx, dy) by deg degrees (CSS convention: clockwise positive). */
export function rotateVec(dx: number, dy: number, deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

/** Canvas coords of local top-left (0,0) for axis-aligned box (x,y,w,h) with rotation around center. */
export function nwCanvasFromItem(item: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
}): { x: number; y: number } {
  const v = rotateVec(-item.width / 2, -item.height / 2, item.rotationDeg);
  return { x: item.x + item.width / 2 + v.x, y: item.y + item.height / 2 + v.y };
}

/** Top-left (x,y) so NW corner stays fixed at `nw` after changing size (rotation unchanged). */
export function topLeftFromFixedNW(
  nw: { x: number; y: number },
  w: number,
  h: number,
  rotationDeg: number,
): { x: number; y: number } {
  const v = rotateVec(-w / 2, -h / 2, rotationDeg);
  const cx = nw.x - v.x;
  const cy = nw.y - v.y;
  return { x: cx - w / 2, y: cy - h / 2 };
}

/** Local point (lx,ly) from top-left unrotated box; ly downward. */
export function canvasToLocal(
  mx: number,
  my: number,
  item: { x: number; y: number; width: number; height: number; rotationDeg: number },
): { lx: number; ly: number } {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const inv = rotateVec(mx - cx, my - cy, -item.rotationDeg);
  return { lx: inv.x + item.width / 2, ly: inv.y + item.height / 2 };
}

/** Angle in degrees from center to point (for rotation handle). */
export function angleFromCenter(cx: number, cy: number, px: number, py: number): number {
  return (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
}

/** Canvas position of local point (lx, ly) with origin at item top-left, y downward. */
export function localTopLeftToCanvas(
  lx: number,
  ly: number,
  item: { x: number; y: number; width: number; height: number; rotationDeg: number },
): { x: number; y: number } {
  const v = rotateVec(lx - item.width / 2, ly - item.height / 2, item.rotationDeg);
  return { x: item.x + item.width / 2 + v.x, y: item.y + item.height / 2 + v.y };
}

export function topLeftFromFixedSE(
  se: { x: number; y: number },
  w: number,
  h: number,
  rotationDeg: number,
): { x: number; y: number } {
  const v = rotateVec(w / 2, h / 2, rotationDeg);
  const cx = se.x - v.x;
  const cy = se.y - v.y;
  return { x: cx - w / 2, y: cy - h / 2 };
}

export function topLeftFromFixedSW(
  sw: { x: number; y: number },
  w: number,
  h: number,
  rotationDeg: number,
): { x: number; y: number } {
  const v = rotateVec(-w / 2, h / 2, rotationDeg);
  const cx = sw.x - v.x;
  const cy = sw.y - v.y;
  return { x: cx - w / 2, y: cy - h / 2 };
}

export function topLeftFromFixedNE(
  ne: { x: number; y: number },
  w: number,
  h: number,
  rotationDeg: number,
): { x: number; y: number } {
  const v = rotateVec(w / 2, -h / 2, rotationDeg);
  const cx = ne.x - v.x;
  const cy = ne.y - v.y;
  return { x: cx - w / 2, y: cy - h / 2 };
}
