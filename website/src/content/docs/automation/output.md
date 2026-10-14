---
title: Output and filtering
description: Formats, jq, fields and the global flags.
---

A table in a terminal, JSON when the output is piped. Global flags on every command:

| Flag                                                      | Effect                            |
| --------------------------------------------------------- | --------------------------------- |
| `--output table\|json\|yaml\|csv`                         | output format                     |
| `--jq <expr>`                                             | filter the JSON with jq           |
| `--fields a,b`                                            | show these fields only            |
| `--profile <name>`                                        | use this profile                  |
| `--division <code>`                                       | use this division for one command |
| `--limit <n>`                                             | stop after n records              |
| `--no-color`, `--verbose`, `--no-retry`, `--timeout <ms>` | display and transport             |

```sh
exactcli account list --search acme --output json --jq '.[] | .Name'
exactcli payables-list list --all --output csv > payables.csv
exactcli lookup crm/Accounts --match Code=1001 --one --jq .ID
```

## Aliases

```sh
exactcli alias set unpaid "receivable list --all"
exactcli unpaid --output csv
exactcli alias list
```
