"""Stand-in for the `mcp` SDK, written for the in-browser demo (not part of ephys-mcp).

The real server registers its tools with mcp.server.mcpserver.MCPServer and talks JSON-RPC over
stdio or HTTP. A browser page has no MCP client, so this package keeps only what server.py needs
at import time: decorators that record the tool and hand back the function unchanged, an Image
holder and ToolError. The demo page calls the tool functions directly.
"""
