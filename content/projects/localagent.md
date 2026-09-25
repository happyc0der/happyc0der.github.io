---
title: localagent
blurb: Local-only LLM agent with image generation, QLoRA fine-tuning and a story-to-comic pipeline, split across a Mac and a Windows GPU laptop.
image: /img/localagent.jpg
year: 2026
order: 20
featured: false
status: local only
stack: [Python, Ollama, Qwen3-14B, PyTorch, diffusers, PEFT, SDXL, llama.cpp]
tags: [ml, swe]
stats: ["49 tok/s Qwen3-14B", "0.4 s per fast image", "5-page comic, 25 panels"]
bullets:
  - "Local agent harness in Python: Qwen3-14B under Ollama with a tool-calling loop over seven shell, file and image tools; the agent runs on a Mac and reaches the models on a Windows GPU laptop through an SSH tunnel."
  - "Two image services on the GPU box, SD-Turbo at about 0.4 s per 512 px image and FLUX.1-schnell in 4-bit at 28 to 36 s per 1024 px image, plus a QLoRA pipeline that fine-tunes Qwen3-14B and imports the result into Ollama through llama.cpp in about 10 minutes."
  - "Story-to-comic pipeline: the LLM writes a panel script, SDXL draws each panel in about 12.5 s, Pillow letters the pages; includes SDXL style and character LoRA training and a 5-page, 25-panel Alice in Wonderland example."
resume_bullets:
  - "Local agent harness: Qwen3-14B under Ollama with a tool-calling loop over seven shell, file and image tools, reached over an SSH tunnel to a GPU laptop."
  - "SD-Turbo at 0.4 s per 512 px image, FLUX.1-schnell 4-bit at 28 to 36 s per 1024 px; QLoRA fine-tune of Qwen3-14B imported into Ollama in about 10 minutes."
  - "Story-to-comic pipeline: LLM panel script, SDXL panels at 12.5 s each, Pillow lettering; a 5-page, 25-panel Alice in Wonderland example."
---

An assistant that runs entirely on hardware I own: no cloud provider, no API keys. Qwen3-14B runs under Ollama on my Windows laptop (RTX 3080 Ti, 16 GB) at about 49 tokens per second. The agent itself runs on the Mac and reaches the models through an SSH tunnel, so its shell and file tools act on the Mac's files and nothing is opened on the Windows firewall. Tool arguments are validated before a call and every error goes back to the model as text it can correct from. Reasoning is off by default: it made a simple reply about 30 times more expensive, on every tool call.

Two image services sit on the GPU box: SD-Turbo for fast images (about 0.4 s at 512 px, loaded next to the LLM) and FLUX.1-schnell in 4-bit for quality (28 to 36 s at 1024 px, with the LLM unloaded). A QLoRA pipeline fine-tunes Qwen3-14B on a folder of documents or captured agent conversations at about 2.9 s per example with a 12.0 GB peak, then merges the adapter, converts it to GGUF with llama.cpp and imports the result into Ollama, about 10 minutes end to end.

The comic pipeline turns a story into lettered pages: the LLM writes a panel-by-panel script, SDXL draws each panel in about 12.5 s, and Pillow adds borders, speech bubbles and captions. It can also cut existing comic pages into panels, describe them with a local vision model, and train SDXL style and character LoRAs (5.8 s per step, 5.9 GB peak). The included example is Alice's Adventures in Wonderland, chapter I: 5 pages, 25 panels, about 5 minutes of art.

It is deliberately not a git repository. There are no automated tests.
