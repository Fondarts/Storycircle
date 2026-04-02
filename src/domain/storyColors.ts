import type { StoryStage } from "./storyStage";

/** CSS custom property names: --ring-{stage}-fill / --ring-{stage}-stroke */
export function stageRingFillVar(stage: StoryStage): string {
  return `--ring-${stage.toLowerCase()}-fill`;
}

export function stageRingStrokeVar(stage: StoryStage): string {
  return `--ring-${stage.toLowerCase()}-stroke`;
}

export function stageAccentVar(stage: StoryStage): string {
  return `--accent-${stage.toLowerCase()}`;
}
