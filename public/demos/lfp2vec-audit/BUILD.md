# LFP2Vec audit demo: how it is built

Interactive charts of the saved results in
[happyc0der/lfp2vec-audit](https://github.com/happyc0der/lfp2vec-audit), exported at commit
`4a0bdef67be059e2993422d7127df809695c57d4` (2026-09-22, "README: at-a-glance comparison, spectra
figure, seven-session figure"). Nothing is trained or re-run in the browser. No weights were
released and wav2vec2 needs PyTorch, so the page reads the result files the repo commits.

## Files

| file | what it is |
|---|---|
| `index.html` | the page and its styles; links `../_shared/demo.css` |
| `app.js` | vanilla JS, hand-built SVG charts, no libraries |
| `data.json` | every number the page shows, written by `export_data.py` |
| `export_data.py` | standard-library Python that reads the repo's result files and writes `data.json` |

The page makes no network requests beyond these files and `../_shared/demo.css`.

## Regenerate `data.json`

From the portfolio repo root, with Python 3 (tested with 3.14) and no packages installed:

```bash
git clone https://github.com/happyc0der/lfp2vec-audit /tmp/lfp2vec-audit
git -C /tmp/lfp2vec-audit checkout 4a0bdef67be059e2993422d7127df809695c57d4
python3 -I public/demos/lfp2vec-audit/export_data.py /tmp/lfp2vec-audit public/demos/lfp2vec-audit/data.json
```

The output is byte-for-byte deterministic for a given commit. The script records the commit hash
and date it read in `data.json` (`source`), and the page's footer links to that commit.

## What the export reads

| panel | files in the repo |
|---|---|
| Spectra | `results/spectra/mean_psd.csv`; the D11 table in `docs/DEVIATIONS.md` |
| Probes | `results/postprocess/cross_lab_*__all_target_groups__seed{0,1,2}[__lp100]__channels.csv`, the matching `.csv` score files, `results/finetune_v2/<run>/<timestamp>/metrics.json` (confusion matrix, for the per-chunk share), `results/calibration/<run>.json` (mean confidence) |
| Transfer | every `results/postprocess/*.csv` that is not a `__channels` file; published margins from `docs/RESULTS_FIXES.md`; the published within-IBL 0.68 from `README.md` |
| Calibration | `results/calibration/*.json` (NaN bins become `null`) |
| all | class names from `REGIONS` in `lfpaudit/__init__.py` |

## Checks the export makes before writing

It exits with an error, and writes nothing, if any of these fail:

- Every margin cell in `docs/RESULTS_FIXES.md` (mean ± sample s.d. over seeds, for every
  configuration and stage) equals the value recomputed from the CSVs, the way `lfpaudit/cli.py`
  builds that table.
- Channel-level balanced and raw accuracy recomputed from each `__channels.csv` equal the
  channel-level rows of the matching score CSV.
- The README's within-IBL claims (0.74 ± 0.07 over 7 sessions, 0.81 post-processed) and its three
  calibration rows match the files.
- Every run's channel order and labels agree, no channel is labelled or predicted CA2, and
  confusion matrices sum to their sample counts.
- The spectra ratios at 100, 200, 300 and 500 Hz are within 10% of D11's table.

## The spectra ratio, and why it is not exactly D11's table

D11 measures Allen power relative to IBL "normalised to each store's own value at 10 Hz". The page
does the same: each lab's mean PSD divided by its own value at 10 Hz, Allen interpolated onto the
frequency asked for, as `scripts/make_figures.py` does with `np.interp`. From the committed
`mean_psd.csv` that gives 1.1x, 3.5x, 32x and 799x at 100, 200, 300 and 500 Hz. D11's table says
1.1x, 3.3x, 33x and 768x. The README describes `mean_psd.csv` as a fixed 4,000-chunk subsample,
and the repo's own `docs/figures/spectra.png`, drawn from this file, prints 799x. The page shows
both columns and says why. A raw ratio without the 10 Hz normalisation would be wrong for this
comparison (869x at 500 Hz). The largest normalised ratio in the file is 7,698x, on a narrow Allen
line at 381 Hz, and the page states that too.

## Colours

The four region colours (CA1 `#d95926`, CA3 `#f2d16b`, DG `#199e70`, VIS `#a78bfa`) pass the
all-pairs colour-vision and normal-vision separation checks on the `#14121c` surface. CA3 is lighter
on purpose, so lightness separates it as well as hue. CA2 is one of the five classes but has no
channels in either test set, and the export checks that no channel is labelled or predicted CA2.
The labs use IBL `#3987e5` and Allen `#d95926`, close to the repo's own spectra figure.

## Testing

Serve `public/` and open `/demos/_shared/frame-test.html?demo=lfp2vec-audit&h=780` to see the
page in 360 and 1400 px iframes. All four tabs fit 780 px without scrolling from 900 to 1400 px
wide. Below 900 px the layout stacks and scrolls inside the frame.
