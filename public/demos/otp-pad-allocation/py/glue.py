"""Glue for the in-browser demo. Not part of the repo.

The repo's files (protocol.py, simulation.py, eval_protocol.py, main.py,
test_protocol.py and summary.csv, copied unmodified from
happyc0der/cryptography-project-1 at commit 662f578) sit next to this file in
Pyodide's virtual file system. This module only routes the page's requests to
them and turns their state into JSON. Every pad, count and check on the page is
computed by the repo's code.

What this file adds, so it can be read in one place:

* ``Playground`` lets the visitor be the network. Hand-driven sends and
  deliveries call ``proto.can_send``, ``proto.send``, ``net.inject``,
  ``net.inflight.pop`` and ``proto.deliver``, the same calls ``main.py``'s
  ``trace()`` makes. ``Playground.step`` is the body of the loop in
  ``simulation.run``, statement for statement, so an untouched auto-played run
  can be checked against ``simulation.run`` with the same seed.
* ``record`` repeats the pad check that ``simulation.run`` does in its inner
  ``record()`` (a closure, so it cannot be imported).
* ``AlwaysPadOne`` is copied from ``test_protocol.py``, where it is defined
  inside ``test_pad_reuse_is_actually_detected``.
* ``ci_full`` runs ``eval_protocol.main()`` itself. It wraps
  ``eval_protocol.measure`` in a counter for the progress bar and restores it
  afterwards; the function's behaviour is unchanged.
"""

from __future__ import annotations

import contextlib
import csv
import difflib
import hashlib
import io
import json
import random
import runpy
import sys
import time

import eval_protocol
from protocol import (
    DATA,
    GRANT,
    REQUEST,
    BaseProtocol,
    ChunkReserveProtocol,
    GrantProtocol,
    Message,
    PadReuseError,
    StaticPartitionProtocol,
)
from simulation import DELIVERY_POLICIES, SCHEDULES, Network, Schedule, run

try:  # in Pyodide, `js` is the Web Worker's global scope
    import js
except ImportError:  # running natively, for the build check
    js = None


def _progress(k: int, total: int, label: str) -> None:
    if js is not None:
        js.progress(k, total, label)


class AlwaysPadOne(BaseProtocol):
    """Copied from test_protocol.py (test_pad_reuse_is_actually_detected)."""

    name = "deliberately-broken"

    def can_send(self, j):
        return True

    def send(self, j):
        return Message(sender=j, pad=1)

    def observe(self, j, msg):
        return


PLAY_PROTOCOLS = {
    "chunk-reserve": ChunkReserveProtocol,
    "static-partition": StaticPartitionProtocol,
    "grant": GrantProtocol,
    "broken": AlwaysPadOne,
}


# ---------------------------------------------------------------------------
# "You are the network"
# ---------------------------------------------------------------------------


