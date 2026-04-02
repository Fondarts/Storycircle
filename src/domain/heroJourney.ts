export type HeroJourneyAct = 1 | 2 | 3;

/** One step on the circle, clockwise from the top (infographic order). */
export type HeroJourneyStepDefinition = {
  step: number;
  title: string;
  /** Short label on the ring wedge */
  ringLabel: string;
  act: HeroJourneyAct;
};

/**
 * Campbell-style 12 steps, clockwise from top.
 * Act I (1–4): Known world → threshold. Act II (5–9): Unknown. Act III (10–12): return.
 */
export const HERO_JOURNEY_STEPS: readonly HeroJourneyStepDefinition[] = [
  { step: 1, title: "Ordinary World", ringLabel: "Ordinary World", act: 1 },
  { step: 2, title: "Call to Adventure", ringLabel: "Call", act: 1 },
  { step: 3, title: "Refusal of the Call", ringLabel: "Refusal", act: 1 },
  { step: 4, title: "Meet the Mentor", ringLabel: "Mentor", act: 1 },
  { step: 5, title: "Crossing the Threshold", ringLabel: "Threshold", act: 2 },
  { step: 6, title: "Tests, Allies, Enemies", ringLabel: "Tests", act: 2 },
  { step: 7, title: "Innermost Cave", ringLabel: "Cave", act: 2 },
  { step: 8, title: "Ordeal", ringLabel: "Ordeal", act: 2 },
  { step: 9, title: "Reward", ringLabel: "Reward", act: 2 },
  { step: 10, title: "The Road Back", ringLabel: "Road back", act: 3 },
  { step: 11, title: "Resurrection", ringLabel: "Resurrection", act: 3 },
  { step: 12, title: "Return With Elixir", ringLabel: "Elixir", act: 3 },
] as const;

export const HERO_JOURNEY_STEP_COUNT = 12;

export type CircleDiagramVariant = "story-circle" | "heroes-journey";

export const CIRCLE_DIAGRAM_VARIANT_STORAGE_KEY = "storycircle:diagram-variant";

/** CSS custom property for card / leader line accent (no `var()` wrapper). */
export function hjActAccentVar(act: HeroJourneyAct): string {
  return `--hj-act-${act}-accent`;
}

export function hjActRingFillVar(act: HeroJourneyAct): string {
  return `--hj-act-${act}-fill`;
}

export function hjActRingStrokeVar(act: HeroJourneyAct): string {
  return `--hj-act-${act}-stroke`;
}
