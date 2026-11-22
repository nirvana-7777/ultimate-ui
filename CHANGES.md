# 2.5.3 - Recordings buttons by state, instant switch after timer delete

## Changed
- Recordings tab: a recording that is not finished yet (scheduled or running) shows **Update** and delete
  instead of Play; a finished one shows **Play** and delete. Failed recordings only offer delete.
  Update looks up the matching timer of the provider (same title, start closest to the recording time)
  and opens the timer dialog; if no timer is found a hint is shown.
- Timers now carry their channel uid (`ClientChannelUid`), used when a timer is updated from the Recordings tab.
- EPG: after **Delete Timer** the programme switches back to "Aufnehmen" immediately (the timer is removed
  locally instead of waiting for a reload).

# 2.5.2 - Cast with character names, timer buttons in the EPG

## Fixed
- "Besetzung" showed `[object Object]` because the EPG now sends actors as objects
  (`{name, character_name, id}`). They are shown as `Kaley Cuoco-Sweeting (Penny), Jim Parsons (Sheldon Cooper), ...`;
  plain string lists still work.

## Changed
- Programmes that already have a timer no longer offer "Aufnehmen". Their details show **Update Timer** and
  **Delete Timer** instead (update opens the timer dialog with the programme, delete asks for confirmation).
  A small ⏺ marks such programmes in the list.
- The EPG loads the active timers of the selected provider and matches them to programmes by `epg_event_id`
  (fallback: same title and start within a minute). Finished or aborted timers are ignored.

# 2.5.1 - Timers use the provider's epg_event_id

## Fixed
- Creating a timer from the EPG sent `ultimate_epg_id` (or the row id) as `epg_event_id`. It now sends the
  real `epg_event_id` of the programme; `ultimate_epg_id` goes only to `epg_uid` (when numeric).
- The EPG server can return two rows for one broadcast: the detailed one (actors, plot, ...) and a thin
  provider-event row that carries `epg_event_id`. They were shown as duplicates and the id never reached the
  detailed row. Rows with the same title and a start within 2 minutes are now merged into the richest row
  and missing fields (above all `epg_event_id`) are filled in. Back-to-back episodes stay separate.
- `epg_event_id` is read from the EPG response (`Program.epg_event_id`), shown as "Event-ID" in the programme
  details, and read from timers (`TimerItem.epgEventId`).

## Changed
- Programmes without an event id get a manual (start/end) timer type first, with a hint in the dialog;
  EPG-based types are used only if the provider has no manual one.
- Deleting a timer also sends the timer's `epg_event_id` (DELETE `/api/timers/<provider>/<index>?epg_event_id=...`,
  forwarded to the backend as query parameter; omitted when the timer has none).
- `RecordingBackend.updateTimer()` (PUT `/api/timers/<provider>/<index>`) added; it sends the same body as create.

# 2.5.0 - Recordings tab

## Added
- New **Recordings** tab (`/recordings`): cloud recordings of the providers (list per provider or all
  providers, search, status, resume bar), play in the floating player (DRM header like live streams) and
  delete at the provider. Second view **Timer**: list (optionally including finished ones) and delete.
- **Aufnehmen** button on upcoming/live programmes in the EPG opens a dialog: timer type of the provider,
  margins, priority and lifetime according to the type's attributes. The EPG id is sent as `epg_event_id`
  (and `epg_uid` when numeric).
- Flask proxy `/api/recordings/<provider>[/<id>]` and `/api/timers/<provider>[/types|/<index>]` to the
  Ultimate Backend; timer bodies are reduced to the known fields.
- Local recordings are prepared, not implemented: `RecordingBackend` interface with a `localRecordings` stub
  (`LOCAL_RECORDINGS_ENABLED` in `recordingsService.ts`) and `/api/local-recordings` answering 501.

## Changed
- Upstream errors of the Ultimate Backend show `error: message` when both are present.

# 2.4.0 - VOD tab

