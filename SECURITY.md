# Security policy

## Report a vulnerability

Use the private "Report a vulnerability" form in the Security tab of the GitHub
repository. Include the version, the command and flags, what you expected and what
happened. Do not open a public issue for a security problem.

You get an answer within seven days. Fixes ship as a patch release with a changelog
entry.

## What exactcli does to stay safe

- The client secret, the access token and the refresh token live only in the operating
  system keychain (macOS Keychain, Windows Credential Manager, libsecret on Linux). The
  CLI refuses to write them to disk when no keychain is available.
- Every request is locked to your Exact Online host (`start.exactonline.<country>`). A
  redirect is refused, so a token is never re-sent to another host. The raw `api`
  command cannot leave that host.
- `--verbose` and error messages never contain credentials.
- The OAuth callback server accepts only the registered callback path and answers with
  static HTML. It sends a `state` value, and it ignores a callback that echoes a
  different state or no state at all. Exact Online does not document the parameter,
  but it echoes it back verbatim.
- Writes are off by default. POST, PUT and DELETE need `--allow-writes` (or
  `EXACTCLI_ALLOW_WRITES=1`), and a DELETE needs `--yes` as well. A refused write
  reads no body and sends no request. The MCP server exposes no mutating tool unless
  it starts with `--allow-writes`, and its `exact_write` tool needs `confirm: true`
  for a delete. `doctor` warns when the environment switch is on.
- A profile can refuse every write (`config set read_only true`) or limit writes to
  a list of divisions (`config set write_divisions <codes>`). The HTTP client checks
  the division in the path of every POST, PUT and DELETE, so a write to another
  division never leaves. A write path with an encoded slash, backslash, dot or
  percent is refused. Both settings live in the keychain credential as well as in
  the config store, and `auth login` keeps the stricter of the two, so an empty or
  edited `EXACTCLI_CONFIG_DIR` cannot loosen them. A malformed list refuses every
  write. Limit: a token from `EXACTCLI_ACCESS_TOKEN` skips the keychain, so only
  the config settings apply to it.
- `create`, `update` and `delete` validate a body against the catalogue before the
  request (method, mandatory fields, unknown fields, read-only fields), and
  `--dry-run` shows the exact request without sending it.
- The localhost mock override (`EXACTCLI_BASE_URL`) accepts only `http://localhost`,
  `http://127.0.0.1` or `http://[::1]`, and requires an explicit `EXACTCLI_ACCESS_TOKEN`,
  so a stored credential never reaches a mock.

## Supported versions

Only the latest minor release receives security fixes.
