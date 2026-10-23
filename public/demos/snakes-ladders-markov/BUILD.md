# Snakes and Ladders demo: how this folder is built

The demo runs the Python from
[happyc0der/SPA_Project](https://github.com/happyc0der/SPA_Project) at commit
`d678fcdd16989681f84c089a5d9da09c6586163a` (2026-09-12, "Truncate and relabel the average-position
curve, cover the plots") in Pyodide 0.29.5 with NumPy 2.2.5, inside a module Web Worker. The page
itself has no build step: only `repo/` is generated, by copying three files from the repo.

## Files

| Path | Origin |
|---|---|
| `repo/model.py`, `repo/simulation.py`, `repo/test_model.py` | Copied byte for byte from the repo at the commit above |
| `glue.py` | Written for this page. Installs a do-nothing `matplotlib` stub (the repo imports `matplotlib.pyplot` at the top but only plots inside `main()` and `sharing_distribution()`, which the page never calls; `test_model.py` calls `matplotlib.use("Agg")`), then calls `model.*` and `simulation.*` and converts NumPy results to lists and dicts |
| `worker.js` | Loads Pyodide (version and CDN URL from `../_shared/pyodide.js`) and NumPy, writes the three repo files and `glue.py` to `/home/pyodide`, imports them, answers calls from the page; loads pytest only when the visitor runs the tests |
| `demo.js`, `index.html` | The page: board, sliders, charts and the token are drawn in JavaScript from what Python returns; uses `../_shared/demo.css` |

Nothing in `repo/` is modified. `pyproject.toml`, `requirements.txt` and `README.md` are not
needed in the browser. The repo has no licence file, so no licence is stated in the demo.

## What the page calls

- `model.transition_matrix(d)` for d = 1..24, cached per die in `glue.py`
- `model.expected_turns(T)` from square 0 for every die (the bar chart), and `model.expected_turns(T, s)`
  for every square that is not a snake or ladder head (the "Turns left" view)
- `model.reachable_squares(T)`, `model.completion_curve(d)`, `model.first_limiting_power(T, 1e-4)`
- the nonzero entries of row `s` of `model.transition_matrix(d)` for the selected square's readout
- `model.sharing_distribution_plot(T, n)` for the turn slider (and turn by turn for the d1 walk)
- `model.simulate_game(T)` after `np.random.seed(seed)` for "Play a game"
- `simulation.simulate_game(counts)` and `simulation.empirical_matrix(counts)` for "Roll", with the
  loop and the comparison from `simulation.main()`, seeded with `model.SEED`
- `pytest.main(["test_model.py", "-v", ...])` for "Run test_model.py"

The fewest / 50% / 90% / 99% turns are read off the list `completion_curve(d)` returns (the first
turn whose value reaches 0+, 50, 90 and 99 percent).

One platform difference: with a one-sided die, `I - Q` is singular. For the 24 squares from which
square 100 is still reachable, desktop NumPy raises `LinAlgError: Singular matrix` inside
`expected_turns(T, s)`, while NumPy 2.2.5 in Pyodide returns `nan`. The page shows whichever the
call actually did.

## Regenerate

From the portfolio repo root (zsh or bash):

```sh
SRC=$(mktemp -d)/SPA_Project
git clone https://github.com/happyc0der/SPA_Project "$SRC"
git -C "$SRC" checkout d678fcdd16989681f84c089a5d9da09c6586163a

D=public/demos/snakes-ladders-markov
rm -rf "$D/repo" && mkdir -p "$D/repo"
git -C "$SRC" archive d678fcdd16989681f84c089a5d9da09c6586163a model.py simulation.py test_model.py | tar -x -C "$D/repo"
```

To move to a newer commit, use its hash in the commands above, then update the commit link and
the short hash in the footer of `index.html` and the commit named at the top of this file. If the
repo gains files that `model.py` or `simulation.py` import, add them to `REPO_FILES` in
`worker.js`.

Check that the copies are untouched:

```sh
T=$(mktemp -d)
git -C "$SRC" archive d678fcdd16989681f84c089a5d9da09c6586163a model.py simulation.py test_model.py | tar -x -C "$T"
diff -r "$T" public/demos/snakes-ladders-markov/repo && echo identical
```

## Try it locally

```sh
python3 -m http.server 8000 --directory public
# http://localhost:8000/demos/snakes-ladders-markov/
# http://localhost:8000/demos/_shared/frame-test.html?demo=snakes-ladders-markov&h=1170
```

The first start downloads about 8.1 MB from cdn.jsdelivr.net (pyodide.mjs, pyodide-lock.json,
pyodide.asm.js, pyodide.asm.wasm, python_stdlib.zip and the NumPy wheel; sizes as transferred,
measured in Edge); the test run adds pytest and its dependencies, about 1.6 MB. Everything else
is same-origin.
