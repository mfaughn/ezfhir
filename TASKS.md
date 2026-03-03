# Tasks

Tasks are derived from `blueprint.md`. Each task follows the TDD lifecycle.

## Legend

| Status | Meaning |
|--------|---------|
| `PENDING` | Not started |
| `IN_PROGRESS` | Currently being worked on |
| `COMPLETED` | Done (tests pass, merged) |
| `BLOCKED` | Waiting on something |
| `DEFERRED` | Postponed intentionally |
| `CANCELLED` | No longer needed |

---

## Phase 0: Spike & Validation

### TASK-001: Project scaffolding
- **Status:** COMPLETED
- **Model:** Sonnet
- **Branch:** `feature/001-project-scaffolding`
- **Acceptance Criteria:**
  - [ ] package.json with TypeScript, vitest, ESM config
  - [ ] tsconfig.json with strict mode
  - [ ] vitest.config.ts
  - [ ] src/index.ts placeholder
  - [ ] npm test runs successfully (empty suite)
- **Notes:** Config-only task, no TDD needed.

---

### TASK-002: Load FHIR package and explore SD structure
- **Status:** COMPLETED
- **Model:** Sonnet
- **Branch:** `feature/002-fhir-package-loading`
- **Depends on:** TASK-001
- **Acceptance Criteria:**
  - [ ] fhir-package-loader installed and working
  - [ ] Can load hl7.fhir.r5.core package
  - [ ] Can access Patient StructureDefinition
  - [ ] DEPENDENCIES.md created with discovered API shapes
  - [ ] Test: loading a package and retrieving a SD succeeds
- **Notes:** Exploration task. Document API shapes in DEPENDENCIES.md for all subsequent tasks.

---

### TASK-003: SD→EZF serializer for Patient
- **Status:** COMPLETED
- **Model:** Opus
- **Branch:** `feature/003-ezf-serializer`
- **Depends on:** TASK-002
- **Acceptance Criteria:**
  - [ ] Serializes Patient SD to EZF conforming to COMPACT-FORMAT-SPEC.md §6
  - [ ] Handles all element types, cardinalities, flags, bindings
  - [ ] Omits inherited DomainResource elements (§6.2)
  - [ ] Includes @format directive
  - [ ] Handles contentReference elements as @ref(path)
  - [ ] Output matches expected Patient EZF structure
- **Notes:** Core algorithmic task. Must implement §6 serialization rules correctly. Reference SD snapshot structure from DEPENDENCIES.md.

---

### TASK-004: EZF parser
- **Status:** COMPLETED
- **Model:** Haiku
- **Branch:** `feature/004-ezf-parser`
- **Depends on:** TASK-003 (needs EZF output to test against)
- **Acceptance Criteria:**
  - [ ] Parses any valid EZF document into EZFElement tree (§7.3)
  - [ ] Handles @format directive validation
  - [ ] Reconstructs element nesting from indentation (§7.2)
  - [ ] Parses all type expressions including @ref(path)
  - [ ] Parses binding sub-lines
  - [ ] Parses flags in correct order
- **Notes:** Grammar is fully specified. Mechanical implementation.

---

### TASK-005: Round-trip verifier for Patient
- **Status:** COMPLETED
- **Model:** Sonnet
- **Branch:** `feature/005-round-trip-verifier`
- **Depends on:** TASK-003, TASK-004
- **Acceptance Criteria:**
  - [ ] Implements verification algorithm from §7.4
  - [ ] serialize(Patient) → parse → verify(SD) passes with 0 mismatches
  - [ ] Reports specific field mismatches on failure
  - [ ] Checks element coverage in both directions
- **Notes:** First fidelity gate. If this fails, serializer or parser has bugs.

---

### TASK-006: Token benchmark
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/006-token-benchmark`
- **Depends on:** TASK-002, TASK-003
- **Acceptance Criteria:**
  - [ ] GoFSH installed and runs on Patient SD
  - [ ] Measures character count, token count, gzip size for JSON/XML/FSH/EZF
  - [ ] Produces formatted comparison table
  - [ ] EZF/JSON ratio ≤ 5% for Patient (exit criterion)
- **Notes:** Can run in parallel with TASK-004/005. Uses tiktoken cl100k_base for token counting.

---

### TASK-007: Minimal MCP server
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/007-minimal-mcp-server`
- **Depends on:** TASK-003
- **Acceptance Criteria:**
  - [ ] MCP server starts via stdio
  - [ ] Serves Patient compact file as fhir://resource/Patient
  - [ ] Implements lookup_element tool for Patient paths
  - [ ] Responds correctly to MCP protocol handshake
