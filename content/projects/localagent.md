---
title: localagent
blurb: Local-only LLM agent with image generation, QLoRA fine-tuning and a story-to-comic pipeline, split across a Mac and a Windows GPU laptop.
image: /img/localagent.jpg
year: 2026
order: 22
featured: false
status: not public
stack: [Python, Ollama, Qwen3-14B, PyTorch, diffusers, PEFT, SDXL, llama.cpp]
tags: [ml, swe]
stats: ["49 tok/s Qwen3-14B", "0.4 s per fast image", "5-page comic, 25 panels"]
bullets:
  - "Local agent harness in Python: Qwen3-14B under Ollama with a tool-calling loop over seven shell, file and image tools; the agent runs on a Mac and reaches the models on a Windows GPU laptop through an SSH tunnel."
  - "Two image services on the GPU box, SD-Turbo at about 0.4 s per 512 px image and FLUX.1-schnell in 4-bit at 28 to 36 s per 1024 px image, plus a QLoRA pipeline that fine-tunes Qwen3-14B (about 2 hours at default settings) and imports the result into Ollama through llama.cpp in about 10 minutes."
  - "September story-to-comic pipeline: the LLM wrote a panel script, SDXL drew each panel in about 12.5 s and Pillow lettered the pages, with SDXL style and character LoRA training and a 5-page, 25-panel Alice in Wonderland example."
resume_bullets:
  - "Built a local agent harness: Qwen3-14B under Ollama, a tool-calling loop over seven shell, file and image tools, an SSH tunnel to a GPU laptop."
  - "Fine-tuned Qwen3-14B with QLoRA: about 2 hours to train at default settings, about 10 minutes to import into Ollama through llama.cpp."
  - "Generated a 25-panel Alice in Wonderland comic with a story-to-comic pipeline: LLM panel script, SDXL panels at about 12.5 s each, Pillow lettering."
---

An assistant that runs entirely on hardware I own: no cloud provider, no API keys. Qwen3-14B runs under Ollama on my Windows laptop (RTX 3080 Ti, 16 GB) at about 49 tokens per second. The agent itself runs on the Mac and reaches the models through an SSH tunnel, so its shell and file tools act on the Mac's files and nothing is opened on the Windows firewall. Tool arguments are validated before a call and every error goes back to the model as text it can correct from. Reasoning is off by default: it made a simple reply about 30 times more expensive, on every tool call.

Two image services sit on the GPU box: SD-Turbo for fast images (about 0.4 s at 512 px, loaded next to the LLM) and FLUX.1-schnell in 4-bit for quality (28 to 36 s at 1024 px, with the LLM unloaded). A QLoRA pipeline fine-tunes Qwen3-14B on a folder of documents or captured agent conversations at about 2.9 s per example with a 12.0 GB peak, about 2 hours at the default 600 steps of 4 examples. It then merges the adapter, converts it to GGUF with llama.cpp and imports the result into Ollama, which takes about 10 minutes.

The September comic pipeline turned a story into lettered pages: the LLM wrote a panel-by-panel script, SDXL drew each panel in about 12.5 s, and Pillow added borders, speech bubbles and captions. It could also cut existing comic pages into panels, describe them with a local vision model, and train SDXL style and character LoRAs. At 768 px and rank 16, a training step of 2 images took 0.95 s on an otherwise idle GPU (13.6 GB peak), or 3.25 s with gradient checkpointing (5.6 GB peak). Its example was Alice's Adventures in Wonderland, chapter I: 5 pages, 25 panels, about 5 minutes of art.

It is deliberately not a git repository. There are no automated tests.
