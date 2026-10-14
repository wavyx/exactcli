---
title: AI agents and MCP
description: Use exactcli from Claude and other agents, through the CLI or the MCP server.
---

## From the command line

- Self-describing: `exactcli --help`, `exactcli <command> --help`,
  `exactcli metadata <resource>`.
- Machine output: `--output json`, `--jq`, `--fields`.
- Deterministic exit codes: a 77 means "sign in" or "add `--allow-writes`".
- `exactcli doctor --output json` checks the setup, `exactcli quota --output json` the
  budget.
- `--dry-run` previews any write without a flag.

## MCP server

`exactcli mcp` runs a Model Context Protocol server over stdio. It exposes seven generic
tools that cover every resource of the catalogue (`exact_resources`, `exact_metadata`,
`exact_list`, `exact_get`, `exact_probe`, `exact_me`, `exact_quota`) plus one tool per
typed list.

```sh
claude mcp add exact -- exactcli mcp
claude mcp add exact -- exactcli mcp --division 123456
```

Or in `.mcp.json` or `claude_desktop_config.json`:

```json
{ "mcpServers": { "exact": { "command": "exactcli", "args": ["mcp"] } } }
```

The server is read-only unless it starts with `--allow-writes`, which adds `exact_write`
(create, update and delete, with `dry_run` and `confirm`). Each tool call runs exactcli
under the profile and the division of the server, so the profile guards still apply.

Two resources carry the docs an agent should read first: `exactcli://docs/recipes` (the
verified flows) and `exactcli://docs/coverage` (which calls have a typed command, which
writes were verified live).
