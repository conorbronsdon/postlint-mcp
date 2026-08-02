/**
 * Counting primitives.
 *
 * Each platform measures a post in a different unit, and none of them is
 * `text.length`. The three that matter:
 *
 *   - X weights characters (Latin, Greek, Cyrillic, Hebrew and Arabic 1; CJK,
 *     Hangul and emoji 2) and bills every URL at
 *     a fixed 23 regardless of its real length, because links are rewritten
 *     through t.co.
 *   - Bluesky counts extended grapheme clusters, so a flag or a family emoji is
 *     1 no matter how many code points it holds. URLs count in full — the exact
 *     opposite of X.
 *   - Everyone else counts UTF-16 code units, JavaScript's `.length`, which is
 *     also wrong for astral characters but is what the platform enforces.
 */

/** t.co rewrites every link to a fixed width. twitter-text v3 `transformedURLLength`. */
export const TCO_URL_LENGTH = 23;

/**
 * Mastodon bills every link at a fixed width too, and picked the same number.
 * `URL_PLACEHOLDER = 'x' * 23` in app/validators/status_length_validator.rb.
 */
export const MASTODON_URL_LENGTH = 23;

/**
 * On Mastodon a remote mention costs only its username: `@user@example.social`
 * counts as `@user`. Mirrors the rewrite in the reference client's
 * `countableText` and in StatusLengthValidator.
 */
export function stripMentionDomains(text: string): string {
  return text.replace(/(^|[^/\w])@(([a-z0-9_]+)@[a-z0-9.-]+[a-z0-9]+)/gi, "$1@$3");
}

/**
 * A representative real link, used to price `[URL]`-style placeholders in a
 * draft. YouTube short links are the shortest thing actually posted, so this is
 * the conservative floor: a draft that passes with this may still fail with a
 * longer link, but a draft that fails here fails for real.
 *
 * Carried over from a private promo-linting script, which added it after
 * an X post measured 264 with `[URL]` in place and 282 once the link was filled
 * in — over the limit, and invisible until post time.
 */
export const PLACEHOLDER_STANDIN = "https://youtu.be/0Lh8GBhrwzk";

/** Draft link placeholders. Case-insensitive. */
const PLACEHOLDER_RE =
  /\[(?:URL|LINK|YOUTUBE URL|YOUTUBE LINK|EPISODE PAGE URL|EPISODE URL|SUBSTACK URL|CLIPS FOLDER URL|NEEDED[^\]]*)\]/gi;

/**
 * TLDs that platforms auto-link without a scheme. Not exhaustive — the real
 * twitter-text list is the full IANA registry — but it covers what appears in
 * posts. A bare domain on an unlisted TLD is counted as plain text, which
 * under-counts on X. Write `https://` in front of a link to remove all doubt.
 */
const AUTOLINK_TLDS = new Set([
  "com", "org", "net", "edu", "gov", "mil", "int", "io", "ai", "dev", "app",
  "co", "me", "sh", "gg", "xyz", "tv", "fm", "cc", "ly", "to", "so", "is",
  "it", "us", "uk", "ca", "au", "de", "fr", "es", "nl", "eu", "jp", "cn",
  "in", "br", "ru", "ch", "se", "no", "fi", "dk", "pl", "info", "biz", "news",
  "blog", "site", "tech", "cloud", "page", "show", "studio", "social", "team",
  "run", "new", "help", "wiki", "press", "media", "design", "email", "link",
]);

/**
 * URL matcher.
 *
 * Three shapes, in precedence order: an explicit scheme, a `www.` prefix, or a
 * bare `host.tld` on a known TLD. The trailing-character trim keeps sentence
 * punctuation out of the match, since `see https://example.com.` links
 * `example.com` and not the full stop.
 */
const URL_RE =
  /\b(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/gi;

/** Punctuation that ends a sentence rather than a URL. */
const TRAILING_JUNK = /[.,;:!?)\]}'"»…]+$/;

