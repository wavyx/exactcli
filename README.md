# exactcli

[![npm](https://img.shields.io/npm/v/@wavyx/exactcli)](https://www.npmjs.com/package/@wavyx/exactcli)
[![CI](https://github.com/wavyx/exactcli/actions/workflows/ci.yml/badge.svg)](https://github.com/wavyx/exactcli/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@wavyx/exactcli)](LICENSE)

Command-line interface for the [Exact Online](https://www.exact.com/) REST API.

`exactcli` gives you raw, host-locked access to every Exact Online resource with OData
filters and paging, plus typed commands for the accounting ledgers. JSON output,
deterministic exit codes and a `--jq` filter make it a clean way to drive Exact Online
from scripts, CI pipelines and AI agents.

Not affiliated with Exact. Exact Online is a trademark of Exact Group B.V.

## Install

```sh
npm install -g @wavyx/exactcli
exactcli --help
```

Node.js 20 or newer. Tokens go to the OS keychain (macOS Keychain, Windows Credential
Manager, libsecret on Linux); `exactcli` refuses to write them to disk.

## Authenticate

Exact Online supports the OAuth 2.0 authorization code flow only, and it requires a
public HTTPS redirect URI (localhost is rejected). `exactcli` runs a local callback
server and exposes it through an [ngrok](https://ngrok.com/) static domain.

1. Claim a static domain in your ngrok account and install `ngrok`.
2. Run `exactcli auth login`. The command prints the redirect URI,
   `https://<your-domain>/callback`.
3. In Exact Online, register an app: Company name > Import/Export > App registrations.
   Use the printed redirect URI. Copy the Client ID and the Client Secret.
4. Run `exactcli auth login` again, paste the Client ID and the Client Secret, and sign
   in in the browser that opens. The command stores the tokens in the keychain and
   remembers your division.

No ngrok? Use `exactcli auth login --manual`: open the printed URL yourself and paste
the redirected URL (or the code) back into the terminal.

Tokens refresh automatically. A refresh token that stays unused for 30 days expires:
run any command at least once a month, or log in again.

```sh
exactcli auth status         # token age, division, identity
exactcli auth logout
```

## Quick start

```sh
exactcli me                                      # who am I, which division
exactcli division list                           # administrations you can reach
exactcli list crm/Accounts --top 5 --select Name
exactcli list financial/GLAccounts --all --output json
exactcli get crm/Accounts <guid> --expand BankAccounts
exactcli sales-entry list --filter "EntryDate ge datetime'2026-01-01'" --all
exactcli purchase-entry list --limit 50 --output csv
exactcli api GET /api/v1/current/Me
exactcli api GET "crm/Accounts?\$top=1"
exactcli api POST crm/Accounts --body @account.json
```

Any resource from the
[REST API reference](https://start.exactonline.be/docs/HlpRestAPIResources.aspx) works
with `list`, `get` and `api`: pass the `service/Resource` path, for example
`salesentry/SalesEntries`, `financial/GLAccounts`, `documents/Documents`.

## Commands

| Topic          | Commands                                        |
| -------------- | ----------------------------------------------- |
| auth           | `login`, `logout`, `status`                     |
| profile        | `list`, `use`, `current`                        |
| config         | `get`, `set`, `list`, `unset`                   |
| division       | `list`                                          |
| sales-entry    | `list`                                          |
| purchase-entry | `list`                                          |
| (root)         | `me`, `list`, `get`, `api`, `doctor`, `version` |

Full reference with every flag: [docs/commands.md](docs/commands.md) or
`exactcli <command> --help`.

Global flags on every command: `--output table|json|yaml|csv`, `--jq <expr>`,
`--fields a,b`, `--profile <name>`, `--division <code>`, `--limit <n>`,
`--no-color`, `--verbose`, `--no-retry`, `--timeout <ms>`. Table output in a
terminal, JSON when piped.

## Profiles and divisions

A profile holds the host (`start.exactonline.be` by default), the ngrok domain and the
default division. Several administrations, several accounts: one profile each.

```sh
exactcli profile use acme
exactcli auth login --profile acme
exactcli config set division 123456
exactcli list crm/Accounts --division 654321   # one-off override
```

Environment: `EXACTCLI_PROFILE`, `EXACTCLI_DIVISION`, `EXACTCLI_CLIENT_ID`,
`EXACTCLI_CLIENT_SECRET`, `EXACTCLI_CONFIG_DIR`, `EXACTCLI_ACCESS_TOKEN` (use a token
you obtained elsewhere; skips the keychain).

## Output and exit codes

Dates arrive from Exact as `/Date(ms)/` in CET wall-clock time. `list`, `get` and the
typed commands print them as `2026-01-31T14:05:00`; `--raw` keeps the API envelope
untouched. `api` always prints the raw envelope.

Exit codes follow sysexits: 0 ok, 64 usage, 65 data (400/422), 69 service unavailable
(5xx, network, missing jq), 70 internal, 75 rate limit, 77 authentication (401/403, not
logged in), 78 configuration (keychain, host, missing division). In JSON mode errors
go to stderr as `{ "error", "message", "exitCode" }`.

Rate limits: Exact allows 60 calls per minute and 5000 per day per administration.
`exactcli` waits for the minute window, never retries a client error, and calls the API
sequentially.

## For agents

- Self-describing: `exactcli --help`, `exactcli <command> --help`.
- Machine output: `--output json`, `--jq '.[] | .Name'`, `--fields`.
- Deterministic exit codes; a 77 means "run `exactcli auth login`".
- `exactcli doctor --output json` checks the setup before a run.

## Security

- Client secret, access token and refresh token live only in the OS keychain.
- Every request is locked to your Exact Online host; redirects are refused.
- The raw `api` command cannot leave that host.
- `--verbose` never prints credentials.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities as described in
[SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
