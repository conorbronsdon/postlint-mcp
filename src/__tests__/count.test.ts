import { describe, it, expect } from "vitest";
import {
  PLACEHOLDER_STANDIN,
  TCO_URL_LENGTH,
  billUrlsAtFixedWidth,
  byteLength,
  findUrls,
  graphemeLength,
  resolvePlaceholders,
  stripMentionDomains,
  utf16Length,
  weightedLength,
} from "../count.js";

const FAMILY = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}"; // 👨‍👩‍👧‍👦
const FLAG_US = "\u{1F1FA}\u{1F1F8}"; // 🇺🇸
const E_COMBINING = "e\u0301"; // e + U+0301 combining acute
const E_PRECOMPOSED = "\u00E9"; // the single-code-point form

describe("graphemeLength", () => {
  it("counts a four-person ZWJ family emoji as one", () => {
    expect(utf16Length(FAMILY)).toBe(11);
    expect(graphemeLength(FAMILY)).toBe(1);
  });

  it("counts a regional-indicator flag pair as one", () => {
    expect(utf16Length(FLAG_US)).toBe(4);
    expect(graphemeLength(FLAG_US)).toBe(1);
  });

  it("counts a base character plus a combining accent as one", () => {
    expect(utf16Length(E_COMBINING)).toBe(2);
    expect(graphemeLength(E_COMBINING)).toBe(1);
    expect(graphemeLength(E_PRECOMPOSED)).toBe(1);
  });

  it("counts a skin-tone modified emoji as one", () => {
    expect(graphemeLength("\u{1F44B}\u{1F3FD}")).toBe(1); // 👋🏽
  });

  it("counts CJK characters one per character", () => {
    expect(graphemeLength("日本語のテキスト")).toBe(8);
  });

  it("counts an empty string as zero", () => {
    expect(graphemeLength("")).toBe(0);
  });
});

describe("weightedLength (X)", () => {
  it("bills Latin text at one per character", () => {
    expect(weightedLength("Hello world").length).toBe(11);
  });

  it("bills CJK at two per character", () => {
    const r = weightedLength("日本語");
    expect(r.length).toBe(6);
    expect(r.heavyChars).toBe(3);
  });

  it("bills an emoji sequence as one unit of two, not two per code point", () => {
    const r = weightedLength(FAMILY);
    expect(r.length).toBe(2);
    expect(r.heavyChars).toBe(1);
  });

  it("bills a flag as two, not four", () => {
    expect(weightedLength(FLAG_US).length).toBe(2);
  });

  it("bills Cyrillic and Greek at one, since both sit in the light ranges", () => {
    expect(weightedLength("привет").length).toBe(6);
    expect(weightedLength("γειά").length).toBe(4);
  });

  it("normalizes to NFC so a decomposed accent bills the same as a precomposed one", () => {
    expect(weightedLength(E_COMBINING).length).toBe(weightedLength(E_PRECOMPOSED).length);
    expect(weightedLength(E_COMBINING).length).toBe(1);
  });

  it("reports heavy and light characters that sum to the weighted length", () => {
    const r = weightedLength("hi 日本 " + FAMILY);
    expect(r.heavyChars * 2 + r.lightChars).toBe(r.length);
  });
});

describe("findUrls", () => {
  it("finds URLs with a scheme regardless of length", () => {
    const urls = findUrls("see https://example.com/a/very/long/path?q=1 ok");
    expect(urls.map((u) => u.text)).toEqual(["https://example.com/a/very/long/path?q=1"]);
  });

  it("finds www-prefixed and bare known-TLD domains", () => {
    expect(findUrls("go to www.example.com now").map((u) => u.text)).toEqual([
      "www.example.com",
    ]);
    expect(findUrls("go to example.dev/docs now").map((u) => u.text)).toEqual([
      "example.dev/docs",
    ]);
  });

  it("leaves sentence punctuation out of the match", () => {
    expect(findUrls("read https://example.com.").map((u) => u.text)).toEqual([
      "https://example.com",
    ]);
    expect(findUrls("read (https://example.com), then").map((u) => u.text)).toEqual([
      "https://example.com",
    ]);
  });

  it("does not treat a fediverse handle's domain as a link", () => {
    expect(findUrls("hi @user@mastodon.social")).toEqual([]);
  });

  it("does not treat an email domain as a link", () => {
    expect(findUrls("write to someone@example.com")).toEqual([]);
  });

  it("does not treat an unknown TLD as a link", () => {
    expect(findUrls("the file is notes.txt")).toEqual([]);
  });

  it("prices a [URL] placeholder as a real link and flags it as estimated", () => {
    const urls = findUrls("new episode [URL]");
    expect(urls).toHaveLength(1);
    expect(urls[0]!.text).toBe(PLACEHOLDER_STANDIN);
    expect(urls[0]!.placeholder).toBe(true);
  });

  it("does not flag a real link as a placeholder", () => {
    expect(findUrls("new episode https://example.com")[0]!.placeholder).toBe(false);
  });

  it("finds every link in a multi-link post", () => {
    const urls = findUrls("a https://one.com b https://two.com c [URL]");
    expect(urls).toHaveLength(3);
  });
});

describe("billUrlsAtFixedWidth", () => {
  it("replaces each link with a fixed-width filler and leaves the rest alone", () => {
    const out = billUrlsAtFixedWidth("go https://example.com/very/long/path now", TCO_URL_LENGTH);
    expect(out).toBe("go " + "x".repeat(23) + " now");
  });

  it("makes a long and a short link cost the same", () => {
    const short = billUrlsAtFixedWidth("x https://a.co", TCO_URL_LENGTH).length;
    const long = billUrlsAtFixedWidth(
      "x https://example.com/" + "y".repeat(200),
      TCO_URL_LENGTH,
    ).length;
    expect(short).toBe(long);
  });

  it("agrees with findUrls on how many links there are", () => {
    const text = "a https://one.com b @user@mastodon.social c [URL]";
    const billed = billUrlsAtFixedWidth(text, TCO_URL_LENGTH);
    const fillers = billed.match(/x{23}/g) ?? [];
    expect(fillers).toHaveLength(findUrls(text).length);
  });
});

describe("stripMentionDomains", () => {
  it("drops the domain from a remote mention", () => {
    expect(stripMentionDomains("hi @user@example.social")).toBe("hi @user");
  });

  it("leaves a local mention alone", () => {
    expect(stripMentionDomains("hi @user")).toBe("hi @user");
  });
});

describe("resolvePlaceholders", () => {
  it("substitutes the documented placeholder spellings, case-insensitively", () => {
    for (const p of ["[URL]", "[url]", "[LINK]", "[YOUTUBE URL]", "[SUBSTACK URL]"]) {
      expect(resolvePlaceholders(`a ${p} b`)).toBe(`a ${PLACEHOLDER_STANDIN} b`);
    }
  });

  it("leaves unrelated bracketed text alone", () => {
    expect(resolvePlaceholders("a [note] b")).toBe("a [note] b");
  });
});

describe("byteLength", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("日")).toBe(3);
    expect(byteLength(FAMILY)).toBe(25);
  });
});
