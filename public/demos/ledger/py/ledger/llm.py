"""Demo stub replacing the repo's ledger/llm.py: the browser demo never calls a model.

The claims shown were returned by Claude Sonnet 5.5 in the recorded 2026-10-17 run
(runs/company_nicrron/v3.jsonl); any edit is checked by the repo's verifier, not by a model.
"""


def chat(*args, **kwargs):
    raise RuntimeError("No model call is possible in the browser demo; it replays the recorded run.")
