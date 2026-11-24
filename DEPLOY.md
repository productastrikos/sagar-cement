# Deploying S!aP ClinkerIQ on astrikos.xyz

POC: `sagar-cement` · Frontend port `3363` · Backend port `4363`
URL: **https://sagar-cement.astrikos.xyz:8443** (convention: `deployment_context.md`, registry row added).

## Process table

| Thing | Value |
| --- | --- |
| Frontend subdomain | `sagar-cement.astrikos.xyz` |
| Backend subdomain | `sagar-cement-api.astrikos.xyz` |
| Frontend port | `3363` |
| Backend port | `4363` (REST API; no websocket — the client polls every 5 s) |
| pm2 frontend name | `sagar-cement_3363` |
| pm2 backend name | `sagar-cement_be_4363` |
| Frontend build output | `client/build/` (Create React App) |

No database: the backend keeps everything in memory and seeds 200 days of plant history on boot.
Every cross-service URL is env-driven — no hosts or ports in source.

## 1. Frontend (static CRA build)

```bash
cd client
npm install                 # installs the vendored S!a Copilot from client/vendor/*.tgz too
CI=false npm run build      # reads client/.env.production → REACT_APP_API_URL=https://sagar-cement-api.astrikos.xyz:8443/api
pm2 start npx --name "sagar-cement_3363" -- serve -s build -p 3363
```

`REACT_APP_API_URL` is compiled into the bundle; rebuild if it changes.

## 2. Backend (Express, in memory)

```bash
cd server
npm install
cp .env.example .env        # then edit: see below
npm run selftest            # optional: 767 checks on the simulation and KPI contract
PORT=4363 pm2 start index.js --name "sagar-cement_be_4363"
pm2 save
```

`server/.env` on the server:

```
CORS_ORIGIN=https://sagar-cement.astrikos.xyz:8443
JWT_SECRET=<long random string>
LLM_PROVIDER=groq            # S!a Copilot ask-anything answers — key stays server-side
LLM_API_KEY=<groq key>
LLM_MODEL=                   # blank = openai/gpt-oss-120b on Groq
SIA_PROVIDER_LABEL=Astrikos AI
```

`PORT` is passed inline on the pm2 command (it overrides `.env`). Without an LLM key S!a still runs the guided demo, reads KPI cards and opens screens; only free-form answers are off.

## 3. nginx

`astrikos.conf` — frontend:
```nginx
server {
    listen 8443 ssl;
    ssl_certificate     /etc/certs/astrikos.xyz/fullchain.pem;
    ssl_certificate_key /etc/certs/astrikos.xyz/privkey.pem;
    server_name sagar-cement.astrikos.xyz;
    location / {
        add_header 'Access-Control-Allow-Origin' '*' always;
        proxy_pass http://127.0.0.1:3363;
    }
}
```

`astriverse.conf` — backend (needs `map $http_upgrade $connection_upgrade {…}` once at the top of the file):
```nginx
server {
    listen 8443 ssl;
    ssl_certificate     /etc/certs/astrikos.xyz/fullchain.pem;
    ssl_certificate_key /etc/certs/astrikos.xyz/privkey.pem;
    server_name sagar-cement-api.astrikos.xyz;
    location / {
        proxy_pass http://127.0.0.1:4363;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
        proxy_buffering off;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 4. Cloudflare DNS

- `sagar-cement.astrikos.xyz` → **Orange** (proxied)
- `sagar-cement-api.astrikos.xyz` → **Gray** (DNS-only)

## 5. Verify

```bash
curl -k https://sagar-cement.astrikos.xyz:8443                 # SPA HTML (title "S!aP ClinkerIQ · Sagar Cements")
curl -k https://sagar-cement-api.astrikos.xyz:8443/api/health  # {"status":"ok","service":"clinkeriq-api",…}
```

Then open https://sagar-cement.astrikos.xyz:8443 and sign in with `admin` / `Astrikos2026`. The S!a dock sits bottom-right (allow the microphone for "Hey S!a").

## Retiring the old CemPulse slot (optional)

```bash
pm2 delete cempulse_3355 cempulse_be_4355 && pm2 save   # frees 3355 / 4355
```
