"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/domain/models";
import { createProject, listProjects } from "@/db/repos/projects";

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await listProjects();
      if (!cancelled) setProjects(p);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent text-[color:var(--foreground)]">
      <div className="mx-auto w-full max-w-5xl px-6 pb-10 pt-16">
        <h1 className="text-2xl font-semibold tracking-tight">Story Circle</h1>
        <p className="mt-2 text-sm opacity-70">
          Local projects (stored in this browser).
        </p>

        <section className="mt-8 rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-surface)] p-5 shadow-sm backdrop-blur-sm">
          <h2 className="text-sm font-semibold opacity-90">
            New project
          </h2>
          <form
            className="mt-3 flex flex-col gap-3 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              const project = await createProject({ title, synopsis: "" });
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
            <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {projects.map((p) => (
                <li key={p.id}>
                  <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-surface)] p-4 shadow-sm backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {p.title}
                        </div>
                        {p.logline ? (
                          <div className="mt-1 line-clamp-2 text-xs opacity-70">
                            {p.logline}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Link
                          className="rounded-xl border border-[color:var(--card-border)] px-3 py-2 text-xs font-medium hover:bg-[var(--ui-accent-muted)]/35"
                          href={`/project/${p.id}/story-circle`}
                        >
                          Circle
                        </Link>
                        <Link
                          className="rounded-xl border border-[color:var(--card-border)] px-3 py-2 text-xs font-medium hover:bg-[var(--ui-accent-muted)]/35"
                          href={`/project/${p.id}/outline`}
                        >
                          Outline
                        </Link>
                        <Link
                          className="rounded-xl border border-[color:var(--card-border)] px-3 py-2 text-xs font-medium hover:bg-[var(--ui-accent-muted)]/35"
                          href={`/project/${p.id}/moodboard`}
                        >
                          Moodboard
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
