# Security

## Report a vulnerability

[Report a vulnerability privately through GitHub Security Advisories](https://github.com/NuvioMedia/self-host/security/advisories/new).
Include the affected version, reproduction steps, and the possible impact.

## Deployment checklist

- Run `./nuvio setup` to generate unique deployment secrets.
- Store `.env`, backups, database files, and Storage files outside Git.
- Publish ports `80` and `443` through the bundled Caddy service or an existing
  HTTPS reverse proxy.
- If you use external-proxy mode, let that proxy or hosting panel obtain and
  renew the TLS certificate.
- Keep the external-proxy gateway bound to localhost or the dedicated
  `nuvio-proxy` Docker network.
- Keep PostgreSQL and pooler ports bound to localhost or a trusted network.
- Keep `SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, database credentials, and
  Studio credentials on the server.
- Use the publishable key shown by `./nuvio credentials` in Nuvio clients.
- Run `./nuvio doctor` after installation and after configuration changes or
  updates.
- Create and verify a backup before updating the deployment.
- Store backups securely; they contain account records and Storage files.
- Keep the automatic safety backup until a restore has been verified.
- Keep the host operating system and Docker Engine updated.

## Account dashboard image

The deployment pulls a prebuilt account-dashboard image. An unprivileged static
web server serves the compiled account interface. Configure the image with the
public backend URL and publishable key. Local deployments bind its port to
`127.0.0.1`; HTTPS deployments send requests through the Nuvio gateway. Keep
service-role keys and database credentials on the server.

## Email authentication

By default, Nuvio confirms new email addresses automatically. To send
verification, password recovery, and email-change messages, configure the
`SMTP_*` settings in `.env`, set `ENABLE_EMAIL_AUTOCONFIRM=false`, and run
`./nuvio up`.

## Secrets

`./nuvio setup` generates fresh secrets for each deployment and writes them to
`.env` with file mode `0600`. The service-role key and database credentials
grant administrative access to account data.

## Account imports

Import your Nuvio Cloud account from a trusted terminal on the self-hosted
server. The importer reads your password interactively, then sends it directly
to Nuvio Cloud sign-in and the local sign-in service. It keeps temporary
sign-in tokens and account data in a private directory and removes them when it
exits.

The Nuvio Cloud publishable key in `.env` is public app configuration for the
initial account sign-in. Administrative operations use a separate service-role
key that stays on the server. After sign-in, the importer downloads the data
that belongs to the authenticated account.

If the same email already exists on the server, the importer asks for
confirmation before it resets the local password and replaces the app data.
It transfers profiles, add-ons, plugins, library data, watch progress,
settings, collections, tracker preferences, avatars, and covers. When the
import finishes, sign in on each client and reconnect security factors,
devices, trackers, and providers.

## API access

Signed-in accounts can access their own account and synchronization data. The
service role performs maintenance operations. Public endpoints expose service
health, the avatar catalog, TV sign-in, and backend discovery. The discovery
endpoint returns the public URL, publishable client key, and capability flags.
It does not return administrative credentials.
