"""Stand-in for httpx, written for the in-browser demo (not part of ephys-mcp).

server.py and sources/dandi.py import httpx for the DANDI Archive source. This page makes no
network requests from Python, so any attempt to build a client fails with HTTPError, which the
server already reports as a readable "DANDI Archive request failed" tool error.
"""


class HTTPError(Exception):
    pass


class Client:
    def __init__(self, *_, **__):
        raise HTTPError("network access is switched off in the browser demo")
