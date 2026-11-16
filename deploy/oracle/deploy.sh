#!/usr/bin/env bash
# Update the existing NAVDECK Oracle VM in place, preserving the MongoDB
# container/volume, Ollama configuration, host Nginx, and TLS certificates.
# Run after: cd /opt/navdeck/app && git pull --ff-only
#            sudo bash deploy/oracle/deploy.sh
set -Eeuo pipefail

cd /opt/navdeck/app
if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/oracle/deploy.sh" >&2
  exit 1
fi
for command in docker git curl python3; do
  command -v "$command" >/dev/null || { echo "Missing: $command" >&2; exit 1; }
done
docker info >/dev/null
docker network inspect navdeck-network >/dev/null
for name in navdeck-backend navdeck-frontend navdeck-mongodb; do
  docker container inspect "$name" >/dev/null || {
    echo "Expected existing container $name is missing. No changes made." >&2
    exit 1
  }
done
[[ "$(docker inspect -f '{{.State.Running}}' navdeck-mongodb)" == true ]] || {
  echo "MongoDB is not running. No changes made." >&2; exit 1;
}

# BuildKit may need several GB while React is compiling. Never prune or
# touch the existing MongoDB volume to free space.
available_kb="$(df -Pk /opt/navdeck/app | awk 'END {print $4}')"
if (( available_kb < 6 * 1024 * 1024 )); then
  echo "At least 6 GB free disk space is required for safe image builds." >&2
  echo "Expand the Oracle boot volume first; MongoDB data was not changed." >&2
  exit 1
fi

# Snapshot the actual backend environment, including local MongoDB and
# existing Ollama settings, without printing or committing any secrets.
runtime_env="$(mktemp)"
chmod 600 "$runtime_env"
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' navdeck-backend > "$runtime_env"
if ! grep -q '^MONGO_URL=.*navdeck-mongodb' "$runtime_env"; then
  echo "Backend is not configured for the local navdeck-mongodb host. Aborting." >&2
  rm -f "$runtime_env"
  exit 1
fi
if ! grep -q '^CLERK_SECRET_KEY=sk_' "$runtime_env" ||
   ! grep -q '^CLERK_PUBLISHABLE_KEY=pk_' "$runtime_env"; then
  echo "Clerk is not configured in the existing backend. Aborting." >&2
  rm -f "$runtime_env"
  exit 1
fi

version="$(git rev-parse --short=12 HEAD)"
backend_image="navdeck-backend:oracle-${version}"
frontend_image="navdeck-frontend:oracle-${version}"
suffix="$(date -u +%Y%m%dT%H%M%SZ)"
backend_backup="navdeck-backend-backup-${suffix}"
frontend_backup="navdeck-frontend-backup-${suffix}"
backend_candidate="navdeck-backend-candidate-${suffix}"
frontend_candidate="navdeck-frontend-candidate-${suffix}"
swapping=0

finish() {
  local result=$?
  trap - EXIT
  docker rm -f "$backend_candidate" "$frontend_candidate" >/dev/null 2>&1 || true
  rm -f "$runtime_env"
  if (( result != 0 && swapping == 1 )); then
    echo "Deployment failed: restoring the previous NAVDECK containers..." >&2
    docker rm -f navdeck-frontend navdeck-backend >/dev/null 2>&1 || true
    if docker inspect "$backend_backup" >/dev/null 2>&1; then
      docker rename "$backend_backup" navdeck-backend
      docker start navdeck-backend
    fi
    if docker inspect "$frontend_backup" >/dev/null 2>&1; then
      docker rename "$frontend_backup" navdeck-frontend
      docker start navdeck-frontend
    fi
  fi
  exit "$result"
}
trap finish EXIT

echo "Building Oracle-native NAVDECK backend ${version}..."
DOCKER_BUILDKIT=1 docker build -f deploy/oracle/backend.Dockerfile -t "$backend_image" .
echo "Building same-origin NAVDECK frontend (no Render API)..."
DOCKER_BUILDKIT=1 docker build -f deploy/oracle/frontend.Dockerfile -t "$frontend_image" .

echo "Checking new backend against the existing private MongoDB..."
docker run -d --name "$backend_candidate" --network navdeck-network \
  --env-file "$runtime_env" "$backend_image" >/dev/null
ready=0
for attempt in {1..12}; do
  if docker exec "$backend_candidate" python -c \
    'import json,urllib.request; u=urllib.request.urlopen("http://127.0.0.1:8000/health/ready",timeout=9); assert json.load(u)["database"]=="connected"' \
    >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 3
done
if (( ready != 1 )); then
  echo "New backend cannot reach local MongoDB; existing site was not changed." >&2
  docker logs --tail 12 "$backend_candidate" >&2 || true
  exit 1
fi

echo "Checking frontend assets and private API reverse proxy..."
docker run -d --name "$frontend_candidate" --network navdeck-network \
  -p 127.0.0.1:8081:80 "$frontend_image" >/dev/null
frontend_ready=0
for attempt in {1..12}; do
  if curl -fsS --max-time 6 http://127.0.0.1:8081/desktop/connect >/dev/null &&
     curl -fsS --max-time 6 http://127.0.0.1:8081/api/clerk/config |
       python3 -c 'import json,sys; assert json.load(sys.stdin)["enabled"] is True'; then
    frontend_ready=1
    break
  fi
  sleep 2
done
if (( frontend_ready != 1 )); then
  echo "New frontend failed its local checks; existing site was not changed." >&2
  exit 1
fi

echo "Switching containers (MongoDB and host Nginx remain untouched)..."
swapping=1
docker stop navdeck-frontend >/dev/null
docker rename navdeck-frontend "$frontend_backup"
docker stop navdeck-backend >/dev/null
docker rename navdeck-backend "$backend_backup"
docker rm -f "$frontend_candidate" "$backend_candidate" >/dev/null

docker run -d --name navdeck-backend --restart unless-stopped \
  --network navdeck-network --env-file "$runtime_env" "$backend_image" >/dev/null
docker run -d --name navdeck-frontend --restart unless-stopped \
  --network navdeck-network -p 127.0.0.1:8080:80 "$frontend_image" >/dev/null

echo "Verifying the live local Oracle site..."
success=0
for attempt in {1..15}; do
  if curl -fsS --max-time 9 http://127.0.0.1:8080/health/ready |
      python3 -c 'import json,sys; assert json.load(sys.stdin)["database"]=="connected"' &&
     curl -fsS --max-time 9 http://127.0.0.1:8080/api/clerk/config |
      python3 -c 'import json,sys; assert json.load(sys.stdin)["enabled"] is True'; then
    success=1
    break
  fi
  sleep 2
done
if (( success != 1 )); then
  echo "Health checks failed after switching; rolling back." >&2
  exit 1
fi
swapping=0

echo "NAVDECK ${version} is running on Oracle with local MongoDB."
echo "Existing MongoDB container and volume have not been modified."
echo "Previous containers retained for rollback: ${backend_backup}, ${frontend_backup}"
echo "Check externally: https://test.navdeck.online/health/ready"
echo "Check desktop login: https://test.navdeck.online/desktop/connect"
