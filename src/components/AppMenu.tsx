"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { supportsFileSystemAccess } from "@/lib/workspaceFileSync";

function projectIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/project\/([^/]+)/);
  return m?.[1] ?? null;
}

export function AppMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const projectId = projectIdFromPath(pathname);
  const ws = useWorkspace();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="fixed right-4 top-4 z-[100] flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--card-border)] bg-[var(--card-surface)] text-[color:var(--foreground)] shadow-md backdrop-blur-md hover:bg-[var(--ui-accent-muted)]/25"
        aria-expanded={open}
        aria-controls="app-drawer"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">Menu</span>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          {open ? (
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          ) : (
            <path d="M3 5h14v1.5H3V5zm0 4.25h14v1.5H3v-1.5zm0 4.25h14V15H3v-1.5z" />
          )}
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90]">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <nav
            id="app-drawer"
            className="absolute right-0 top-0 flex h-full min-h-0 w-[min(100%,20rem)] flex-col border-l border-[color:var(--card-border)] bg-[var(--card-surface)] shadow-2xl backdrop-blur-md"
          >
            <div className="border-b border-[color:var(--card-border)] px-4 py-4 pt-16">
              <div className="text-sm font-semibold text-[color:var(--foreground)]">
                Story Circle{" "}
                <span className="font-mono text-[11px] font-normal opacity-50">V0.1</span>
              </div>
              <div className="mt-2 text-xs font-medium uppercase tracking-wide opacity-55">
                Navigation
              </div>
            </div>
            <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
              <li>
                <Link
                  href="/"
                  className="block rounded-xl px-3 py-2.5 text-sm font-medium text-[color:var(--foreground)] hover:bg-[var(--ui-accent-muted)]/30"
                  onClick={() => setOpen(false)}
                >
                  Projects
                </Link>
              </li>
              {projectId ? (
                <>
                  <li>
                    <Link
                      href={`/project/${projectId}/story-circle`}
                      className="block rounded-xl px-3 py-2.5 text-sm font-medium text-[color:var(--foreground)] hover:bg-[var(--ui-accent-muted)]/30"
                      onClick={() => setOpen(false)}
                    >
                      Story circle
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/project/${projectId}/outline`}
                      className="block rounded-xl px-3 py-2.5 text-sm font-medium text-[color:var(--foreground)] hover:bg-[var(--ui-accent-muted)]/30"
                      onClick={() => setOpen(false)}
                    >
                      Outline
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/project/${projectId}/moodboard`}
                      className="block rounded-xl px-3 py-2.5 text-sm font-medium text-[color:var(--foreground)] hover:bg-[var(--ui-accent-muted)]/30"
                      onClick={() => setOpen(false)}
                    >
                      Moodboard
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/project/${projectId}/logline-synopsis`}
                      className="block rounded-xl px-3 py-2.5 text-sm font-medium text-[color:var(--foreground)] hover:bg-[var(--ui-accent-muted)]/30"
                      onClick={() => setOpen(false)}
                    >
                      Logline & Synopsis
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/project/${projectId}/characters`}
                      className="block rounded-xl px-3 py-2.5 text-sm font-medium text-[color:var(--foreground)] hover:bg-[var(--ui-accent-muted)]/30"
                      onClick={() => setOpen(false)}
                    >
                      Characters
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/project/${projectId}/script`}
                      className="block rounded-xl px-3 py-2.5 text-sm font-medium text-[color:var(--foreground)] hover:bg-[var(--ui-accent-muted)]/30"
                      onClick={() => setOpen(false)}
                    >
                      Script
                    </Link>
                  </li>
                </>
              ) : null}
            </ul>
            <div className="mt-auto border-t border-[color:var(--card-border)] p-3">
              <div className="px-3 pb-2 text-xs font-medium uppercase tracking-wide opacity-55">
                Data
              </div>
              {ws.isFileWorkspace ? (
                <>
                  <p className="px-3 pb-2 text-[11px] leading-snug opacity-70">
                    Folder: <span className="font-medium opacity-90">{ws.folderName ?? "—"}</span>
                    <br />
                    <span className="opacity-60">story-circle-data.json</span>
                  </p>
                  <button
                    type="button"
                    className="mb-1 w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--ui-accent-muted)]/30"
                    onClick={() => {
                      void ws.pickOrChangeFolder();
                      setOpen(false);
                    }}
                  >
                    Change folder…
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--ui-accent-muted)]/30"
                    onClick={() => void ws.saveNow()}
                  >
                    Save to disk now
                  </button>
                </>
              ) : ws.mode === "idb_only" && supportsFileSystemAccess() ? (
                <>
                  <p className="px-3 pb-2 text-[11px] leading-snug opacity-70">
                    Data is in the browser until you choose a folder. Then everything syncs to{" "}
                    <span className="opacity-80">story-circle-data.json</span> in that folder.
                  </p>
                  <button
                    type="button"
                    className="mb-1 w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--ui-accent-muted)]/30"
                    onClick={() => {
                      void ws.pickOrChangeFolder();
                      setOpen(false);
                    }}
                  >
                    Choose folder…
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--ui-accent-muted)]/30"
                    onClick={() => void ws.downloadJsonBackup()}
                  >
                    Download JSON backup
                  </button>
                </>
              ) : (
                <>
                  <p className="px-3 pb-2 text-[11px] leading-snug opacity-70">
                    This browser cannot pick a folder. Data stays in the browser (IndexedDB). Use Chrome or Edge for
                    file-based storage.
                  </p>
                  <button
                    type="button"
                    className="mb-1 w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--ui-accent-muted)]/30"
                    onClick={() => void ws.downloadJsonBackup()}
                  >
                    Download JSON backup
                  </button>
                </>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
