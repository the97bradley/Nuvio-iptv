# Self-hosting Nuvio

Run Nuvio on your own server with Docker Compose. The deployment includes the
backend, account dashboard, authentication, sync, and storage services.

This project is for users who prefer to keep their Nuvio account, library, and
synced data on infrastructure they control. The official Nuvio-hosted backend
is `https://api.nuvio.tv`. Self-hosted deployments are intended for personal
use. We do not recommend connecting to unofficial public backends operated by
third parties, as Nuvio cannot verify or support those services.

## Deployment

The recommended deployment uses HTTPS with a domain. Each client then has one
stable Backend URL, with a certificate trusted by browsers, phones, and TVs.

### Requirements

- A 64-bit Linux server (`amd64` or `arm64`)
- Docker Engine with Docker Compose v2
- Git, OpenSSL, and curl
- A domain or subdomain pointed at the server
- TCP ports `80` and `443` available for bundled Caddy, or an existing HTTPS
  reverse proxy

Create an `A` or `AAAA` record such as `backend.example.com`, then run:

```sh
git clone https://github.com/NuvioMedia/self-host
cd self-host
./nuvio setup --domain backend.example.com
./nuvio up
./nuvio credentials
```

Once Nuvio starts, open `https://backend.example.com` for the account
dashboard. Enter that same address as the Backend URL in Nuvio clients. Caddy
handles HTTPS and sends dashboard and API requests to the correct services.

Supported clients can use the discovery endpoint at
`https://backend.example.com/.well-known/nuvio`. See
[Connect Nuvio apps](docs/client-configuration.md) for details.

## Existing reverse proxy

If Nginx, Caddy, Traefik, or a hosting panel already uses ports `80` and `443`,
run Nuvio behind that proxy:

```sh
./nuvio setup --domain backend.example.com --proxy external
./nuvio up
```

Point the proxy at `http://127.0.0.1:8080`, then run `./nuvio doctor`. In this
mode, the existing proxy manages the HTTPS certificates. See
[Use an existing reverse proxy](docs/external-proxy.md) for example
configurations and instructions for running Traefik in Docker.

## Local setup

Use local mode for testing on the server itself or through an SSH tunnel:

```sh
git clone https://github.com/NuvioMedia/self-host
cd self-host
./nuvio setup
./nuvio up
./nuvio credentials
```

The dashboard is available at `http://localhost:3000`, and the backend is at
`http://localhost:8000`. Both listen only on the server's localhost interface.

## Guides

- [Self-hosting guide](docs/self-hosting.md)
- [Use an existing reverse proxy](docs/external-proxy.md)
- [Connect Nuvio apps](docs/client-configuration.md)
- [Architecture](docs/architecture.md)
- [Security](SECURITY.md)

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) and
[NOTICE](NOTICE).
