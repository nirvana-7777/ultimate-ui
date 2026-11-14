# Ultimate UI

Web UI for the EPG stack: browse the programme guide, play live/catchup streams,
download catchup recordings, map streaming channels to EPG channels, manage XMLTV
providers and watch import status.

* **Frontend** – React 18 + TypeScript SPA (`ultimate-ui-react/`, built with Vite)
* **Backend** – Flask app (`src/`) that serves the SPA and proxies **WebEPG** and the
  **Ultimate Backend**, so the browser needs no CORS access to either

```
Browser ──► Ultimate UI (Flask + SPA, :7779) ──► WebEPG            (EPG data, providers, aliases)
                                              └─► Ultimate Backend (providers, channels, catchup manifests)
```

## Layout

```
Dockerfile, docker-compose.yml, requirements*.txt
config/config.example.yaml     copy to config/config.yaml (the Config page writes it)
src/                           Flask app: app.py, config.py, api_client.py, templates/spa.html
src/static/dist/               built SPA (the Docker image rebuilds it; see "Development")
ultimate-ui-react/             SPA source, lockfile, verify-build.sh
tests/spa/                     pytest suite for the Flask side (own conftest; will not clash with other tests/)
nginx/nginx.conf               optional reverse proxy (compose profile "proxy")
```

## Run with Docker

```bash
mkdir -p config && cp config/config.example.yaml config/config.yaml
sudo chown -R 10001:10001 config        # container user must be able to write it
docker compose up -d --build
# http://localhost:7779
```

Set the WebEPG / Ultimate Backend URLs on the Config page, or via environment
variables in `docker-compose.yml`. Do **not** bind-mount `./static` or `./templates`
over `/app` – that hides the built SPA.

### Configuration precedence

`built-in defaults < config.yaml < environment variables`

| Variable | Setting |
|---|---|
| `ULTIMATE_UI_CONFIG` | path of the YAML file (default `config/config.yaml`) |
| `WEBEPG_URL`, `WEBEPG_TIMEOUT` | WebEPG base URL (no `/api/v1`), timeout in s |
| `ULTIMATE_BACKEND_URL`, `ULTIMATE_BACKEND_TIMEOUT` | internal Ultimate Backend URL (used by Flask) |
| `ULTIMATE_BACKEND_PUBLIC_URL` | optional browser-reachable origin (needs CORS) for in-browser catchup replay; empty = replay hidden, **downloads still work** |
| `CATCHUP_MAX_HOURS`, `UI_THEME`, `UI_REFRESH_INTERVAL`, `UI_TIMEZONE` | see Config page |
| `LOG_LEVEL` | `INFO` (default) |

Empty variables are ignored. If a variable overrides something you save on the Config
page, the UI shows a warning instead of silently ignoring your input.

## Security model – read before exposing it

* **There is no login.** Run it on a trusted network or behind a reverse proxy with auth
  (`nginx/nginx.conf` has an `auth_basic` stub).
* State-changing requests need an `X-Requested-With` header (CSRF defence). The SPA sends
  it; for `curl` add `-H 'X-Requested-With: curl'`.
* Settings are validated server-side; errors returned to the browser never contain
  upstream hostnames or exception text (details go to the log).
* The browser only receives a whitelist of settings (`SPA_CONFIG_KEYS` in `src/app.py`).
  Note that includes the internal backend URLs shown on the Config page.
* The catchup download route never accepts a URL from the client; it rebuilds it from the
  backend's manifest.
* No Content-Security-Policy is set yet (see below).

## HTTP API (what the SPA uses)

