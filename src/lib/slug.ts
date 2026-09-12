export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "agent";
}

export const AGENT_ACCENTS = [
  "#6a9e8a",
  "#c4a574",
  "#8a7bb8",
  "#5b8a9a",
  "#c47b7b",
  "#7b9cc4",
  "#b89a6a",
  "#6a8ab8",
];

export function pickAccent(index: number): string {
  return AGENT_ACCENTS[index % AGENT_ACCENTS.length];
}
