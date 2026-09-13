/** @type {import("../../src/lib/plugins/types").AtriumPlugin["tools"]} */
export const tools = [
  {
    id: "say_hello",
    label: "Say hello",
    hint: "Return a friendly greeting from the hello-world plugin",
    definition: {
      type: "function",
      function: {
        name: "say_hello",
        description:
          "Return a short greeting from the hello-world Atrium plugin. Does not touch the filesystem.",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Optional name to greet",
            },
          },
        },
      },
    },
    execute: async ({ name }) => ({
      ok: true,
      greeting: `Hello${name ? `, ${name}` : ""} — from the hello-world Atrium plugin.`,
      plugin: "hello-world",
    }),
  },
];
