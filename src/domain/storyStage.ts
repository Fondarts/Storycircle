export const STORY_STAGES = [
  "You",
  "Need",
  "Go",
  "Search",
  "Find",
  "Take",
  "Return",
  "Change",
] as const;

export type StoryStage = (typeof STORY_STAGES)[number];

export const STORY_STAGE_LABELS: Record<StoryStage, string> = {
  You: "You (comfort zone)",
  Need: "Need (want)",
  Go: "Go (enter chaos)",
  Search: "Search (adapt)",
  Find: "Find (truth)",
  Take: "Take (pay the price)",
  Return: "Return (road back)",
  Change: "Change (master / flaw fixed)",
};

