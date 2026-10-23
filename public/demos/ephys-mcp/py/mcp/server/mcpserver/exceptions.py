"""ToolError stand-in. Demo glue, not ephys-mcp."""


class ToolError(Exception):
    """Raised by a tool for a failure the model should read; the real SDK returns it as isError."""
