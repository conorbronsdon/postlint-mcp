<div align="center">

# postlint-mcp

Check a social post against a platform's real character limit before it ships. X, Bluesky, LinkedIn, Threads, Mastodon, Discord. Pure compute — no API, no auth, no network.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/Node-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Podcast](https://img.shields.io/badge/Podcast-Chain_of_Thought-purple?style=flat-square)](https://chainofthought.show/?utm_source=github&utm_medium=referral&utm_campaign=repo-readme&utm_content=postlint-mcp)
[![X](https://img.shields.io/badge/X-@ConorBronsdon-black?style=flat-square&logo=x)](https://x.com/ConorBronsdon)

<img src="docs/demo.gif" alt="Three drafts checked in a terminal: an X post at 308 of 280 with three URLs billed at 23 each, a Bluesky post at 302 of 300, and that same draft with its link still a [URL] placeholder, which a length check reads as 277 but the server prices at exactly 300 of 300" width="800">

<sub>Recorded from <a href="docs/demo.tape">docs/demo.tape</a> with <a href="https://github.com/charmbracelet/vhs">vhs</a>. The posts and counts come from <a href="scripts/fixtures.mjs">scripts/fixtures.mjs</a>, which the regression tests import too.</sub>

</div>

---

An MCP server that answers one question: does this post fit?

A language model cannot count characters by inspection, and on these platforms neither can you. The limits are not what they look like. X bills every URL at 23 characters through t.co whether the link is 12 characters or 200. Bluesky counts extended grapheme clusters, so a four-person family emoji is 1 and not 11. Mastodon charges nothing for the domain on a remote mention. Getting any of that wrong shows up as a rejected post, or a truncated one, at publish time.

Counting is what a tool call is for. The model cannot do it by inspection, and a deterministic function can do it exactly.

**Why this exists.** Two posts went out of a podcast promo workflow over the limit. A Bluesky post shipped at 302 against 300, with the line "Under 300 graphemes. Audit clean." sitting directly beneath it. An X post was drafted at 308 against 280 and would have been rejected on launch morning. Both were invisible to eyeballing, because in both cases the count was a claim and not a measurement. Both are regression tests in this repo.

## Tools

| Tool | What it returns |
|------|-----------------|
| `check_post` | Verdict for one platform: counted length, the limit, headroom, and what drove the count |
| `check_post_all` | One row per platform, with the breakdown attached only to the rows that fail |
| `platform_limits` | Each platform's limit, its counting unit, why that unit is not a character count, and the source |

Responses are small on purpose. `check_post_all` omits the arithmetic on passing rows because agents pay tokens per response.

## How each platform counts

| Platform | Limit | Unit | The part that surprises people | Source |
|----------|-------|------|-------------------------------|--------|
| `x` | 280 | weighted characters | Every URL costs exactly 23. CJK, Hangul, and emoji cost 2 each; Latin, Greek, Cyrillic, Hebrew, and Arabic cost 1. An emoji sequence is one unit of 2, not 2 per code point. | [twitter-text v3 config](https://github.com/twitter/twitter-text/blob/master/config/v3.json) |
| `x_premium` | 25,000 | weighted characters | Same weighting, higher ceiling. | [X help center](https://help.x.com/en/using-x/types-of-posts) |
| `bluesky` | 300 | graphemes | Flags, ZWJ emoji, skin-tone modifiers, and combining accents each count as 1. URLs count in full. A second cap of 3,000 UTF-8 bytes can bind first on ZWJ-heavy text. | [atproto lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json) |
| `linkedin` | 3,000 | characters | The 3,000 is generous; the fold is the real constraint. The feed collapses the post behind "see more" after a few lines. | [LinkedIn help](https://www.linkedin.com/help/linkedin/answer/a528176) |
| `threads` | 500 | characters | The September 2025 change added a 10,000-character *attachment*. The post body is still 500. | [Meta newsroom](https://about.fb.com/news/2025/09/attach-text-threads-posts-share-longer-perspectives/) |
| `mastodon` | 500 | graphemes | URLs cost 23, as on X. On `@user@example.social` only `@user` counts. The limit is per-instance and plenty of servers run higher. | [Mastodon API docs](https://docs.joinmastodon.org/methods/instance/) |
| `discord` | 2,000 | characters | 4,000 with Nitro. Embeds have a separate 6,000 total. | [Discord support](https://support.discord.com/hc/en-us/articles/360034632292-Sending-Messages) |

Every number above traces to a published source. Widely repeated figures that no primary source states — the Facebook post limit, the YouTube community post limit, Reddit's title cap, Instagram's organic caption cap — are deliberately absent. A limit that cannot be defended makes a passing check worth nothing.

## Setup

Published on npm. The config blocks below use `npx`, which fetches it on first run; no clone required.

```bash
git clone https://github.com/conorbronsdon/postlint-mcp.git
cd postlint-mcp
npm install
npm run build
```

### Claude Code

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "postlint": {
      "command": "node",
      "args": ["/absolute/path/to/postlint-mcp/dist/index.js"]
    }
  }
}
```

### Claude Desktop

Same block, in `claude_desktop_config.json`.

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.postlint]
command = "npx"
args = ["-y", "@conorbronsdon/postlint-mcp"]
```

No token, no environment variables, no network access. Once the package is published, `npx -y @conorbronsdon/postlint-mcp` replaces the `node` invocation everywhere above.

### Verify

Ask your assistant: "Check this post for X and Bluesky," and paste something with a couple of links in it.

## A worked example

The X post that started this, run through `check_post` with `platform: "x"`:

```json
{
  "platform": "x",
  "limit": 280,
  "unit": "weighted characters",
  "length": 308,
  "over": true,
  "remaining": -28,
  "drivers": [
    "3 URLs counted as 23 each = 69",
    "239 other characters counted as 1 each"
  ],
  "warnings": []
}
```

The `drivers` line is the useful part. 69 of the budget went to links before a word was written, which tells you to move two of them into a reply rather than trimming prose.

The same post through `check_post_all`:

```json
{
  "fits": ["x_premium", "linkedin", "threads", "mastodon", "discord"],
  "over": ["x", "bluesky"],
  "rows": [
    { "platform": "x", "length": 308, "limit": 280, "over": true, "drivers": ["3 URLs counted as 23 each = 69", "239 other characters counted as 1 each"] },
    { "platform": "bluesky", "length": 330, "limit": 300, "over": true, "drivers": ["3 URLs counted in full = 91 (Bluesky does not shorten links)", "239 other graphemes"] },
    { "platform": "mastodon", "length": 308, "limit": 500, "over": false, "remaining": 192 }
  ]
}
```

One post, three different lengths — 308, 330, and 308 again — from the same 330 characters of text. That gap is the whole reason this exists.

## Draft placeholders

Drafts carry link placeholders, and `[URL]` is five characters while a real link is not. A post measured with the placeholder in place and posted with the link filled in is a post measured wrong; one draft came in at 264 that way and posted at 282.

So `[URL]`, `[LINK]`, `[YOUTUBE URL]`, `[SUBSTACK URL]`, and similar are priced as a real link (a 28-character YouTube short link, the shortest thing normally posted) and the response carries a warning saying the count is a floor.

## What it does not do

- **It does not post anything.** There is no write path, no credential, and no network call of any kind. That last one is enforced rather than asserted: a test replaces `fetch`, `XMLHttpRequest`, and `WebSocket` with throws and drives every tool, so a call added later fails CI instead of quietly making this sentence false.
- **It does not check an instance's actual limit.** Mastodon servers configure their own; this reports the 500 default and tells you to read `configuration.statuses.max_characters` from the target server yourself.
- **It does not truncate.** A `truncate_to` helper was considered and left out. Cutting a post at a character offset splits URLs, breaks grapheme clusters, and lands mid-sentence, and cutting it at a "safe" boundary silently drops whichever clause happened to be last. Either way the tool would be deciding what the post says. It reports the number and leaves the edit to you.
- **It does not detect every URL a platform would.** Links with a scheme and `www.`-prefixed hosts always match. A bare domain matches only on a common TLD (`src/count.ts` holds the list), where the real twitter-text implementation carries the full IANA registry. Write `https://` in front of a link and the count is exact.
- **It does not count media, polls, quote posts, or link cards.** Those have their own rules and this measures text.
- **It does not know about content warnings.** On Mastodon a CW counts toward the same 500. This checks the body alone.
- **It does not carry limits it cannot source.** See the platform table.

## Development

```bash
npm install
npm run build
npm test
```

Tests make no network calls, because the server makes none. The two historical over-limit posts are regression fixtures in `src/__tests__/lint.test.ts`, alongside grapheme cases for ZWJ family emoji, regional-indicator flags, skin-tone modifiers, combining accents, and CJK.

## Contributing

Issues and pull requests are welcome. A new platform needs three things: the limit, the unit it is measured in, and a published source. A new counting rule needs a test that fails without it. Numbers repeated by third parties are not sources.

## About

Built and maintained by [Conor Bronsdon](https://github.com/conorbronsdon). I host the [Chain of Thought](https://chainofthought.show/?utm_source=github&utm_medium=referral&utm_campaign=repo-readme&utm_content=postlint-mcp) podcast, which covers AI infrastructure, developer tools, and how practitioners actually use this stuff. I built this after shipping two over-limit posts in a workflow that was supposed to catch them.

Companion tools:

- [op3-mcp](https://github.com/conorbronsdon/op3-mcp): podcast analytics through OP3 — downloads, geography, apps, per-episode breakdowns.
- [podcastindex-mcp](https://github.com/conorbronsdon/podcastindex-mcp): the Podcast Index MCP server, search by person or topic, trending shows, feed health.
- [substack-mcp](https://github.com/conorbronsdon/substack-mcp): read posts and manage drafts on Substack, safe for agent workflows.
- [Transistor-MCP](https://github.com/conorbronsdon/Transistor-MCP): the Transistor.fm MCP server. Episodes, transcripts, download counts.
- [ai-tools-for-creators](https://github.com/conorbronsdon/ai-tools-for-creators): a curated list of AI skills and MCP servers for people who ship ideas for a living.

More at [chainofthought.show](https://chainofthought.show/?utm_source=github&utm_medium=referral&utm_campaign=repo-readme&utm_content=postlint-mcp) and on [X](https://x.com/ConorBronsdon).

---

## Disclaimer

*This is an independent personal project, not affiliated with, sponsored by, or endorsed by any company. All views expressed are my own.*

## License

Apache-2.0
