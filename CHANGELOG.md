# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
