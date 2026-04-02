/** Turn a user-pasted video page URL into an iframe embed src (YouTube / Vimeo). */
export function videoPageToEmbedSrc(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
      }
      const short = url.pathname.match(/^\/embed\/([^/]+)/);
      if (short?.[1]) return `https://www.youtube.com/embed/${encodeURIComponent(short[1])}`;
    }
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").split("/")[0];
      if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      let vid = "";
      if (parts[0] === "video" && parts[1]) vid = parts[1];
      else if (/^\d+$/.test(parts[0] ?? "")) vid = parts[0] ?? "";
      if (vid) return `https://player.vimeo.com/video/${vid}`;
    }
  } catch {
    return null;
  }
  return null;
}

/** Allow http(s) and data:image for moodboard images. */
export function safeImageSrc(u: string): string {
  const t = u.trim();
  if (t.startsWith("data:image/")) return t;
  try {
    const x = new URL(t);
    if (x.protocol === "http:" || x.protocol === "https:") return t;
  } catch {
    /* ignore */
  }
  return "";
}

/** Allow http(s) for links. */
export function safeHref(u: string): string {
  const t = u.trim();
  try {
    const x = new URL(t);
    if (x.protocol === "http:" || x.protocol === "https:") return t;
  } catch {
    /* ignore */
  }
  return "";
}