class Playground:
    def __init__(self, kind, n, d, m, schedule, delivery, pressure, seed):
        self.kind = kind
        self.cfg = dict(
            kind=kind,
            n=n,
            d=d,
            m=m,
            schedule=schedule,
            delivery=delivery,
            pressure=pressure,
            seed=seed,
        )
        self.proto = PLAY_PROTOCOLS[kind](n, d, m)
        self.n, self.d, self.m = n, d, m
        # The global reading of the d bound, as in main.py's trace().
        self.net = Network(d)
        self.rng = random.Random(seed)
        self.schedule = Schedule(schedule, m)
        self.policy = DELIVERY_POLICIES[delivery]
        self.pressure = pressure
        self.used: dict[int, int] = {}  # pad -> party that used it
        self.landed: set[int] = set()  # pads whose message has been delivered
        self.pending: list[Message] = []  # control traffic waiting for a slot
        self.per_party = [0] * m
        self.sends = 0
        self.blocked = 0
        self.steps = 0
        self.idle = 0
        self.events: list[dict] = []
        self.alarm = None
        self.reused = None
        self.finished = False
        self.manual = False
        self.check = None
        self.event(self._intro(), "info")

    # --- the pad check from simulation.run's record() ------------------------
    def record(self, msg):
        if msg.kind != DATA or msg.pad is None:
            return
        if msg.pad in self.used:
            raise PadReuseError(
                f"{self.proto.name}: party {msg.sender} reused pad {msg.pad}"
            )
        if not 1 <= msg.pad <= self.proto.n:
            raise PadReuseError(f"{self.proto.name}: pad {msg.pad} out of range")
        self.used[msg.pad] = msg.sender

    # --- simulation.run's pump_control() and drain() -------------------------
    def pump_control(self):
        moved = False
        self.proto.tick()
        self.pending.extend(self.proto.take_control_messages())
        while self.pending and self.net.has_room(self.pending[0].sender):
            msg = self.pending.pop(0)
            self.net.inject(msg)
            self.event(f"P{msg.sender} broadcasts {self._control_text(msg)}", "ctl")
            moved = True
        return moved

    def drain(self):
        for _ in range(10_000):
            while self.net.inflight:
                msg = self.net.pop(self.policy, self.rng)
                self._deliver(msg)
            if not self.pump_control():
                return

    # --- primitives ----------------------------------------------------------
    def _send(self, j):
        msg = self.proto.send(j)
        try:
            self.record(msg)
        except PadReuseError as err:
            self.alarm = f"PadReuseError: {err}"
            self.reused = msg.pad
            self.event(self.alarm, "alarm")
            return False
        self.net.inject(msg)
        self.per_party[j] += 1
        self.sends += 1
        self.event(f"P{j} sends on pad {msg.pad}", "send", j)
        return True

    def _deliver(self, msg):
        before = self._reserve_of(msg.sender)
        self.proto.deliver(msg)
        if msg.kind == DATA and msg.pad is not None:
            self.landed.add(msg.pad)
            text = f"network delivers P{msg.sender}'s pad {msg.pad}"
            after = self._reserve_of(msg.sender)
            if self.kind == "chunk-reserve":
                if after != before:
                    shown = "none left" if after is None else f"chunk {after}"
                    text += f": reserve[{msg.sender}] moves to {shown}"
                else:
                    text += ": reserve unchanged"
            self.event(text, "deliver", msg.sender)
        else:
            self.event(
                f"network delivers P{msg.sender}'s {self._control_text(msg)}",
                "ctl",
                msg.sender,
            )

    def _reserve_of(self, j):
        views = getattr(self.proto, "views", None)
        return views[0].reserve[j] if views else None

    # --- hand-driven actions -------------------------------------------------
    def send(self, j):
        self.manual = True
        if self.alarm or self.finished:
            return
        if not self.net.has_room(j):
            self.event(
                f"P{j} waits: {len(self.net.inflight)} messages are undelivered "
                f"and d = {self.d}, so the network takes no more until one lands",
                "warn",
            )
            return
        if not self.proto.can_send(j):
            if self.proto.has_spare_capacity():
                self.blocked += 1
            self.event(self._why_not(j), "warn")
            return
        if self._send(j):
            self.pump_control()
            self._check_finished()

    def deliver(self, i):
        self.manual = True
        if self.alarm or self.finished or not 0 <= i < len(self.net.inflight):
            return
        self._deliver(self.net.inflight.pop(i))
        self.pump_control()
        self._check_finished()

    def deliver_by(self, policy):
        if not self.net.inflight:
            self.event("nothing is in flight", "warn")
            return
        self.deliver(DELIVERY_POLICIES[policy](self.net.inflight, self.rng))

    def end_run(self):
        """Stop here: deliver what is in flight and count the unused pads."""
        self.manual = True
        if self.alarm or self.finished:
            return
        self.drain()
        self._finish()

    # --- one iteration of simulation.run's loop ------------------------------
    def step(self):
        if self.alarm or self.finished:
            return
        self.steps += 1
        busy = self.pump_control()

        if self.pressure == "eager":
            for _ in range(self.rng.randint(0, 3)):
                msg = self.net.pop(self.policy, self.rng)
                if msg is None:
                    break
                self._deliver(msg)
                busy = True

        j = self.schedule.pick(self.rng, self.proto.d)
        if self.pressure == "lazy" and not self.net.has_room(j):
            msg = self.net.pop(self.policy, self.rng)
            if msg is not None:
                self._deliver(msg)
                busy = True
        if (
            self.net.has_room(j)
            and not self.proto.can_send(j)
            and self.proto.has_spare_capacity()
        ):
            self.blocked += 1
        if self.net.has_room(j) and self.proto.can_send(j):
            if not self._send(j):
                return
            self.schedule.on_sent(j)
            busy = True

        self.idle = 0 if busy else self.idle + 1
        if self.idle > 3:
            self.drain()
            if not any(self.proto.can_send(k) for k in self.schedule.live()):
                self._finish()
                return
            self.idle = 0

    def steps_until(self, budget):
        for _ in range(budget):
            if self.alarm or self.finished:
                return
            self.step()

    # --- end of a run --------------------------------------------------------
    def _check_finished(self):
        if self.net.inflight or self.pending:
            return
        if not any(self.proto.can_send(k) for k in range(self.m)):
            self._finish()

    def _finish(self):
        self.finished = True
        wasted = self.n - len(self.used)
        self.event(f"run over: {wasted} of {self.n} pads never used", "done")
        if self.manual:
            return
        # An untouched auto-played run must match simulation.run exactly.
        c = self.cfg
        try:
            r = run(
                PLAY_PROTOCOLS[c["kind"]](c["n"], c["d"], c["m"]),
                schedule=Schedule(c["schedule"], c["m"]),
                delivery=c["delivery"],
                pressure=c["pressure"],
                seed=c["seed"],
            )
        except PadReuseError as err:
            self.check = dict(error=str(err))
            return
        mine = dict(
            wasted=wasted, sends=self.sends, blocked=self.blocked, steps=self.steps
        )
        theirs = dict(wasted=r.wasted, sends=r.sends, blocked=r.blocked, steps=r.steps)
        self.check = dict(mine=mine, run=theirs, same=mine == theirs)

    # --- text helpers ---------------------------------------------------------
    def _intro(self):
        p = self.proto
        if self.kind in ("chunk-reserve", "grant"):
            return (
                f"n={self.n} pads, d={self.d}, m={self.m} parties: "
                f"{p.layout.count} chunks of c=d={p.layout.c} pads"
            )
        if self.kind == "static-partition":
            return f"n={self.n} pads split into {self.m} fixed slices"
        return "AlwaysPadOne puts every message on pad 1"

    def _why_not(self, j):
        p = self.proto
        if self.kind == "static-partition":
            lo, hi = p.bounds[j] + 1, p.bounds[j + 1]
            elsewhere = sum(
                p.bounds[k + 1] - p.next_pad[k] + 1 for k in range(self.m) if k != j
            )
            return (
                f"P{j} is out of pads: its slice {lo}-{hi} is spent, and the "
                f"{elsewhere} unused pads in the other slices belong to other parties"
            )
        if self.kind == "chunk-reserve":
            if p.views[j].reserve[j] is None:
                return (
                    f"P{j} is out of pads: its current chunk is spent and every "
                    "chunk has been handed out"
                )
            return f"P{j} is blocked waiting on a delivery"
        if self.kind == "grant":
            if p.has_spare_capacity():
                return f"P{j} has no chunk of its own yet and waits for a grant"
            return f"P{j} is out of pads and nobody has a chunk left to grant"
        return f"P{j} cannot send"

    @staticmethod
    def _control_text(msg):
        if msg.kind == REQUEST:
            return "a request for chunks"
        if msg.kind == GRANT:
            chunks = ", ".join(str(c) for c in msg.chunks)
            return f"a grant of chunks {chunks} to P{msg.to}"
        return msg.kind

    def event(self, text, kind, party=None):
        self.events.append(dict(t=text, k=kind, p=party))
        del self.events[:-60]

    # --- state for the page ---------------------------------------------------
    def _groups(self):
        p = self.proto
        if self.kind == "static-partition":
            return [
                dict(
                    start=p.bounds[j] + 1,
                    size=p.bounds[j + 1] - p.bounds[j],
                    owner=j,
                    role="slice",
                    label=f"P{j} slice",
                )
                for j in range(self.m)
            ]
        if self.kind == "broken":
            return [
                dict(start=1, size=self.n, owner=None, role="none", label="no rule")
            ]
        lay = p.layout
        out = []
        if self.kind == "chunk-reserve":
            view = p.views[0]
            for c in range(lay.count):
                cur = [j for j in range(self.m) if p.cursors[j].current == c]
                res = [j for j in range(self.m) if view.reserve[j] == c]
                owner = (cur or res or [None])[0]
                if cur and res:
                    role = "both"
                elif cur:
                    role = "current"
                elif res:
                    role = "reserve"
                elif c >= view.next_chunk:
                    role = "free"
                else:
                    role = "spent"
                out.append(
                    dict(
                        start=lay.first_pad(c),
                        size=lay.size(c),
                        owner=owner,
                        role=role,
                        chunk=c,
                    )
                )
            return out
        # grant: each party's own pool, its current chunk, and chunks in transit
        transit = {}
        for msg in [*self.net.inflight, *self.pending]:
            if msg.kind == GRANT:
                for c in msg.chunks:
                    transit[c] = msg.to
        for c in range(lay.count):
            owner, role = None, "spent"
            for j in range(self.m):
                cur = p.cursors[j]
                if cur is not None and cur.current == c:
                    owner, role = j, "current"
                elif c in p.pool[j]:
                    owner, role = j, "pool"
            if c in transit:
                owner, role = transit[c], "transit"
            if role == "spent" and not any(
                pad in self.used for pad in range(lay.first_pad(c), lay.first_pad(c) + lay.size(c))
            ):
                role = "free"
            out.append(
                dict(
                    start=lay.first_pad(c),
                    size=lay.size(c),
                    owner=owner,
                    role=role,
                    chunk=c,
                )
            )
        return out

    def _parties(self):
        p = self.proto
        inflight = [0] * self.m
        for msg in self.net.inflight:
            inflight[msg.sender] += 1
        rows = []
        for j in range(self.m):
            row = dict(
                j=j,
                sent=self.per_party[j],
                inflight=inflight[j],
                room=self.net.has_room(j),
                can=bool(p.can_send(j)),
            )
            if self.kind == "chunk-reserve":
                cur = p.cursors[j]
                row.update(
                    current=cur.current,
                    left=p.layout.size(cur.current) - cur.pos,
                    reserve=p.views[0].reserve[j],
                )
            elif self.kind == "grant":
                cur = p.cursors[j]
                row.update(
                    current=None if cur is None else cur.current,
                    left=0 if cur is None else p.layout.size(cur.current) - cur.pos,
                    pool=len(p.pool[j]),
                    asking=bool(p.pending_request[j]),
                )
            elif self.kind == "static-partition":
                row.update(
                    lo=p.bounds[j] + 1,
                    hi=p.bounds[j + 1],
                    left=p.bounds[j + 1] - p.next_pad[j] + 1,
                )
            rows.append(row)
        return rows

    def state(self):
        p = self.proto
        pads = []
        for pad in range(1, self.n + 1):
            if pad == self.reused:
                pads.append([3, self.used.get(pad)])
            elif pad in self.landed:
                pads.append([2, self.used[pad]])
            elif pad in self.used:
                pads.append([1, self.used[pad]])
            else:
                pads.append([0, None])
        inflight = []
        for i, msg in enumerate(self.net.inflight):
            item = dict(i=i, sender=msg.sender, kind=msg.kind, pad=msg.pad)
            if msg.kind == GRANT:
                item.update(to=msg.to, chunks=list(msg.chunks))
            inflight.append(item)
        bound = getattr(p, "waste_bound", None)
        views = getattr(p, "views", None)
        out = dict(
            cfg=self.cfg,
            protocol=p.name,
            n=self.n,
            d=self.d,
            m=self.m,
            groups=self._groups(),
            pads=pads,
            parties=self._parties(),
            inflight=inflight,
            pending=len(self.pending),
            used=len(self.used),
            sends=self.sends,
            blocked=self.blocked,
            steps=self.steps,
            bound=bound() if bound else None,
            closed_form=(
                self.d * (2 * self.m - 1) - self.m + (self.n % self.d)
                if bound
                else None
            ),
            views_agree=(
                all(v.reserve == views[0].reserve for v in views) if views else None
            ),
            next_chunk=views[0].next_chunk if views else None,
            chunks=p.layout.count if hasattr(p, "layout") else None,
            events=self.events[-12:],
            alarm=self.alarm,
            finished=self.finished,
            wasted=self.n - len(self.used) if self.finished else None,
            manual=self.manual,
            check=self.check,
            live=[k for k in self.schedule.live()],
        )
        return out