export interface FoundUrl {
  /** The URL text as it appears in the post. */
  text: string;
  /** Where it starts in the placeholder-resolved text. */
  start: number;
  /** Whether it came from a `[URL]`-style placeholder rather than a real link. */
  placeholder: boolean;
}

/**
 * Resolve `[URL]`-style placeholders and report where each substitution landed,
 * so the links that came from one can be flagged as estimated.
 */
function resolveWithSpans(text: string): { text: string; spans: [number, number][] } {
  const spans: [number, number][] = [];
  let out = "";
  let cursor = 0;
  PLACEHOLDER_RE.lastIndex = 0;
  for (let m = PLACEHOLDER_RE.exec(text); m; m = PLACEHOLDER_RE.exec(text)) {
    out += text.slice(cursor, m.index);
    spans.push([out.length, out.length + PLACEHOLDER_STANDIN.length]);
    out += PLACEHOLDER_STANDIN;
    cursor = m.index + m[0].length;
  }
  return { text: out + text.slice(cursor), spans };
}

/**
 * Find the links a platform would auto-detect, in placeholder-resolved text.
 *
 * A single matcher backs both the URL list and the fixed-width substitution, so
 * the reported link count and the counted length can never disagree.
 */
export function findUrls(text: string): FoundUrl[] {
  const { text: resolved, spans } = resolveWithSpans(text);
  return matchUrls(resolved).map(({ text: url, start }) => ({
    text: url,
    start,
    placeholder: spans.some(([a, b]) => start >= a && start < b),
  }));
}

function matchUrls(resolved: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  URL_RE.lastIndex = 0;
  for (let m = URL_RE.exec(resolved); m; m = URL_RE.exec(resolved)) {
    const trimmed = m[0].replace(TRAILING_JUNK, "");
    if (!trimmed) continue;
    // A domain directly after "@" is the tail of an email address or of a
    // fediverse handle like @user@example.social. Neither is a link, and
    // counting one as 23 characters was inflating Mastodon posts by 23 apiece.
    const precededByAt = m.index > 0 && resolved[m.index - 1] === "@";
    if (!precededByAt && hasKnownShape(trimmed)) {
      out.push({ text: trimmed, start: m.index });
    }
    // Re-anchor past the trimmed match so a stripped tail stays available.
    URL_RE.lastIndex = m.index + trimmed.length;
  }
  return out;
}

