import type { ScriptBlock, ScriptBlockType, ScriptDoc } from "@/domain/models";
import { nowIso } from "@/domain/time";
import { db } from "@/db/db";
import { newId } from "@/db/ids";

function normalizeBlock(b: ScriptBlock): ScriptBlock {
  const t = (b.text ?? "").replace(/\r\n/g, "\n");
  return { ...b, text: t };
}

function normalizeDoc(d: ScriptDoc): ScriptDoc {
  const blocks = Array.isArray(d.blocks) ? d.blocks.map(normalizeBlock) : [];
  return {
    ...d,
    title: (d.title ?? "").trim() || "Script",
    blocks: blocks.length ? blocks : [{ id: newId("blk"), type: "scene", text: "" }],
  };
}

export async function getOrCreateScriptDoc(projectId: string): Promise<ScriptDoc> {
  const existing = await db.scriptDocs.where("projectId").equals(projectId).first();
  if (existing) return normalizeDoc(existing);
  const t = nowIso();
  const doc: ScriptDoc = normalizeDoc({
    id: newId("scr"),
    projectId,
    title: "Script",
    blocks: [{ id: newId("blk"), type: "scene", text: "" }],
    createdAt: t,
    updatedAt: t,
  });
  await db.scriptDocs.put(doc);
  return doc;
}

export async function updateScriptDoc(
  id: string,
  patch: Partial<Pick<ScriptDoc, "title" | "blocks">>,
): Promise<void> {
  await db.scriptDocs.update(id, { ...patch, updatedAt: nowIso() });
}

export function toFountain(blocks: ScriptBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    const text = (b.text ?? "").trimEnd();
    if (!text) {
      out.push("");
      continue;
    }
    switch (b.type as ScriptBlockType) {
      case "scene":
        out.push(text.toUpperCase());
        out.push("");
        break;
      case "character":
        out.push(text.toUpperCase());
        break;
      case "transition":
        out.push(text.toUpperCase());
        out.push("");
        break;
      case "parenthetical":
        out.push(text.startsWith("(") ? text : `(${text})`);
        break;
      case "shot":
        out.push(text.toUpperCase());
        out.push("");
        break;
      case "dialogue":
      case "action":
      default:
        out.push(text);
        out.push("");
        break;
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

