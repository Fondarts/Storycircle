import type {
  Character,
  CharacterBoardNode,
  CharacterRelation,
  Event,
  HeroJourneyNote,
  MoodboardItem,
  Project,
  Scene,
  ScriptDoc,
  Sequence,
  StageNote,
} from "@/domain/models";
import { db } from "@/db/db";

export const WORKSPACE_DATA_FILENAME = "story-circle-data.json";
export const WORKSPACE_SNAPSHOT_VERSION = 1 as const;

export type WorkspaceSnapshotV1 = {
  version: typeof WORKSPACE_SNAPSHOT_VERSION;
  exportedAt: string;
  projects: Project[];
  events: Event[];
  sequences: Sequence[];
  scenes: Scene[];
  stageNotes: StageNote[];
  moodboardItems: MoodboardItem[];
  characters: Character[];
  characterBoardNodes: CharacterBoardNode[];
  characterRelations: CharacterRelation[];
  scriptDocs: ScriptDoc[];
  /** Optional for backward compatibility with older JSON exports */
  heroJourneyNotes?: HeroJourneyNote[];
};

const META_DB = "story_circle_workspace_meta";
const META_STORE = "kv";
const META_KEY = "workspaceDir";

let persistTimer: number | null = null;
let hooksInstalled = false;
let activeDirectoryHandle: FileSystemDirectoryHandle | null = null;

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META_STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const idb = await openMetaDb();
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).get(META_KEY);
      req.onsuccess = () => {
        const row = req.result as { key: string; handle?: FileSystemDirectoryHandle } | undefined;
        resolve(row?.handle ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveStoredDirectoryHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  const idb = await openMetaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(META_STORE, "readwrite");
    if (handle == null) {
      tx.objectStore(META_STORE).delete(META_KEY);
    } else {
      tx.objectStore(META_STORE).put({ key: META_KEY, handle });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function setActiveWorkspaceDirectory(handle: FileSystemDirectoryHandle | null): void {
  activeDirectoryHandle = handle;
}

export function getActiveWorkspaceDirectory(): FileSystemDirectoryHandle | null {
  return activeDirectoryHandle;
}

export async function buildSnapshotFromDb(): Promise<WorkspaceSnapshotV1> {
  const [
    projects,
    events,
    sequences,
    scenes,
    stageNotes,
    moodboardItems,
    characters,
    characterBoardNodes,
    characterRelations,
    scriptDocs,
    heroJourneyNotes,
  ] = await Promise.all([
    db.projects.toArray(),
    db.events.toArray(),
    db.sequences.toArray(),
    db.scenes.toArray(),
    db.stageNotes.toArray(),
    db.moodboardItems.toArray(),
    db.characters.toArray(),
    db.characterBoardNodes.toArray(),
    db.characterRelations.toArray(),
    db.scriptDocs.toArray(),
    db.heroJourneyNotes.toArray(),
  ]);
  return {
    version: WORKSPACE_SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    projects,
    events,
    sequences,
    scenes,
    stageNotes,
    moodboardItems,
    characters,
    characterBoardNodes,
    characterRelations,
    scriptDocs,
    heroJourneyNotes,
  };
}

export async function applySnapshotToDb(data: WorkspaceSnapshotV1): Promise<void> {
  const tables = [
    db.projects,
    db.events,
    db.sequences,
    db.scenes,
    db.stageNotes,
    db.moodboardItems,
    db.characters,
    db.characterBoardNodes,
    db.characterRelations,
    db.scriptDocs,
    db.heroJourneyNotes,
  ] as const;
  await db.transaction("rw", tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    if (data.projects?.length) await db.projects.bulkAdd(data.projects);
    if (data.events?.length) await db.events.bulkAdd(data.events);
    if (data.sequences?.length) await db.sequences.bulkAdd(data.sequences);
    if (data.scenes?.length) await db.scenes.bulkAdd(data.scenes);
    if (data.stageNotes?.length) await db.stageNotes.bulkAdd(data.stageNotes);
    if (data.moodboardItems?.length) await db.moodboardItems.bulkAdd(data.moodboardItems);
    if (data.characters?.length) await db.characters.bulkAdd(data.characters);
    if (data.characterBoardNodes?.length) await db.characterBoardNodes.bulkAdd(data.characterBoardNodes);
    if (data.characterRelations?.length) await db.characterRelations.bulkAdd(data.characterRelations);
    if (data.scriptDocs?.length) await db.scriptDocs.bulkAdd(data.scriptDocs);
    const hj = data.heroJourneyNotes;
    if (hj?.length) await db.heroJourneyNotes.bulkAdd(hj);
  });
}

export async function writeSnapshotToDirectory(
  dir: FileSystemDirectoryHandle,
  snapshot: WorkspaceSnapshotV1,
): Promise<void> {
  const json = JSON.stringify(snapshot);
  const fileHandle = await dir.getFileHandle(WORKSPACE_DATA_FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(json);
  await writable.close();
}

export async function readSnapshotFromDirectory(
  dir: FileSystemDirectoryHandle,
): Promise<WorkspaceSnapshotV1 | null> {
  try {
    const fileHandle = await dir.getFileHandle(WORKSPACE_DATA_FILENAME);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text) as WorkspaceSnapshotV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.projects)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function persistWorkspaceToDisk(): Promise<void> {
  const dir = activeDirectoryHandle;
  if (!dir) return;
  const perm = await dir.queryPermission({ mode: "readwrite" });
  if (perm !== "granted") return;
  const snap = await buildSnapshotFromDb();
  await writeSnapshotToDirectory(dir, snap);
}

function schedulePersist(): void {
  if (!activeDirectoryHandle) return;
  if (persistTimer != null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void persistWorkspaceToDisk().catch(() => {});
  }, 700);
}

export function installWorkspaceSyncHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  const hooked = [
    db.projects,
    db.events,
    db.sequences,
    db.scenes,
    db.stageNotes,
    db.moodboardItems,
    db.characters,
    db.characterBoardNodes,
    db.characterRelations,
    db.scriptDocs,
    db.heroJourneyNotes,
  ];
  for (const table of hooked) {
    table.hook("creating", schedulePersist);
    table.hook("updating", schedulePersist);
    table.hook("deleting", schedulePersist);
  }
}

export async function pickWorkspaceDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFileSystemAccess()) return null;
  try {
    return await window.showDirectoryPicker({ mode: "readwrite" });
  } catch {
    return null;
  }
}
