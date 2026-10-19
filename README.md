# Portfolio

Site and resumes, both built from `content/`.

## Add a project
Copy any file in `content/projects/`, change the frontmatter, write a few lines. It shows up on the site.
`bullets` are for the site; `resume_bullets` (optional, about 20 words each) are what the PDFs use.
To put it on a resume, add its file name to that resume's `projects` list in `content/resumes.yaml`.
Order matters there: a resume that runs past one page gets slightly smaller type, then loses projects from the end.

`content/MASTER.md` is generated from all of this (`npm run master`); read it, do not edit it.

## Add a note
Drop a markdown file in `content/notes/` with `title` and `date`. The Notes link appears in the nav by itself.

## Add a whole new section
Add a collection in `src/content.config.ts`, copy `src/pages/notes/` and rename, add a nav entry in `src/layouts/Base.astro`.

## Change the look
`src/styles/tokens.css`.

## Commands
    npm run dev        # site at localhost:4321
    npm run resumes    # regenerate MASTER.md and the five PDFs in public/resume/ (needs Microsoft Edge), and check they parse
    npm run build      # static site into dist/

Pushing to `main` deploys to GitHub Pages. The PDFs are committed, so CI does not need to build them.

## Live stats

The homepage's "By the numbers" section reads `content/stats/*.json`. Any source that is missing or not configured is simply hidden.

- **Public sources** (GitHub contributions, Overwatch, and Codeforces, LeetCode and Twitch once their handles are set under `stats:` in `content/profile.yaml`) are fetched by `scripts/stats/fetch-public.mjs` before every deploy. The deploy workflow also runs once a day. Twitch needs the `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` repository secrets.
- **Local sources** are collected on the Mac by `scripts/stats/update-local.mjs`, which commits `content/stats/` and pushes. These are Claude Code token usage (this Mac, plus the MSI laptop over `ssh msi` when it is awake), Garmin (through `~/Projects/garmin-connect-api`'s saved session; weight is never published), and Strava (if `~/.config/portfolio-stats/strava.json` exists). It works in its own clone under `~/Library/Caches/portfolio-stats/`, so it never touches this working copy. A launchd job runs it daily.
- `node scripts/stats/update-local.mjs --here` collects into the current checkout without any git commands, for testing.

## License

This repository has two parts with different terms.

**The code is public domain.** The site source and build tooling (`src/`, `scripts/`, `resume/`, `.github/`, and the config files at the root) are released under the [Unlicense](LICENSE): use them however you like, no credit needed. Fonts bundled from Fontsource, including the Inter font embedded in `resume/linkedin-banner.html`, keep the SIL Open Font License.

**The content is not.** Everything in `content/` (my profile, resume settings and project write-ups) and in `public/` (the resume PDFs, images, screenshots and banner) is Copyright (C) 2026 Keshav Rajput, all rights reserved. Please don't reuse it; build your own from the template instead.
