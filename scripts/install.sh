#!/usr/bin/env bash
# Download the matching gmail-mcp release binary for this host.
#
# Env overrides:
#   VERSION  release tag (default: latest)
#   PREFIX   install root  (default: $HOME/.local — binary goes in $PREFIX/bin)

set -euo pipefail

REPO="AeyeOps/Gmail-MCP-Server"
VERSION="${VERSION:-latest}"
PREFIX="${PREFIX:-$HOME/.local}"
BIN_DIR="$PREFIX/bin"
DEST="$BIN_DIR/gmail-mcp"

os="$(uname -s)"
arch="$(uname -m)"

case "$os/$arch" in
  Darwin/arm64)         asset="gmail-mcp-darwin-arm64" ;;
  Linux/x86_64)         asset="gmail-mcp-linux-x64" ;;
  Linux/aarch64|Linux/arm64) asset="gmail-mcp-linux-arm64" ;;
  *)
    echo "error: unsupported platform $os/$arch" >&2
    echo "see https://github.com/$REPO/releases for available assets" >&2
    exit 1
    ;;
esac

if [ "$VERSION" = "latest" ]; then
  url="https://github.com/$REPO/releases/latest/download/$asset"
else
  url="https://github.com/$REPO/releases/download/$VERSION/$asset"
fi

mkdir -p "$BIN_DIR"
tmp="$(mktemp "${TMPDIR:-/tmp}/gmail-mcp.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

echo "downloading $asset ($VERSION) -> $DEST"
curl -fsSL --retry 3 --retry-delay 2 -o "$tmp" "$url"
chmod +x "$tmp"
mv -f "$tmp" "$DEST"
trap - EXIT

echo "installed: $DEST"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "note: $BIN_DIR is not on \$PATH — add it to use the bare 'gmail-mcp' command" ;;
esac
