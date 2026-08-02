import { describe, it, expect } from "vitest";
import { checkPost } from "../lint.js";
import { PLATFORMS, getPlatform } from "../limits.js";
import {
  BLUESKY_POST_302,
  BLUESKY_POST_PLACEHOLDER,
  CJK_POST_200,
  X_POST_308,
} from "../../scripts/fixtures.mjs";

const platform = (id: string) => {
  const p = getPlatform(id);
  if (!p) throw new Error(`no such platform: ${id}`);
  return p;
};

/**
 * The two posts that made this server exist. The text lives in
 * `scripts/fixtures.mjs` because the README demo recording renders the same
 * posts, and the GIF would otherwise drift away from these assertions.
 */
describe("regressions", () => {
  it("catches the Bluesky post that shipped at 302 against 300", () => {
    const post = BLUESKY_POST_302;
    const r = checkPost(post, platform("bluesky"));
    expect(r.length).toBe(302);
    expect(r.limit).toBe(300);
    expect(r.over).toBe(true);
    expect(r.remaining).toBe(-2);
  });

  it("catches the X post drafted at 308 against 280", () => {
    const post = X_POST_308;
    const r = checkPost(post, platform("x"));
    expect(r.length).toBe(308);
    expect(r.limit).toBe(280);
    expect(r.over).toBe(true);
    expect(r.drivers).toContain("3 URLs counted as 23 each = 69");
  });

  it("prices a [URL] placeholder rather than counting five characters", () => {
    // The failure this guards: a draft measured 264 with the placeholder in
    // place and 282 once the real link went in — over, and invisible.
    const withPlaceholder = checkPost("Listen here [URL]", platform("bluesky"));
    const withLink = checkPost(
      "Listen here https://youtu.be/0Lh8GBhrwzk",
      platform("bluesky"),
    );
    expect(withPlaceholder.length).toBe(withLink.length);
    expect(withPlaceholder.warnings.join(" ")).toMatch(/placeholder/);
  });

  // Pinned because docs/demo.gif shows these exact numbers. If the pricing
  // changes, this fails and the GIF gets re-recorded rather than going stale.
  it("leaves the placeholder draft with no headroom a length check would report", () => {
    const r = checkPost(BLUESKY_POST_PLACEHOLDER, platform("bluesky"));
    expect([...BLUESKY_POST_PLACEHOLDER].length).toBe(277);
    expect(r.length).toBe(300);
    expect(r.over).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/placeholder was priced as a 28-character link/);
  });
});

describe("X counting", () => {
  it("bills every URL at 23 no matter its real length", () => {
    const short = checkPost("go https://a.co", platform("x"));
    const long = checkPost("go https://example.com/" + "z".repeat(120), platform("x"));
    expect(short.length).toBe(long.length);
    expect(short.length).toBe(3 + 23);
  });

  it("fits a post whose raw length is over 280 but whose links compress", () => {
    const post =
      "Short take. " + "https://example.com/" + "z".repeat(300);
    const r = checkPost(post, platform("x"));
    expect(post.length).toBeGreaterThan(280);
    expect(r.over).toBe(false);
  });

  it("fails a CJK post that a naive character count would pass", () => {
    const post = CJK_POST_200;
    expect(post.length).toBe(200);
    const r = checkPost(post, platform("x"));
    expect(r.length).toBe(400);
    expect(r.over).toBe(true);
  });

  it("keeps the drivers adding up to the reported length", () => {
    const r = checkPost(
      "Read https://example.com and https://example.org and 日本語 and \u{1F1FA}\u{1F1F8}",
      platform("x"),
    );
    expect(r.drivers).toEqual([
      "2 URLs counted as 23 each = 46",
      "4 non-Latin characters (CJK, Hangul, or emoji) counted as 2 each = 8",
      "20 other characters counted as 1 each",
    ]);
    expect(46 + 8 + 20).toBe(r.length);
  });

  it("applies the same weighting to the Premium 25,000 ceiling", () => {
    const post = "日".repeat(200);
    const free = checkPost(post, platform("x"));
    const premium = checkPost(post, platform("x_premium"));
    expect(premium.length).toBe(free.length);
    expect(premium.over).toBe(false);
  });
});

