# Changes to the vendored hawk-py code

This directory is a vendored copy of [hawk-sign/hawk-py](https://github.com/hawk-sign/hawk-py)
(MIT), the Python implementation that accompanies the Hawk v1.1 specification. It is kept
verbatim apart from the changes listed here, so that the code can be diffed against upstream.

Everything below is a correctness or packaging fix. No parameter, algorithm, or encoding was
altered.

## 1. NumPy 2 integer promotion (`codec.py`)

Under NumPy ≥ 2 ([NEP 50](https://numpy.org/neps/nep-0050-scalar-promotion.html)) a Python
int combined with a NumPy scalar no longer widens the result — the NumPy dtype wins. Both
sites below received `uint8` values read out of a bit array from `np.unpackbits`, which made
the whole computation `uint8`.

- `decodeint` accumulated `c += x[...]`, so `c` became a `uint8` after the first term.
  `decompressgr` then computed `x[i] + z * 2**low`, which raised
  `OverflowError: Python integer 256 out of bounds for uint8` and made **every verification
  fail** on NumPy 2. Fixed by casting the bit to `int` before accumulating.
- `decompressgr`'s sign-bit application `x[i] - y[i] * (2 * x[i] + 1)` overflowed `uint8`
  and emitted `RuntimeWarning: overflow encountered in scalar subtract`. Fixed with
  `int(y[i])`.

On NumPy 1.x the first issue wrapped silently rather than raising, so the original code only
worked by accident there.

## 2. Bounds check in `decompressgr` (`codec.py`)

The Golomb–Rice unary-decoding loop read:

```python
if j >= len(y) and z >= 2 ** (high - low):
    return None
```

Algorithm 7 of the specification, and the comment directly above the code, both say **or**.
With `and`, a bit sequence that runs out before the terminating `1` bit falls through to
`t = y[j]` and raises `IndexError`. Random 249-byte inputs hit this reliably. Changed to
`or`, so malformed input is rejected as `⊥` (returned as `None`) the way the spec requires.
Covered by `tests/test_hawk.py::test_random_signatures_rejected_without_raising`.

## 3. Length check in `decode_public` (`codec.py`)

```python
if len(y) * 8 < j + v:   # was
if len(y) < j + v:       # now
```

`y` is already a bit array (`np.unpackbits` output), so multiplying by 8 again compared bits
against eight times the bit length and the check could never fire. Algorithm 9 specifies
`len_bits(y) < j + v`. Valid keys are unaffected — the condition is slack for them — but
truncated keys were silently decoded instead of rejected.

## 4. `rebuilds0` signalled failure with the wrong sentinel (`verify.py`)

`hawkverify_unpacked` checks its result with `if w0 is None`, but `rebuilds0` returned
`False` on all three of its reject paths. The check never fired, so a failed reconstruction
fell through into `polyQnorm`, which iterates its polynomial arguments:

```
TypeError: 'bool' object is not iterable
```

Changed the three paths to `return None`, matching Algorithm 18's bottom and every other
bottom-returning function in the package (`decode_sign`, `decode_public`, `decompressgr`).
Returning `None` is also the only option that works here: the success value is a NumPy
array, so a truthiness check would raise "truth value of an array is ambiguous".

Reachable whenever a well-formed signature and public key decode successfully but s0
reconstruction fails. `app.py` caught this at the API boundary; a library caller did not.
Covered by `tests/test_hawk.py::test_rebuilds0_returns_none_on_failure`.

## 5. `encode_public` returned a tuple on one bottom path (`codec.py`)

Three of its four failure paths `return None`; the `q00[0]` out-of-int16-range path returned
the tuple `(None, False)`. `hawkkeygen_unpacked` checks `if pub is None` to decide whether to
restart, so the tuple slipped past and reached `pub.tobytes()`:

```
AttributeError: 'tuple' object has no attribute 'tobytes'
```

Changed to `return None`. In practice `q00[0] = ||f||² + ||g||²` stays well inside int16 for
the specified parameters, so this is a defensive path rather than one reachable through
normal key generation — but it crashed instead of restarting, which is what Algorithm 8
specifies. Covered by `tests/test_hawk.py::test_encode_public_returns_none_on_failure`.

## 6. Modular exponentiation in `get_roots` (`poly.py`)

```python
g0 = (g0**b) % p      # was
g0 = pow(g0, b, p)    # now
```

Same value, but the original built the exact integer power before reducing it. `get_roots`
is called with the two ~2^31 verification primes, where `b = (p−1)/2n` is in the millions —
so `g0**b` materialises a number of roughly 130 million bits for Hawk-256 before a single
modular reduction throws almost all of it away.

This dominated verification and made it scale backwards, since a larger n means a smaller
exponent:

| median of 5 | Hawk-256 | Hawk-512 | Hawk-1024 |
|---|---|---|---|
| verify, before | 6.04s | 2.09s | 0.76s |
| verify, after | **0.02s** | **0.04s** | **0.08s** |
| keygen, before | 2.11s | 1.44s | 4.44s |
| keygen, after | **0.09s** | **0.74s** | **4.27s** |

Verification is ~300x faster at Hawk-256 and now scales with n the way it should. Key
generation is affected too, since it tests `q00` for invertibility modulo the same two
primes; Hawk-1024 barely moves because its cost is dominated by `ntru_solve`. The test suite
went from 30s to 2s.

Outputs are bit-identical: `pow(g0, b, p) == (g0 ** b) % p` was checked for every (prime, n)
pair the code actually uses.

## 7. Package imports

Upstream uses top-level absolute imports (`from poly import ...`) that only resolve when the
package directory itself is on `sys.path`, which is why the original `app.py` did a
`sys.path.insert`. Converted to explicit relative imports (`from .poly import ...`) so
`hawk_crypto` is importable as an ordinary package from the repository root.

Consequent changes:

- `keygen.py`: `import ntrugen` + `ntrugen.fft.inv_fft(...)` relied on `ntrugen.fft` having
  been registered as a side effect of another module's import. Replaced with a direct
  `from .ntrugen.fft import inv_fft`.
- `__init__.py` re-exports `hawkkeygen`, `hawksign`, `hawkverify`.
- Removed two unused imports: `sympy.ntheory.npartitions` in `verify.py` and `random` in
  `ntrugen/ntrugen_hawk.py`.

## Known upstream limitations, left as-is

Deliberately not changed, to keep this copy diffable against upstream:

- The Python implementation uses floating-point arithmetic in key generation and is, in
  upstream's words, "not compliant with the reference implementation / specifications." The
  C reference implementation is the normative one.
- Nothing here is constant-time. The whole point of Hawk's design was isochronous execution;
  this code does not deliver it and is not meant to.
- `hawkkeygen_unpacked` restarts by calling itself recursively rather than looping, so each
  rejected candidate costs a stack frame. Restarts are rare enough that the 1000-frame
  default limit is never approached in practice.
- Dead code inherited from the Falcon codebase `ntrugen` was adapted from: `common.sqnorm`,
  `ntrugen_hawk.isInvertible2`, `poly.poly_mul_schoolbook`, and the scalar helpers
  `add`/`sub`/`mul`/`div`/`adj` plus `sub_fft` in `ntrugen/fft.py`. `poly_mul_schoolbook` is
  worth keeping as a naive counterpart to the NTT multiply.
- `ntrugen/common.py` defines `q = 12289`, Falcon's modulus, which Hawk does not use — Hawk
  solves `fG - gF = 1` and `ntrugen_hawk.py` sets `q = 1`. A comment now marks it, since
  finding the wrong `q` in a Hawk codebase is more confusing than finding none.
