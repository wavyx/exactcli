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

`--jq` needs the jq binary. `npm install -g @wavyx/exactcli` may skip the download of
node-jq, so install jq (`brew install jq`, `apt install jq`,
`winget install jqlang.jq`) and set `JQ_PATH=/path/to/jq`, or run
`npm rebuild node-jq` inside a project install. Every other command works without jq.

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
exactcli api GET crm/Accounts --query '$top=1'
exactcli api POST crm/Accounts --body @account.json
```

Any resource from the
[REST API reference](https://start.exactonline.be/docs/HlpRestAPIResources.aspx) works
with `list`, `get` and `api`: pass the `service/Resource` path, for example
`salesentry/SalesEntries`, `financial/GLAccounts`, `documents/Documents`.

## Commands

| Topic            | Commands                                                                    |
| ---------------- | --------------------------------------------------------------------------- |
| auth             | `login`, `logout`, `status`                                                 |
| profile          | `list`, `use`, `current`                                                    |
| config           | `get`, `set`, `list`, `unset`                                               |
| division         | `list`, `use`, `current`                                                    |
| sales-entry      | `list`                                                                      |
| purchase-entry   | `list`                                                                      |
| transaction-line | `list`                                                                      |
| account          | `list`                                                                      |
| gl-account       | `list`                                                                      |
| document         | `list`, `download`                                                          |
| (root)           | `me`, `list`, `get`, `api`, `metadata`, `quota`, `mcp`, `doctor`, `version` |

Full reference with every flag: [docs/commands.md](docs/commands.md) or
`exactcli <command> --help`.

Global flags on every command: `--output table|json|yaml|csv`, `--jq <expr>`,
`--fields a,b`, `--profile <name>`, `--division <code>`, `--limit <n>`,
`--no-color`, `--verbose`, `--no-retry`, `--timeout <ms>`. Table output in a
terminal, JSON when piped.

## Catalogue and metadata

The CLI ships a catalogue of the 435 REST resources of Exact Online: path, methods,
fields, mandatory fields, filterable fields. It comes from the reference
documentation and is refreshed with `npm run catalog:build`; the date of the
catalogue is in the CHANGELOG.

```sh
exactcli metadata --search invoice          # which resources match a word
exactcli metadata salesentry/SalesEntries   # fields, types, mandatory, filterable
exactcli metadata crm/Accounts --methods    # summary: methods, keys, webhook
```

`list` and `get` read the catalogue too: a known resource gets readable default
columns (and a lighter `$select`), and the key type of `get` follows the
resource. A path that is not in the catalogue still goes out, with a warning.

## Typed commands

Typed commands add readable columns and filters that know the accounting fields:

```sh
exactcli transaction-line list --year 2026 --period 9 --gl-account 700000
exactcli transaction-line list --from 2026-01-01 --to 2026-01-31 --account 1001
exactcli account list --search acme --customer yes
exactcli gl-account list --type 12
exactcli document list --from 2026-01-01 --type 10
exactcli document download <document-id> --out ./attachments
exactcli sales-entry list --limit 200 --output json
```

`--account` takes a GUID or a code; a code is looked up on `crm/Accounts`. A free
`--filter` combines with the typed filters. Every typed command is a small
descriptor in `src/lib/typed/descriptors.js`; adding one is a matter of minutes.

## Writes

Writes are off by default. `create`, `update`, `delete` and `api POST|PUT|DELETE` need
`--allow-writes` (or `EXACTCLI_ALLOW_WRITES=1` in the shell), and a delete needs
`--yes` as well. Without the flag nothing is read and nothing is sent, exit 77.
`doctor` shows the state of the switch.

The generic write commands validate the body against the catalogue before they send
it: method allowed, mandatory fields present, no unknown field, no read-only field
on an update. `--dry-run` prints the validated request and sends nothing; it needs
no flag, so an agent can preview a write.

```sh
exactcli create crm/Accounts --set Name=Acme --set Code=1001 --dry-run
exactcli create crm/Accounts --set Name=Acme --set Code=1001 --allow-writes
exactcli create salesentry/SalesEntries --body @entry.json \
  --set Customer=@ref:crm/Accounts:1001 --allow-writes
