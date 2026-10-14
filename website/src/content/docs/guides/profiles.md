---
title: Profiles and divisions
description: Work with several administrations and accounts, and protect production.
---

A profile holds the host (`start.exactonline.be` by default), the ngrok domain and the
default division. Several administrations or several accounts: one profile each.

```sh
exactcli profile use acme
exactcli auth login --profile acme
exactcli division use 123456                    # checks the access, then stores it
exactcli division current
exactcli list crm/Accounts --division 654321    # one-off override
```

## Divisions

```sh
exactcli division list                  # accessible divisions of this license
exactcli division list --scope accessible   # of every license (accountants)
exactcli division list --scope all          # also divisions without access rights
exactcli division list --scope recent       # the five used last
```

Every typed list takes `--all-divisions`: one read per division you can access, each
row tagged with its `Division`.

## Protect a live administration

```sh
exactcli config set read_only true --profile prod            # no write at all
exactcli config set write_divisions 123456 --profile test    # writes reach 123456 only
```

`read_only` refuses every write of the profile. `write_divisions` takes a list of
division codes separated by commas: a write to another division stops with exit 77
before the request leaves. Both settings live in the profile and in the keychain
credential, and sign-in keeps the stricter of the two, so an edited config directory
cannot loosen them.

## Environment

`EXACTCLI_PROFILE`, `EXACTCLI_DIVISION`, `EXACTCLI_CLIENT_ID`, `EXACTCLI_CLIENT_SECRET`,
`EXACTCLI_CONFIG_DIR` and `EXACTCLI_ACCESS_TOKEN`. exactcli does not read `.env` files:
export the variables in your shell.
