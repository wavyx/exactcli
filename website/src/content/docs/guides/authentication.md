---
title: Authentication
description: Register an Exact Online app and sign in with OAuth 2.0.
---

Exact Online supports the OAuth 2.0 authorization code flow only, and it requires a
public HTTPS redirect URI: localhost is refused. exactcli runs a local callback server
and exposes it through an [ngrok](https://ngrok.com/) static domain.

## Sign in

1. Claim a static domain in your ngrok account and install `ngrok`.
2. Run `exactcli auth login`. The command prints the redirect URI,
   `https://<your-domain>/callback`.
3. Register an app with that redirect URI, then copy its Client ID and Client Secret.
   The route depends on your subscription:
   - A customer subscription registers an internal app in Exact Online: Company name >
     Import/Export > App registrations. It needs the Manage apps role and serves only the
     users of that subscription.
   - A developer subscription has no such menu. Register the app in the App Store:
     Manage my apps. A test app serves only the users of the developer subscription.
4. Run `exactcli auth login` again, paste the Client ID and the Client Secret at the
   prompt, and sign in in the browser that opens. The tokens go to the keychain, and the
   command remembers your division.

```sh
exactcli auth login
exactcli auth status         # token age, division, identity
exactcli auth logout
```

Type the secret at the prompt: a `--client-secret` flag stays in your shell history.

## Without ngrok

`exactcli auth login --manual` needs no running tunnel. It still asks for the HTTPS
redirect domain registered on your app, because the redirect URI is built from it. It
prints the authorization URL: open it yourself, sign in, and paste the redirected URL
(or the code) back into the terminal.

## Token lifetime

Tokens refresh automatically. A refresh token that stays unused for 30 days expires: run
any command at least once a month, or sign in again. To sign in as another user while
the browser keeps a session, add `--force-login`.

## CI and tokens from elsewhere

`EXACTCLI_ACCESS_TOKEN` sets an access token you obtained elsewhere; it skips the
keychain. Only the config settings of the profile apply to it.
