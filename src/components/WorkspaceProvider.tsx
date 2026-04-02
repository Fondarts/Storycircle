"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppMenu } from "@/components/AppMenu";
import {
  applySnapshotToDb,
  buildSnapshotFromDb,
  installWorkspaceSyncHooks,
  loadStoredDirectoryHandle,
  persistWorkspaceToDisk,
  pickWorkspaceDirectory,
  readSnapshotFromDirectory,
  saveStoredDirectoryHandle,
  setActiveWorkspaceDirectory,
  supportsFileSystemAccess,
  writeSnapshotToDirectory,
} from "@/lib/workspaceFileSync";
import { db } from "@/db/db";

export type WorkspaceMode = "loading" | "file_ready" | "needs_folder" | "needs_permission" | "idb_only";

type WorkspaceContextValue = {
  mode: WorkspaceMode;
  folderName: string | null;
  isFileWorkspace: boolean;
  pickOrChangeFolder: () => Promise<void>;
  saveNow: () => Promise<void>;
  retryPermission: () => Promise<void>;
  downloadJsonBackup: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const c = useContext(WorkspaceContext);
  if (!c) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return c;
}

async function downloadJsonBackupImpl(): Promise<void> {
  const snap = await buildSnapshotFromDb();
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "story-circle-data.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<WorkspaceMode>("loading");
  const [folderName, setFolderName] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    await db.open();
    if (!supportsFileSystemAccess()) {
      setMode("idb_only");
      return;
    }
    const handle = await loadStoredDirectoryHandle();
    if (!handle) {
      setMode("idb_only");
      return;
    }
    setActiveWorkspaceDirectory(handle);
    setFolderName(handle.name);
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      setMode("needs_permission");
      return;
    }
    const snap = await readSnapshotFromDirectory(handle);
    if (snap) {
      await applySnapshotToDb(snap);
    } else {
      await writeSnapshotToDirectory(handle, await buildSnapshotFromDb());
    }
    installWorkspaceSyncHooks();
    setMode("file_ready");
    window.dispatchEvent(new Event("storycircle:workspace-loaded"));
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const pickOrChangeFolder = useCallback(async () => {
    await db.open();
    const h = await pickWorkspaceDirectory();
    if (!h) return;
    await saveStoredDirectoryHandle(h);
    setActiveWorkspaceDirectory(h);
    setFolderName(h.name);
    const snap = await readSnapshotFromDirectory(h);
    if (snap) {
      await applySnapshotToDb(snap);
    } else {
      await writeSnapshotToDirectory(h, await buildSnapshotFromDb());
    }
    installWorkspaceSyncHooks();
    await persistWorkspaceToDisk();
    setMode("file_ready");
    window.dispatchEvent(new Event("storycircle:workspace-loaded"));
  }, []);

  const retryPermission = useCallback(async () => {
    await db.open();
    const h = (await loadStoredDirectoryHandle()) ?? null;
    if (!h) {
      setMode("needs_folder");
      return;
    }
    const perm = await h.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") return;
    setActiveWorkspaceDirectory(h);
    setFolderName(h.name);
    const snap = await readSnapshotFromDirectory(h);
    if (snap) {
      await applySnapshotToDb(snap);
    } else {
      await writeSnapshotToDirectory(h, await buildSnapshotFromDb());
    }
    installWorkspaceSyncHooks();
    setMode("file_ready");
    window.dispatchEvent(new Event("storycircle:workspace-loaded"));
  }, []);

  const saveNow = useCallback(async () => {
    await persistWorkspaceToDisk();
  }, []);

  const downloadJsonBackup = useCallback(async () => {
    await downloadJsonBackupImpl();
  }, []);

  const ctx = useMemo<WorkspaceContextValue>(
    () => ({
      mode,
      folderName,
      isFileWorkspace: mode === "file_ready",
      pickOrChangeFolder,
      saveNow,
      retryPermission,
      downloadJsonBackup,
    }),
    [mode, folderName, pickOrChangeFolder, saveNow, retryPermission, downloadJsonBackup],
  );

  if (mode === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--card-surface)] text-sm text-[color:var(--foreground)] opacity-80">
        Loading storage…
      </div>
    );
  }

  if (mode === "needs_folder") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--card-surface)] px-6 pb-20 pt-16 text-center text-[color:var(--foreground)]">
        <div className="text-xs font-medium uppercase tracking-wide opacity-50">Story Circle · V0.1</div>
        <h1 className="text-xl font-semibold tracking-tight">Choose a folder for your data</h1>
        <p className="max-w-md text-sm leading-relaxed opacity-75">
          Everything is saved as a single JSON file (<code className="rounded bg-[var(--hole-fill)] px-1">story-circle-data.json</code>)
          in the folder you pick. The browser only keeps permission to that folder, not your screenplay content.
        </p>
        <button
          type="button"
          className="rounded-xl px-5 py-2.5 text-sm font-medium text-[var(--ui-accent-contrast)] hover:opacity-95"
          style={{ background: "var(--ui-accent)" }}
          onClick={() => void pickOrChangeFolder()}
        >
          Choose folder…
        </button>
        <p className="max-w-sm text-xs opacity-55">
          Use Chrome, Edge, or another Chromium-based browser. Safari support is limited.
        </p>
      </div>
    );
  }

  if (mode === "needs_permission") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--card-surface)] px-6 pb-20 pt-16 text-center text-[color:var(--foreground)]">
        <div className="text-xs font-medium uppercase tracking-wide opacity-50">Story Circle · V0.1</div>
        <h1 className="text-xl font-semibold tracking-tight">Allow folder access</h1>
        <p className="max-w-md text-sm leading-relaxed opacity-75">
          Grant read/write access to <span className="font-medium opacity-90">{folderName ?? "your data folder"}</span>{" "}
          so Story Circle can load and save <code className="rounded bg-[var(--hole-fill)] px-1">story-circle-data.json</code>.
        </p>
        <button
          type="button"
          className="rounded-xl px-5 py-2.5 text-sm font-medium text-[var(--ui-accent-contrast)] hover:opacity-95"
          style={{ background: "var(--ui-accent)" }}
          onClick={() => void retryPermission()}
        >
          Allow access
        </button>
        <button
          type="button"
          className="text-xs underline opacity-60 hover:opacity-90"
          onClick={() => void pickOrChangeFolder()}
        >
          Pick a different folder instead
        </button>
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider value={ctx}>
      <AppMenu />
      {children}
    </WorkspaceContext.Provider>
  );
}
