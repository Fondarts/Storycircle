"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getProject, updateProject } from "@/db/repos/projects";

export default function LoglineSynopsisPage() {
  const params = useParams();
  const projectId = typeof params.id === "string" ? params.id : null;
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const p = await getProject(projectId);
      if (cancelled) return;
      setTitle(p?.title ?? "");
      setLogline(p?.logline ?? "");
      setSynopsis(p?.synopsis ?? "");
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const canSave = useMemo(() => Boolean(projectId && loaded && !saving), [projectId, loaded, saving]);

  async function save(patch: { logline?: string; synopsis?: string }) {
    if (!projectId) return;
    setSaving(true);
    try {
      await updateProject(projectId, patch);
    } finally {
      setSaving(false);
    }
  }

  if (!projectId) {
    return (
      <div className="m-4 rounded-xl border border-dashed border-[color:var(--card-border)] p-6 text-sm">
        Missing project id.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent text-[color:var(--foreground)]">
      <div className="w-full px-6 pb-8 pt-16">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">Logline & Synopsis</h1>
            <div className="mt-1 truncate text-xs opacity-60">{title || "Project"}</div>
          </div>
          <button
            type="button"
            disabled={!canSave}
            className="rounded-xl bg-[color:var(--ui-accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-45"
            onClick={() => save({ logline, synopsis })}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="mt-6 grid min-h-[calc(100dvh-8.5rem)] grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="flex min-h-0 flex-col">
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-60">Logline</div>
            <textarea
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
              onBlur={() => void save({ logline })}
              className="mt-2 min-h-0 flex-1 resize-none rounded-xl border border-[color:var(--card-border)] bg-[var(--hole-fill)] px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
              placeholder="One sentence that captures the story."
            />
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-60">Synopsis</div>
            <textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              onBlur={() => void save({ synopsis })}
              className="mt-2 min-h-0 flex-1 resize-none rounded-xl border border-[color:var(--card-border)] bg-[var(--hole-fill)] px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
              placeholder="A short summary of the story (beginning, middle, end)."
            />
          </section>
        </div>
      </div>
    </div>
  );
}

