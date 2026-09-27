---
title: First CUDA experiments
blurb: "A naive CUDA matrix-multiplication kernel timed against a single-threaded C++ loop on 1024 x 1024 matrices."
repo: https://github.com/happyc0der/cuda-matmul-cpu-vs-gpu
year: 2025
order: 34
featured: false
listed: false
stack: [CUDA, C++, Make]
tags: [swe]
stats: []
bullets:
  - "My first CUDA programs (March 2025): a hello-world kernel, then a naive matrix multiply with one thread per output element, checked element by element against a CPU triple loop on 1024 x 1024 matrices."
  - "The README explains what the host-side timing includes (allocation, copies and CUDA context creation) and lists the next steps: shared-memory tiling, cuBLAS and CUDA events."
---

Learning exercises, not an optimised GEMM: there is no tiling, cuBLAS or error checking. Kept in the dataset, off the site.
