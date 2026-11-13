---
title: Slopify
blurb: Local pipeline that turns a trend report into finished, captioned short and long-form videos on one 16 GB GPU, with a safety gate and a judge model before anything is posted.
year: 2026
order: 41
featured: false
status: not public
stack: [Python, ComfyUI, FLUX schnell, Wan 2.2, Kokoro, faster-whisper, Gemma 4 12B, Ollama, qwen3-vl, NudeNet, FFmpeg, pytest]
tags: [ml, swe]
stats: ["13 stages per video", "684 test functions", "442 commits in 26 days"]
bullets:
  - "Built a 13-stage video pipeline (trend report, topic, research, script, storyboard, visuals, voice, music, captions, assembly, review, safety check, judge) that runs locally on one 16 GB GPU: FLUX schnell stills and Wan 2.2 5B motion clips through ComfyUI, Kokoro voices, faster-whisper word timing and Gemma 4 12B in Ollama as the writer."
  - "Kept facts checkable: the researcher keeps a fact only when its source sentence is really on the fetched page and every number in the fact appears in that sentence, and only numbers from those facts become on-screen counters; stock images are limited to CC0, public domain and CC BY, with each license recorded."
  - "Gated publishing: NudeNet scans every still, clip and finished video at 4 frames a second and the publisher fails closed when the scan can't run; a separate vision model (qwen3-vl) judges each video from 8 frames and the real audio, rewrites low scorers once, and a feedback loop learns from real views and watch time which judge sub-scores and formats predict retention."
resume_bullets:
  - "Built a 13-stage local video pipeline on one 16 GB GPU: ComfyUI image and video models, Kokoro voices, Whisper captions and a Gemma 4 12B writer."
  - "Kept every on-screen number traceable: a fact survives only if its source sentence and all its numbers appear on the fetched page."
  - "Gated publishing with a fail-closed NudeNet scan and a separate judge model, and fed real views and watch time back into the judge and format choice."
---

I built Slopify to see how far a free, local stack can go toward making short videos end to end. One command takes a genre or a topic and produces a finished, captioned vertical reel or a 16:9 long-form video. Every stage writes its output into the job's folder, so any stage can be edited by hand and the run resumed from there.

The topic comes from the day's trend report: the top topic that hasn't been made recently, with its angle kept as the brief. A free researcher plans two or three news searches, fetches the articles' readable text, and has the writer model pull out facts, each with the sentence it came from. A fact is kept only when that sentence is really on the page and every number in the fact is in it. The writer then drafts five plans for the script and the edit together (every spoken line, its voice and pause, every shot with its effect, sound and label) and a judge picks one. The renderer cuts one shot per spoken phrase and gives every video its own seeded look.

Nothing is posted on trust. NudeNet scans every stock download, every generated still and clip, and the finished video at 4 frames a second; the publisher posts nothing without a clean scan and fails closed when the check can't run. A different model from the writer, qwen3-vl, judges the result from 8 frames and the real audio through Whisper, and a video below the bar is rewritten once with its notes. A separate fact gate skips videos with an invented claim about a real person, made-up news, or health or safety misinformation. Real people appear only in licensed Wikimedia Commons photos; a real person's face is never generated.

A feedback loop archives each video's real views and watch time and learns which judge sub-scores track them and which formats and openings hold viewers. Heavy GPU work only starts inside a nightly window, and every run unloads its ComfyUI and Ollama models when it ends. The repo is private, with 684 test functions that run on CPU against a fake ComfyUI.