_play: Playground | None = None


# ---------------------------------------------------------------------------
# Compare: simulation.run for the three protocols in eval_protocol.PROTOCOLS
# ---------------------------------------------------------------------------


def _committed_rows():
    with open("summary.csv", newline="") as fh:
        return {
            (r["protocol"], r["m"], r["d"], r["n"], r["schedule"]): r
            for r in csv.DictReader(fh)
        }


def compare(schedule, delivery, pressure, seed, m, d, n):
    committed = _committed_rows()
    out = []
    for name, cls in eval_protocol.PROTOCOLS.items():
        proto = cls(n, d, m)
        bound = getattr(proto, "waste_bound", lambda: None)()
        start = time.perf_counter()
        r = run(
            proto,
            schedule=Schedule(schedule, m),
            delivery=delivery,
            pressure=pressure,
            seed=seed,
        )
        ms = 1000 * (time.perf_counter() - start)
        row = committed.get((name, str(m), str(d), str(n), schedule))
        out.append(
            dict(
                protocol=name,
                wasted=r.wasted,
                used=r.used,
                sends=r.sends,
                blocked=r.blocked,
                steps=r.steps,
                bound=bound,
                ms=round(ms, 1),
                views_agree=r.views_agree,
                per_party=r.per_party_sends,
                committed=(
                    dict(max_wasted=row["max_wasted"], max_blocked=row["max_blocked"])
                    if row
                    else None
                ),
            )
        )
    return out


