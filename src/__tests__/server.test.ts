import { describe, it, expect } from "vitest";
import { createServer } from "../server.js";
import { PLATFORMS } from "../limits.js";

/**
 * Drive a registered MCP tool's handler directly and parse its JSON text
 * result. The MCP SDK stores registered tools on `_registeredTools`, each with
 * a `handler` that returns a content array.
 */
async function callTool(
  server: ReturnType<typeof createServer>,
  name: string,
  args: Record<string, unknown>,
): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as any)._registeredTools as Record<string, any>;
  const tool = tools[name];
  if (!tool) throw new Error(`tool ${name} not registered`);
  // The SDK validates and applies zod defaults before dispatching. Mirror that
  // so tests exercise the real input path.
  const parsed = tool.inputSchema ? tool.inputSchema.parse(args) : args;
  const result = await tool.handler(parsed, {} as any);
  if (result.isError) return { isError: true, text: result.content[0].text };
  return JSON.parse(result.content[0].text);
}

function registeredTools(server: ReturnType<typeof createServer>): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.keys((server as any)._registeredTools);
}

describe("tool registration", () => {
  it("exposes exactly the three documented tools", () => {
    expect(registeredTools(createServer()).sort()).toEqual([
      "check_post",
      "check_post_all",
      "platform_limits",
    ]);
  });
});

describe("check_post", () => {
  it("returns the verdict, the arithmetic, and nothing else", async () => {
    const out = await callTool(createServer(), "check_post", {
      text: "Hello world",
      platform: "bluesky",
    });
    expect(Object.keys(out).sort()).toEqual([
      "drivers",
      "length",
      "limit",
      "over",
      "platform",
      "remaining",
      "unit",
      "warnings",
    ].sort());
    expect(out.length).toBe(11);
    expect(out.over).toBe(false);
  });

  it("flags an over-limit post", async () => {
    const out = await callTool(createServer(), "check_post", {
      text: "a".repeat(301),
      platform: "bluesky",
    });
    expect(out.over).toBe(true);
    expect(out.remaining).toBe(-1);
  });

  it("rejects an unknown platform through zod, before the handler runs", async () => {
    await expect(
      callTool(createServer(), "check_post", { text: "hi", platform: "myspace" }),
    ).rejects.toThrow();
  });
});

describe("check_post_all", () => {
  it("returns one row per platform plus fits/over summaries", async () => {
    const out = await callTool(createServer(), "check_post_all", {
      text: "A short post.",
    });
    expect(out.rows).toHaveLength(PLATFORMS.length);
    expect(out.over).toEqual([]);
    expect(out.fits).toEqual(PLATFORMS.map((p) => p.id));
  });

  it("includes the breakdown only on the rows that fail", async () => {
    const out = await callTool(createServer(), "check_post_all", {
      text: "a".repeat(600),
    });
    for (const row of out.rows) {
      expect("drivers" in row).toBe(row.over);
    }
    expect(out.over).toContain("bluesky");
    expect(out.over).toContain("x");
    expect(out.fits).toContain("linkedin");
  });

  it("keeps the passing response small", async () => {
    const server = createServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["check_post_all"];
    const result = await tool.handler(tool.inputSchema.parse({ text: "Hello." }), {} as any);
    expect(result.content[0].text.length).toBeLessThan(1500);
  });
});

describe("platform_limits", () => {
  it("lists every platform with a limit, a unit, and a source", async () => {
    const out = await callTool(createServer(), "platform_limits", {});
    expect(out).toHaveLength(PLATFORMS.length);
    for (const row of out) {
      expect(typeof row.limit).toBe("number");
      expect(row.unit).toBeTruthy();
      expect(row.source).toMatch(/^https:\/\//);
    }
  });

  it("narrows to a single platform on request", async () => {
    const out = await callTool(createServer(), "platform_limits", { platform: "x" });
    expect(out).toHaveLength(1);
    expect(out[0].platform).toBe("x");
    expect(out[0].limit).toBe(280);
  });
});

/**
 * The README says: "There is no write path, no credential, and no network call
 * of any kind." That is the strongest thing this server claims, and until this
 * test existed it was true only by inspection -- nothing failed if a future
 * change added a fetch. Every global that could reach the network is replaced
 * with a throw, so a call fails the suite rather than the claim.
 */
describe("makes no network calls", () => {
  const NETWORK_GLOBALS = ["fetch", "XMLHttpRequest", "WebSocket"] as const;

  it("completes every tool without touching a network global", async () => {
    const saved = new Map<string, unknown>();
    const attempted: string[] = [];

    for (const name of NETWORK_GLOBALS) {
      saved.set(name, (globalThis as Record<string, unknown>)[name]);
      (globalThis as Record<string, unknown>)[name] = (...args: unknown[]) => {
        attempted.push(`${name}(${String(args[0] ?? "")})`);
        throw new Error(`network call attempted via ${name}`);
      };
    }

    try {
      const server = createServer();
      const text = "Shipping a thing today https://example.com/a-fairly-long-path";

      await callTool(server, "check_post", { text, platform: "x" });
      await callTool(server, "check_post_all", { text });
      await callTool(server, "platform_limits", {});
    } finally {
      for (const [name, value] of saved) {
        (globalThis as Record<string, unknown>)[name] = value;
      }
    }

    expect(attempted).toEqual([]);
  });
});
