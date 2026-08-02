/**
 * The two posts that made this server exist.
 *
 * Both went out of a podcast promo workflow where every count was a claim
 * rather than a measurement. The copy is synthetic — same shape, same counts,
 * none of the original text — so the numbers stay pinned without shipping
 * anyone's drafts.
 *
 * Kept here, in plain ESM, because two things depend on the exact same bytes:
 * the regression tests in `src/__tests__/lint.test.ts` and the demo in
 * `scripts/demo.mjs` that gets recorded into `docs/demo.gif`. If the text lived
 * in the test file, the recorded GIF would quietly disagree with the suite the
 * first time either copy was edited.
 */

/** Drafted at 308 against X's 280. Three links, priced at 23 each. */
export const X_POST_308 =
  "New episode is live. Why most teams measure agent reliability wrongly, what changes once evals run in CI, and how you actually decide an agent is good enough to ship. Video: https://youtu.be/0Lh8GBhrwzk Transcript: https://example.com/podcast/ep-66 Newsletter: https://example.com/newsletter Chapter timestamps are in the replies.";

/** Shipped at 302 against Bluesky's 300, under a line claiming it was clean. */
export const BLUESKY_POST_302 =
  "New episode is live. We got into why most teams measure agent reliability wrong, what changes once evals run in CI, and the part nobody writes down: how you decide an agent is good enough to ship. Worth the listen if you build with LLMs. Full episode and transcript here: https://example.com/podcast/64";

/**
 * 200 CJK characters. `"日".repeat(200).length` is 200, so every naive check
 * — including a model counting by inspection — passes it. X weights each one
 * at 2 and the real count is 400.
 */
export const CJK_POST_200 = "日".repeat(200);

/**
 * The same Bluesky draft one step earlier, while the link was still a `[URL]`
 * placeholder. Derived from the post above rather than retyped, so the two
 * cannot drift apart: this is literally that post before the link went in.
 *
 * A length check reads 277 and reports 23 characters to spare. The real count
 * is 300 of 300 — no headroom at all — because the placeholder stands in for a
 * link, not for five characters.
 */
export const BLUESKY_POST_PLACEHOLDER = BLUESKY_POST_302.replace(
  "https://example.com/podcast/64",
  "[URL]",
);
