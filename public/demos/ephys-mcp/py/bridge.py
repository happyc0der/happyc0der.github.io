"""Glue between the demo page and ephys-mcp's server module. Written for the demo, not part of ephys-mcp.

The page sends a tool name and JSON arguments; this module calls the function server.py
registered for that tool, exactly as an MCP client's tools/call would reach it, and returns
the JSON the tool produced (or its ToolError message), plus the arrays a plot tool handed to
the plots stand-in, plus the time the call took in this browser.
"""

from __future__ import annotations

import inspect
import json
import sys
import time
import types
import typing

import numpy as np

import plots_capture

# Pyodide is 32-bit WebAssembly, so numpy's index type (intp) is int32. np.repeat then refuses the
# int64 counts that rng.poisson returns (sources/synthetic.py builds spike trains that way), which
# 64-bit numpy accepts. This shim casts such counts to intp, after checking they fit, and changes
# nothing else; on a 64-bit platform it never triggers.
_np_repeat = np.repeat


def _repeat(a, repeats, axis=None):
    r = np.asarray(repeats)
    if r.dtype.kind in "iu" and r.dtype.itemsize > np.dtype(np.intp).itemsize:
        if r.size and r.max() > np.iinfo(np.intp).max:
            raise OverflowError("repeat count does not fit the platform index type")
        repeats = r.astype(np.intp)
    return _np_repeat(a, repeats, axis=axis)


np.repeat = _repeat

sys.modules["ephys_mcp.plots"] = plots_capture  # before server.py runs `from . import plots`

import ephys_mcp  # noqa: E402
from mcp.server.mcpserver.exceptions import ToolError  # noqa: E402

ephys_mcp.plots = plots_capture
from ephys_mcp import server  # noqa: E402

TOOLS = server.mcp.tools  # name -> {"fn", "options"}, in registration order


def _default(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


def _kind(name: str, ann) -> dict:
    """Describe a parameter's type for the page's form, from the real annotation."""
    origin, args = typing.get_origin(ann), typing.get_args(ann)
    optional = origin in (typing.Union, types.UnionType) and type(None) in args
    if optional:
        rest = [a for a in args if a is not type(None)]
        ann = rest[0] if len(rest) == 1 else ann
        origin, args = typing.get_origin(ann), typing.get_args(ann)
    if origin is typing.Literal:
        return {"type": "choice", "choices": list(args), "optional": optional}
    if name.endswith("session_id") and ann is str:
        return {"type": "session", "optional": optional}
    if name.endswith("session_ids"):
        return {"type": "sessions", "optional": optional}
    if origin is list:
        inner = args[0] if args else typing.Any
        if inner is int:
            return {"type": "int_list", "optional": optional}
        return {"type": "json", "optional": optional}
    if origin is dict:
        return {"type": "params", "optional": optional}
    for t, label in ((bool, "bool"), (int, "int"), (float, "float"), (str, "str")):
        if ann is t:
            return {"type": label, "optional": optional}
    return {"type": "json", "optional": optional}


def describe() -> str:
    tools = []
    for name, entry in TOOLS.items():
        fn = entry["fn"]
        hints = typing.get_type_hints(fn.__wrapped__)
        params = []
        for p in inspect.signature(fn).parameters.values():
            info = {"name": p.name, **_kind(p.name, hints.get(p.name, typing.Any))}
            if p.default is not inspect.Parameter.empty:
                info["default"] = p.default
            else:
                info["required"] = True
            params.append(info)
        tools.append({"name": name, "doc": inspect.getdoc(fn) or "", "params": params, "figure": name.startswith("plot_")})
    sources = {
        k: {"status": v["status"], "description": v["description"], "params": v["params"]}
        for k, v in server.SOURCES.items()
    }
    return json.dumps(
        {
            "tools": tools,
            "sources": sources,
            "instructions": server.mcp.instructions,
            "prompt": server.analyze_session("<session_id>"),
            "python": sys.version.split()[0],
            "numpy": np.__version__,
            "scipy": __import__("scipy").__version__,
        },
        default=_default,
    )


def call(name: str, kwargs_json: str) -> str:
    if name not in TOOLS:
        return json.dumps({"ok": False, "error": f"unknown tool {name!r}", "ms": 0})
    kwargs = json.loads(kwargs_json)
    t0 = time.perf_counter()
    figure = None
    try:
        out, error = TOOLS[name]["fn"](**kwargs), None
    except ToolError as exc:
        out, error = None, str(exc)
    except Exception as exc:  # not an anticipated tool error: show it as it is
        out, error = None, f"{type(exc).__name__}: {exc}"
    ms = (time.perf_counter() - t0) * 1000
    if isinstance(out, list) and len(out) == 2 and hasattr(out[1], "path"):
        summary, image = out
        figure = plots_capture.CAPTURED.pop(str(image.path), None)
        out = [summary, {"image": "PNG in the real server; drawn here as SVG from the same arrays"}]
    return json.dumps({"ok": error is None, "result": out, "error": error, "figure": figure, "ms": ms}, default=_default)
