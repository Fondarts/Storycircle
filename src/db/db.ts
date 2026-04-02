import Dexie, { type Table } from "dexie";
import type {
  Character,
  CharacterBoardNode,
  CharacterRelation,
  Event,
  MoodboardItem,
  Project,
  Scene,
  ScriptDoc,
  Sequence,
  StageNote,
} from "@/domain/models";

export class StoryCircleDb extends Dexie {
  projects!: Table<Project, string>;
  events!: Table<Event, string>;
  sequences!: Table<Sequence, string>;
  scenes!: Table<Scene, string>;
  stageNotes!: Table<StageNote, string>;
  moodboardItems!: Table<MoodboardItem, string>;
  characters!: Table<Character, string>;
  characterBoardNodes!: Table<CharacterBoardNode, string>;
  characterRelations!: Table<CharacterRelation, string>;
  scriptDocs!: Table<ScriptDoc, string>;

  constructor() {
    super("story_circle_db");

    this.version(1).stores({
      projects: "id, updatedAt",
      events: "id, projectId, stage, orderInStage, updatedAt, [projectId+stage]",
      sequences: "id, projectId, order, updatedAt",
      scenes: "id, projectId, sequenceId, order, updatedAt, [projectId+sequenceId]",
    });

    this.version(2).stores({
      projects: "id, updatedAt",
      events: "id, projectId, stage, orderInStage, updatedAt, [projectId+stage]",
      sequences: "id, projectId, order, updatedAt",
      scenes: "id, projectId, sequenceId, order, updatedAt, [projectId+sequenceId]",
      stageNotes: "id, projectId, stage, updatedAt, [projectId+stage]",
    });

    this.version(3).stores({
      projects: "id, updatedAt",
      events: "id, projectId, stage, orderInStage, updatedAt, [projectId+stage]",
      sequences: "id, projectId, order, updatedAt",
      scenes: "id, projectId, sequenceId, order, updatedAt, [projectId+sequenceId]",
      stageNotes: "id, projectId, stage, updatedAt, [projectId+stage]",
    });

    this.version(4).stores({
      projects: "id, updatedAt",
      events: "id, projectId, stage, orderInStage, updatedAt, [projectId+stage]",
      sequences: "id, projectId, order, updatedAt",
      scenes: "id, projectId, sequenceId, order, updatedAt, [projectId+sequenceId]",
      stageNotes: "id, projectId, stage, updatedAt, [projectId+stage]",
    });

    this.version(5).stores({
      projects: "id, updatedAt",
      events: "id, projectId, stage, orderInStage, updatedAt, [projectId+stage]",
      sequences: "id, projectId, order, updatedAt",
      scenes: "id, projectId, sequenceId, order, updatedAt, [projectId+sequenceId]",
      stageNotes: "id, projectId, stage, updatedAt, [projectId+stage]",
      moodboardItems: "id, projectId, zIndex, updatedAt",
    });

    this.version(6).stores({
      projects: "id, updatedAt",
      events: "id, projectId, stage, orderInStage, updatedAt, [projectId+stage]",
      sequences: "id, projectId, order, updatedAt",
      scenes: "id, projectId, sequenceId, order, updatedAt, [projectId+sequenceId]",
      stageNotes: "id, projectId, stage, updatedAt, [projectId+stage]",
      moodboardItems: "id, projectId, zIndex, updatedAt",
      characters: "id, projectId, updatedAt, [projectId+name]",
    });

    this.version(7).stores({
      projects: "id, updatedAt",
      events: "id, projectId, stage, orderInStage, updatedAt, [projectId+stage]",
      sequences: "id, projectId, order, updatedAt",
      scenes: "id, projectId, sequenceId, order, updatedAt, [projectId+sequenceId]",
      stageNotes: "id, projectId, stage, updatedAt, [projectId+stage]",
      moodboardItems: "id, projectId, zIndex, updatedAt",
      characters: "id, projectId, updatedAt, [projectId+name]",
      characterBoardNodes: "id, projectId, characterId, zIndex, updatedAt, [projectId+characterId]",
      characterRelations: "id, projectId, fromCharacterId, toCharacterId, updatedAt, [projectId+fromCharacterId], [projectId+toCharacterId]",
    });

    this.version(8).stores({
      projects: "id, updatedAt",
      events: "id, projectId, stage, orderInStage, updatedAt, [projectId+stage]",
      sequences: "id, projectId, order, updatedAt",
      scenes: "id, projectId, sequenceId, order, updatedAt, [projectId+sequenceId]",
      stageNotes: "id, projectId, stage, updatedAt, [projectId+stage]",
      moodboardItems: "id, projectId, zIndex, updatedAt",
      characters: "id, projectId, updatedAt, [projectId+name]",
      characterBoardNodes: "id, projectId, characterId, zIndex, updatedAt, [projectId+characterId]",
      characterRelations: "id, projectId, fromCharacterId, toCharacterId, updatedAt, [projectId+fromCharacterId], [projectId+toCharacterId]",
    });

    this.version(9).stores({
      projects: "id, updatedAt",
      events: "id, projectId, stage, orderInStage, updatedAt, [projectId+stage]",
      sequences: "id, projectId, order, updatedAt",
      scenes: "id, projectId, sequenceId, order, updatedAt, [projectId+sequenceId]",
      stageNotes: "id, projectId, stage, updatedAt, [projectId+stage]",
      moodboardItems: "id, projectId, zIndex, updatedAt",
      characters: "id, projectId, updatedAt, [projectId+name]",
      characterBoardNodes: "id, projectId, characterId, zIndex, updatedAt, [projectId+characterId]",
      characterRelations: "id, projectId, fromCharacterId, toCharacterId, updatedAt, [projectId+fromCharacterId], [projectId+toCharacterId]",
      scriptDocs: "id, projectId, updatedAt, [projectId+updatedAt]",
    });
  }
}

export const db = new StoryCircleDb();

