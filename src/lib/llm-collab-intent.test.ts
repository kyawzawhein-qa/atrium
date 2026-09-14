import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCollaborationIntent } from "./llm";

test("detectCollaborationIntent matches named agent handoff requests", () => {
  assert.equal(
    detectCollaborationIntent("Can you collaborate with Mara on the API design?"),
    true
  );
  assert.equal(
    detectCollaborationIntent("Please talk to Theo about the hero layout."),
    true
  );
  assert.equal(
    detectCollaborationIntent("Ask Imani to review the login flow tests."),
    true
  );
  assert.equal(
    detectCollaborationIntent("Reach senior-developer about the migration plan."),
    true
  );
});

test("detectCollaborationIntent ignores unrelated prompts", () => {
  assert.equal(detectCollaborationIntent("Write a file called notes.txt"), false);
  assert.equal(detectCollaborationIntent("Mara is a common name in Myanmar"), false);
  assert.equal(detectCollaborationIntent("How does collaboration work in general?"), false);
});

test("seed personas tell specialists to use message_agent", () => {
  const seedPath = path.join(process.cwd(), "prisma", "seed.ts");
  const seed = readFileSync(seedPath, "utf8");

  for (const slug of ["senior-developer", "graphic-designer", "qa-automation"]) {
    const block = seed.slice(seed.indexOf(`slug: "${slug}"`));
    assert.match(block, /message_agent/, `${slug} seed should mention message_agent`);
    assert.match(
      block,
      /Do not say you cannot reach other agents/,
      `${slug} seed should forbid isolation claims`
    );
  }

  const theoBlock = seed.slice(seed.indexOf('slug: "graphic-designer"'));
  assert.match(theoBlock, /senior-developer for Mara Chen/);
  assert.match(theoBlock, /message_agent[\s\S]*Mara/);
});
