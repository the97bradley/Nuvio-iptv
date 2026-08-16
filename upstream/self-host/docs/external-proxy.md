# Use an existing reverse proxy

Use external-proxy mode if Nginx, Caddy, Traefik, or a hosting panel already
serves HTTPS on ports `80` and `443`.

## Start the Nuvio gateway

Point the domain to the server, then configure and start Nuvio:

```sh
./nuvio setup --domain backend.example.com --proxy external
./nuvio up
```

Nuvio serves the dashboard and API through one HTTP gateway at
`127.0.0.1:8080`. The public proxy terminates HTTPS and forwards all requests
for that hostname to this gateway. Configure HTTPS, certificate issuance, and
certificate renewal in the existing proxy.

To use another loopback port, pass `--proxy-port PORT` and use that port in the
proxy configuration.

## Nginx

Put this `map` in the `http` section of the main Nginx configuration:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Add a server block for the Nuvio domain. Use the certificate paths managed by
your existing ACME client or hosting panel.

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name backend.example.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 55m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_read_timeout 3600s;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

Use the existing server or hosting-panel configuration to redirect the matching
port `80` hostname to HTTPS.

## Caddy

Add the Nuvio hostname to the existing Caddyfile:

```caddyfile
backend.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Caddy handles HTTPS and WebSocket forwarding automatically.

## Traefik on the host

Add a file-provider configuration that uses Traefik's existing certificate
resolver:

```yaml
http:
  routers:
    nuvio:
      rule: Host(`backend.example.com`)
      entryPoints:
        - websecure
      service: nuvio
      tls:
        certResolver: letsencrypt

  services:
    nuvio:
      loadBalancer:
        servers:
          - url: http://127.0.0.1:8080
```

## Traefik in Docker

`./nuvio up` creates a Docker network named `nuvio-proxy`. Attach the Traefik
service to it:

```yaml
services:
  traefik:
    networks:
      - default
      - nuvio-proxy

networks:
  nuvio-proxy:
    external: true
    name: nuvio-proxy
```

Set the service URL in Traefik's file-provider configuration to
`http://nuvio-gateway:80`:

```yaml
http:
  routers:
    nuvio:
      rule: Host(`backend.example.com`)
      entryPoints:
        - websecure
      service: nuvio
      tls:
        certResolver: letsencrypt

  services:
    nuvio:
      loadBalancer:
        servers:
          - url: http://nuvio-gateway:80
```

If you change `NUVIO_PROXY_NETWORK` in `.env`, use the new name in the Traefik
Compose file.

## Verify the deployment

Reload the public proxy, then test the HTTPS route:

```sh
curl https://backend.example.com/health
./nuvio doctor
./nuvio credentials
```

Enter the printed Backend URL and publishable key in Nuvio clients.
