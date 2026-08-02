import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkPost } from "./lint.js";
import { PLATFORMS, PLATFORM_IDS, getPlatform } from "./limits.js";

export const SERVER_VERSION = "0.1.0";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const errorResult = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true as const,
});

const textArg = z
  .string()
  .describe(
    "The post text, exactly as it will be published. Leading and trailing whitespace is trimmed, as the platforms do. `[URL]`-style placeholders are priced as a real link.",
  );

export function createServer(): McpServer {
  const server = new McpServer({
    name: "postlint-mcp",
    version: SERVER_VERSION,
  });

  server.tool(
    "check_post",
    "Check a social post against one platform's real character limit and report whether it fits. Returns the counted length, the limit, and what drove the count (URLs billed at a fixed width, non-Latin characters billed double, emoji sequences collapsed to one grapheme). Use this before publishing anything with a hard limit — the counting rules are per-platform and are not text.length.",
    {
      text: textArg,
      platform: z
        .enum(PLATFORM_IDS)
        .describe(`Which platform's rules to apply: ${PLATFORM_IDS.join(", ")}.`),
    },
    async ({ text, platform }) => {
      const target = getPlatform(platform);
      if (!target) {
        return errorResult(
          `Unknown platform "${platform}". Known platforms: ${PLATFORM_IDS.join(", ")}.`,
        );
      }
      return json(checkPost(text, target));
    },
  );

  server.tool(
    "check_post_all",
    "Check one post against every platform at once and get a row per platform: counted length, limit, and whether it fits. Use this when deciding where a draft can go as-is. The per-platform arithmetic is included only for the platforms it fails, to keep the response small — call check_post for a single platform's full breakdown.",
    {
      text: textArg,
    },
    async ({ text }) => {
      const rows = PLATFORMS.map((p) => {
        const r = checkPost(text, p);
        return {
          platform: r.platform,
          length: r.length,
          limit: r.limit,
          unit: r.unit,
          over: r.over,
          remaining: r.remaining,
          // Only failures earn the full breakdown. A passing row does not need it.
          ...(r.over ? { drivers: r.drivers } : {}),
        };
      });
      return json({
        fits: rows.filter((r) => !r.over).map((r) => r.platform),
        over: rows.filter((r) => r.over).map((r) => r.platform),
        rows,
      });
    },
  );

  server.tool(
    "platform_limits",
    "List the platforms this server knows, with each one's limit, the unit it is measured in, why that unit is not a plain character count, and the source the number came from. Use it to explain a result or to see what is covered.",
    {
      platform: z
        .enum(PLATFORM_IDS)
        .optional()
        .describe("Limit the response to one platform. Omit for all of them."),
    },
    async ({ platform }) => {
      const list = platform ? PLATFORMS.filter((p) => p.id === platform) : PLATFORMS;
      return json(
        list.map((p) => ({
          platform: p.id,
          label: p.label,
          limit: p.limit,
          unit: p.unit,
          ...(p.secondary
            ? { alsoCapped: `${p.secondary.limit} ${p.secondary.unit} (${p.secondary.name})` }
            : {}),
          ...(p.truncatesAt !== undefined ? { seeMoreAtAbout: p.truncatesAt } : {}),
          note: p.note,
          source: p.source,
        })),
      );
    },
  );

  return server;
}
