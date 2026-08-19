# exactcli

Command-line interface for the [Exact Online](https://www.exact.com/) REST API.

`exactcli` gives you raw OData access to any Exact Online resource, plus typed commands
for the accounting entries you touch every day. It prints JSON, YAML, CSV, or a table,
returns deterministic exit codes, and keeps every secret in the OS keychain. Built for
terminals, CI pipelines, and AI agents.

## Install

```bash
npm i -g @wavyx/exactcli
```

Node 20 or later is required.

## Quick start

```bash
exactcli auth login
exactcli me
exactcli list crm/Accounts --top 5 --select Name
```

## License

MIT. Not affiliated with Exact.
