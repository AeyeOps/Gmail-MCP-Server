SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := help

VERSION ?= v$(shell jq -r .version package.json)
ENTRY := src/index.ts
DIST := binaries
BIN := gmail-mcp

TARGETS := bun-linux-x64 bun-linux-arm64 bun-darwin-arm64

.PHONY: help clean build-binaries release

help:  ## Show available targets
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

clean:  ## Remove built binaries
	rm -rf $(DIST)

build-binaries: clean  ## Build standalone bun binaries (linux-x64, linux-arm64, darwin-arm64)
	@[ -d node_modules ] || { echo "run 'npm install' first"; exit 1; }
	@command -v bun >/dev/null || { echo "bun not installed - https://bun.sh/install"; exit 1; }
	mkdir -p $(DIST)
	@for t in $(TARGETS); do \
		out="$(DIST)/$(BIN)-$${t#bun-}"; \
		echo "==> $$out"; \
		bun build --compile --target=$$t $(ENTRY) --outfile=$$out; \
	done
	@ls -lah $(DIST)

release: build-binaries  ## Build + publish GitHub Release (VERSION defaults to v<package.json>)
	@command -v gh >/dev/null || { echo "gh CLI not installed"; exit 1; }
	@if gh release view $(VERSION) >/dev/null 2>&1; then \
		echo "release $(VERSION) already exists - delete with: gh release delete $(VERSION)"; \
		exit 1; \
	fi
	gh release create $(VERSION) $(DIST)/$(BIN)-* --title "$(VERSION)" --generate-notes