- **Notes:** @modelcontextprotocol/sdk handles protocol details.

---

### TASK-008: Mini AI evaluation
- **Status:** PENDING
- **Model:** Opus
- **Branch:** `feature/008-mini-eval`
- **Depends on:** TASK-007
- **Acceptance Criteria:**
  - [ ] 5-10 FHIR questions authored with reference answers
  - [ ] Evaluation harness script calls Claude API with/without ezfhir
  - [ ] Responses scored on accuracy, completeness, specificity, hallucination
  - [ ] Composite score ≥ 7/9 with ezfhir (exit criterion)
  - [ ] At least one baseline hallucination that ezfhir prevents
- **Notes:** Requires separate harness script. Cannot be run by the agent being tested. Manual scoring acceptable for Phase 0.

---

## Phase 1: Ingestion Pipeline

### TASK-009: Generalize SD→EZF converter
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/009-generalize-converter`
- **Depends on:** Phase 0 complete
- **Acceptance Criteria:**
  - [ ] Handles all R5 core resource types
  - [ ] Round-trip verifier passes for a representative sample (10+ resources)
- **Notes:** Scales the pattern established in TASK-003.

---

### TASK-010: Datatype conversion
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/010-datatype-conversion`
- **Depends on:** TASK-009
- **Acceptance Criteria:**
  - [ ] Converts complex datatypes (Identifier, CodeableConcept, HumanName, etc.)
  - [ ] Converts primitive datatypes
  - [ ] Round-trip passes for all datatypes

---

### TASK-011: Search parameter extraction
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/011-search-params`
- **Depends on:** TASK-009
- **Acceptance Criteria:**
  - [ ] Extracts search parameters from SearchParameter resources
  - [ ] Formats per EZF §4.7
  - [ ] Correct for Patient, Observation, MedicationRequest

---

### TASK-012: Operation definition extraction
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/012-operations`
- **Depends on:** TASK-009
- **Acceptance Criteria:**
  - [ ] Extracts operation definitions
  - [ ] Formats per EZF §4.8
  - [ ] Correct for Patient/$everything, $validate

---

### TASK-013: Value set summary extraction
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/013-valueset-summary`
- **Depends on:** TASK-009
- **Acceptance Criteria:**
  - [ ] Extracts ValueSet name, URL, description, code count
  - [ ] Inline codes for small value sets, count-only for large
  - [ ] Formats per EZF §4.12

---

### TASK-014: Extension definition processing
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/014-extensions`
- **Depends on:** TASK-009
- **Acceptance Criteria:**
  - [ ] Handles simple extensions
  - [ ] Handles complex extensions with nested elements
  - [ ] Formats per EZF §4.10

---

### TASK-015: Index file generation
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/015-index-generation`
- **Depends on:** TASK-009 through TASK-014
- **Acceptance Criteria:**
  - [ ] Generates categorized resource index per EZF §5
  - [ ] Generates datatype index
  - [ ] Generates per-IG index with profile/extension/valueset listings

---

### TASK-016: Profile delta processing
- **Status:** PENDING
- **Model:** Opus
- **Branch:** `feature/016-profile-delta`
- **Depends on:** TASK-009, TASK-014
- **Acceptance Criteria:**
  - [ ] Computes constraint delta from base resource
  - [ ] Identifies cardinality tightening, MS additions, binding changes, type narrowing
  - [ ] Handles slicing
  - [ ] Handles added extensions
  - [ ] US Core Patient delta matches expected output

---

### TASK-017: Integration test — R5 core + US Core
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/017-integration-r5-uscore`
- **Depends on:** TASK-009 through TASK-016
- **Acceptance Criteria:**
  - [ ] Full pipeline runs on hl7.fhir.r5.core
  - [ ] Full pipeline runs on hl7.fhir.us.core
  - [ ] Output file hierarchy matches expected structure
  - [ ] Spot-check 5+ resources for correctness

---

### TASK-018: Integration test — R6 + C-CDA + extensions
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/018-integration-multi-ig`
- **Depends on:** TASK-017
- **Acceptance Criteria:**
  - [ ] Pipeline runs on R6, C-CDA, extension pack
  - [ ] No crashes or unhandled artifact types
  - [ ] Spot-check output correctness

---

## Phase 2: MCP Server — Resources & Navigation

### TASK-019: MCP resource — spec index
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/019-mcp-index-resource`
- **Depends on:** Phase 1 complete
- **Acceptance Criteria:**
  - [ ] fhir://index serves categorized resource listing
  - [ ] Returns correct content for R5 core

