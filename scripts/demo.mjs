#!/usr/bin/env node
/**
 * Human-readable rendering of what `check_post` returns, for the README demo.
 *
 * The server speaks stdio JSON-RPC, which records as a wall of framing rather
 * than a result. This script calls `checkPost` — the same function the
 * `check_post` tool handler calls in `src/server.ts`, on the same built output
 * in `dist/` — and prints the verdict in a form a person can read. The numbers
 * are the tool's numbers; only the formatting differs.
 *
 * Usage:  node scripts/demo.mjs <case>
 *   x            the X post drafted at 308 against 280
 *   bluesky      the Bluesky post that shipped at 302 against 300
 *   placeholder  that draft while its link was still a [URL] placeholder
 *   cjk          200 CJK characters that every naive length check passes
 *
 * `cjk` is deliberately not in docs/demo.tape: the terminal font used for the
 * recording has no CJK coverage, so it renders as empty boxes. It stays here
 * because it is the sharpest case to run by hand.
 *
 * Requires a build first: npm run build
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  BLUESKY_POST_302,
  BLUESKY_POST_PLACEHOLDER,
  CJK_POST_200,
  X_POST_308,
} from "./fixtures.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (!existsSync(resolve(root, "dist/lint.js"))) {
  console.error("dist/ is missing. Run `npm run build` first.");
  process.exit(1);
}

const { checkPost } = await import(new URL("../dist/lint.js", import.meta.url));
const { getPlatform } = await import(new URL("../dist/limits.js", import.meta.url));

const DIM = "[2m";
const BOLD = "[1m";
const RED = "[31m";
const GREEN = "[32m";
const YELLOW = "[33m";
const OFF = "[0m";

const CASES = {
  x: {
    platform: "x",
    text: X_POST_308,
    headline: "A launch-morning X post. Nothing looks wrong with it.",
  },
  bluesky: {
    platform: "bluesky",
    text: BLUESKY_POST_302,
    headline: 'This one shipped, under a line that read "Under 300 graphemes. Audit clean."',
  },
  placeholder: {
    platform: "bluesky",
    text: BLUESKY_POST_PLACEHOLDER,
    headline: "The same draft an hour earlier, while the link was still a placeholder.",
  },
  cjk: {
    platform: "x",
    text: CJK_POST_200,
    headline: "200 CJK characters. JavaScript agrees it is 200. So would you.",
  },
};

/**
 * CJK and emoji render two cells wide in a terminal, so a 200-glyph CJK line
 * is 400 columns of screen. Measuring in cells is what keeps the preview
 * inside the recorded window.
 */
const cellWidth = (s) =>
  [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}]/u.test(ch) ? 2 : 1), 0);

/** Hard-cut a run with no spaces in it (a long URL, or 200 CJK glyphs). */
function clip(word, width) {
  const out = [];
  let cur = "";
  for (const ch of word) {
    if (cellWidth(cur) + cellWidth(ch) > width) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Wrap on word boundaries so the recorded terminal never soft-wraps mid-word. */
function wrap(text, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    for (const piece of cellWidth(word) > width ? clip(word, width) : [word]) {
      if (line && cellWidth(line) + 1 + cellWidth(piece) > width) {
        lines.push(line);
        line = piece;
      } else {
        line = line ? `${line} ${piece}` : piece;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Trim a line to `width` cells and mark that it was cut. */
function ellipsize(line, width) {
  if (cellWidth(line) <= width) return line;
  const [head] = clip(line, width - 4);
  return `${head} ...`;
}

const name = process.argv[2];
const demo = CASES[name];
if (!demo) {
  console.error(
    `Unknown case "${name ?? ""}". Available: ${Object.keys(CASES).join(", ")}`,
  );
  process.exit(1);
}

const platform = getPlatform(demo.platform);
const result = checkPost(demo.text, platform);

const wrapped = wrap(demo.text, 74);
const preview = wrapped.slice(0, 4);
if (wrapped.length > 4) preview[3] = ellipsize(preview[3], 70);

console.log();
console.log(`  ${BOLD}${demo.headline}${OFF}`);
console.log();
for (const line of preview) console.log(`  ${DIM}${line}${OFF}`);
console.log();

const naive = [...demo.text].length;
console.log(
  `  ${DIM}what a length check sees:${OFF} ${naive} characters` +
    `   ${DIM}what ${platform.label} enforces:${OFF} ${result.limit} ${result.unit}`,
);
console.log();

const verdict = result.over
  ? `${RED}${BOLD}  OVER  ${OFF}  ${result.length} / ${result.limit} ${result.unit}` +
    `   ${RED}over by ${-result.remaining}${OFF}`
  : `${GREEN}${BOLD}  FITS  ${OFF}  ${result.length} / ${result.limit} ${result.unit}` +
    `   ${GREEN}${result.remaining} left${OFF}`;
console.log(`  ${verdict}`);
console.log();

console.log(`  ${DIM}what drove the count${OFF}`);
for (const driver of result.drivers) console.log(`    ${YELLOW}·${OFF} ${driver}`);

for (const warning of result.warnings) {
  console.log();
  for (const line of wrap(warning, 72)) console.log(`  ${YELLOW}${line}${OFF}`);
}
console.log();