exactcli update crm/Accounts <id> --set Name="Acme NV" --allow-writes
exactcli delete crm/Accounts <id> --allow-writes --yes
exactcli api DELETE "crm/Accounts(guid'<id>')" --allow-writes --yes   # raw, no validation
```

`--set Key=value` is repeatable and merges over `--body`. Values: text, numbers,
`true`, `false`, `null`; `@str:1001` pins a string; `@guid:<id>` pins a GUID;
`@ref:crm/Accounts:1001` resolves a code to the GUID of that record.

## Sync and bulk

Exact offers three read APIs per resource. The regular API pages at 60. The bulk
API (`list --bulk`) pages at 1000 and needs a `$select` (the catalogue columns by
default). The sync API returns only the records changed after a timestamp, 1000 per
page, and pairs with the deleted feed:

```sh
exactcli list crm/Accounts --bulk --all --output csv
exactcli sync crm/Accounts --since 0                     # full first load
exactcli sync crm/Accounts --state ./sync.json           # then only the changes
exactcli deleted --state ./sync.json                     # and the deletions
exactcli sync timestamp                                  # the server timestamps
```

`--state` remembers the last timestamp per resource and is written only after a
complete walk. The next timestamp also prints on stderr.

## Profiles and divisions

A profile holds the host (`start.exactonline.be` by default), the ngrok domain and the
default division. Several administrations, several accounts: one profile each.

```sh
exactcli profile use acme
exactcli auth login --profile acme
exactcli division use 123456                    # checks the access, then stores it
exactcli division current
exactcli list crm/Accounts --division 654321   # one-off override
```

Environment: `EXACTCLI_PROFILE`, `EXACTCLI_DIVISION`, `EXACTCLI_CLIENT_ID`,
`EXACTCLI_CLIENT_SECRET`, `EXACTCLI_CONFIG_DIR`, `EXACTCLI_ACCESS_TOKEN` (use a token
you obtained elsewhere; skips the keychain).

`exactcli` does not read `.env` files; export the variables in your shell.

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

- Self-describing: `exactcli --help`, `exactcli <command> --help`,
  `exactcli metadata <resource>`.
- Machine output: `--output json`, `--jq '.[] | .Name'`, `--fields`.
- Deterministic exit codes; a 77 means "run `exactcli auth login`" or "add
  `--allow-writes`".
- `exactcli doctor --output json` checks the setup before a run,
  `exactcli quota --output json` the budget.

### MCP server

`exactcli mcp` runs a Model Context Protocol server over stdio. It exposes six
generic tools that cover every resource of the catalogue (`exact_resources`,
`exact_metadata`, `exact_list`, `exact_get`, `exact_me`, `exact_quota`) plus one
tool per typed command (`exact_transaction_line_list`, `exact_account_list`, ...).
The server is read-only unless it starts with `--allow-writes`, which adds
`exact_write` (create, update, delete with `dry_run` and `confirm`). Each tool call
runs `exactcli` as a child process under the profile and the division of the
server.

```sh
claude mcp add exact -- exactcli mcp
claude mcp add exact -- exactcli mcp --division 123456
```

Or in `.mcp.json` or `claude_desktop_config.json`:

```json
{ "mcpServers": { "exact": { "command": "exactcli", "args": ["mcp"] } } }
```

## Security

- Client secret, access token and refresh token live only in the OS keychain.
- Every request is locked to your Exact Online host; redirects are refused.
- The raw `api` command cannot leave that host.
- Writes are off unless you add `--allow-writes`; a delete needs `--yes` as well.
  `create`, `update` and `delete` validate the body against the catalogue first.
- `--verbose` never prints credentials.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities as described in
[SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