---

### TASK-020: MCP resource — individual artifacts
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/020-mcp-artifact-resources`
- **Depends on:** Phase 1 complete
- **Acceptance Criteria:**
  - [ ] fhir://resource/{name} serves resource EZF
  - [ ] fhir://datatype/{name} serves datatype EZF
  - [ ] fhir://profile/{pkg}/{id} serves profile EZF
  - [ ] fhir://ig/{pkg}/index serves IG index

---

### TASK-021: search_spec tool
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/021-search-spec`
- **Depends on:** Phase 1 compact files
- **Acceptance Criteria:**
  - [ ] lunr.js index built over resource names, element paths, descriptions, search params, operations
  - [ ] "Patient" returns Patient as top result
  - [ ] "blood pressure" returns Observation-related results
  - [ ] Empty results for nonsense queries (not an error)

---

### TASK-022: lookup_element tool
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/022-lookup-element`
- **Depends on:** Phase 1 complete
- **Acceptance Criteria:**
  - [ ] Resolves simple paths (Patient.birthDate)
  - [ ] Resolves nested paths (Patient.contact.relationship)
  - [ ] Resolves choice types (Observation.value[x])
  - [ ] Returns clear error for invalid paths
  - [ ] Supports IG-scoped lookup

---

### TASK-023: get_examples tool
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/023-get-examples`
- **Depends on:** Phase 1 complete
- **Acceptance Criteria:**
  - [ ] Returns example instances from spec packages
  - [ ] Respects count parameter
  - [ ] Returns examples for common resources (Patient, Observation)

---

### TASK-024: get_search_params tool
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/024-get-search-params`
- **Depends on:** Phase 1 complete
- **Acceptance Criteria:**
  - [ ] Returns all search params for a resource with types and expressions
  - [ ] Correct for Patient (17 params)

---

### TASK-025: load_ig tool
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/025-load-ig`
- **Depends on:** Phase 1 pipeline
- **Acceptance Criteria:**
  - [ ] Downloads package from registry.fhir.org
  - [ ] Runs generation pipeline
  - [ ] New IG resources available immediately
  - [ ] Clear error for invalid package IDs

---

### TASK-026: list_igs tool
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/026-list-igs`
- **Depends on:** Phase 1 complete
- **Acceptance Criteria:**
  - [ ] Lists loaded packages with version and artifact counts
  - [ ] Updates after load_ig adds new packages

---

## Phase 3: Deterministic Analysis Tools

### TASK-027: StructureDefinition diff engine
- **Status:** PENDING
- **Model:** Opus
- **Branch:** `feature/027-diff-engine`
- **Depends on:** Phase 1 complete
- **Acceptance Criteria:**
  - [ ] Compares two SDs element by element
  - [ ] Detects: cardinality changes, type narrowing, binding changes, MS additions, new elements, removed elements, slicing, extensions, fixed values
  - [ ] Comprehensive unit test coverage per TESTING-STRATEGY.md §4.3
- **Notes:** Intellectual heart of the project alongside the serializer. Must be thorough.

---

### TASK-028: compare_profiles tool
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/028-compare-profiles`
- **Depends on:** TASK-027
- **Acceptance Criteria:**
  - [ ] Wraps diff engine in MCP tool
  - [ ] US Core Patient vs Patient produces correct delta
  - [ ] Identical inputs produce "no differences"

---

### TASK-029: compare_versions tool
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/029-compare-versions`
- **Depends on:** TASK-027
- **Acceptance Criteria:**
  - [ ] Loads same resource from two package versions
  - [ ] Runs diff engine
  - [ ] Patient R4→R5 shows correct changes
  - [ ] Handles resources that don't exist in one version

---

### TASK-030: expand_valueset tool
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/030-expand-valueset`
- **Depends on:** Phase 1 complete
- **Acceptance Criteria:**
  - [ ] Calls tx.fhir.org/$expand
  - [ ] Returns all codes for small value sets
  - [ ] Truncates large value sets with count
  - [ ] Filter parameter works
  - [ ] Graceful degradation on server error/timeout
  - [ ] Caches successful expansions locally

---

