"""Demo shim, not PySpark. Spark does not run in a browser.

autoddg/profile.py imports pyspark at module top and uses it only inside the Spark
functions. These placeholders let it import, so profile_pandas.py can use its shared
helpers (type inference, semantic types, quality flags, _build_columns). Any call into
Spark would fail, and the demo makes none.
"""
