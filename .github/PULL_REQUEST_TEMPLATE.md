## Summary

<!--
Describe the change in 2-3 sentences. What problem does it solve and how?
-->

## Linked issue

<!--
Closes #ISSUE_NUMBER
or "No related issue" if this is a standalone change.
-->

## Changes

<!--
Bullet list of the significant changes made in this PR. Group by area if helpful.

- feat(terminal): add WebGL renderer toggle to settings
- fix(pty): prevent double-close on Windows ConPTY handle
-->

## Screenshots / Recordings

<!--
For UI changes: before/after screenshots or a short screen recording.
Delete this section if not applicable.
-->

## Checklist

- [ ] `pnpm typecheck` passes locally
- [ ] `pnpm lint` passes locally
- [ ] `pnpm test` passes locally
- [ ] `cargo clippy --all-targets -- -D warnings` passes locally (if Rust files changed)
- [ ] New public APIs or complex logic are documented (JSDoc / rustdoc)
- [ ] An ADR has been added or updated in `docs/adr/` if this is an architectural decision
- [ ] Breaking changes are noted in `CHANGELOG.md` under `## [Unreleased]`
- [ ] This PR is scoped to a single concern (split if not)
