---
title: claude-purple
blurb: Unofficial purple reskin for the Claude desktop app on Windows and macOS and for Claude Code, plus a Claude Code plugin that strips ads from pages in Claude's built-in browser.
repo: https://github.com/happyc0der/claude-purple
image: /img/claude-purple.png
year: 2026
order: 42
featured: false
credit: "Colour values from nataliefruitema's Modern Purple Theme for VS Code, applied with my own code; no files from that theme are included. Unofficial and not affiliated with Anthropic."
resume_credit: "Colours from nataliefruitema's Modern Purple Theme; unofficial, not affiliated with Anthropic."
stack: [JavaScript, PowerShell, Bash, Claude Code plugins, LaunchAgents, Windows Task Scheduler]
tags: [swe]
stats: ["Windows and macOS", "~40 ms full recolour", "v1.0.2, MIT"]
bullets:
  - "Recolours the whole Claude desktop app (sidebar, chat, panes, menus, settings, code blocks) without patching its signed, integrity-checked files: a per-user watcher opens DevTools through the app's own Developer Mode and pastes a script that only sets colour values, shifting the app's neutral greys at runtime while keeping their brightness."
  - "Built the watcher to stay out of the way: it types only after confirming by window title that the focused window is Claude's DevTools for claude.ai, waits for 4 seconds of keyboard and mouse idle, restores the clipboard, logs every run, and on Windows checks a capture of Claude's own window to re-apply if the colours drop; a full recolour takes about 40 ms."
  - "Wrote browser-ad-remover, a Claude Code plugin that hooks the built-in browser tools and removes ad markup before Claude reads or screenshots a page; measured on three ad-heavy pages it removed 7 to 37 ad elements and cut Daily Mail's ad iframes from 31 to 12, with page text almost unchanged, so the gain is in screenshots rather than tokens."
resume_bullets:
  - "Built an unofficial reskin of the Claude desktop app for Windows and macOS that recolours it at runtime without patching its signed files."
  - "Made the auto-apply watcher safe: it types only into a verified DevTools window, waits for idle input and restores the clipboard."
  - "Wrote a Claude Code plugin that strips ads before the built-in browser is read; ad iframes on Daily Mail fell from 31 to 12."
---

The Claude desktop app has no custom themes, its files are signed and integrity-checked, and it blocks remote debugging, so I built the reskin without patching anything. The app's own Developer Mode enables DevTools. When Claude starts, or reloads its page to pick up new web code, a small watcher (a logon task on Windows, a LaunchAgent on macOS) waits until the keyboard and mouse have been idle, opens DevTools and pastes the theme script into the console. The script only sets colour values: it finds the app's neutral greys at runtime, including styles that menus load later, shifts their hue while keeping their brightness, and maps the code theme to the VS Code theme's syntax colours, including inside code blocks.

The automation is careful about where it types. It confirms by window title that the focused window is Claude's Developer Tools for claude.ai and stops otherwise, restores the clipboard afterwards and logs every run. On Windows it checks a picture of Claude's own window, never the rest of the screen, to confirm the colours took. On macOS it spots page reloads from the line Claude writes to its own log. Watchers poll every 3 to 30 seconds at under 1% of one CPU core, and a colour-reference file lets a check after each app update list exactly which parts of the screen changed colour.

The repo also ships a matching Claude Code CLI theme, a Windows Terminal scheme and browser-ad-remover, a plugin that sweeps ad markup just before Claude reads or screenshots a page in its built-in browser. On three ad-heavy pages it removed 7, 37 and 36 ad elements with page text almost unchanged, so the honest result is fewer, cleaner screenshots rather than fewer text tokens. Released as v1.0.2 under MIT. The colours are nataliefruitema's Modern Purple Theme; that theme declares no licence, so only its colour values are used.
