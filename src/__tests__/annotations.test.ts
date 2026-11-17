import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

/**
 * MCP ToolAnnotations default to the unsafe values (readOnlyHint false,
 * destructiveHint true, idempotentHint false, openWorldHint true), so a tool
 * that omits them is advertised to clients as a destructive, open-world write.
 * Every tool in this server is pure compute, so each must say so. This goes
 * through a real tools/list rather than the SDK's private registry, so it
 * checks what a client actually sees.
 */
async function listTools() {
  const server = createServer();
  const client = new Client({ name: "annotations-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return (await client.listTools()).tools;
  } finally {
    await client.close();
  }
}

const EXPECTED = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

describe("tool annotations", () => {
  it("declares every tool read-only, non-destructive, idempotent, and closed-world", async () => {
    const tools = await listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "check_post",
      "check_post_all",
      "platform_limits",
    ]);
    for (const tool of tools) {
      expect({ name: tool.name, annotations: tool.annotations }).toEqual({
        name: tool.name,
        annotations: EXPECTED,
      });
    }
  });

  it("catches a tool that omits annotations (negative control)", async () => {
    const server = createServer();
    server.tool("unannotated_probe", "probe", {}, async () => ({ content: [] }));
    const client = new Client({ name: "annotations-test", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
    const { tools } = await client.listTools();
    await client.close();
    const offenders = tools.filter((t) => t.annotations?.readOnlyHint !== true).map((t) => t.name);
    expect(offenders).toEqual(["unannotated_probe"]);
  });
});
