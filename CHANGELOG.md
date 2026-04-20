# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-04-20

### Changed

- Rewrote README to reflect the fork-only install path. Removed the Smithery
  badge and install block (this fork isn't on Smithery), replaced all
  `npx @gongrzhe/server-gmail-autoauth-mcp` install/auth commands with the
  local `gmail-mcp` binary (installed via `npm run build-and-install`), and
  retrofitted the Docker section to build from this repo's `Dockerfile` into
  a local `aeyeops-gmail-mcp:local` tag instead of pulling the upstream
  `mcp/gmail` image. Fork notice at the top of README now matches the one
  in `llms-install.md`.

## [1.3.0] - 2026-04-20

### Changed

- Renamed npm package scope from `@gongrzhe/server-gmail-autoauth-mcp` to
  `@aeyeops/server-gmail-autoauth-mcp`, establishing AeyeOps as the fork
  maintainer. The unscoped name and the `gmail-mcp` binary are unchanged,
  so existing MCP client configurations (e.g. `~/.claude.json`) continue
  to work without edits. Original author and MIT copyright are preserved;
  AeyeOps added as a contributor.

## [1.2.0] - 2026-04-20

### Added

- `update_draft` tool wrapping Gmail's `users.drafts.update` so drafts can be
  modified by id without the delete-then-recreate workaround. Accepts the same
  fields as `draft_email` plus `draftId`. `threadId` must be passed explicitly
  to preserve thread association — omitting it unthreads the draft.
- `delete_draft` tool wrapping `users.drafts.delete`. Works on the existing
  `gmail.modify` token, unlike `delete_email` which requires the full
  `https://mail.google.com/` scope for permanent message deletion.

## [1.1.11] - Upstream baseline

Forked from upstream `@gongrzhe/server-gmail-autoauth-mcp` at version 1.1.11.
Fork-specific changes prior to 1.2.0 (reply-threading refactor,
build-and-install tooling, test coverage) are captured in git history.
