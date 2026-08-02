# Regenerate: vhs docs/demo.tape (run from repo root)
#
# Prerequisite: npm run build — scripts/demo.mjs reads the compiled dist/,
# which is gitignored, so a fresh clone must build before recording.
#
# vhs.exe is a Windows binary, but the commands below run inside the default
# WSL distro's bash, so only what is installed there is reachable (node lives
# at /usr/bin/node). The recorded shell inherits the directory vhs was invoked
# from, which is why "run from repo root" is the whole setup — no absolute
# path is baked in.
#
# The opening Sleep is load-bearing: vhs starts typing immediately, and
# without it the first keystrokes land before bash has drawn a prompt and are
# silently lost, which renders a GIF where the commands echo but never run.
#
# Every beat is a self-contained command. Nothing selects content by line
# number, so editing a source file cannot silently desynchronise the panes.
#
# The posts and the numbers on screen come from scripts/fixtures.mjs, which
# the regression tests import too — so a change that would date this GIF fails
# the suite first. The `cjk` case is left out on purpose: this font has no CJK
# coverage and renders it as empty boxes.

Output docs/demo.gif
Set Shell bash
Set FontSize 15
Set Width 1200
Set Height 500
Set Theme "Monokai Pro"
Set Padding 18
Set TypingSpeed 28ms

Hide
Sleep 3s
Type "clear" Enter
Sleep 800ms
Show

Type "# an X post drafted for launch morning. It reads fine."
Enter
Sleep 1200ms
Type "node scripts/demo.mjs x"
Enter
Sleep 6s

Type "clear" Enter
Sleep 300ms
Type "# this one actually shipped, two graphemes over"
Enter
Sleep 1200ms
Type "node scripts/demo.mjs bluesky"
Enter
Sleep 6s

Type "clear" Enter
Sleep 300ms
Type "# and the same draft an hour earlier, before the link went in"
Enter
Sleep 1200ms
Type "node scripts/demo.mjs placeholder"
Enter
Sleep 7s
