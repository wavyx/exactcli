---
title: Exit codes
description: The sysexits codes exactcli returns, and what to do about each.
---

| Code | Meaning                                                                       | What to do                                                       |
| ---- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 0    | OK                                                                            | -                                                                |
| 64   | Usage: a bad flag, value or body                                              | fix the command; `--help` shows the flags                        |
| 65   | Data: Exact refused the content (400, 422), or a lookup found none or several | read the message                                                 |
| 69   | Unavailable: a 5xx, a network failure, missing jq                             | retry a read; check a write before you send it again             |
| 70   | Internal error                                                                | report it                                                        |
| 75   | Rate limit, or a timeout of a wait                                            | wait for the reset                                               |
| 77   | Authentication, or a closed write gate                                        | run `exactcli auth login`, or add `--allow-writes` (and `--yes`) |
| 78   | Configuration: keychain, host, missing division                               | run `exactcli doctor`                                            |

In JSON mode errors go to stderr as `{ "error", "message", "exitCode" }`.

## Rate limits

Exact allows 60 calls per minute and 5000 per day per administration. exactcli waits
for the minute window, calls the API one call at a time, and never retries a client
error. It repeats a GET or a PUT after a network failure or a 5xx, never a POST or a
DELETE. `exactcli quota` shows the budget.
