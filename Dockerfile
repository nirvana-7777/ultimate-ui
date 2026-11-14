# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: build the React SPA (output goes to /build/dist)
# ---------------------------------------------------------------------------
# --platform=$BUILDPLATFORM: the SPA is platform-independent, so build it natively once
# instead of under QEMU emulation for every target architecture.
FROM --platform=$BUILDPLATFORM node:25-alpine AS frontend
WORKDIR /build

# package-lock.json MUST be committed or `npm ci` fails
COPY ultimate-ui-react/package.json ultimate-ui-react/package-lock.json ./
RUN npm ci

COPY ultimate-ui-react/ ./
RUN VITE_OUT_DIR=/build/dist npm run build

# ---------------------------------------------------------------------------
# Stage 2: Python dependencies (all pinned wheels - no compiler needed)
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS builder
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 3: runtime image
# ---------------------------------------------------------------------------
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Fixed uid/gid so a bind-mounted ./config can be chown'ed to match:
#   sudo chown -R 10001:10001 ./config
RUN groupadd --system --gid 10001 ultimate \
    && useradd --system --uid 10001 --gid ultimate --no-create-home ultimate

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ULTIMATE_UI_CONFIG=/app/config/config.yaml

# Application code + the SPA built in stage 1 (Flask serves src/static/dist)
COPY src/ /app/src/
COPY --from=frontend /build/dist /app/src/static/dist

RUN mkdir -p /app/config && chown -R ultimate:ultimate /app/config

USER ultimate
EXPOSE 7779

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:7779/health || exit 1

# gthread workers: a long catchup download occupies one thread, not a worker.
# Each worker re-reads config.yaml when it changes, so UI saves reach all of them.
CMD ["gunicorn", "--bind", "0.0.0.0:7779", "--workers", "2", "--threads", "8", \
     "--timeout", "120", "--access-logfile", "-", "src.app:app"]