describe("Bluesky counting", () => {
  it("counts a family emoji as one grapheme, not eleven code units", () => {
    const post = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}".repeat(30);
    expect(post.length).toBe(330);
    const r = checkPost(post, platform("bluesky"));
    expect(r.length).toBe(30);
    expect(r.over).toBe(false);
  });

  it("counts links in full, unlike X", () => {
    const post = "go https://example.com/" + "z".repeat(300);
    expect(checkPost(post, platform("x")).over).toBe(false);
    expect(checkPost(post, platform("bluesky")).over).toBe(true);
  });

  it("warns when the 3,000-byte record cap is breached under 300 graphemes", () => {
    // A four-person ZWJ family is one grapheme and 25 UTF-8 bytes, so the byte
    // cap can bind long before the grapheme cap. This is the only way the two
    // limits disagree, and it is why both are checked.
    const post = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}".repeat(121);
    const r = checkPost(post, platform("bluesky"));
    expect(r.length).toBe(121);
    expect(r.over).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/3025 of 3000 UTF-8 bytes/);
  });

  it("does not warn about bytes on ordinary text", () => {
    const r = checkPost("A short post.", platform("bluesky"));
    expect(r.warnings).toEqual([]);
  });
});

describe("Mastodon counting", () => {
  it("bills a link at 23 and charges nothing for a mention's domain", () => {
    const bare = checkPost("hello", platform("mastodon"));
    const withMention = checkPost("hello @user@a-very-long-instance.example", platform("mastodon"));
    // " @user" is six more characters; the domain is free.
    expect(withMention.length).toBe(bare.length + 6);
  });

  it("counts graphemes, so an emoji costs one", () => {
    const r = checkPost("\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}", platform("mastodon"));
    expect(r.length).toBe(1);
  });

  it("always says the limit is instance-configurable", () => {
    const r = checkPost("hi", platform("mastodon"));
    expect(r.warnings.join(" ")).toMatch(/max_characters/);
  });
});

describe("LinkedIn", () => {
  it("passes a long post under 3,000 and warns about the fold", () => {
    const r = checkPost("word ".repeat(200).trim(), platform("linkedin"));
    expect(r.over).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/see more/);
  });

  it("does not warn about the fold on a short post", () => {
    const r = checkPost("A short post.", platform("linkedin"));
    expect(r.warnings).toEqual([]);
  });

  it("fails past 3,000", () => {
    const r = checkPost("a".repeat(3001), platform("linkedin"));
    expect(r.over).toBe(true);
    expect(r.remaining).toBe(-1);
  });
});

describe("general behavior", () => {
  it("trims surrounding whitespace, as the platforms do", () => {
    const r = checkPost("  hello  \n\n", platform("bluesky"));
    expect(r.length).toBe(5);
  });

  it("treats a post exactly at the limit as fitting", () => {
    const r = checkPost("a".repeat(300), platform("bluesky"));
    expect(r.over).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("returns a usable result for empty text on every platform", () => {
    for (const p of PLATFORMS) {
      const r = checkPost("", p);
      expect(r.length).toBe(0);
      expect(r.over).toBe(false);
    }
  });

  it("never emits a driver line for zero characters", () => {
    for (const p of PLATFORMS) {
      for (const d of checkPost("hello world", p).drivers) {
        expect(d).not.toMatch(/^0 /);
      }
    }
  });

  it("reports remaining as limit minus length everywhere", () => {
    for (const p of PLATFORMS) {
      const r = checkPost("a test post with https://example.com in it", p);
      expect(r.remaining).toBe(r.limit - r.length);
      expect(r.over).toBe(r.length > r.limit);
    }
  });
});
