"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/domain/models";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { createProject, listProjects } from "@/db/repos/projects";
import { supportsFileSystemAccess } from "@/lib/workspaceFileSync";

export default function Home() {
  const router = useRouter();
  const ws = useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState("");

  const refreshProjects = useCallback(() => {
    void listProjects().then(setProjects);
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    const onWs = () => refreshProjects();
    window.addEventListener("storycircle:workspace-loaded", onWs);
    return () => window.removeEventListener("storycircle:workspace-loaded", onWs);
  }, [refreshProjects]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent text-[color:var(--foreground)]">
      <div className="mx-auto w-full max-w-5xl px-6 pb-10 pt-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Story Circle{" "}
          <span className="font-mono text-base font-normal opacity-50">V0.1</span>
        </h1>
        <p className="mt-2 text-sm opacity-70">
          {ws.isFileWorkspace
            ? `Projects are saved in your chosen folder (${ws.folderName ?? "folder"}) as story-circle-data.json.`
            : ws.mode === "idb_only" && supportsFileSystemAccess()
              ? "Create a project to get started. After the first one is created, your browser will ask where to save story-circle-data.json (you can cancel and keep data in the browser only)."
              : "Projects are stored in this browser only (IndexedDB). This browser cannot attach a folder; use Download JSON backup in the menu to export."}
        </p>

        <section className="mt-8 rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-surface)] p-5 shadow-sm backdrop-blur-sm">
          <h2 className="text-sm font-semibold opacity-90">
            New project
          </h2>
          <form
            className="mt-3 flex flex-col gap-3 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = title.trim() || "Untitled";
              const project = await createProject({ title: name, synopsis: "" });
              if (ws.mode === "idb_only" && supportsFileSystemAccess()) {
                await ws.pickOrChangeFolder();
              }
              const next = await listProjects();
              setProjects(next);
              setTitle("");
              router.push(`/project/${project.id}/story-circle`);
            }}
          >
            <input
              name="title"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 flex-1 rounded-xl border border-[color:var(--card-border)] bg-[var(--hole-fill)] px-3 text-sm outline-none ring-0 focus:border-[color:var(--ui-accent)]"
            />
            <button
              type="submit"
              className="h-10 rounded-xl px-4 text-sm font-medium text-[var(--ui-accent-contrast)] hover:opacity-95"
              style={{ background: "var(--ui-accent)" }}
            >
              Create
            </button>
          </form>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold opacity-90">
              Your projects
            </h2>
            <span className="text-xs opacity-60">
              {projects.length} total
            </span>
          </div>

          {projects.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-[color:var(--card-border)] bg-[var(--card-surface)]/50 p-8 text-sm opacity-75">
              Create a project to get started.
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {projects.map((p) => (
                <li key={p.id}>
                  <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-surface)] p-4 shadow-sm backdrop-blur-sm">
                    <div className="flex flex-col gap-3 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between min-[640px]:gap-4">
                      <div className="min-w-0 shrink-0 min-[640px]:max-w-[min(40%,16rem)]">
                        <div className="truncate text-sm font-semibold">
                          {p.title}
                        </div>
                        {p.logline ? (
                          <div className="mt-1 line-clamp-2 text-xs opacity-70">
                            {p.logline}
                          </div>
                        ) : null}
                      </div>
                      <div className="-mx-1 flex min-w-0 flex-1 flex-nowrap gap-2 overflow-x-auto px-1 pb-0.5 min-[640px]:justify-end min-[640px]:overflow-visible">
                        <Link
                          className="shrink-0 rounded-xl border border-[color:var(--card-border)] px-2.5 py-2 text-xs font-medium whitespace-nowrap hover:bg-[var(--ui-accent-muted)]/35"
                          href={`/project/${p.id}/story-circle`}
                        >
                          Circle
                        </Link>
                        <Link
                          className="shrink-0 rounded-xl border border-[color:var(--card-border)] px-2.5 py-2 text-xs font-medium whitespace-nowrap hover:bg-[var(--ui-accent-muted)]/35"
                          href={`/project/${p.id}/outline`}
                        >
                          Outline
                        </Link>
                        <Link
                          className="shrink-0 rounded-xl border border-[color:var(--card-border)] px-2.5 py-2 text-xs font-medium whitespace-nowrap hover:bg-[var(--ui-accent-muted)]/35"
                          href={`/project/${p.id}/moodboard`}
                        >
                          Moodboard
                        </Link>
                        <Link
                          className="shrink-0 rounded-xl border border-[color:var(--card-border)] px-2.5 py-2 text-xs font-medium whitespace-nowrap hover:bg-[var(--ui-accent-muted)]/35"
                          href={`/project/${p.id}/logline-synopsis`}
                        >
                          Logline
                        </Link>
                        <Link
                          className="shrink-0 rounded-xl border border-[color:var(--card-border)] px-2.5 py-2 text-xs font-medium whitespace-nowrap hover:bg-[var(--ui-accent-muted)]/35"
                          href={`/project/${p.id}/characters`}
                        >
                          Characters
                        </Link>
                        <Link
                          className="shrink-0 rounded-xl border border-[color:var(--card-border)] px-2.5 py-2 text-xs font-medium whitespace-nowrap hover:bg-[var(--ui-accent-muted)]/35"
                          href={`/project/${p.id}/script`}
                        >
                          Script
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
