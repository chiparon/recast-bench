#!/usr/bin/env bash
# Optional private container engine when Windows Docker Desktop is unavailable.
# Run with: wsl -d Ubuntu -u root -- bash /mnt/e/Eproject/recast-bench-nl2repo/src/nl2repo/setup-wsl-docker.sh
set -euo pipefail
runtime=/opt/recast/nl2repo-docker
mkdir -p "$runtime"
cd "$runtime"
if [[ ! -x docker/dockerd ]]; then
  curl -fL --retry 2 --connect-timeout 15 --max-time 180 \
    https://download.docker.com/linux/static/stable/x86_64/docker-29.10.0.tgz -o docker-29.10.0.tgz
  curl -fL --connect-timeout 15 --max-time 30 \
    https://download.docker.com/linux/static/stable/x86_64/docker-29.10.0.tgz.sha256 -o docker-29.10.0.tgz.sha256
  sha256sum -c docker-29.10.0.tgz.sha256
  tar -xzf docker-29.10.0.tgz
fi
if [[ -f daemon.pid ]] && kill -0 "$(cat daemon.pid)" 2>/dev/null; then
  echo 'NL2Repo private Docker daemon is already running.'
  exit 0
fi
exec env PATH="$runtime/docker:$PATH" "$runtime/docker/dockerd" \
  --data-root "$runtime/data" --exec-root "$runtime/exec" --pidfile "$runtime/daemon.pid" \
  --host "unix://$runtime/docker.sock" --iptables=false --ip6tables=false --bridge=none \
  --ip-forward=false --ip-masq=false
