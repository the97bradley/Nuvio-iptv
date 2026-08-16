# How your deployment works

Nuvio runs as a single Docker Compose deployment. The diagram below shows how
requests move through the services, where data is stored, and which ports the
server uses.

```text
HTTPS browser/client --> Bundled Caddy or existing reverse proxy
                          +-- Nuvio gateway
                                +-- Web routes --> Account Dashboard
                                +-- API routes --> Kong API gateway
                                                     +-- Auth
                                                     +-- PostgREST --> PostgreSQL
                                                     +-- Storage ---> PostgreSQL + local files
                                                     +-- Edge Runtime --> Nuvio Edge Functions

Local browser --+--> Account Dashboard (localhost:3000)
                +--> Kong API gateway (localhost:8000)

SSH tunnel ------------> Kong localhost route --> Studio (optional)
                                                  +-- postgres-meta

./nuvio commands
    +-- migrations ------------> PostgreSQL
    +-- backup and restore ----> PostgreSQL + local files
```

## Request flow

Nuvio apps use one backend URL for sign-in, synchronization, file storage, and
supporting functions. A local deployment serves the account dashboard at
`http://localhost:3000` and the backend at `http://localhost:8000`.

Supported clients fetch public connection settings from
`/.well-known/nuvio`. The request does not require authentication.

With HTTPS, a browser that opens the public backend URL receives the account
dashboard. Supabase API paths go to Kong instead. In bundled mode, Nuvio's
Caddy container terminates HTTPS. In external-proxy mode, the server's existing
proxy terminates HTTPS and sends all traffic through Nuvio's loopback gateway.
The dashboard image contains the compiled account UI and receives the
deployment URL and publishable key when it starts.

If you enable Studio, it runs in the same deployment. You can reach it through
an SSH tunnel to the localhost Kong port.

## Database

PostgreSQL stores accounts, profiles, add-ons, plugins, library items, watch
progress, settings, tracker connections, login sessions, and sync state.
Database access rules separate the data for each account.

`./nuvio up` applies pending database updates automatically. You can also run
`./nuvio migrate` after updating the installation. Nuvio records each applied
update so it does not run twice.

## Storage

PostgreSQL stores file metadata, while the files themselves live under
the Docker-managed `storage-data` volume. Nuvio creates the `avatars` and `covers` storage areas
automatically. `./nuvio up` and `./nuvio migrate` keep the built-in avatar
catalog complete without replacing uploaded files.

## Edge functions

Edge functions handle health checks, account deletion, TV sign-in, and tracker
sign-in. A function that needs administrative access first verifies either the
signed-in account or a one-time sign-in code.

## Network ports

| Port | Use |
| --- | --- |
| `80` and `443` | Caddy HTTP validation and HTTPS traffic |
| `8080` | External-proxy gateway on localhost |
| `3000` | Local account dashboard |
| `8000` | Local Kong API and optional Studio |
| `5432` | Local PostgreSQL session pooling |
| `6543` | Local PostgreSQL transaction pooling |

The local dashboard, Kong, and database ports bind to the server's `127.0.0.1`
interface. Bundled Caddy publishes ports `80` and `443`. In external-proxy
mode, Nuvio stays on localhost port `8080`, and the existing proxy publishes
HTTPS.