# ---------------------------------------------------------------------------
# CI: the three jobs in .github/workflows/tests.yml that can run here
# ---------------------------------------------------------------------------

# eval_protocol.py's argparse defaults: --n 5000 --seeds 3
GRID_N, GRID_SEEDS = 5000, 3


def _grid_cells():
    """The 180 cells in the order eval_protocol.main() visits them."""
    return [
        (name, cls, m, d, schedule)
        for name, cls in eval_protocol.PROTOCOLS.items()
        for m in (5, 9)
        for d in (1, 2, 5, 10, 20)
        for schedule in SCHEDULES
    ]


def _csv_line(row):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=eval_protocol.FIELDS, extrasaction="ignore")
    writer.writerow(row)
    return buf.getvalue()


def ci_slice():
    """Regenerate the m=5, d=5 rows and compare them with the committed lines."""
    with open("summary.csv", "rb") as fh:
        committed_lines = fh.read().decode().split("\r\n")
    index = {
        tuple(line.split(",")[:5]): line for line in committed_lines[1:] if line
    }
    cells = [c for c in _grid_cells() if c[2] == 5 and c[3] == 5]
    rows = []
    start = time.perf_counter()
    for k, (name, cls, m, d, schedule) in enumerate(cells):
        row = eval_protocol.measure(
            cls, n=GRID_N, d=d, m=m, schedule=schedule, seeds=GRID_SEEDS
        )
        row["protocol"] = name
        line = _csv_line(row)
        key = (name, str(m), str(d), str(GRID_N), schedule)
        old = index.get(key)
        rows.append(
            dict(new=line.rstrip("\r\n"), old=old, same=old is not None and line == old + "\r\n")
        )
        _progress(k + 1, len(cells), f"{name} m={m} d={d} {schedule}")
    return dict(
        rows=rows,
        header=committed_lines[0],
        seconds=round(time.perf_counter() - start, 1),
        identical=sum(r["same"] for r in rows),
        total=len(rows),
    )


