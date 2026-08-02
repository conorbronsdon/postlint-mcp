/**
 * Platform limits.
 *
 * Every number here traces to a published source, cited on the entry. Widely
 * repeated figures that no primary source states — the Facebook post limit, the
 * YouTube community post limit, Reddit's title cap, Instagram's organic caption
 * cap — are deliberately absent. A limit this server reports is a limit it can
 * defend; guessing one would make a passing check worth nothing.
 */

export type CountMode =
  /** Weighted characters, URLs billed at a fixed 23. X. */
  | "x"
  /** Extended grapheme clusters, URLs counted in full. Bluesky. */
  | "grapheme"
  /** Grapheme clusters, URLs billed at a fixed 23, mention domains free. Mastodon. */
  | "mastodon"
  /** Characters, URLs counted in full. Everyone else. */
  | "plain";

export interface SecondaryLimit {
  name: string;
  limit: number;
  unit: string;
}

export interface Platform {
  id: string;
  label: string;
  limit: number;
  unit: string;
  mode: CountMode;
  /** An additional hard cap enforced alongside the main limit. */
  secondary?: SecondaryLimit;
  /** Where the post gets visually collapsed behind a "see more" control. A warning, not a failure. */
  truncatesAt?: number;
  /** Why this platform's count is not `text.length`. */
  note: string;
  source: string;
}

export const PLATFORMS: Platform[] = [
  {
    id: "x",
    label: "X (Twitter)",
    limit: 280,
    unit: "weighted characters",
    mode: "x",
    note: "Every URL bills 23 through t.co no matter its real length. Latin, Greek, Cyrillic, Hebrew, and Arabic characters cost 1; CJK, Hangul, and emoji cost 2. An emoji sequence is one unit of 2, not 2 per code point.",
    source: "https://github.com/twitter/twitter-text/blob/master/config/v3.json",
  },
  {
    id: "x_premium",
    label: "X (Twitter) — Premium long post",
    limit: 25000,
    unit: "weighted characters",
    mode: "x",
    note: "Premium accounts can post up to 25,000 characters. Same weighting and same 23-character URLs; only the ceiling moves.",
    source: "https://help.x.com/en/using-x/types-of-posts",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    limit: 300,
    unit: "graphemes",
    mode: "grapheme",
    secondary: { name: "record text", limit: 3000, unit: "UTF-8 bytes" },
    note: "300 extended grapheme clusters, so a family emoji or a flag is 1. URLs count in full — the opposite of X. The record also caps at 3,000 UTF-8 bytes, which can bind first on ZWJ-sequence-heavy text where one grapheme runs 25 bytes.",
    source:
      "https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    limit: 3000,
    unit: "characters",
    mode: "plain",
    truncatesAt: 210,
    note: "3,000 characters for a post. The feed collapses it behind 'see more', which is a visibility problem rather than a rejection.",
    source: "https://www.linkedin.com/help/linkedin/answer/a528176",
  },
  {
    id: "threads",
    label: "Threads",
    limit: 500,
    unit: "characters",
    mode: "plain",
    note: "500 characters in the post body. Since September 2025 you can attach up to 10,000 more characters as an attachment, but the body cap did not move.",
    source:
      "https://about.fb.com/news/2025/09/attach-text-threads-posts-share-longer-perspectives/",
  },
  {
    id: "mastodon",
    label: "Mastodon",
    limit: 500,
    unit: "graphemes",
    mode: "mastodon",
    note: "500 by default and configurable per instance. URLs bill a fixed 23, and on a remote mention only the username counts — the domain is free.",
    source: "https://docs.joinmastodon.org/methods/instance/",
  },
  {
    id: "discord",
    label: "Discord message",
    limit: 2000,
    unit: "characters",
    mode: "plain",
    note: "2,000 characters for a standard message; Nitro raises it to 4,000. Embeds have their own separate 6,000-character total.",
    source:
      "https://support.discord.com/hc/en-us/articles/360034632292-Sending-Messages",
  },
];

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));

export function getPlatform(id: string): Platform | undefined {
  return BY_ID.get(id.toLowerCase().trim());
}

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as [string, ...string[]];
