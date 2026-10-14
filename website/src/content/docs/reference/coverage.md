---
title: API coverage
description: Which Exact Online calls have a typed command, and which writes were verified live.
---

Every call of the catalogue is reachable through a generic command: `list` and `get`,
`create`, `update`, `delete`, `sync`, `list --bulk` and the raw `api` command. The
generic writes validate the body against the catalogue.

The full table, with every write call, its typed command and whether it was verified on
a live administration, is generated with each release:
[docs/coverage.md on GitHub](https://github.com/wavyx/exactcli/blob/main/docs/coverage.md).
