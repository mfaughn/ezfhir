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
