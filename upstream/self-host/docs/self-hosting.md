# Self-hosting Nuvio

Nuvio runs with Docker Compose. Use a domain when clients connect remotely, or
use local mode for testing and SSH access.

## Requirements

- A 64-bit Linux server (`amd64` or `arm64`)
- Docker Engine with Docker Compose v2
- Git, OpenSSL, and curl
- `jq` if you want to import a Nuvio Cloud account

For HTTPS, point a domain or subdomain to the server. Bundled Caddy uses TCP
ports `80` and `443`. If the server already has a reverse proxy, use
external-proxy mode. Keep ports `3000`, `8000`, `5432`, and `6543` private. If
a required proxy port is busy, setup reports the process using it before it
writes the deployment configuration.

## HTTPS with a domain

### 1. Point your domain

Create an `A` record for IPv4 or an `AAAA` record for IPv6. For example:

```text
backend.example.com -> your server IP
```

### 2. Clone the repository

```sh
git clone https://github.com/NuvioMedia/self-host
cd self-host
```

### 3. Configure Nuvio

```sh
./nuvio setup --domain backend.example.com
```

Setup generates the deployment secrets and configures the domain. Enter the
hostname in `backend.example.com` form.

### 4. Start Nuvio

```sh
./nuvio up
```

On the first start, Nuvio initializes the database, applies migrations, seeds
the built-in assets, and runs health checks. Caddy obtains and renews the HTTPS
certificate.

### 5. Get the connection details

```sh
./nuvio credentials
```

With a domain, the account dashboard and Backend URL use the same address:

```text
Account dashboard: https://backend.example.com
Backend URL:       https://backend.example.com
Publishable key:   <generated public key>
```

Open the dashboard URL in a browser. Enter the Backend URL and publishable key
in Nuvio clients. Keep administrative and service-role keys on the server.
Supported clients can fetch these settings from the discovery endpoint:

```sh
curl https://backend.example.com/.well-known/nuvio
```

## Use an existing reverse proxy

If Nginx, Caddy, Traefik, or a hosting panel already uses ports `80` and `443`,
configure Nuvio to use an HTTP gateway on localhost:

```sh
./nuvio setup --domain backend.example.com --proxy external
./nuvio up
```

The gateway listens at `http://127.0.0.1:8080`. Configure the existing proxy
and its HTTPS certificate, then test the public route:

```sh
./nuvio doctor
./nuvio credentials
```

To use another loopback port:

```sh
./nuvio setup \
  --domain backend.example.com \
  --proxy external \
  --proxy-port 18080
```

See [Use an Existing Reverse Proxy](external-proxy.md) for Nginx, Caddy, and
Traefik configurations.

## Local setup

```sh
git clone https://github.com/NuvioMedia/self-host
cd self-host
./nuvio setup
./nuvio up
./nuvio credentials
```

Local mode uses:

```text
Account dashboard: http://localhost:3000
Backend URL:       http://localhost:8000
```

Both ports bind to `127.0.0.1`. To reach a remote server from your computer,
open an SSH tunnel:

```sh
ssh -L 3000:localhost:3000 -L 8000:localhost:8000 user@server
```

Keep these HTTP ports on localhost. Configure a domain before connecting a
phone, TV, or other remote device.

## Add a domain later

Point the domain to the server, then choose bundled Caddy:

```sh
./nuvio down
./nuvio set-domain backend.example.com
./nuvio up
./nuvio credentials
```

To use an existing reverse proxy instead:

```sh
./nuvio down
./nuvio set-domain backend.example.com --proxy external
./nuvio up
```

Changing the domain keeps the existing database, files, and secrets. Clients
may need to sign in again after the URL changes.

## Connect Nuvio apps

Use the two values printed by `./nuvio credentials`:

- **Backend URL**
- **Publishable key**

Use the Backend URL exactly as printed. Supported clients can fetch their
connection settings from `<BACKEND_URL>/.well-known/nuvio`. See
[Connect Nuvio apps](client-configuration.md) for manual build settings.

## Other setup options

Use a different default catalog:

```sh
./nuvio setup \
  --domain backend.example.com \
  --catalog-url https://catalog.example.com/manifest.json
```

Move an existing Nuvio Cloud account:

```sh
./nuvio import-account
```

## Common commands

| Command | Purpose |
| --- | --- |
| `./nuvio up` | Start, migrate, and verify the deployment |
| `./nuvio down` | Stop Nuvio and preserve its data |
| `./nuvio restart` | Restart the services |
| `./nuvio status` | Show service status |
| `./nuvio logs [SERVICE]` | Follow logs |
| `./nuvio doctor` | Check dashboard and backend health |
| `./nuvio credentials` | Show connection details |
| `./nuvio backup` | Back up PostgreSQL and Storage |
| `./nuvio restore BACKUP --yes` | Restore a backup |

## Backups and updates

Create a backup:

```sh
./nuvio backup
```

Nuvio stores backups under `backups/`, database data under
`volumes/db/data/`, uploaded files in the Docker-managed `storage-data` volume, and deployment
secrets in `.env`.

Create a backup before updating. Then run:

```sh
git pull --ff-only
./nuvio pull
./nuvio up
```
