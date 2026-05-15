# @orchestra/mcp-client

MCP (Model Context Protocol) server lifecycle manager for Orchestra IDE. Provides:

- **MCPManager** — start/stop/restart servers, list tools, call tools
- **Config schema** — Zod-validated `.orchestra/mcp.json` format
- **Hot-reload** — `watchConfig()` monitors config file and triggers reload callbacks

## Status

**pre-alpha** — Sprint 0 scaffold. Stubs only; real `@modelcontextprotocol/sdk` transport wiring lands in Sprint 1.

## Config format (`.orchestra/mcp.json`)

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "transport": "stdio",
      "enabled": true
    }
  }
}
```

## Development

```bash
pnpm build        # tsup ESM bundle + .d.ts
pnpm dev          # watch mode
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
```