### TASK-031: to_fsh tool
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/031-to-fsh`
- **Depends on:** Phase 1 complete
- **Acceptance Criteria:**
  - [ ] Runs GoFSH on specified SD
  - [ ] Returns valid FSH
  - [ ] Clear error on failure with artifact URL

---

### TASK-032: get_bindings tool
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/032-get-bindings`
- **Acceptance Criteria:**
  - [ ] Returns all coded elements with value set URLs and binding strengths
  - [ ] Patient includes gender → administrative-gender (required)

---

### TASK-033: get_references tool
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/033-get-references`
- **Acceptance Criteria:**
  - [ ] Returns all Reference-typed elements with allowed targets
  - [ ] Patient includes generalPractitioner → Organization|Practitioner|PractitionerRole

---

### TASK-034: get_constraints tool
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/034-get-constraints`
- **Acceptance Criteria:**
  - [ ] Returns all FHIRPath invariants with human descriptions
  - [ ] Patient includes pat-1

---

## Phase 4: Testing, Documentation & Polish

### TASK-035: Full round-trip fidelity tests
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/035-full-fidelity`
- **Acceptance Criteria:**
  - [ ] Verifier runs on ALL R5 core resources
  - [ ] 100% element coverage
  - [ ] Any failures documented with reason

---

### TASK-036: Golden file test set
- **Status:** PENDING
- **Model:** Opus
- **Branch:** `feature/036-golden-files`
- **Acceptance Criteria:**
  - [ ] 8+ golden EZF files: Patient, Observation, MedicationRequest, Bundle, Identifier, Extension, US Core Patient, US Core Condition
  - [ ] Byte-for-byte match with serializer output

---

### TASK-037: Edge case tests
- **Status:** PENDING
- **Model:** Opus (identification) + Haiku (implementation)
- **Branch:** `feature/037-edge-cases`
- **Acceptance Criteria:**
  - [ ] Tests per TESTING-STRATEGY.md §2.3 (choice types, deep nesting, recursive refs, abstract resources, contentReference, etc.)

---

### TASK-038: Token benchmark tooling
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/038-benchmark-tooling`
- **Acceptance Criteria:**
  - [ ] Benchmarks run across full test set per TESTING-STRATEGY.md §3.2
  - [ ] Produces formatted table and JSON for trend tracking
  - [ ] CI fails on >10% compression regression

---

### TASK-039: Tool correctness tests
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/039-tool-tests`
- **Acceptance Criteria:**
  - [ ] Golden I/O pairs for every MCP tool per TESTING-STRATEGY.md §4.2

---

### TASK-040: Diff engine comprehensive tests
- **Status:** PENDING
- **Model:** Opus
- **Branch:** `feature/040-diff-tests`
- **Acceptance Criteria:**
  - [ ] All scenarios from TESTING-STRATEGY.md §4.3 covered
  - [ ] Cardinality, type, binding, MS, slicing, extension, fixed value, rename detection

---

### TASK-041: AI evaluation question set
- **Status:** PENDING
- **Model:** Opus
- **Branch:** `feature/041-eval-questions`
- **Acceptance Criteria:**
  - [ ] 30-50 questions across categories A-E per TESTING-STRATEGY.md §5.1
  - [ ] Reference answers authored

---

### TASK-042: AI evaluation scoring framework + run
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/042-eval-framework`
- **Acceptance Criteria:**
  - [ ] Automated scoring per §5.2-5.3
  - [ ] Run with Claude Sonnet, Haiku, Opus
  - [ ] Composite score ≥ 8/9 target

---

### TASK-043: Claude skill for ezfhir usage
- **Status:** PENDING
- **Model:** Opus
- **Branch:** `feature/043-claude-skill`
- **Acceptance Criteria:**
  - [ ] System prompt guiding optimal tool selection
  - [ ] Progressive disclosure pattern: index → resource → tool

---

### TASK-044: Documentation
- **Status:** PENDING
- **Model:** Haiku
- **Branch:** `feature/044-docs`
- **Acceptance Criteria:**
  - [ ] README with installation, configuration, usage
  - [ ] Example MCP client configurations

---

### TASK-045: Packaging and CI
- **Status:** PENDING
- **Model:** Sonnet
- **Branch:** `feature/045-packaging`
- **Acceptance Criteria:**
  - [ ] npm package publishable
  - [ ] Claude Code MCP config
  - [ ] CI pipeline runs tests + benchmarks

---

## Completed Tasks

<!-- Move completed tasks here with final notes -->

---

## Blocked / Deferred

<!-- Tasks waiting on something or intentionally postponed -->
