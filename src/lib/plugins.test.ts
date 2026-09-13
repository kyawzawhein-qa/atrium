import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPluginsFromDir } from "./plugins/loader";
import {
  executePluginTool,
  getPluginPromptAddendum,
  getPluginToolMetas,
  resetPluginCache,
} from "./plugins/registry";
import { resetPluginInit } from "./plugins/init";

test("loads manifest-only and module-backed plugins from a directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atrium-plug-"));
  const onlyJson = path.join(root, "prompt-only");
  await mkdir(onlyJson);
  await writeFile(
    path.join(onlyJson, "plugin.json"),
    JSON.stringify({
      id: "prompt-only",
      name: "Prompt only",
      description: "Adds prompt text",
      promptAddendum: "Remember to stay concise.",
    })
  );

  const withTools = path.join(root, "with-tools");
  await mkdir(withTools);
  await writeFile(
    path.join(withTools, "plugin.json"),
    JSON.stringify({
      id: "with-tools",
      name: "With tools",
      description: "Adds a tool",
    })
  );
  await writeFile(
    path.join(withTools, "index.mjs"),
    `export const tools = [{
      id: "demo_ping",
      label: "Demo ping",
      hint: "Returns pong",
      definition: {
        type: "function",
        function: {
          name: "demo_ping",
          description: "Ping",
          parameters: { type: "object", properties: {} },
        },
      },
      execute: async () => ({ ok: true, pong: true }),
    }];`
  );

  const plugins = await loadPluginsFromDir(root);
  assert.equal(plugins.length, 2);
  assert.equal(plugins[0].id, "prompt-only");
  assert.match(plugins[0].promptAddendum || "", /concise/);
  assert.equal(plugins[1].tools?.[0]?.id, "demo_ping");

  resetPluginCache(root);
  resetPluginInit();
  const metas = await getPluginToolMetas();
  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "demo_ping");

  const addendum = await getPluginPromptAddendum();
  assert.match(addendum, /concise/);

  const result = await executePluginTool("demo_ping", {});
  assert.deepEqual(result, { ok: true, pong: true });

  await rm(root, { recursive: true, force: true });
  resetPluginCache();
  resetPluginInit();
});

test("loads the shipped hello-world example plugin", async () => {
  resetPluginCache();
  resetPluginInit();
  const plugins = await loadPluginsFromDir(path.join(process.cwd(), "plugins"));
  const hello = plugins.find((p) => p.id === "hello-world");
  assert.ok(hello);
  assert.equal(hello?.tools?.[0]?.id, "say_hello");
  const greeting = await executePluginTool("say_hello", { name: "Atrium" });
  assert.equal(
    (greeting as { greeting?: string }).greeting,
    "Hello, Atrium — from the hello-world Atrium plugin."
  );
});
