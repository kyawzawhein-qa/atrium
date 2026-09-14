import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPluginsFromDir } from "./plugins/loader";
import {
  __setPluginLoadOverride,
  executePluginTool,
  getLoadedPlugins,
  getPluginPromptAddendum,
  getPluginToolMetas,
  resetPluginCache,
} from "./plugins/registry";
import { resetPluginInit, getPluginContext } from "./plugins/init";

test("plugin tool definitions require allowlist", async () => {
  resetPluginCache();
  resetPluginInit();
  const without = await getPluginContext({ toolsGranted: false });
  assert.equal(without.toolDefinitions.length, 0);
  assert.match(without.promptAddendum, /hello-world|concise|plugin/i);

  const withAllow = await getPluginContext({ toolsGranted: true });
  assert.ok(withAllow.toolDefinitions.length > 0);
});

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

test("broken plugin module keeps manifest and skips tools", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atrium-plug-broken-"));
  const broken = path.join(root, "broken-module");
  await mkdir(broken);
  await writeFile(
    path.join(broken, "plugin.json"),
    JSON.stringify({
      id: "broken-module",
      name: "Broken module",
      description: "Manifest loads even when the module throws",
      promptAddendum: "Broken module prompt still applies.",
    })
  );
  await writeFile(
    path.join(broken, "index.mjs"),
    `throw new Error("plugin init failed");`
  );

  const plugins = await loadPluginsFromDir(root);
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0].id, "broken-module");
  assert.match(plugins[0].promptAddendum || "", /Broken module prompt/);
  assert.equal(plugins[0].tools, undefined);

  resetPluginCache(root);
  resetPluginInit();
  const metas = await getPluginToolMetas();
  assert.equal(metas.length, 0);
  const addendum = await getPluginPromptAddendum();
  assert.match(addendum, /Broken module prompt/);

  await rm(root, { recursive: true, force: true });
  resetPluginCache();
  resetPluginInit();
});

test("getLoadedPlugins does not cache a rejected load promise", async () => {
  let attempts = 0;
  __setPluginLoadOverride(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("transient plugin load failure");
    return [];
  });
  resetPluginCache();

  await assert.rejects(getLoadedPlugins(), /transient plugin load failure/);
  await assert.doesNotReject(getLoadedPlugins());
  assert.equal(attempts, 2);

  __setPluginLoadOverride(null);
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
