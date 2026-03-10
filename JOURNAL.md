# Project Journal

This file is the permanent log of sessions, decisions, blockers, and learnings. It serves as the memory bridge between context windows.

---

## Project Started - 2026-03-02

**Initial Goal:** Build an MCP server (ezfhir) that gives AI models precise, token-efficient access to the FHIR specification via a custom compact format (EZF) and deterministic analysis tools.

**Key Decisions Made:**
- Two-layer approach: compact summaries (EZF) for orientation, deterministic tools for precision
- EZF format defined with formal grammar in COMPACT-FORMAT-SPEC.md (v0.1)
- FSH used on-demand via GoFSH, not as the primary compact format
- Phase 0 spike with explicit go/no-go exit criteria before full investment
- Model assignment: Opus ~20% (design), Sonnet ~40% (core impl), Haiku ~40% (mechanical work)
- R4 package included in day-one targets for cross-version comparison support
- ContentReference elements represented as `@ref(path)` in EZF
- Error contracts required for all tools before implementation

**Planning Documents:**
- PLAN.md — full project plan with phased implementation and model assignments
- COMPACT-FORMAT-SPEC.md — formal EZF format specification
- TESTING-STRATEGY.md — four-category testing approach
- additional_notes.md — resolved planning issues tracker

---

## Maintenance Note - 2026-03-06

### vitest config: pool changed to forks/singleFork

The previous session froze because vitest worker threads (spawned as a pool of 4+) became orphaned when Claude Code aborted a test run. The orphaned workers spun at 100% CPU indefinitely, starving the container and wedging the Claude Code event loop.

**Fix applied to `vitest.config.ts`:** Changed pool to `forks` with `singleFork: true`. Forked processes receive SIGHUP when their parent dies (worker threads don't), and single-fork means only one child process to manage instead of 4+. No meaningful speed impact for this project's test suite.

Previous session context was lost due to the freeze — no handoff was written. Check `git log` for the last committed state.

---

## Session Handoff - 2026-03-10

### Completed This Session
- Committed previously uncommitted fixes from crashed session (`ba496d6`):
  - `specPackageLoader.ts`: Added `findHtmlDir()` to handle spec zip extracting into subdirectories (e.g. `fhir-spec/site/`); updated all public functions; bumped unzip timeout; added progress logging; cleaned unused imports
  - `vitest.config.ts`: Switched pool to `forks` with `singleFork: true` to prevent orphaned worker threads from freezing the container
  - `JOURNAL.md`: Added maintenance note about the vitest crash
- Ran full test suite: **571 tests passing across 30 files** (~74s)
- Produced functionality summary of all MCP tools and information sources

### Current State
- Branch: `main` (1 commit ahead of origin — not pushed)
- Last checkpoint: `ba496d6 Fix spec loader subdirectory handling and prevent vitest thread orphaning`
- Tests: All 571 passing
- Untracked: 10 exploratory scripts in `scripts/` from Phase 0-2 development (not committed)

### Next Steps
1. Decide whether to push `main` to origin
2. Clean up or `.gitignore` the exploratory `scripts/` directory
3. Determine next feature work — all phases through Phase 5 are complete; check PLAN.md for Phase 6+ or new priorities
4. Consider adding R4 core package to default startup (currently only R5 loads automatically)

### Open Questions / Blockers
- No blockers
- The `scripts/` directory has 10 untracked exploratory files — decide whether to commit, gitignore, or delete

### Relevant Context
- The vitest forks fix is confirmed working — full suite ran without freezing
- The spec loader fix hasn't been tested against an actual fresh download (the spec was already cached); the `findHtmlDir()` logic is based on observed zip structure

---

<!--
SESSION HANDOFF TEMPLATE (copy this for each handoff):

## Session Handoff - [DATE] [TIME]

### Completed This Session
- [What was accomplished]

### Current State
- Branch: `feature/xxx`
- Last checkpoint: `GREEN: xxx passes`
- Tests: All passing / N failing

### Next Steps
1. [Immediate next action]
2. [Following action]

### Open Questions / Blockers
- [Anything unresolved]

### Relevant Context
- [Anything the next session needs that isn't obvious from files]
-->
