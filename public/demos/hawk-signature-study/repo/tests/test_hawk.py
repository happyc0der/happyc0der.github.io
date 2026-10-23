"""Round-trip and malformed-input tests for the vendored Hawk implementation.

Run with `pytest` from the repository root, or directly with `python tests/test_hawk.py`.
Hawk-256 and Hawk-512 run by default (~2s); Hawk-1024 key generation is the one slow
operation, so it is only exercised when HAWK_TEST_SLOW=1 is set (~7s total).
"""

import os
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hawk_crypto import hawkkeygen, hawksign, hawkverify  # noqa: E402
from hawk_crypto.params import PARAMS  # noqa: E402

FAST_VARIANTS = [8, 9]
ALL_VARIANTS = FAST_VARIANTS + ([10] if os.environ.get("HAWK_TEST_SLOW") == "1" else [])

MESSAGE = np.frombuffer(b"Post-Quantum Cryptography, Spring 2026", dtype=np.uint8)


@pytest.fixture(scope="module")
def keypairs():
    """One key pair per tested variant, generated once (keygen is the slow step)."""
    return {logn: hawkkeygen(logn) for logn in ALL_VARIANTS}


@pytest.mark.parametrize("logn", ALL_VARIANTS)
def test_sign_verify_roundtrip(keypairs, logn):
    priv, pub = keypairs[logn]
    sig = hawksign(logn, priv, MESSAGE)
    assert hawkverify(logn, pub, MESSAGE, sig) is True


@pytest.mark.parametrize("logn", ALL_VARIANTS)
def test_encoded_lengths_match_spec(keypairs, logn):
    """Encoded sizes must match the v1.1 specification's parameter table."""
    priv, pub = keypairs[logn]
    sig = hawksign(logn, priv, MESSAGE)
    assert len(priv) == PARAMS(logn, "lenpriv")
    assert len(pub) == PARAMS(logn, "lenpub")
    assert len(sig) == PARAMS(logn, "lensig")


@pytest.mark.parametrize("logn", FAST_VARIANTS)
def test_tampered_message_rejected(keypairs, logn):
    priv, pub = keypairs[logn]
    sig = hawksign(logn, priv, MESSAGE)
    tampered = MESSAGE.copy()
    tampered[0] ^= 0x01
    assert hawkverify(logn, pub, tampered, sig) is False


@pytest.mark.parametrize("logn", FAST_VARIANTS)
def test_wrong_public_key_rejected(keypairs, logn):
    priv, _ = keypairs[logn]
    _, other_pub = hawkkeygen(logn)
    sig = hawksign(logn, priv, MESSAGE)
    assert hawkverify(logn, other_pub, MESSAGE, sig) is False


@pytest.mark.parametrize("logn", FAST_VARIANTS)
def test_corrupted_signature_rejected(keypairs, logn):
    priv, pub = keypairs[logn]
    sig = hawksign(logn, priv, MESSAGE)
    corrupted = sig.copy()
    corrupted[-1] ^= 0xFF
    assert hawkverify(logn, pub, MESSAGE, corrupted) is False


@pytest.mark.parametrize("logn", FAST_VARIANTS)
def test_truncated_signature_rejected(keypairs, logn):
    priv, pub = keypairs[logn]
    sig = hawksign(logn, priv, MESSAGE)
    assert hawkverify(logn, pub, MESSAGE, sig[:-1]) is False


def test_random_signatures_rejected_without_raising(keypairs):
    """Decoding garbage must return False, not raise.

    The Golomb-Rice decoder used to read past the end of the bit array on random
    input; see hawk_crypto/PATCHES.md.
    """
    logn = 8
    _, pub = keypairs[logn]
    rng = np.random.default_rng(20260608)
    siglen = PARAMS(logn, "lensig")
    for _ in range(64):
        garbage = rng.integers(0, 256, siglen, dtype=np.uint8)
        assert hawkverify(logn, pub, MESSAGE, garbage) is False


def test_random_public_keys_rejected_without_raising(keypairs):
    logn = 8
    priv, _ = keypairs[logn]
    sig = hawksign(logn, priv, MESSAGE)
    rng = np.random.default_rng(20260609)
    publen = PARAMS(logn, "lenpub")
    for _ in range(32):
        garbage = rng.integers(0, 256, publen, dtype=np.uint8)
        assert hawkverify(logn, pub=garbage, msg=MESSAGE, sig=sig) is False


# --- bottom-sentinel regressions -------------------------------------------------
#
# Several vendored functions signal failure ("bottom" in the specification) while
# their callers test `is None`. Where the sentinel disagreed, the failure path fell
# through into code that assumed success. See hawk_crypto/PATCHES.md.


def test_rebuilds0_returns_none_on_failure(keypairs):
    """rebuilds0's caller checks `w0 is None`; returning False raised TypeError."""
    from hawk_crypto.codec import decode_public
    from hawk_crypto.verify import hawkverify_unpacked, rebuilds0

    logn = 8
    n = 1 << logn
    _, pub = keypairs[logn]
    q00, q01 = decode_public(logn, pub)

    bad_q00 = np.array(q00, dtype=np.int16).copy()
    bad_q00[0] = -1  # q00[0] < 0 is one of rebuilds0's reject conditions

    h0 = [0] * n
    h1 = [0] * n
    h1[0] = 1  # non-zero leading coefficient so symbreak(w1) passes
    s1 = np.zeros(n, dtype=np.int16)

    # hawkverify_unpacked computes w1 = h1 - 2*s1, which equals h1 for s1 = 0,
    # so passing h1 as rebuilds0's w1 matches what the caller would hand it.
    assert rebuilds0(logn, bad_q00, q01, h1, h0) is None
    assert hawkverify_unpacked(logn, s1, bad_q00, q01, h0, h1) is False


def test_encode_public_returns_none_on_failure():
    """encode_public returned the tuple (None, False) on one path; keygen checks `is None`."""
    from hawk_crypto.codec import encode_public

    logn, n = 8, 256
    q00 = np.zeros(n, dtype=np.int64)
    q00[0] = 2**15  # out of int16 range -> bottom
    q01 = np.zeros(n, dtype=np.int16)

    assert encode_public(logn, q00, q01) is None


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