## Added
- New **VOD** tab (`/vod`) for the library of the VOD crawler service: movie / series switch, provider filter,
  title search, "Kostenpflichtige" toggle (rent/buy/subscription content is hidden by default, like in the
  crawler), poster grid with infinite scroll, detail dialog (plot, genre, cast, director, price/access badge,
  trailer) and, for series, seasons with episode list.
- Play in the floating player for items with a clear, static `manifest_url`. DRM-protected items and dynamic
  (session/script) manifests are marked and not played in the browser.
- Sync status of the crawler plus a "Sync" button (all providers, or only the selected one); lists reload when a
  running sync finishes.
- Config page: VOD Crawler URL / timeout with connection test. Environment: `VOD_CRAWLER_URL`,
  `VOD_CRAWLER_TIMEOUT` (default `http://localhost:7888`).
- Flask proxy `/api/vod/{status,movies,shows,shows/<id>/episodes,sync}` and `/api/test/vod-crawler`. Parameters
  are validated; upstream errors never leak hostnames.

## Fixed
- VOD page: two effects returned a value instead of nothing, which crashed the app with "i is not a function" when leaving the tab.

## Crawler side (optional)
- `GET /api/library/movies` gets a `q` parameter (title search). Without it the search box only filters what is
  already loaded; the UI works either way.

# 2.3.7 - Show all EPG attributes

## Changed
- Program details show every attribute the EPG server returns: subtitle / `episode_name`, description / `plot`,
  category, DVB genre (`genre` / `genre_dvb`, as German label), year, country, duration, season + episode
  (`season_num` / `episode_num` as plain numbers or XMLTV-NS, `season_number` / `episode_number`), rating (FSK),
  Regie, Moderation (`presenters`), Besetzung, Drehbuch (`writers`), Produktion (`producers`), Sprache (`language`),
  image (`icon_url` / `icon` / `thumbnail_url`) and `ultimate_epg_id`. The year is `year`, else `production_year`.
- Empty values (`""`, `0`, `null`, empty lists) are not rendered at all; the "Keine Beschreibung verfügbar."
  placeholder is gone.
- Directors/actors may arrive as a string or a list.

# 2.3.6 - DRM config parsing

## Fixed
- A `X-Kodi-Drm-Configs` header without any license server (placeholder config on unencrypted
  streams) is treated as "no DRM" instead of showing "keinen nutzbaren Lizenzserver".

# 2.3.5 - DRM error handling

## Changed
- DRM errors are shown in the player and as a toast. Shaka 6020 (MISSING_EME_SUPPORT) is explained:
  Widevine/EME needs HTTPS or localhost; DRM streams on an insecure page stop with a clear message.
- Streams without a DRM header are played as clear streams (`manifest.dash.ignoreDrmInfo`), even if the
  MPD carries ContentProtection tags.
- Dependency-Check suppression is passed with an absolute path (`/github/workspace/...`).

# 2.3.4 - DRM robustness, catchup Play gate

## Security
- OWASP Dependency-Check failed on picomatch 4.0.7 (GHSA-fc5q-39xc-vjpf, ReDoS, CVSS 7.5). The advisory
  covers every released version, so no upgrade fixes it. picomatch is dev-only build tooling (vite),
  not shipped. Added `dependency-check-suppressions.xml` (expires 2026-12-15) and passed it to the
  dependency-check step.

## Changed
- Catchup **Play** is shown whenever the browser has a backend URL: `public_url`, else `url`
  (same fallback live playback already used). Before, it was hidden unless `public_url` was set.
- A DRM header that is empty (`{}`), undecodable or without a usable license server no longer blocks
  playback: a warning is shown and the stream is played without DRM.
- Player error for category-6 (DRM) errors shows the Shaka error code and no longer guesses the cause.

# 2.3.3 - Play / Download buttons, DRM playback

## Changed
- Buttons in the programme detail: **Play** (live and catchup) and **Download** (catchup). Both use the
  look of the former "Live ansehen" button; Download has the catchup (violet) colour. The channel-list
  play button's tooltip is "Play" as well.

