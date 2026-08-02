# Security

This server takes text in and returns numbers. It makes no network calls, reads
no files, holds no credentials, and has no environment variables. Post text is
processed in memory and never stored or logged.

The realistic risk surface is the regular-expression matching in `src/count.ts`.
If you find an input that makes it hang or consume unbounded memory, that is a
bug worth reporting.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open the **Security** tab on this
repo and click **Report a vulnerability**. Do not open a public issue for
security problems.

I aim to respond within a week. Credit goes to the reporter in the fix notes
unless you prefer otherwise.
