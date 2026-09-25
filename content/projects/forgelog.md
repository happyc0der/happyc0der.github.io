---
title: ForgeLog
blurb: Offline Android gym tracker with no accounts and no network permission.
repo: https://github.com/happyc0der/ForgeLog
demo: https://happyc0der.github.io/ForgeLog/
image: /img/forgelog.png
year: 2026
order: 6
featured: true
stack: [Kotlin, Jetpack Compose, Room, Hilt, DataStore, kotlinx.serialization, Robolectric]
tags: [swe]
stats: ["830 tests", "2.3 MB signed APK", "no INTERNET permission"]
bullets:
  - "Offline Android gym tracker in Kotlin with Jetpack Compose, Room, Hilt and MVVM; the manifest declares five permissions and no INTERNET permission."
  - "Rest timer counts down on the lock screen and survives process death; analytics for volume, estimated 1RM and personal bests; JSON backup, restore and CSV export through the Storage Access Framework."
  - "830 tests run on the JVM with no device, plus 38 instrumented tests on API 26 and API 36 emulators; released as a signed 2.3 MB APK (v1.0)."
resume_bullets:
  - "Offline Android gym tracker in Kotlin (Jetpack Compose, Room, Hilt, MVVM); five permissions declared, none of them INTERNET."
  - "Rest timer on the lock screen survives process death; analytics for volume, estimated 1RM and personal bests; JSON backup and CSV export."
  - "830 unit and Robolectric tests on the JVM with no device, plus 38 instrumented tests on API 26 and 36; released as a signed 2.3 MB APK."
---

I built ForgeLog to plan gym programs, log sets during a workout and compare sessions over time, with every workout kept on the phone. There is no account, no backend and no INTERNET permission, so training data leaves the phone only when the user exports it. The rest countdown shows in the workout notification on the lock screen, comes back paused, skipped or extended if Android kills the app, and holds a wake lock so it reaches zero with the screen off.

Backup is a JSON file and export is CSV, both through the Storage Access Framework, so the app holds no storage permission. A restore is validated in full before anything is written, and the release checks record about 1,500 deliberately corrupted files that the importer refused instead of crashing on. Room schema JSONs are committed and there is no destructive-migration fallback, so a missing migration fails loudly rather than wiping history.

830 tests run on a laptop with no device attached: Room and the Compose screens run under Robolectric, and 38 instrumented tests run on Gradle managed emulators at API 26 and API 36, the same UI tests on a real Android runtime plus the few that need a device. v1.0 is a signed 2.3 MB APK on GitHub Releases, one file for all four CPU architectures, Android 8.0 and up, GPL-3.0-or-later. It is my first Android app. The Play Store listing text is drafted but not submitted.