## Added
- **DRM playback.** The manifest response of DRM-protected streams carries `X-Kodi-Drm-Configs`
  (base64 JSON, Kodi style: `server_url`, `req_headers`, `req_data`). The UI decodes it
  (`src/lib/drm.ts`) and hands Shaka the license server plus the license request headers (e.g. `CID`;
  `User-Agent` cannot be set by a browser and is skipped). Unencrypted streams have no header and
  play as before. Only `req_data = {CHA-RAW}` (raw challenge) is supported; anything else is logged.
- Manifest cache entries now expire after 5 minutes (the license token in the header is time limited).
- A DRM failure is shown in the player ("Lizenz/Widevine nicht verfuegbar") instead of failing silently.

## Backend requirement
- A browser can only read a cross-origin response header that is listed in
  `Access-Control-Expose-Headers`. The Ultimate Backend currently exposes only
  `Content-Length, Content-Range`; add `X-Kodi-Drm-Configs, X-Kodi-Stream-Format` there, otherwise
  encrypted streams cannot get their license config (the player then says so).

# 2.3.0 - tabs navigation, 3-column EPG, container fix

## Fixed
- **`Control server error: [Errno 13] Permission denied: '/home/ultimate'` on start.** gunicorn >= 25
  opens a control socket under `$HOME/.gunicorn/`; the `ultimate` user has no home directory. The
  Dockerfile now starts gunicorn with `--no-control-socket` (we never use `gunicornc`).
- **First click on "Live ansehen" wiped the page (player invisible, stream playing in the background).** The lazy shaka chunk imported `./index.js` while the page loads the entry as `index.js?v=<hash>`; the browser treated them as two modules and ran the whole app a second time, mounting a second React app over `#root`. The shared CommonJS helpers now live in their own chunk (`vite.config.ts` `manualChunks`) so lazy chunks no longer import the entry, and `main.tsx` refuses a second mount.
- **`crypto.randomUUID is not a function` broke DASH playback over plain HTTP.** `randomUUID` only exists in secure contexts; shaka-player calls it from its video event handlers and in `load()`. A small polyfill (`src/lib/polyfills.ts`, imported first in `main.tsx`) now provides it via `getRandomValues`.
- **Player started paused for DASH/HLS streams.** The shaka path never called `video.play()` after `load()`; it now does (if the browser refuses unmuted autoplay, e.g. Safari after the async manifest fetch, it retries muted; unmute via the controls).
- **"Kein Stream verfügbar" when clicking "Live ansehen" (no request sent).** The channel list from the
  mapping endpoint carries no `StreamUrl` for providers like magenta2, so the click was rejected before any
  request. Live playback now resolves the stream via `GET /api/providers/<p>/channels/<id>/manifest` on the
  public backend URL and prefers `manifest_url` (DASH/HLS); `ts_stream_url` is only the last resort. Live
  programs in the timeline use the same resolution. The toast now only appears if the manifest cannot be
  fetched either, says why (no backend URL vs. manifest not reachable) and the console logs the reason.
- **`verify-build.sh` failed: "user-facing string present: Keine Kanäle verfügbar".** The channel
  column's empty state said only "Keine Kanäle", but the reviewed set-5 checklist (and therefore
  the CI grep) expects the full phrase. The title is now "Keine Kanäle verfügbar" and the
  committed `src/static/dist` bundle was rebuilt accordingly.

## Changed
- **Navigation is a tab bar in the header** instead of a 280 px sidebar. WebEPG status and clock moved
  to the header's right side. On phones the tabs collapse to icons (active tab keeps its label).
- **EPG page is a 3-column browser:** Provider -> Channels -> Programme.
  - Channels show what is on right now (loaded lazily for visible rows only) and have a search box.
  - The programme column is one continuous list with inline, sticky day headers. It scrolls without
    limit into the past and the future (one day is fetched at a time; an end is declared after
    3 consecutive empty days). Rows show basics; the selected row expands in place with the full
    information and the play / catchup / download actions.
  - Selection lives in the URL (`/?provider=zdf&channel=123`) and is remembered for a bare `/`.
  - Below 900 px the columns become a drill-down (one column at a time, back buttons).