def ci_full():
    """What CI does: python eval_protocol.py --out /tmp/summary.csv; diff."""
    cells = len(_grid_cells()) + 3  # main() also measures three n-scaling cells
    original = eval_protocol.measure
    count = 0

    def counted(*args, **kwargs):
        nonlocal count
        result = original(*args, **kwargs)
        count += 1
        cls = args[0] if args else kwargs.get("cls")
        _progress(
            count,
            cells,
            f"{getattr(cls, '__name__', '?')} m={kwargs.get('m')} d={kwargs.get('d')} "
            f"n={kwargs.get('n')} {kwargs.get('schedule')}",
        )
        return result

    argv = sys.argv
    out = io.StringIO()
    start = time.perf_counter()
    eval_protocol.measure = counted
    sys.argv = ["eval_protocol.py", "--out", "/tmp/summary.csv"]
    try:
        with contextlib.redirect_stdout(out):
            eval_protocol.main()
    finally:
        eval_protocol.measure = original
        sys.argv = argv
    seconds = round(time.perf_counter() - start, 1)
    with open("/tmp/summary.csv", "rb") as fh:
        new = fh.read()
    with open("summary.csv", "rb") as fh:
        old = fh.read()
    diff = list(
        difflib.unified_diff(
            old.decode().splitlines(),
            new.decode().splitlines(),
            "summary.csv",
            "/tmp/summary.csv",
            lineterm="",
        )
    )
    return dict(
        identical=new == old,
        old_bytes=len(old),
        new_bytes=len(new),
        old_sha=hashlib.sha256(old).hexdigest(),
        new_sha=hashlib.sha256(new).hexdigest(),
        rows=new.decode().count("\r\n") - 1,
        diff=diff[:80],
        stdout=out.getvalue(),
        seconds=seconds,
    )


