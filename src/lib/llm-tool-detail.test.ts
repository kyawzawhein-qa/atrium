import { test } from "node:test";
import assert from "node:assert/strict";
import { toolResultDetail } from "./llm";

test("read_file detail marks truncated without dumping content", () => {
  const big = "x".repeat(500);
  const detail = toolResultDetail(
    {
      ok: true,
      path: "/tmp/large.txt",
      content: big,
      bytes: 65536,
      truncated: true,
    },
    "read_file"
  );
  assert.match(detail, /truncated/);
  assert.ok(!detail.includes(big));
  assert.ok(!detail.includes("xxx"));
});

test("read_file detail omits content for non-truncated reads", () => {
  const detail = toolResultDetail(
    {
      ok: true,
      path: "/tmp/small.txt",
      content: "hello world",
      bytes: 11,
      truncated: false,
    },
    "read_file"
  );
  assert.equal(detail, "/tmp/small.txt · 11 bytes");
  assert.ok(!detail.includes("hello"));
});

test("toolResultDetail caps generic JSON at 180 characters", () => {
  const detail = toolResultDetail({ ok: true, items: "a".repeat(300) });
  assert.ok(detail.length <= 180);
  assert.match(detail, /…$/);
});
