"""Reference implementation of the HAWK signature scheme (vendored from hawk-sign/hawk-py).

HAWK was withdrawn from NIST standardisation on 29 July 2026 after a practical
key-recovery attack. This package exists for study only -- see ../docs/security-status.md.
"""

from .keygen import hawkkeygen
from .sign import hawksign
from .verify import hawkverify

__all__ = ["hawkkeygen", "hawksign", "hawkverify"]
