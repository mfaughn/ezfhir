# Implementation Blueprint

This document defines **HOW** we will build what's specified in `spec.md`. No implementation code should be written until this blueprint is approved.

Full detail on rationale, model assignments, and format specification lives in `PLAN.md`, `COMPACT-FORMAT-SPEC.md`, and `TESTING-STRATEGY.md`. This blueprint is the actionable implementation sequence.

---

## 1. Technical Approach

### Architecture Overview

An MCP server with three layers:
1. **Ingestion pipeline** — converts FHIR packages into compact EZF files
2. **Resource layer** — serves compact files via MCP resources for progressive disclosure
3. **Tool layer** — wraps deterministic operations (diff, expand, convert) as MCP tools

### Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Compact format | Custom EZF (not FSH) | 20x+ compression vs JSON; FSH is awkward for base resources and omits cross-cutting info |
| FSH access | On-demand via GoFSH | Avoids storing redundant representation; exact FSH when needed |
| Profile representation | Delta from base | Shows only what changed; saves tokens and aids comprehension |
| ContentReference | `@ref(path)` syntax | Explicit; avoids duplicating element trees |
| Terminology | tx.fhir.org with local cache | Authoritative source; cache for reliability |
| Search | lunr.js | Lightweight, no external dependencies |

### Dependencies

- `@modelcontextprotocol/sdk` — MCP server framework
- `fhir-package-loader` — download and load FHIR packages from registry.fhir.org
- `gofsh` — StructureDefinition to FSH conversion
- `lunr` — lightweight search index
- `vitest` — test framework
- `typescript` — language
- `tiktoken` (dev) — token counting for benchmarks

---

## 2. Implementation Phases

### Phase 0: Spike & Validation

**Goal:** Prove the concept end-to-end for ONE resource (Patient) with ONE IG. Establish go/no-go decision.

**Tasks:**
1. [ ] Project scaffolding (Node/TS/vitest/ESM) → `TASK-001`
2. [ ] Load FHIR package, explore SD structure, document dependency APIs → `TASK-002`
3. [ ] Write SD→EZF serializer for Patient → `TASK-003`
4. [ ] Write EZF parser → `TASK-004`
5. [ ] Write round-trip verifier, validate Patient → `TASK-005`
6. [ ] Token benchmark (JSON vs XML vs FSH vs EZF) → `TASK-006`
7. [ ] Minimal MCP server (Patient resource + lookup_element tool) → `TASK-007`
8. [ ] Mini AI evaluation (5-10 FHIR questions) → `TASK-008`

**Dependencies:** 1→2→3→4→5 (sequential). 6 needs 2+3 (parallel with 4-5). 7 needs 3. 8 needs 7.

**Exit Criteria:**
1. Round-trip fidelity: Patient serialize→parse→verify = 0 element mismatches
2. Token efficiency: EZF/JSON ratio ≤ 5%
3. AI quality: composite score ≥ 7/9 vs baseline ≤ 6/9
4. Hallucination: at least one question where baseline hallucinates, ezfhir does not

**If any of (1)-(3) fail, STOP and reassess.**

**Deliverables:** Working serializer for Patient, parser, verifier, token benchmarks, minimal MCP server, evaluation results.

---

### Phase 1: Ingestion Pipeline

**Goal:** Automated pipeline that converts any FHIR package into complete EZF file hierarchy.

**Tasks:**
1. [ ] Generalize SD→EZF converter for all resource types → `TASK-009`
2. [ ] Add datatype conversion → `TASK-010`
3. [ ] Add search parameter extraction → `TASK-011`
4. [ ] Add operation definition extraction → `TASK-012`
5. [ ] Add value set summary extraction → `TASK-013`
6. [ ] Add extension definition processing → `TASK-014`
7. [ ] Generate index files → `TASK-015`
8. [ ] Build profile delta processing → `TASK-016`
9. [ ] Integration test: R5 core + US Core → `TASK-017`
10. [ ] Integration test: R6 + C-CDA + extension pack → `TASK-018`

**Dependencies:** 9 first (generalizes converter). 10-14 parallel after 9. 15 needs 9-14. 16 needs 9+14. 17 needs 9-16. 18 needs 17.

**Deliverables:** `generate` CLI command that produces complete EZF hierarchy from package IDs.

---

### Phase 2: MCP Server — Resources & Navigation

**Goal:** AI can browse the spec via MCP resources with progressive disclosure.

**Tasks:**
1. [ ] MCP resource: spec index → `TASK-019`
2. [ ] MCP resource: individual resource/datatype/profile files → `TASK-020`
3. [ ] `search_spec` tool (lunr.js index) → `TASK-021`
4. [ ] `lookup_element` tool → `TASK-022`
5. [ ] `get_examples` tool → `TASK-023`
6. [ ] `get_search_params` tool → `TASK-024`
7. [ ] `load_ig` tool (runtime IG loading) → `TASK-025`
8. [ ] `list_igs` tool → `TASK-026`

**Dependencies:** 19, 20 parallel. 21 needs Phase 1 compact files. 22-26 independent of each other. 25 needs Phase 1 pipeline.

**Deliverables:** Full MCP server with browsable resources and navigation tools.

---

### Phase 3: Deterministic Analysis Tools

**Goal:** AI can request precise, computed comparisons and expansions.

