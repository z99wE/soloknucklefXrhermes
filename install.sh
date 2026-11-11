#!/usr/bin/env bash
# Soloknuckle installer for Linux and macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/z99wE/soloknucklefXrhermes/main/install.sh | bash
#
# Downloads one release tarball (a single bundled Node script, so there is no
# platform-specific build to get wrong) and puts it on your PATH. It never edits
# your shell rc files: if the install directory is not on PATH it tells you the
# exact line to add.
#
# Prefer npm? `npm install -g soloknuckle` does the same thing.

set -euo pipefail

REPO="${SOLOKNUCKLE_REPO:-z99wE/soloknucklefXrhermes}"
INSTALL_DIR="${SOLOKNUCKLE_INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="soloknuckle"
MIN_NODE_MAJOR=20

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()  { printf "${GREEN}[info]${NC}  %s\n" "$1"; }
warn()  { printf "${YELLOW}[warn]${NC}  %s\n" "$1"; }
error() { printf "${RED}[error]${NC} %s\n" "$1" >&2; exit 1; }

check_deps() {
  for cmd in curl tar node; do
    command -v "$cmd" >/dev/null 2>&1 || error "'$cmd' is required but not installed."
  done

  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -lt "$MIN_NODE_MAJOR" ]; then
    error "Node ${MIN_NODE_MAJOR}+ is required (found $(node -v))."
  fi
}

latest_version() {
  if [ -n "${SOLOKNUCKLE_VERSION:-}" ]; then
    printf '%s' "$SOLOKNUCKLE_VERSION"
    return
  fi

  local tag
  tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null \
    | grep -m1 '"tag_name"' \
    | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')" || true

  if [ -z "${tag:-}" ]; then
    error "Could not read the latest release of ${REPO}. Set SOLOKNUCKLE_VERSION=vX.Y.Z, or install with npm."
  fi
  printf '%s' "$tag"
}

install() {
  local version="$1"
  local url="https://github.com/${REPO}/releases/download/${version}/soloknuckle.tar.gz"
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  # shellcheck disable=SC2064  # expand tmp_dir now, not at trap time
  trap "rm -rf '$tmp_dir'" EXIT

  info "Downloading ${BINARY_NAME} ${version}"
  curl -fsSL "$url" -o "$tmp_dir/soloknuckle.tar.gz" \
    || error "No release asset at ${url}. Install with npm instead: npm install -g soloknuckle"

  tar -xzf "$tmp_dir/soloknuckle.tar.gz" -C "$tmp_dir"
  [ -f "$tmp_dir/$BINARY_NAME" ] || error "Archive did not contain ${BINARY_NAME}."

  mkdir -p "$INSTALL_DIR"
  mv "$tmp_dir/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
  chmod +x "$INSTALL_DIR/$BINARY_NAME"

  info "Installed to ${INSTALL_DIR}/${BINARY_NAME}"
}

check_path() {
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*) ;;
    *)
      warn "${INSTALL_DIR} is not on your PATH. Add this line to your shell rc file:"
      printf '\n    export PATH="%s:$PATH"\n\n' "$INSTALL_DIR"
      ;;
  esac
}

main() {
  printf "${BOLD}Soloknuckle${NC} - production hygiene for solo developers\n\n"

  check_deps
  local version
  version="$(latest_version)"
  install "$version"
  check_path

  printf '\n'
  if command -v "$BINARY_NAME" >/dev/null 2>&1; then
    info "Verified: $("$BINARY_NAME" --version 2>/dev/null || echo 'installed')"
  fi

  cat <<'EOF'

Next steps:

    cd your-project
    soloknuckle init      # scaffold AGENTS.md and safe git hooks
    soloknuckle check     # score the project

For the Hermes plugin, see hermes-plugin/ in the repository.
EOF
}

main "$@"
