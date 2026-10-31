# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Node 20 or later is now required (was 14 in `engines`, 18 in practice).
  nodemailer 10.1.4, the first release that clears its open advisories,
  needs Node 20.

### Security

- nodemailer 7 to 10.3.1. Several of the cleared advisories are in the
  address parser that every HTML or attachment message goes through.
- googleapis 129 to 150.0.1, past the uuid advisory in googleapis-common.
  The OAuth client is now built with `google.auth.OAuth2`, the class googleapis
  consumes, and the direct google-auth-library dependency is dropped.
- @modelcontextprotocol/sdk 0.4 to 1.32.2. Server capabilities move to the
  constructor's second argument.
- zod 3 to 4.6.7. Tool input schemas now come from zod's own
  `z.toJSONSchema` in input mode, so fields with defaults stay optional, and
  zod-to-json-schema is dropped.
- vitest 2 to 4.1.12 for development.
- In-range fixes from `npm audit fix`, including jws 4.0.1 and jwa 2.0.1. jwa
  2.0.0 read `SlowBuffer`, which Node 26 removed, so the server crashed at
  startup there.
- Still open: rimraf, glob and minimatch under gaxios 7.1.3, which
  googleapis-common pins and nothing calls at runtime.

### Removed

- The `mcp-evals` harness (`src/evals`) and its README section. It could not
  run on zod 4, no `mcp-evals` release moves past `ai` 4, and its dependency
  chain carried advisories with no fix.

### Fixed

- `read_email` printed only From, To, Subject and Date. It now adds a
  `Labels:` line with the message's label IDs after `Message-ID:`. Header
  lines follow in this order: From, To, Cc, Bcc, Reply-To, Subject, Date. A
  header the message does not have is left out.
- `search_emails` printed only ID, Subject, From and Date. Each result now
  lists `ID`, `Thread ID` and `Labels`, then the same header lines as
  `read_email`. Drafts carry the `DRAFT` label. When more messages match than
  `maxResults` returned, the output ends with a note saying so. When nothing
  matches, it returns `No messages matched the query.` instead of empty text.
- `list_drafts` returned a bare array of `{draftId, messageId, threadId}`. It
  now returns `{"drafts": [...], "hasMore": bool}`. Each draft adds
  `subject`, `to`, `cc` and `date` when the draft has them. `hasMore` is true
  when more drafts match than `maxResults` returned.
- All tools: a failure now returns `isError: true` with the text
  `Error: <message>`. Failures previously came back as normal results, and
  `download_attachment` used its own `Failed to download attachment:` text.
- `download_attachment` overwrote an existing file of the same name. It now
  fails with `EEXIST`. Without `filename`, it looked up the original name from
  the attachment ID. Gmail issues new attachment IDs on every read, so the
  lookup usually missed. The fallback name `attachment-<id>` then failed with
  `ENAMETOOLONG`, because the ID runs to about 400 characters. It now fails
  with the cause. Pass `filename`, the name `read_email` lists. A
  filename taken from the message is reduced to its base name, so it cannot
  point outside `savePath`.
- `send_email` and `draft_email` logged a warning and sent or saved the
  message unthreaded when the `threadId` lookup failed. They now fail. An
  `inReplyTo` value without `@` is treated as a Gmail message ID, and a failed
  lookup of it also fails the call. `update_draft` uses the same lookups and
  fails the same way. The `send_email` and `draft_email` success text adds a
  second line, `Thread ID: <id>`.
- `get_or_create_label` reported `found existing` for a label it had just
  created. It now reports `created new` when it creates the label.
- `modify_email` dropped `labelIds` when `addLabelIds` was also given. It now
  applies both.

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
