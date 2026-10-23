"""Glue between the demo page and the repo's hawk_crypto package.

Written for this page; it is not part of the repository. It stands in for app.py,
the repo's Flask server, which cannot run in a browser: the same conversions app.py
does around each call (base64 in and out, messages as UTF-8 bytes read with
np.frombuffer(..., dtype=np.uint8)), but calling hawkkeygen, hawksign and hawkverify
directly. Times cover the library call only, measured with time.perf_counter().

One deliberate difference from app.py: app.py folds any exception raised by
hawkverify into "invalid". Here an exception is reported as an exception, so the
page can show that malformed input is rejected by the code itself (the decoder fixes
in hawk_crypto/PATCHES.md), not by a try/except around it.
"""

import base64
import os
import time

import numpy as np

from hawk_crypto import hawkkeygen, hawksign, hawkverify
from hawk_crypto.params import PARAMS

# Same limit as app.py's MAX_MESSAGE_BYTES.
MAX_MESSAGE_BYTES = 4096


def b64enc(arr):
    return base64.b64encode(arr.tobytes()).decode()


def b64dec(s):
    return np.frombuffer(base64.b64decode(s, validate=True), dtype=np.uint8)


def message_bytes(message):
    raw = message.encode("utf-8")
    if len(raw) > MAX_MESSAGE_BYTES:
        raise ValueError(f"message must be at most {MAX_MESSAGE_BYTES} bytes")
    return np.frombuffer(raw, dtype=np.uint8)


def spec_sizes(logn):
    """Encoded lengths from the v1.1 parameter table in hawk_crypto/params.py."""
    return {
        "priv": PARAMS(logn, "lenpriv"),
        "pub": PARAMS(logn, "lenpub"),
        "sig": PARAMS(logn, "lensig"),
    }


def _ms(t0):
    return (time.perf_counter() - t0) * 1000.0


def keygen(logn):
    t0 = time.perf_counter()
    priv, pub = hawkkeygen(logn)
    ms = _ms(t0)
    return {"priv": b64enc(priv), "pub": b64enc(pub), "priv_len": len(priv), "pub_len": len(pub), "ms": ms}


def sign(logn, priv_b64, message):
    priv = b64dec(priv_b64)
    msg = message_bytes(message)
    t0 = time.perf_counter()
    sig = hawksign(logn, priv, msg)
    ms = _ms(t0)
    return {"sig": b64enc(sig), "sig_len": len(sig), "msg_len": int(msg.size), "ms": ms}


def verify(logn, pub_b64, message, sig_b64):
    pub = b64dec(pub_b64)
    sig = b64dec(sig_b64)
    msg = message_bytes(message)
    t0 = time.perf_counter()
    try:
        result = hawkverify(logn, pub, msg, sig)
        raised = None
    except Exception as exc:  # reported, not hidden
        result = None
        raised = f"{type(exc).__name__}: {exc}"
    ms = _ms(t0)
    return {"valid": result is True, "returned": repr(result), "raised": raised, "ms": ms}


def garbage(logn, pub_b64, message, count):
    """hawkverify on `count` random byte strings of the signature length (os.urandom),
    like tests/test_hawk.py::test_random_signatures_rejected_without_raising."""
    pub = b64dec(pub_b64)
    msg = message_bytes(message)
    siglen = PARAMS(logn, "lensig")
    tally = {"false": 0, "true": 0, "raised": 0}
    first_error = None
    t0 = time.perf_counter()
    for _ in range(count):
        sig = np.frombuffer(os.urandom(siglen), dtype=np.uint8)
        try:
            r = hawkverify(logn, pub, msg, sig)
        except Exception as exc:
            tally["raised"] += 1
            first_error = first_error or f"{type(exc).__name__}: {exc}"
            continue
        tally["true" if r is True else "false"] += 1
    ms = _ms(t0)
    return {"count": count, "siglen": siglen, **tally, "first_error": first_error, "ms": ms}


def run_tests():
    """Run the repo's tests/test_hawk.py with pytest; output streams to stdout."""
    import pytest

    os.chdir("/home/pyodide")
    t0 = time.perf_counter()
    code = pytest.main(["-v", "-p", "no:cacheprovider", "--color=no", "--capture=sys", "tests/test_hawk.py"])
    return {"exit_code": int(code), "ms": _ms(t0)}
