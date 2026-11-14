# What changed relative to the files you sent

Layout: your `src/app.py`, `config.py`, `api_client.py`, `__init__.py`, `Dockerfile`,
`docker-compose.yml`, `config.yaml`, `requirements*.txt`, README were taken over; the Jinja
page templates were replaced by the React SPA (`src/templates/spa.html`).

## Bugs found while wiring the SPA to your backend (all fixed, all covered by tests)

1. **Backend outages looked like "no data".** `api_client` returned `[]`/`{}` on any error, so
   the SPA's error banner could never appear. Clients now raise `UpstreamError` → HTTP 502/504.
   Only monitoring helpers stay tolerant.
2. **"Auf Standard zurücksetzen" did nothing.** `POST /config/reset` did not exist (the SPA
   called it and reloaded anyway). Implemented.
3. **Saved settings were lost or ignored:** `retention_days` was never persisted;
   player `autoplay/muted/default_volume` were dropped by your `/config` handler; unknown
   sections in config.yaml were wiped on every UI save (save now merges).
4. **Multi-worker config drift:** gunicorn ran 4 workers but a UI save updated only one.
   Every worker now re-reads config.yaml when its mtime changes.
5. **Environment variables silently beat UI saves** (your compose set `UI_THEME=dark`,
   `UI_REFRESH_INTERVAL=300` – so `config.yaml` values were ignored). The UI now warns;
   compose no longer hard-codes them. Empty env vars are ignored.
6. **Theme setting had no effect in the SPA** (ThemeProvider only read localStorage).
7. `POST /api/providers` answered `201 null` when WebEPG failed.
8. Route params were interpolated unencoded into upstream URLs (`%3F` could inject a query
   string; `..` could traverse). Now percent-encoded / rejected.
9. `?page=abc` and similar produced 500s; now 400.
10. Duplicate `/static/<path>` route (dead code), `send_from_directory("static")` relative to
    the CWD, hard-coded default `SECRET_KEY` (unused) – removed.

## Security / hardening
CSRF header on all mutating requests, server-side validation of every setting, generic error
messages to the browser, atomic config writes (keeps file mode), `X-Content-Type-Options`/
`X-Frame-Options`/`Referrer-Policy`, immutable caching for hashed assets, download length cap and
http(s)-only check on the manifest template.

## Dependencies
Your pins had **27 known advisories** (Flask 2.3.3, Werkzeug 3.0.1, requests 2.31.0, gunicorn 21.2.0,
python-dotenv 1.0.0). Now pinned to current releases (pip-audit clean on 2026-11-14);
`python-dotenv` removed from runtime (never imported).

## Docker
* Node build stage added (SPA is built in the image); node 22 instead of EOL 20.
* Removed `gcc/g++/libpq-dev` (nothing to compile), `PYTHONPATH=/app/src` (made `src/config.py`
  importable as top-level `config`), obsolete `FLASK_APP/FLASK_ENV`.
* Fixed uid 10001; workers 2 × 8 threads (gthread) instead of 4 × 2.
* **Compose:** the `./static` and `./templates` bind mounts would have hidden the built SPA;
  `ULTIMATE_BACKEND_URL` pointed at the UI's own port (7779); ports `7777:7777` vs
  `SERVER_PORT=3000` disagreed; nginx mounted files that did not exist; webepg/backend
  placeholder images could not be pulled. Compose now only defines the UI (+ optional nginx
  profile); WebEPG/Ultimate Backend run in their own stacks.
* `config/config.yaml` is shipped as `config.example.yaml` so extracting the zip cannot
  overwrite a live config.

## Removed / not carried over
Legacy Jinja pages (`base/epg_display/config/providers/monitoring/epg_mapping.html`) and their
`static/js|css` (superseded by the SPA); the stale `flask/` patch fragments, `Dockerfile.example`
and a stale duplicate `spa.html` from the previous zip; README claims that had no implementation
(Prometheus `/metrics`, OpenTelemetry, Kubernetes manifests, `docker-compose.prod.yml`).
The old config page had controls (cache, log level, show icons/descriptions, import/export)
that the backend never persisted; they are not in the SPA.

## GitHub workflows (`.github/`)
Adapted from the ones you sent; `actionlint` is clean, the lint chain and the smoke-test assertions were run locally.
* **docker.yml** – `file: ./docker/Dockerfile` → `./Dockerfile` (the old path does not exist); the image was
  never pushed for `v*` tags (condition only matched branches) – fixed via a `PUBLISH` env; Python matrix
  3.9/3.10 removed (the pinned requests/gunicorn/click/urllib3 need ≥ 3.10; now 3.11 + 3.12); Node 18 (EOL) → 22;
  the legacy `eslint/htmlhint/stylelint` job on `src/static/js|css` replaced by typecheck + build + `verify-build.sh` +
  `npm audit --omit=dev`; duplicate CodeQL job removed (it ran twice and wrote to the same SARIF category as
  `codeql.yml`); `safety check … || true` (never failed, and Safety now needs an account) → blocking `pip-audit`;
  Bandit now blocks on medium+; the container smoke test now also checks the baked-in SPA bundle, the CSRF guard,
  that a dead WebEPG yields a 502, and that the container is not root; blind `sleep`s → wait loops; deploy runs the
  container as the owner of `/opt/ultimate-ui/config` (the image user is now uid 10001, which would otherwise break
  saving settings on an existing host), drops the obsolete `FLASK_ENV` and unused logs mount, and supports a
  pinned `DEPLOY_KNOWN_HOSTS` instead of always `StrictHostKeyChecking=no`; `codecov-action@v3` → v5 (actionlint:
  runner too old); concurrency group added.
* **codeql.yml** – `javascript` → `javascript-typescript`, `build-mode: none` (no Autobuild needed), v3 → v4.
* **release.yml** – `git describe` returned the tag being released (empty changelog; also needs full history) and the
  `git log` text was injected into `$GITHUB_ENV` with a fixed `EOF` delimiter and into a shell script/JSON body
  (command injection via commit subjects) → now GitHub's generated notes only; added `permissions: contents: write`;
  tag must equal the package versions; quick start used port 5000 → 7779 with the config mount; Docker Hub description
  update used an access token as `JWT` (rejected by the API) → `peter-evans/dockerhub-description`; `action-gh-release` v1 → v2.
* **dependabot.yml** – added the `npm` ecosystem for `ultimate-ui-react/` (frontend was unmonitored) and grouped minor/patch PRs.
* **pyproject.toml** (new) – `isort` needs `profile = "black"` or it fights black; also holds black/mypy settings.
* Dev tools bumped: pytest 9.0.3, black 26.10.1 (advisories), `python-dotenv` dropped; code reformatted accordingly.

## Verified vs. not verified
Verified: `tsc`, production build + `verify-build.sh`, 48 pytest tests, flake8/black, clean
`pip install` + `pip check` + `pip-audit` from `requirements.txt`, and a headless-Chromium run
against gunicorn (2 workers) with fake WebEPG/Ultimate Backend: EPG renders, config save/validation/
reset, theme, multi-worker reload, error banner when WebEPG is down, no JS errors.
**Not verified (CI will be the first real run):** the workflows on GitHub itself, `docker build`/`compose up` (no Docker in my sandbox), Python 3.11 (tests ran on
3.12), real streams in the player (shaka), a real WebEPG/Ultimate Backend.
