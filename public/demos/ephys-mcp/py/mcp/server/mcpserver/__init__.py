"""Minimal MCPServer stand-in: records registrations, adds no behaviour. Demo glue, not ephys-mcp."""

from __future__ import annotations


class Image:
    """Holds what server.py passes; the real SDK would read the file and send it as image content."""

    def __init__(self, path=None, data=None, format=None):
        self.path, self.data, self.format = path, data, format


class MCPServer:
    def __init__(self, name: str, instructions: str = "", **_):
        self.name, self.instructions = name, instructions
        self.tools: dict[str, dict] = {}
        self.resources: dict[str, object] = {}
        self.prompts: dict[str, object] = {}

    def tool(self, name: str | None = None, **options):
        def register(fn):
            self.tools[name or fn.__name__] = {"fn": fn, "options": options}
            return fn

        return register

    def resource(self, uri: str, **_):
        def register(fn):
            self.resources[uri] = fn
            return fn

        return register

    def prompt(self, name: str | None = None, **_):
        def register(fn):
            self.prompts[name or fn.__name__] = fn
            return fn

        return register

    def run(self, *_, **__):
        raise RuntimeError("no MCP transport in the browser demo")
