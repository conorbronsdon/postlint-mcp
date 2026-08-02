/**
 * The check itself: text plus a platform in, a verdict plus the arithmetic out.
 *
 * The arithmetic is the point. "308 / 280, over by 28" is not actionable on its
 * own; "3 URLs cost 69 of your 280" tells you which sentence to cut.
 */

import {
  MASTODON_URL_LENGTH,
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
} from "./count.js";
import type { Platform } from "./limits.js";

export interface CheckResult {
  platform: string;
  limit: number;
  unit: string;
  length: number;
  over: boolean;
  /** Headroom left. Negative when over. */
  remaining: number;
  /** What drove the count, in plain arithmetic. Only entries that apply. */
  drivers: string[];
  /** Non-fatal: truncation points, secondary caps, estimated placeholder pricing. */
  warnings: string[];
}

/**
 * Platforms strip leading and trailing whitespace before enforcing the limit,
 * so counting it would fail a post that would actually go through.
 */
function normalize(text: string): string {
  return text.trim();
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "3 URLs counted as 23 each = 69", or "1 URL counted as 23" for a single link. */
const urlLine = (n: number, each: number, total: number) =>
  n === 1
    ? `1 URL counted as ${each}`
    : `${n} URLs counted as ${each} each = ${total}`;

/**
 * The characters left after the special cases. Only called "other" when there
 * were special cases to be other than, and dropped entirely when it is zero —
 * "0 other characters" is noise in a response an agent pays for.
 */
const remainderLine = (n: number, word: string, hasOthers: boolean) =>
  n === 0 ? "" : plural(n, hasOthers ? `other ${word}` : word);

export function checkPost(text: string, platform: Platform): CheckResult {
  const body = normalize(text);
  const urls = findUrls(body);
  const drivers: string[] = [];
  const warnings: string[] = [];

  let length: number;

  switch (platform.mode) {
    case "x": {
      const { length: weighted, heavyChars, lightChars } = weightedLength(
        billUrlsAtFixedWidth(body, TCO_URL_LENGTH),
      );
      length = weighted;
      const urlCost = urls.length * TCO_URL_LENGTH;
      if (urls.length > 0) {
        drivers.push(
          urlLine(urls.length, TCO_URL_LENGTH, urlCost),
        );
      }
      if (heavyChars > 0) {
        drivers.push(
          heavyChars === 1
            ? "1 non-Latin character (CJK, Hangul, or emoji) counted as 2"
            : `${heavyChars} non-Latin characters (CJK, Hangul, or emoji) counted as 2 each = ${heavyChars * 2}`,
        );
      }
      // lightChars includes the fixed-width URL filler, so subtract it back out
      // or the drivers would not sum to the total.
      const light = remainderLine(lightChars - urlCost, "character", urls.length > 0 || heavyChars > 0);
      if (light) drivers.push(`${light} counted as 1 each`);
      break;
    }

    case "grapheme": {
      const resolved = resolvePlaceholders(body);
      length = graphemeLength(resolved);
      const units = utf16Length(resolved);
      if (units !== length) {
        drivers.push(
          `${units} UTF-16 code units collapse to ${length} graphemes (emoji sequences, flags, and combining marks each count as 1)`,
        );
      }
      const urlChars = urls.reduce((n, u) => n + graphemeLength(u.text), 0);
      if (urls.length > 0) {
        drivers.push(
          `${plural(urls.length, "URL")} counted in full = ${urlChars} (Bluesky does not shorten links)`,
        );
      }
      // The collapse line above already states the total, so the remainder is
      // only worth printing when links took a share of it.
      if (urls.length > 0) {
        drivers.push(remainderLine(length - urlChars, "grapheme", true));
      } else if (drivers.length === 0) {
        drivers.push(plural(length, "grapheme"));
      }
      if (platform.secondary) {
        const bytes = byteLength(resolved);
        if (bytes > platform.secondary.limit) {
          warnings.push(
            `Over the ${platform.secondary.name} cap as well: ${bytes} of ${platform.secondary.limit} ${platform.secondary.unit}.`,
          );
        }
      }
      break;
    }

    case "mastodon": {
      // Mastodon's StatusLengthValidator counts grapheme clusters over text
      // whose URLs have been replaced with 23 characters and whose remote
      // mentions have lost their domain.
      const countable = stripMentionDomains(
        billUrlsAtFixedWidth(body, MASTODON_URL_LENGTH),
      );
      length = graphemeLength(countable);
      const urlCost = urls.length * MASTODON_URL_LENGTH;
      if (urls.length > 0) {
        drivers.push(
          urlLine(urls.length, MASTODON_URL_LENGTH, urlCost),
        );
      }
      const mentions = countRemoteMentions(body);
      if (mentions > 0) {
        drivers.push(
          `${plural(mentions, "remote mention")} counted as the username only, domain free`,
        );
      }
      drivers.push(remainderLine(length - urlCost, "grapheme", urls.length > 0 || mentions > 0));
      warnings.push(
        "500 is the default only. Each instance sets its own — read configuration.statuses.max_characters from the target server's /api/v2/instance.",
      );
      warnings.push(
        "A content warning counts toward the same limit. This check covers the post body alone.",
      );
      break;
    }

    case "plain": {
      const resolved = resolvePlaceholders(body);
      length = utf16Length(resolved);
      const urlChars = urls.reduce((n, u) => n + utf16Length(u.text), 0);
      if (urls.length > 0) {
        drivers.push(`${plural(urls.length, "URL")} counted in full = ${urlChars}`);
      }
      drivers.push(remainderLine(length - urlChars, "character", urls.length > 0));
      break;
    }
  }

  const estimated = urls.filter((u) => u.placeholder).length;
  if (estimated > 0) {
    warnings.push(
      `${estimated} link placeholder${estimated === 1 ? " was" : "s were"} priced as a ${PLACEHOLDER_STANDIN.length}-character link. A longer real URL raises the count everywhere except X and Mastodon, where links are a flat 23.`,
    );
  }

  if (platform.truncatesAt !== undefined && length > platform.truncatesAt) {
    warnings.push(
      `Roughly the first ${platform.truncatesAt} characters show before "see more"; the rest needs a click. LinkedIn cuts by line count, not character count, so treat this as approximate.`,
    );
  }

  return {
    platform: platform.id,
    limit: platform.limit,
    unit: platform.unit,
    length,
    over: length > platform.limit,
    remaining: platform.limit - length,
    drivers: drivers.filter(Boolean),
    warnings,
  };
}

function countRemoteMentions(text: string): number {
  return text.match(/(^|[^/\w])@[a-z0-9_]+@[a-z0-9.-]+[a-z0-9]+/gi)?.length ?? 0;
}
