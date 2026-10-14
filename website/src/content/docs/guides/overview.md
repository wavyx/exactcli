---
title: Overview
description: What exactcli is, who it serves, and how its commands are organised.
---

exactcli is a command-line interface for the [Exact Online](https://www.exact.com/) REST
API. It gives raw, host-locked access to every resource of the API, with OData filters
and paging, plus typed commands for the work of a bookkeeper: entries, invoices, orders,
master data, payments and collections.

exactcli is not affiliated with Exact. Exact Online is a trademark of Exact Group B.V.

## Three ways to reach the API

- **Typed commands** know the accounting fields. They take codes instead of GUIDs, show
  readable columns and validate what they send. Example:
  `exactcli sales-entry create --customer 1001 --journal 700 --line 700000:1350:Consulting`.
- **Generic commands** reach any resource of the built-in catalogue: `list`, `get`,
  `create`, `update`, `delete`, `lookup`, `upsert`, `sync` and `backup`. The writes are
  validated against the catalogue too.
- **The raw `api` command** sends any request to your Exact Online host and prints the
  answer as it came.

## Built for scripts and agents

- JSON when the output is piped, a table in a terminal, and `--output yaml|csv`.
- A `--jq` filter on every command.
- Exit codes a script can trust: 64 usage, 65 data, 69 unavailable, 75 rate limit, 77
  authentication or a closed write gate, 78 configuration.
- An MCP server (`exactcli mcp`) that exposes the reads as tools for Claude and other
  agents, read-only by default.

## Safe by default

Nothing is written without `--allow-writes`, and a delete also needs `--yes`. A profile
can be read-only, or allowed to write to a list of divisions only. Read
[Safe writes](/exactcli/guides/writes/) before you write to a live administration.

## Next steps

1. [Install exactcli](/exactcli/guides/installation/).
2. [Sign in to Exact Online](/exactcli/guides/authentication/).
3. [Choose a profile and a division](/exactcli/guides/profiles/).