**Tasks:**
1. [ ] StructureDefinition diff engine → `TASK-027`
2. [ ] `compare_profiles` tool → `TASK-028`
3. [ ] `compare_versions` tool → `TASK-029`
4. [ ] `expand_valueset` tool (tx.fhir.org client + cache) → `TASK-030`
5. [ ] `to_fsh` tool (GoFSH wrapper) → `TASK-031`
6. [ ] `get_bindings` tool → `TASK-032`
7. [ ] `get_references` tool → `TASK-033`
8. [ ] `get_constraints` tool → `TASK-034`

**Dependencies:** 27 first (diff engine). 28, 29 depend on 27. 30-34 independent; parallel.

**Deliverables:** Complete tool suite for deterministic FHIR analysis.

---

### Phase 4: Testing, Documentation & Polish

**Goal:** Comprehensive test coverage, AI evaluation, and distribution packaging.

**Tasks:**
1. [ ] Full round-trip fidelity tests (all R5 resources) → `TASK-035`
2. [ ] Golden file test set (8+ resources/profiles) → `TASK-036`
3. [ ] Edge case tests for tricky SD features → `TASK-037`
4. [ ] Token benchmark tooling + full benchmark run → `TASK-038`
5. [ ] Tool correctness tests (golden I/O pairs for every tool) → `TASK-039`
6. [ ] Diff engine comprehensive unit tests → `TASK-040`
7. [ ] AI evaluation question set (30-50 questions) → `TASK-041`
8. [ ] AI evaluation scoring framework + full run → `TASK-042`
9. [ ] Claude skill/system prompt for ezfhir usage → `TASK-043`
10. [ ] README, installation docs, example configs → `TASK-044`
11. [ ] npm packaging, MCP config, CI pipeline → `TASK-045`

**Note:** Tasks 35-40 describe the *complete* test suite. In practice, tests are written alongside code in earlier phases. Phase 4 fills gaps, adds edge cases, and runs comprehensive suites.

**Deliverables:** Published npm package, CI pipeline, comprehensive test suite, AI evaluation results.

---

## 3. File Changes

### New Files

| Path | Purpose |
|------|---------|
| `package.json` | Project configuration and dependencies |
| `tsconfig.json` | TypeScript configuration |
| `vitest.config.ts` | Test framework configuration |
| `src/index.ts` | Entry point |
| `src/converter/serializer.ts` | SD → EZF serialization |
| `src/converter/parser.ts` | EZF text → EZFElement tree |
| `src/converter/verifier.ts` | Round-trip verification |
| `src/converter/profileDelta.ts` | Profile constraint delta |
| `src/converter/types.ts` | Shared types |
| `src/server/mcpServer.ts` | MCP server setup |
| `src/server/resources/*.ts` | Resource handlers (5 files) |
| `src/server/tools/*.ts` | Tool handlers (13 files) |
| `src/diff/diffEngine.ts` | SD comparison engine |
| `src/diff/types.ts` | Diff result types |
| `src/pipeline/generate.ts` | CLI generation command |
| `src/pipeline/*.ts` | Converter and extractor modules (9 files) |
| `src/terminology/client.ts` | tx.fhir.org HTTP client |
| `src/terminology/cache.ts` | Expansion cache |
| `src/search/searchIndex.ts` | lunr.js index |
| `DEPENDENCIES.md` | Discovered API shapes (created in Phase 0) |

### Modified Files

| Path | Changes |
|------|---------|
| `CLAUDE.md` | Updated as conventions emerge |
| `TASKS.md` | Updated as tasks progress |
| `JOURNAL.md` | Session handoffs throughout |

---

## 4. Testing Strategy

Full detail in `TESTING-STRATEGY.md`. Summary:

### Unit Tests
- Serializer: element-level correctness for each SD feature
- Parser: line classification, nesting reconstruction, type parsing
- Verifier: match/mismatch detection for each field
- Diff engine: all change types (cardinality, type, binding, slicing, etc.)
- Each MCP tool: golden input/output pairs

### Integration Tests
- Round-trip fidelity across all R5 core resources (target: 100%)
- Pipeline end-to-end: package → EZF file hierarchy
- MCP server: resource serving and tool invocation

### Benchmarks
- Token efficiency: EZF vs JSON/XML/FSH across representative resource set
- Regression threshold: fail CI if compression ratio regresses >10%

### AI Quality Evaluation
- 30-50 FHIR questions with reference answers
- Scored on accuracy (0-3), completeness (0-3), specificity (0-3), hallucination (0/1)
- Run manually per-release (requires API access)

---

## 5. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Compact format loses important nuance | AI gives incomplete answers | Phase 0 validates with real queries before scaling |
| GoFSH doesn't handle all SDs | `to_fsh` tool fails on some inputs | Fallback to direct SD access; GoFSH is optional |
| tx.fhir.org rate limits or downtime | Value set expansion unavailable | Cache locally; bundle common sets; graceful degradation |
| Profile diff can't handle slicing | Incomplete profile comparisons | Scope carefully; accept incremental coverage |
| Token savings don't improve answers | Project not justified | Phase 0 exit criteria test this explicitly |
| Too many tools overwhelm AI | Poor tool selection | Group logically; Claude skill guides usage patterns |
| ContentReference elements cause parser issues | Fidelity failures | `@ref(path)` syntax defined in spec; edge case tests cover it |

---

## 6. Approval

- [x] Blueprint reviewed and approved
- **Approved by:** User
- **Date:** 2026-03-02

---

## 7. Implementation Notes

[Add notes here during implementation that future sessions should know]