def run_main():
    """python main.py --m 5, the CI step that checks the demo still runs."""
    argv = sys.argv
    out = io.StringIO()
    start = time.perf_counter()
    sys.argv = ["main.py", "--m", "5"]
    try:
        with contextlib.redirect_stdout(out):
            runpy.run_path("main.py", run_name="__main__")
    finally:
        sys.argv = argv
    return dict(stdout=out.getvalue(), seconds=round(time.perf_counter() - start, 2))


class _Stream(io.TextIOBase):
    """Forwards pytest's terminal output to the page as it is written."""

    def writable(self):
        return True

    def isatty(self):
        return False

    def write(self, s):
        if s and js is not None:
            js.stream(s)
        return len(s)


def run_tests():
    """python -m pytest -q on the repo's test_protocol.py."""
    import pytest

    stream = _Stream()
    start = time.perf_counter()
    with contextlib.redirect_stdout(stream), contextlib.redirect_stderr(stream):
        code = pytest.main(["-q", "-p", "no:cacheprovider", "test_protocol.py"])
    return dict(
        code=int(code),
        seconds=round(time.perf_counter() - start, 1),
        pytest=pytest.__version__,
        python=sys.version.split()[0],
    )


# ---------------------------------------------------------------------------


def dispatch(op, args_json="{}"):
    global _play
    a = json.loads(args_json or "{}")
    if op == "play.new":
        _play = Playground(**a)
        return json.dumps(_play.state())
    if op.startswith("play."):
        if _play is None:
            raise RuntimeError("no playground yet")
        if op == "play.send":
            _play.send(int(a["j"]))
        elif op == "play.deliver":
            _play.deliver(int(a["i"]))
        elif op == "play.deliver_by":
            _play.deliver_by(a["policy"])
        elif op == "play.step":
            _play.steps_until(int(a.get("k", 1)))
        elif op == "play.finish":
            _play.steps_until(500_000)
        elif op == "play.end":
            _play.end_run()
        elif op != "play.state":
            raise ValueError(op)
        return json.dumps(_play.state())
    if op == "compare":
        return json.dumps(compare(**a))
    if op == "ci.slice":
        return json.dumps(ci_slice())
    if op == "ci.full":
        return json.dumps(ci_full())
    if op == "ci.main":
        return json.dumps(run_main())
    if op == "ci.tests":
        return json.dumps(run_tests())
    if op == "info":
        return json.dumps(
            dict(
                python=sys.version.split()[0],
                schedules=SCHEDULES,
                deliveries=list(DELIVERY_POLICIES),
            )
        )
    raise ValueError(f"unknown op {op!r}")
