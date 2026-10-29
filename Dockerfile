# Design Canvas — frontend build + FastAPI (one process on :8000)
# Build:  docker build -t design-canvas .
# Run:    docker run --rm -p 8000:8000 -v design-canvas-data:/data design-canvas
#
# Optional Litestream → Azure Blob (ephemeral disks / Container Apps):
#   -e LITESTREAM_ENABLED=1 \
#   -e LITESTREAM_AZURE_ACCOUNT_NAME=... \
#   -e LITESTREAM_AZURE_CONTAINER=... \
#   -e LITESTREAM_AZURE_ACCOUNT_KEY=...   # or use Managed Identity on Azure

# --- frontend ---
FROM node:22-alpine AS frontend
# One switch for the optional modules (for example "design,cv"): the frontend build and the API both read it.
ARG ENABLED_MODULES=design
ENV VITE_ENABLED_MODULES=$ENABLED_MODULES
# Absolute origin for canonical links and the sitemap, for example https://designcanvas.example
ARG SITE_URL=
ENV SITE_URL=$SITE_URL
WORKDIR /src/app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

# --- runtime ---
FROM python:3.12-slim
WORKDIR /app

ARG LITESTREAM_VERSION=0.5.17
ARG TARGETARCH

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && case "${TARGETARCH}" in \
         amd64) LITESTREAM_ARCH=x86_64 ;; \
         arm64) LITESTREAM_ARCH=arm64 ;; \
         *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
       esac \
    && curl -fsSL -o /tmp/litestream.tar.gz \
         "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${LITESTREAM_ARCH}.tar.gz" \
    && tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz \
    && rm /tmp/litestream.tar.gz \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements-modules.txt /app/backend/
RUN pip install --no-cache-dir -r /app/backend/requirements.txt -r /app/backend/requirements-modules.txt

COPY backend/ /app/backend/
COPY --from=frontend /src/app/dist /app/app/dist
# Backend loads problems from app/src/problems (override with PROBLEMS_DIR)
COPY app/src/problems /app/app/src/problems
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ARG ENABLED_MODULES=design
ENV ENABLED_MODULES=$ENABLED_MODULES
ENV DB_PATH=/data/data.sqlite3
ENV LITESTREAM_ENABLED=0
ENV LITESTREAM_AZURE_PATH=data.sqlite3
ENV PYTHONUNBUFFERED=1

VOLUME ["/data"]
EXPOSE 8000

WORKDIR /app/backend
ENTRYPOINT ["/entrypoint.sh"]
