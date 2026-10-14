---
title: CI pipelines
description: Run exactcli in a CI job with a token and JSON output.
---

A CI runner has no keychain and no browser. Pass an access token you obtained elsewhere
in `EXACTCLI_ACCESS_TOKEN`, and the division in `EXACTCLI_DIVISION`:

```yaml
- run: npm install -g @wavyx/exactcli
- run: exactcli receivables-list list --due-to 2026-09-30 --all --output csv > open.csv
  env:
    EXACTCLI_ACCESS_TOKEN: ${{ secrets.EXACT_ACCESS_TOKEN }}
    EXACTCLI_DIVISION: '123456'
```

An access token lives 10 minutes: mint it in the same job. A token from the environment
skips the keychain, so only the config settings of the profile protect the division; set
`EXACTCLI_ALLOW_WRITES` only in a job that must write.

Check the exit code, not the output: 0 is success, and every failure has its own code
(see [Exit codes](/exactcli/automation/exit-codes/)).
