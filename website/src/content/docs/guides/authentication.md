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
   The route depends on your subscription: see [Register the app](#register-the-app).
4. Run `exactcli auth login` again, paste the Client ID and the Client Secret at the
   prompt, and sign in in the browser that opens. The tokens go to the keychain, and the
   command remembers your division.

```sh
exactcli auth login
exactcli auth status         # token age, division, identity
exactcli auth logout
```

Type the secret at the prompt: a `--client-secret` flag stays in your shell history.

## Register the app

### In your own administration

A customer subscription registers an internal app inside Exact Online. The app serves
only the users of that subscription, and the user needs the "Manage apps" role.

1. Open the administration menu (the name at the top left) and choose Import/Export
   (Importer/Exporter).
2. Under Other (Autre), choose App registrations (Enregistrements d'applications).
3. Choose New (Nouveau).
4. Fill in the authorization details:
   - App name: for example `exactcli`.
   - Redirect URI: the URI that `exactcli auth login` printed,
     `https://<your-domain>/callback`.
   - Description: free text.
5. Save the app. The page then shows the Client ID, the Client secret and the Webhook
   secret. Use the eye icon to show a secret and the copy icon to copy it.

The Webhook secret is the one that `exactcli webhook listen` asks for: Exact signs each
notification with the secret of the app that the administration signs in with.

### In the App Store (developer subscription)

A developer subscription has no App registrations menu. Register the app in the Exact
App Store: Manage my apps > Demo apps > Register a demo app. A demo app serves only the
users of the developer subscription. To serve other subscriptions, the app must become a production
app in the App Store.

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
