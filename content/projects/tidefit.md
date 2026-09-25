---
title: TideFit
blurb: "Security audit, Next 14 to 16 upgrade and production launch of a roommate's Next.js trip planner."
repo: https://github.com/UtkarshMitta/tide-fit
demo: https://tide-fit.vercel.app
image: /img/tidefit.png
year: 2026
order: 5
featured: true
credit: "The app is Utkarsh Mittal's (UtkarshMitta on GitHub). The audit, the upgrade, the tests, the CI and the launch are mine."
resume_credit: "App by Utkarsh Mittal; the audit, upgrade, tests, CI and launch are mine."
stack: [TypeScript, Next.js 16, React 19, Supabase, Vercel, GitHub Actions, "node:test"]
tags: [sec, swe]
stats: ["15 findings, 13 fixed", "npm audit 6 to 0", "0 to 45 tests"]
bullets:
  - "Security and correctness audit of a Next.js trip planner: 15 findings confirmed against the running app (OAuth CSRF, a Supabase policy exposing every user's trips, an app secret in a plaintext cookie, no rate limit on paid endpoints), 13 fixed and 2 documented."
  - "Upgraded Next 14 to 16 and React 18 to 19 by hand (async cookies, middleware to proxy, ESLint 9 flat config), taking npm audit from 6 vulnerabilities to 0 and tests from 0 to 45, with CI that deploys main to Vercel once the checks pass."
  - "Launched it at tide-fit.vercel.app with private Blob storage so shared links survive redeploys, an edge rate limit verified at 20 requests then 429, and Strava and Google Calendar sign-in verified end to end on the live site."
resume_bullets:
  - "Security audit (code review of all 45 source files) of a Next.js trip planner: 15 vulnerabilities confirmed on the running app (OAuth CSRF, Supabase row-level security policy exposing every user, secret in a plaintext cookie), 13 fixed."
  - "Upgraded Next 14 to 16 and React 18 to 19 by hand across 16 merged pull requests; npm audit 6 vulnerabilities to 0, tests 0 to 45, CI (typecheck, lint, tests) deploying main to Vercel."
  - "Launched at tide-fit.vercel.app: private Blob storage, edge rate limit verified at 20 requests then 429, Strava and Google sign-in verified live."
---

TideFit is my roommate Utkarsh Mittal's Next.js trip planner for athletes. It fetches sport-specific forecasts (sea state for swimmers, air quality for runners, wind and heat for cyclists and hikers), grades each trip day safe, caution or unsafe against tunable thresholds, and writes a day-by-day plan. The app is his and he gave me full permission to change it. The audit, the upgrade, the tests, the CI and the launch are mine.

I read all 45 source files and probed a local server that had no API keys. The high-severity findings: the Strava and Google OAuth callbacks accepted any authorization code, a Supabase policy let anyone holding the public anon key read every user's trips, a visitor's Strava app secret was stored in a browser cookie in plaintext, and the endpoints that spend money had no rate limit. Each of those fixes was verified: a forged callback is rejected, the anon key reads no rows, the cookie holds ciphertext, and the 11th request in a minute gets a 429. The worst bug for users turned up after the audit: the server's UTC date survived hydration as the date input's minimum, so the trip form would not submit every evening in the Americas.

The Next 14 to 16 upgrade was a proper migration rather than the codemod's escape hatch: async cookies(), middleware to proxy, ESLint 9 flat config. npm audit went from 6 vulnerabilities (1 critical, 5 high) to 0 and the test suite from 0 to 45. CI runs typecheck, lint, tests and a zero-key build, then deploys main to Vercel. The work went in as 16 merged pull requests. Two low-severity findings are written up in docs/AUDIT.md rather than fixed.
