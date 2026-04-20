# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-04-20

### Fixed

- `delete_email` and `batch_delete_emails` previously called
  `users.messages.delete`, which requires the full `https://mail.google.com/`
  OAuth scope — but this fork only requests `gmail.modify` +
  `gmail.settings.basic`, so both tools returned "Insufficient Permission" for
  every id. Pre-existing defect inherited from upstream; never worked in this
  fork. Both handlers now call `users.messages.trash`, which works on the
  existing `gmail.modify` scope. Note the semantic shift: these tools were
  previously intended for permanent deletion, and now move messages to Trash
  instead.
- Corrected `repository.url`, `bugs.url`, and `homepage` in `package.json` to
  reference the `AeyeOps` org instead of the `aeyeopsdev` user account (the
  actual repo lives at `github.com/AeyeOps/Gmail-MCP-Server`). Pure metadata
  fix so `npm view`, `npm bugs`, and `npm repo` resolve correctly.
- Renumbered § Available Tools in README — the list previously had two entries
  numbered `14` (`batch_delete_emails` and `create_filter`). Now sequential
  1..23 with no duplicates.
- Reconciled stale description strings in `src/index.ts`: the `delete_draft`
  tool description no longer references the (now incorrect) `mail.google.com`
  scope claim for `delete_email`; `DeleteEmailSchema.messageId` and
  `BatchDeleteEmailsSchema.messageIds` parameter descriptions now read
  "move to Trash" instead of "delete" to match the updated behavior.

### Changed

- `delete_email` behavior: previously documented as "permanently deletes" (but
  non-functional per the scope gap above). Now moves messages to Trash —
  recoverable from the Trash folder; Gmail auto-purges after 30 days. Tool
  name preserved for MCP client config compatibility.
- `batch_delete_emails` behavior: same shift — moves messages to Trash in
  batches rather than permanently deleting.
- README Features section: "Delete emails" → "Move emails to Trash (with
  recovery, auto-purged after 30 days)"; added "Full draft management —
  create, update, list, get, and delete drafts by ID".

### Added

- `list_drafts` tool wrapping `users.drafts.list`. Optional `maxResults`
  (default 20) and `q` (Gmail search syntax). Returns an array of
  `{draftId, messageId, threadId}` so agents can enumerate drafts without
  having persisted ids from prior `draft_email` responses.
- `get_draft` tool wrapping `users.drafts.get` with `format: 'full'`. Takes
  `draftId`, returns headers, body (plain text preferred, HTML fallback), and
  attachment metadata. Parallel to `read_email` but for unsent drafts.
- Documented `update_draft` and `delete_draft` (shipped in 1.2.0) in § Available
  Tools — they were registered in the server but never appeared in the
  README's tool list.

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
