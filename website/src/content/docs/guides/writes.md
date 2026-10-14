---
title: Safe writes
description: The write gate, catalogue validation, dry runs and the guards of a profile.
---

Writes are off by default. Four checks run before a request leaves your machine, and a
refused write costs no API call at all.

1. **Validation.** The body is checked against the catalogue: method allowed, mandatory
   fields present, no unknown field, no read-only field on an update. Exit 64 otherwise.
2. **The write gate.** `--allow-writes` (or `EXACTCLI_ALLOW_WRITES=1` in the shell), and
   `--yes` for a delete. Exit 77 otherwise.
3. **The division guard.** A read-only profile refuses every write; `write_divisions`
   limits writes to a list of divisions, also for raw `api` calls and MCP tools.
4. **Sent once.** A POST or a DELETE is never repeated after a network failure or a
   5xx: the write may have landed, so exactcli exits 69 and says so.

## Preview

`--dry-run` prints the validated request and sends nothing. It needs no flag, so an
agent can preview a write.

```sh
exactcli create crm/Accounts --set Name=Acme --set Code=1001 --dry-run
exactcli create crm/Accounts --set Name=Acme --set Code=1001 --allow-writes
exactcli update crm/Accounts <id> --set Name="Acme NV" --allow-writes
exactcli delete crm/Accounts <id> --allow-writes --yes
```

## Field values

`--set Key=value` is repeatable and merges over `--body` (a JSON string, `@file` or
piped stdin). Values: text, numbers, `true`, `false`, `null`; `@str:1001` pins a string;
`@guid:<id>` pins a GUID; `@ref:crm/Accounts:1001` resolves a code to the GUID of that
record.

## Create or update by key

```sh
exactcli upsert crm/Accounts --match Code=1001 --set Name="Acme NV" --allow-writes
```

`upsert` creates the record that `--match` finds nothing for, or updates the one it
finds; the match fields stay out of the update. Several matches exit 65.

## Aliases that write

An alias that stores `--allow-writes` or `--yes` writes without them on the command
line, and `alias set` warns about it. The profile guards still apply.
