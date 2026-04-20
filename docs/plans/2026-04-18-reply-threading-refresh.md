# Gmail MCP Reply Threading Refresh Implementation Plan

> For Hermes: Use subagent-driven-development skill to implement this plan task-by-task.

Goal: Refresh the Gmail MCP fork from latest upstream main and carry forward only the still-valid server-side reply-threading fixes needed for robust Gmail replies.

Architecture: Start from latest upstream main on a fresh branch in the fork. Implement the smallest clean server patch that combines: Gmail API id -> RFC 2822 Message-ID resolution, read_email Message-ID exposure, optional threadId-only auto-resolution, and RFC-compliant formatting hardening. Explicitly exclude Hermes-side typed-argument coercion patches and unrelated send-as alias work.

Tech Stack: TypeScript, Gmail API via googleapis, zod, nodemailer, npm build, Node test runner / existing repo test setup.

---

### Task 1: Refresh repository state and create a clean branch

Objective: Ensure implementation starts from latest upstream main rather than old patch history.

Files:
- Modify: git history only

Step 1: Fetch all remotes.
Run: `git fetch origin --prune && git fetch upstream --prune`
Expected: origin and upstream refs updated.

Step 2: Verify upstream main head.
Run: `git rev-parse --short upstream/main && git log --oneline -n 5 upstream/main`
Expected: current upstream tip is visible.

Step 3: Create a fresh branch from upstream/main.
Run: `git checkout -B fix/reply-threading-refresh upstream/main`
Expected: branch points exactly at upstream/main.

Step 4: Verify branch contains no old local patch stack.
Run: `git status --short && git log --oneline --decorate -n 3`
Expected: clean working tree on fresh branch.

Step 5: Commit
No commit in this task.

### Task 2: Port PR #97 core reply-resolution logic

Objective: Resolve Gmail API message ids to RFC Message-ID values before writing reply headers.

Files:
- Modify: `src/index.ts`
- Modify: `src/utl.ts`

Step 1: Write/adjust code so when `validatedArgs.inReplyTo` is present the server fetches the referenced message metadata with `Message-ID` and `References`.

Step 2: Replace Gmail API id with RFC Message-ID and build a resolved references chain.
Implementation target:
- `validatedArgs.inReplyTo = <resolved Message-ID>` when available
- `validatedArgs._resolvedReferences = <existing References + resolved Message-ID>` when available
- fall back without error if lookup fails

Step 3: Update MIME builders to use `_resolvedReferences || inReplyTo` for `References`.

Step 4: Build the project.
Run: `npm run build`
Expected: build passes.

Step 5: Commit
Run: `git add src/index.ts src/utl.ts && git commit -m "fix: resolve RFC message ids for reply threading"`

### Task 3: Port PR #91 read_email Message-ID exposure

Objective: Surface RFC Message-ID in `read_email` output so callers can use it directly.

Files:
- Modify: `src/index.ts`

Step 1: Update `read_email` header extraction to include `message-id`.

Step 2: Add `Message-ID: ...` to the returned text block near Thread ID.

Step 3: Build the project.
Run: `npm run build`
Expected: build passes.

Step 4: Commit
Run: `git add src/index.ts && git commit -m "feat: expose message-id in read_email output"`

### Task 4: Port PR #91 optional threadId-only auto-resolution

Objective: Make replies work when callers provide `threadId` but omit `inReplyTo`.

Files:
- Modify: `src/index.ts`

Step 1: Add logic before message construction:
- if `threadId` is set and `inReplyTo` is absent,
- fetch thread metadata,
- collect all `Message-ID` headers,
- set `inReplyTo` to the last message Message-ID,
- set `references` to the full chain.

Step 2: Ensure failures degrade gracefully with warning only.

Step 3: Build the project.
Run: `npm run build`
Expected: build passes.

Step 4: Commit
Run: `git add src/index.ts && git commit -m "feat: auto-resolve reply headers from threadId"`

### Task 5: Port PR #75 formatting hardening

Objective: Normalize threading headers to RFC-compliant angle-bracketed Message-ID formatting and support explicit references.

Files:
- Modify: `src/index.ts`
- Modify: `src/utl.ts`

Step 1: Add `references` to `SendEmailSchema` as optional `string | string[]`.

Step 2: Add helper functions in `src/utl.ts`:
- `formatMessageId(messageId)`
- `formatReferences(references)`

Step 3: Update both message builders so:
- `In-Reply-To` always uses formatted Message-ID
- `References` prefers explicit `references`, else `_resolvedReferences`, else `inReplyTo`

Step 4: Build the project.
Run: `npm run build`
Expected: build passes.

Step 5: Commit
Run: `git add src/index.ts src/utl.ts && git commit -m "fix: harden RFC threading header formatting"`

### Task 6: Add focused regression tests

Objective: Add coverage for the new threading behavior without introducing unrelated feature scope.

Files:
- Create or modify: `src/utl.test.ts`
- Optionally modify: `package.json`
- Optionally create: `vitest.config.ts` if required for test runner

Step 1: Add tests for:
- angle bracket normalization
- references chain formatting
- `createEmailMessage` using explicit references
- fallback to resolved references / inReplyTo

Step 2: Add source-level verification or minimal tests for:
- `read_email` exposing Message-ID
- reply-resolution logic presence in `src/index.ts`

Step 3: Run tests.
Run: `npm test`
Expected: tests pass.

Step 4: Build again.
Run: `npm run build`
Expected: build passes.

Step 5: Commit
Run: `git add package.json vitest.config.ts src/utl.ts src/utl.test.ts src/index.ts && git commit -m "test: cover reply threading fixes"`

### Task 7: Final validation, diff review, and push

Objective: Verify only intended scope is present and publish clean branch to fork.

Files:
- Modify: git history only

Step 1: Review final diff against upstream main.
Run: `git diff --stat upstream/main...HEAD && git diff --name-only upstream/main...HEAD`
Expected: only intended files changed.

Step 2: Confirm excluded items are absent.
Run: `git diff upstream/main...HEAD -- src/index.ts src/utl.ts | rg 'from:|coerce|preprocess|Expected array|Expected number' -n || true`
Expected: no alias support or coercion patch content added.

Step 3: Run full validation.
Run: `npm test && npm run build`
Expected: all pass.

Step 4: Push branch.
Run: `git push -u origin fix/reply-threading-refresh`
Expected: branch published to fork.

Step 5: Optional PR creation
Run: `gh pr create --repo AeyeOps/Gmail-MCP-Server --base main --head fix/reply-threading-refresh --draft --title "fix: refresh reply threading support" --body "Refresh fork from latest upstream main and port server-side reply-threading fixes only."`
Expected: draft PR created in fork.

---

Explicit exclusions:
- Do not carry forward old bridge-only typed-argument coercion patches.
- Do not add unrelated send-as alias / `from` support.
- Do not replay any old mixed patch stack from legacy branches.
