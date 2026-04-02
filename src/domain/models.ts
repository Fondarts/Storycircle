import type { StoryStage } from "./storyStage";

export type Id = string;

export type ISODateString = string;

export type Project = {
  id: Id;
  title: string;
  logline: string;
  synopsis: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type Event = {
  id: Id;
  projectId: Id;
  stage: StoryStage;
  title: string;
  description: string;
  tags: string[];
  orderInStage: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type Sequence = {
  id: Id;
  projectId: Id;
  title: string;
  order: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type Scene = {
  id: Id;
  projectId: Id;
  /** Empty string = card on the free board (not inside an act column). */
  sequenceId: Id | "";
  /** Pixel offset on free board when sequenceId is ""; null when inside an act. */
  boardX: number | null;
  boardY: number | null;
  title: string;
  summary: string;
  sourceEventIds: Id[];
  estMinutes: number | null;
  order: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type Character = {
  id: Id;
  projectId: Id;
  name: string;
  role: string;
  /** Optional image URL or data URL. */
  imageUrl?: string;
  logline: string;
  bio: string;
  goal: string;
  flaw: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type CharacterBoardNode = {
  id: Id;
  projectId: Id;
  characterId: Id;
  x: number;
  y: number;
  zIndex: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type CharacterRelation = {
  id: Id;
  projectId: Id;
  fromCharacterId: Id;
  toCharacterId: Id;
  label: string;
  color?: string;
  dashed?: boolean;
  arrow?: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type ScriptBlockType =
  | "scene"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition"
  | "shot";

export type ScriptBlock = {
  id: Id;
  type: ScriptBlockType;
  text: string;
};

export type ScriptDoc = {
  id: Id;
  projectId: Id;
  title: string;
  blocks: ScriptBlock[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type MoodboardItemKind =
  | "text"
  | "image"
  | "color"
  | "link"
  | "video"
  | "arrow"
  | "shape";

/** Used when kind === "shape": rectangle, ellipse, or open line (stroke only). */
export type MoodboardShapeVariant = "rect" | "ellipse" | "line";

/** Free-form moodboard element: media, notes, connectors, vector shapes. */
export type MoodboardItem = {
  id: Id;
  projectId: Id;
  kind: MoodboardItemKind;
  /** Canvas position (px), unscaled. For arrows: start point; width/height are deltas to end. */
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  /** Text body (text), link label (link), or shape variant: rect | ellipse | line. */
  text: string;
  /** Image URL/data URL, link href, or video page URL (YouTube/Vimeo). */
  url: string;
  /** Fill: swatch hex, shape/arrow fill, text tint optional. Empty = no fill (shapes). */
  color: string;
  /** Stroke color (#hex). Empty = no outline (except sensible default when both fill and stroke empty). */
  strokeColor: string;
  /** SVG stroke width for shapes, arrows, and shape lines. */
  strokeWidth: number;
  /** Degrees; rotation around box center (connectors & shapes use same pivot). */
  rotationDeg: number;
  /** Uniform scale applied after rotation (1 = 100%). */
  scale: number;
  /** When true, item cannot be moved, resized or rotated via canvas. */
  locked: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type StageNote = {
  id: Id; // `${projectId}:${stage}`
  projectId: Id;
  stage: StoryStage;
  /** Active beat text; kept in sync with `beatOptions[activeBeatIndex]` */
  text: string;
  /** Multiple beat variants per stage; Enter adds a new slot */
  beatOptions?: string[];
  activeBeatIndex?: number;
  // normalized position of the stage card inside the diagram (0..1)
  cardX: number | null;
  cardY: number | null;
  updatedAt: ISODateString;
};

