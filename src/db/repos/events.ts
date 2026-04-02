import type { Event } from "@/domain/models";
import type { StoryStage } from "@/domain/storyStage";
import { nowIso } from "@/domain/time";
import { db } from "../db";
import { newId } from "../ids";

export async function listEventsForProject(projectId: string): Promise<Event[]> {
  return db.events.where("projectId").equals(projectId).sortBy("updatedAt");
}

export async function listEventsForStage(
  projectId: string,
  stage: StoryStage,
): Promise<Event[]> {
  return db.events
    .where("[projectId+stage]")
    .equals([projectId, stage])
    .sortBy("orderInStage");
}

export async function createEvent(input: {
  projectId: string;
  stage: StoryStage;
  title: string;
  description?: string;
  tags?: string[];
}): Promise<Event> {
  const t = nowIso();
  const existing = await listEventsForStage(input.projectId, input.stage);
  const event: Event = {
    id: newId("evt"),
    projectId: input.projectId,
    stage: input.stage,
    title: input.title.trim() || "Event",
    description: (input.description ?? "").trim(),
    tags: (input.tags ?? []).map((x) => x.trim()).filter(Boolean),
    orderInStage: existing.length,
    createdAt: t,
    updatedAt: t,
  };
  await db.events.add(event);
  return event;
}

export async function updateEvent(
  eventId: string,
  patch: Partial<
    Pick<Event, "title" | "description" | "tags" | "stage" | "orderInStage">
  >,
): Promise<void> {
  await db.events.update(eventId, { ...patch, updatedAt: nowIso() });
}

export async function deleteEvent(eventId: string): Promise<void> {
  await db.events.delete(eventId);
}

export async function bulkUpdateEvents(events: Event[]): Promise<void> {
  const updatedAt = nowIso();
  await db.transaction("rw", db.events, async () => {
    for (const e of events) {
      await db.events.put({ ...e, updatedAt });
    }
  });
}