- Removed: card grid, "Alle EPG Kanaele" aggregate view, day-by-day navigation, program details
  modal (incl. its placeholder "Erinnerung setzen" button), `useEPG`, and the CSS only they used.

# Earlier: what changed relative to the files you originally sent

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
    the CWD, hard-coded default `SECRET_KEY` (unused) – removed. The Jinja filters (`format_time`,
    `format_datetime`, `truncate_filter`, `time_diff_filter`) and `inject_config` are kept unchanged
    for existing tests, although `spa.html` does not use them.

## Security / hardening
CSRF header on all mutating requests, server-side validation of every setting, generic error
messages to the browser, atomic config writes (keeps file mode), `X-Content-Type-Options`/
`X-Frame-Options`/`Referrer-Policy`, immutable caching for hashed assets, download length cap and
http(s)-only check on the manifest template.

## Dependencies
Frontend: `vite` 5.4 → 7.3.8 and `@vitejs/plugin-react` → 4.7.0 (8 vite dev-server advisories, one CVSS 10.0, fail
OWASP Dependency-Check at `--failOnCVSS 7`; they never shipped in the image, but they blocked the pipeline).
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

## Applying this zip to an existing checkout
Copy over: `src/`, `ultimate-ui-react/`, `Dockerfile`, `docker-compose.yml`, `requirements*.txt`, `.dockerignore`,
`nginx/`, `.github/`, and the new `tests/spa/`. Merge by hand if you already have them: `pyproject.toml`
(isort needs `profile = "black"`), `.flake8`. Do **not** overwrite your own `tests/` files (the zip no longer
contains `tests/conftest.py` or `pytest.ini`) or `config/config.yaml`.
If you extracted the *previous* zip: delete the copies it put directly into `tests/`
(`test_app_pages_and_config.py`, `test_app_proxy.py`, `test_config_and_client.py`,
`test_template_filters.py`) – they now live in `tests/spa/`, and a leftover `tests/conftest.py` of mine would
shadow yours (`git checkout -- tests/conftest.py` restores it).

## Porting old tests
| Old test expectation | Now |
|---|---|
| client `get_channels/get_providers/get_channel_programs/create_channel_alias/...` returns `[]`/`None` on HTTP or connection errors | raises `UpstreamError` → `with pytest.raises(UpstreamError):` |
| route test accepts `[200, 500]` when WebEPG is unreachable | `[200, 502]` (504 on timeout) |
| POST/PUT/DELETE without extra header | needs `X-Requested-With`; in the test client fixture: `client.environ_base["HTTP_X_REQUESTED_WITH"] = "pytest"` |
| `POST /config` with form data | JSON body (`client.post("/config", json={...})`), validated server-side |
| tests of the Jinja pages (`/epg`, `config.html` structure, `<link>`/`<script>` tags in `base.html`) | pages are the SPA now (`/epg` redirects to `/`); see `tests/spa/test_app_pages_and_config.py` – delete the old template tests |
| `Config()` without a path | unchanged: defaults + env only (a first version of the rewrite wrongly loaded `./config/config.yaml`; fixed + regression test) |

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
Verified: `tsc`, production build + `verify-build.sh` (vite 7.3.8), 56 pytest tests (also alongside a simulated foreign `tests/conftest.py`), flake8/black, clean
`pip install` + `pip check` + `pip-audit` from `requirements.txt`, and a headless-Chromium run
against gunicorn (2 workers) with fake WebEPG/Ultimate Backend: EPG renders, config save/validation/
reset, theme, multi-worker reload, error banner when WebEPG is down, no JS errors.
**Not verified (CI will be the first real run):** the workflows on GitHub itself, `docker build`/`compose up` (no Docker in my sandbox), Python 3.11 (tests ran on
3.12), real streams in the player (shaka), a real WebEPG/Ultimate Backend.
