---
title: Sync, backup and webhooks
description: Read the changes since a timestamp, back up a division, and listen to events.
---

## Three read APIs

The regular API pages at 60. The bulk API (`list --bulk`) pages at 1000. The sync API
returns only the records changed after a timestamp, 1000 per page, and pairs with the
deleted feed.

```sh
exactcli list crm/Accounts --bulk --all --output csv
exactcli sync crm/Accounts --since 0                     # full first load
exactcli sync crm/Accounts --state ./sync.json           # then only the changes
exactcli deleted --state ./sync.json                     # and the deletions
exactcli sync timestamp --endpoint Accounts --modified 2026-01-01
```

## Backup

`backup` copies a division to a directory: one JSON file per sync feed, merged by `ID`,
and a `manifest.json` with the timestamps. The next run reads only the changes, then
removes the records of the deleted log.

```sh
exactcli backup --list
exactcli backup --dir ./backup-acme
exactcli backup --dir ./backup-acme --feed Financial/TransactionLines --feed CRM/Accounts
```

- A feed of a module the division lacks answers 403 and is marked `forbidden`.
- A feed cut by `--max-pages` is `partial` and goes on at the next run.
- Any other failure marks the feed `failed`, and the run exits 65 at the end.
- Exact keeps deletions for two months. After a longer pause the run warns until a
  `--full` run over every feed reads everything again.

## Webhooks

`webhook listen` subscribes to topics through the ngrok domain of the profile, checks the
HMAC-SHA256 signature of each notification with the webhook secret of the app, prints
each verified one as a JSON line, and removes its subscriptions when it stops.

Use the webhook secret of the app the profile signs in with. Exact signs each
notification with the app named in `Content.ClientId`, and a refused notification names
that app.

```sh
export EXACTCLI_WEBHOOK_SECRET=...     # or type it at the prompt
exactcli webhook listen --topic Accounts --topic SalesInvoices --allow-writes
exactcli webhook list
```
