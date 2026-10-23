"""Run ephys-mcp's own offline tests under pytest in the browser. Demo glue, not part of ephys-mcp.

Test files are the repo's, unmodified, unpacked under /home/pyodide/ephys-mcp/tests. Two tests are
deselected because they check things this page replaces rather than the analysis:
- test_tools_are_registered awaits the MCP SDK's list_tools(), and the SDK is stubbed here;
- test_plots_return_summary_and_png reads PNG bytes, and matplotlib is not loaded here.
Tests that need the `sort` extra (spikeinterface) skip themselves, as they do without it anywhere.
"""

from __future__ import annotations

import json
import os

import pytest

REPO = "/home/pyodide/ephys-mcp"  # git archive of the tag, unpacked by the page

FILES = [
    "tests/test_core.py",
    "tests/test_psth_plots.py",
    "tests/test_cross_session.py",
    "tests/test_latent.py",
    "tests/test_geometry.py",
]
DESELECT = {
    "tests/test_core.py::test_tools_are_registered": "awaits the MCP SDK's list_tools(); the SDK is stubbed here",
    "tests/test_psth_plots.py::test_plots_return_summary_and_png": "reads PNG bytes; matplotlib is not loaded here",
}


class _Recorder:
    def __init__(self, emit):
        self.emit, self.rows = emit, []

    def pytest_collectreport(self, report):
        if report.skipped:
            reason = report.longrepr[-1] if isinstance(report.longrepr, tuple) else str(report.longrepr)
            row = {"id": report.nodeid, "outcome": "skipped", "ms": 0, "detail": str(reason).removeprefix("Skipped: ")}
            self.rows.append(row)
            self.emit(json.dumps(row))

    def pytest_runtest_logreport(self, report):
        if report.when == "call" or (report.when == "setup" and report.outcome != "passed"):
            detail = ""
            if report.skipped and isinstance(report.longrepr, tuple):
                detail = str(report.longrepr[-1]).removeprefix("Skipped: ")
            elif report.failed:
                detail = str(report.longrepr)[-1200:]
            row = {"id": report.nodeid, "outcome": report.outcome, "ms": round(report.duration * 1000), "detail": detail}
            self.rows.append(row)
            self.emit(json.dumps(row))


def run(emit) -> str:
    rec = _Recorder(emit)
    args = ["-q", "-p", "no:cacheprovider", "--rootdir", REPO, *FILES]
    for node in DESELECT:
        args += ["--deselect", node]
    here = os.getcwd()
    os.chdir(REPO)
    try:
        code = pytest.main(args, plugins=[rec])
    finally:
        os.chdir(here)
    return json.dumps({"exit_code": int(code), "rows": rec.rows, "deselected": DESELECT})