/** Reject bare-domain matches whose TLD is not one platforms auto-link. */
function hasKnownShape(candidate: string): boolean {
  if (/^https?:\/\//i.test(candidate)) return true;
  if (/^www\./i.test(candidate)) return true;
  const host = candidate.split("/")[0]!;
  const tld = host.split(".").pop()!.toLowerCase();
  return AUTOLINK_TLDS.has(tld);
}

/** Replace every detected link with a fixed-width filler, X- and Mastodon-style. */
export function billUrlsAtFixedWidth(text: string, width: number): string {
  const resolved = resolvePlaceholders(text);
  let out = "";
  let cursor = 0;
  for (const { text: url, start } of matchUrls(resolved)) {
    out += resolved.slice(cursor, start) + "x".repeat(width);
    cursor = start + url.length;
  }
  return out + resolved.slice(cursor);
}

/** Substitute `[URL]`-style placeholders with a representative real link. */
export function resolvePlaceholders(text: string): string {
  return text.replace(PLACEHOLDER_RE, PLACEHOLDER_STANDIN);
}

let segmenter: Intl.Segmenter | undefined;

/**
 * Count extended grapheme clusters — Bluesky's unit.
 *
 * `Intl.Segmenter` implements UAX #29, so ZWJ sequences (👨‍👩‍👧‍👦), regional
 * indicator pairs (🇺🇸), skin-tone modifiers, and combining accents each count
 * as one. Node ships full ICU from 14 on; if a runtime has stripped it, this
 * throws rather than silently falling back to a code-point count that would
 * report a passing number for an over-limit post.
 */
export function graphemeLength(text: string): number {
  if (typeof Intl.Segmenter !== "function") {
    throw new Error(
      "Intl.Segmenter is unavailable, so grapheme counts cannot be computed. Run on Node 18+ with full ICU (the default build).",
    );
  }
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}

/**
 * UTF-16 code units — JavaScript's `.length`.
 *
 * The unit for platforms with no published counting rule (LinkedIn, Threads,
 * Discord). It is the conservative choice: an astral character costs 2 here and
 * 1 under a code-point count, so a post that passes this passes either way.
 */
export function utf16Length(text: string): number {
  return text.length;
}

/** Count Unicode code points (not UTF-16 code units). */
export function codePointLength(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

/**
 * twitter-text v3 weighted-length configuration.
 *
 * `defaultWeight` 200 with `scale` 100 means every character costs 2 units
 * unless it falls in one of the listed ranges, which cost 1. The ranges cover
 * Latin, Latin-1 Supplement, Latin Extended, IPA, Greek, Cyrillic, Hebrew,
 * Arabic, and general punctuation — so Latin text bills 1 per character and
 * CJK, Hangul, Devanagari, and emoji bill 2.
 */
const X_SCALE = 100;
const X_DEFAULT_WEIGHT = 200;
const X_LIGHT_RANGES: [number, number][] = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];

function xWeightOf(codePoint: number): number {
  for (const [start, end] of X_LIGHT_RANGES) {
    if (codePoint >= start && codePoint <= end) return X_SCALE;
  }
  return X_DEFAULT_WEIGHT;
}

export interface WeightedResult {
  /** Weighted length in characters (weight units divided by scale, rounded up). */
  length: number;
  /** How many characters billed at 2 instead of 1. */
  heavyChars: number;
  /** How many billed at 1. `heavyChars * 2 + lightChars` is the weighted length. */
  lightChars: number;
}

/**
 * X's weighted length, over text whose URLs have already been replaced with
 * fixed-width filler.
 *
 * Emoji are segmented as graphemes first so a multi-code-point sequence bills
 * 2 total rather than 2 per code point — twitter-text v3 does the same when
 * `emojiParsingEnabled` is set, which it is.
 */
export function weightedLength(text: string): WeightedResult {
  let weight = 0;
  let heavyChars = 0;
  let lightChars = 0;
  // twitter-text normalizes to NFC before counting, so a decomposed "é" bills
  // 1 rather than 2.
  for (const cluster of segmentGraphemes(text.normalize("NFC"))) {
    const first = cluster.codePointAt(0)!;
    // A cluster longer than one code point that starts outside the light ranges
    // is an emoji sequence or a composed non-Latin character: one unit, weight 2.
    const w = xWeightOf(first);
    if (w === X_DEFAULT_WEIGHT) {
      weight += X_DEFAULT_WEIGHT;
      heavyChars++;
    } else if (cluster.length === 1 || isCombiningOnly(cluster)) {
      // Combining marks fold into the base character, matching X's normalization.
      weight += X_SCALE;
      lightChars++;
    } else {
      const points = codePointLength(cluster);
      weight += X_SCALE * points;
      lightChars += points;
    }
  }
  return { length: Math.ceil(weight / X_SCALE), heavyChars, lightChars };
}

/** True when every code point after the first is a combining mark. */
function isCombiningOnly(cluster: string): boolean {
  const points = [...cluster];
  return points.slice(1).every((c) => /[\p{M}\uFE0F\u200D]/u.test(c));
}

function segmentGraphemes(text: string): string[] {
  if (typeof Intl.Segmenter !== "function") return [...text];
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...segmenter.segment(text)].map((s) => s.segment);
}

/** UTF-8 byte length. Bluesky enforces one on the record as well as a grapheme cap. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