| Endpoint | |
|---|---|
| `GET /health` | liveness (does not call upstreams) |
| `GET/POST /config`, `POST /config/reset` | page / save settings (JSON) / reset to defaults |
| `GET /api/epg/channels?page&limit`, `GET /api/channels/<id>/programs?start&end&provider` | EPG |
| `GET /api/mapping/providers`, `GET /api/mapping/channels/<provider>`, `POST /api/mapping/create-alias` | channel mapping |
| `GET/POST /api/providers`, `GET/PUT/DELETE /api/providers/<id>`, `…/test`, `…/import/trigger` | XMLTV providers |
| `GET /api/import/status`, `POST /api/import/trigger`, `GET /api/monitoring/status` | imports / monitoring |
| `GET /api/aliases[...]`, `DELETE /api/aliases/<id>`, `GET /api/channels` | aliases |
| `GET /api/proxy/catchup/download?provider&channel&start&end&filename` | streams a `.ts` recording |
| `GET /api/test/webepg`, `GET /api/test/ultimate-backend` | connection tests |

Upstream failures are answered with 502/504 and `{"success": false, "error": …}` – never
with an empty list – so the UI can show its error banner.

WebEPG endpoints used: `/api/v1/{health,channels,channels/<id>/programs,providers,providers/<id>[/test|/import/trigger],aliases[...],channels/<id>/aliases,import/status,import/trigger,statistics}`.
Ultimate Backend: `/api/providers`, `/api/providers/<p>/channels`, `/api/providers/<p>/channels/<c>/manifest`.

## Development

```bash
# backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements.dev.txt
pytest -q                                   # 56 tests (tests/spa/)
isort src tests && black src tests && flake8 src tests --max-line-length=100 && mypy src
ULTIMATE_UI_CONFIG=config/config.yaml FLASK_DEBUG=true python -m src.app   # http://127.0.0.1:7779

# frontend
cd ultimate-ui-react
npm ci
npm run dev            # Vite on :5173, proxies /api and /config to :7779
npm run typecheck
npm run build          # writes ../src/static/dist
bash verify-build.sh   # post-build checks (lazy shaka chunk, bundle size, …)
```

`src/static/dist` is committed in this archive so `python -m src.app` works out of the box;
the Docker build ignores it and builds its own.

## CI/CD (`.github/`)

| Workflow | What it does |
|---|---|
| `docker.yml` | lint (black/isort/flake8/mypy) → tests (py 3.11, 3.12) → frontend (typecheck, build, `verify-build.sh`, `npm audit` prod) → security (pip-audit, Bandit, Semgrep, Trivy, OWASP DC) → multi-arch image build/push → container smoke test → staging deploy over SSH |
| `codeql.yml` | CodeQL for TypeScript and Python |
| `release.yml` | on `v*` tags: checks the tag equals `src/__init__.py` and `package.json` versions, creates the GitHub release, updates the Docker Hub description |
| `dependabot.yml` | pip, npm (`ultimate-ui-react/`), docker, github-actions |

Secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (access token with Read/Write/Delete), `DEPLOY_HOST_STAGING`,
`DEPLOY_USER`, `DEPLOY_KEY`; optional `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 <host>`), `CODECOV_TOKEN`,
`SLACK_CHANNEL_ID`, `SLACK_BOT_TOKEN`.
Releasing: bump the version in **both** `src/__init__.py` and `ultimate-ui-react/package.json`, then `git tag vX.Y.Z`.

## Known gaps

* No authentication / CSP; no automated frontend tests or ESLint; no CI.
* Player behaviour (shaka teardown on A→B switch, minimize/restore, native fallback) has only
  manual tests – try these in a real browser with real streams: play DASH/HLS → switch to
  another stream without closing → minimize/restore → close and play again → native `.ts`/`.mp4`.
* `npm audit`: 2 moderate advisories remain, both `react-router-dom` 6.x (open redirect via
  user-controlled link targets, CVSS 6.1; fixed only in v7). The UI never passes user input to
  `<Link>`/`navigate`, so plan the v7 upgrade but it is not urgent. (`vite` was upgraded 5 → 7.3.8,
  which clears 8 dev-server advisories; it needs Node ≥ 20.19 / 22.12 – CI and the Dockerfile use 22.)
* ProviderModal's "test connection" for a *new* provider does a browser `HEAD` to the URL
  (often blocked by CORS); existing providers are tested through WebEPG.
* Accessibility pass (focus traps, dialog roles) and mapping-page touch support are open.
