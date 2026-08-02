#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  if (typeof Intl.Segmenter !== "function") {
    // Grapheme counting is the whole point on Bluesky and Mastodon. A build
    // without full ICU would silently return counts that are too low, which is
    // worse than not starting.
    console.error(
      "Fatal: Intl.Segmenter is unavailable. postlint-mcp needs Node 18+ with full ICU (the default build) to count graphemes.",
    );
    process.exit(1);
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("postlint MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
