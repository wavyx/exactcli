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
- The OAuth callback server accepts only the registered callback path, answers with
  static HTML, and ignores callbacks with a wrong `state`.
- The localhost mock override (`EXACTCLI_BASE_URL`) accepts only `http://localhost`,
  `http://127.0.0.1` or `http://[::1]`, and requires an explicit `EXACTCLI_ACCESS_TOKEN`,
  so a stored credential never reaches a mock.

## Supported versions

Only the latest minor release receives security fixes.
