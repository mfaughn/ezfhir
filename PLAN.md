# ezfhir: AI-First FHIR Specification Tool

## Project Summary

An MCP server that gives AI models precise, token-efficient access to the FHIR specification, Implementation Guides, and related artifacts. The server wraps deterministic FHIR tooling (GoFSH, fhir-package-loader, terminology services) and exposes pre-processed compact representations of the spec for progressive disclosure.

**Core principle:** Deterministic code for structural operations. AI for interpretation and navigation.

**Companion documents:**
- [COMPACT-FORMAT-SPEC.md](./COMPACT-FORMAT-SPEC.md) — Formal specification for the EZF format (grammar, serialization rules, parsing rules, verification algorithm)
- [TESTING-STRATEGY.md](./TESTING-STRATEGY.md) — Comprehensive testing strategy (format fidelity, token efficiency, tool correctness, AI quality evaluation)

---

## Key Design Decisions

### On FSH as the compression format

FSH is the right format for **profiles, extensions, and value sets** — it's compact, well-understood, and GoFSH already converts StructureDefinitions to it. But FSH alone is insufficient for this use case for three reasons:

1. **Base resources in FSH are awkward.** GoFSH translates base resources as "Logical" models or profiles with Parent, which is not how anyone thinks about Patient. What an AI needs is a resolved element table: "here are Patient's elements, their types, cardinalities, and bindings." FSH's syntax was designed for expressing *constraints on* resources, not for *describing* them.

2. **FSH omits critical cross-cutting information.** Search parameters, operations ($everything, $validate), compartment membership, examples, and relationships between resources are not part of FSH. These are exactly the things AI models get wrong.

3. **FSH still has authoring-oriented syntax overhead.** Keywords like `Description:`, `Title:`, `Id:`, `* insert RuleSet` are useful for IG authoring but waste tokens for AI consumption.

**Decision:** Use a two-layer approach:
- **Layer A: Custom compact summaries** — pre-generated, ultra-token-efficient resource/datatype/profile descriptions optimized for LLM consumption. These are what the AI reads first.
- **Layer B: FSH on demand** — when the AI needs the precise, formal definition (e.g., to generate a conformant profile), it calls a tool that runs GoFSH against the StructureDefinition. This gives exact FSH without storing it all upfront.

### On deterministic tools vs. AI reasoning

Existing FHIR tooling should be wrapped, not reimplemented:

| Operation | Tool to wrap | Why deterministic |
|---|---|---|
| Profile comparison (what does US Core add to Patient?) | Custom diff on StructureDefinition snapshots | Structural, must be exact |
| Version comparison (R4 vs R5 Patient) | Same diff engine, cross-version | Cannot tolerate hallucination |
| Value set expansion | tx.fhir.org API or local expander | Terminological, must be complete |
| FSH generation | GoFSH (npm: `gofsh`) | Already built, well-tested |
| Package loading | fhir-package-loader (npm) | Standard tooling for registry.fhir.org |
| Validation | SUSHI or HAPI validator | Deterministic by nature |

The AI's job is to know **when** to call these tools and **how to interpret** the results for the user.

### On Multi-IG support

Not an afterthought. The ingestion pipeline operates on **FHIR packages** from registry.fhir.org, which means any published IG can be loaded with identical machinery. Day-one targets:

- `hl7.fhir.r4.core` (R4 base spec — needed for cross-version comparisons)
- `hl7.fhir.r5.core` (R5 base spec)
- `hl7.fhir.r6.core` (R6 / current CI build)
- `hl7.fhir.us.core` (US Core)
- `hl7.fhir.us.ccda` (C-CDA on FHIR)
- `hl7.fhir.uv.extensions` (Extension pack)

Additional IGs can be added by the user at runtime via an MCP tool.

### On delivery mechanism

**MCP server** as the primary interface, because:
- Tools for deterministic operations (compare, expand, convert)
- Resources for browsable file hierarchy (progressive disclosure)
- Works with any MCP-capable client (Claude, Cursor, VS Code, etc.)
- Can be run locally (stdio) or remote (HTTP+SSE)

**Claude Code / Cowork skill** as an optional companion that knows the usage patterns: "start with the index, narrow to resource type, use tools for precision."

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 MCP Client (AI)                  │
│  Reads resources (compact files) for orientation │
│  Calls tools for precise operations              │
└────────────────────┬────────────────────────────┘
                     │ MCP Protocol
┌────────────────────▼────────────────────────────┐
│              ezfhir MCP Server                   │
│                                                  │
│  Resources:          Tools:                      │
│  ├─ index            ├─ lookup_element           │
│  ├─ resource/{name}  ├─ compare_profiles         │
│  ├─ datatype/{name}  ├─ compare_versions         │
│  ├─ profile/{id}     ├─ expand_valueset          │
│  ├─ valueset/{url}   ├─ to_fsh                   │
│  └─ ig/{id}/index    ├─ search_spec              │
│                      ├─ get_examples              │
│                      ├─ load_ig                   │
│                      └─ get_search_params         │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │         Package & Spec Cache             │    │
│  │  (fhir-package-loader + compact files)   │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌────────────┐ ┌───────┐ ┌──────────────────┐  │
│  │ GoFSH      │ │ Diff  │ │ Terminology      │  │
│  │ (on-demand │ │Engine │ │ Client           │  │
│  │  FSH gen)  │ │       │ │ (tx.fhir.org)    │  │
│  └────────────┘ └───────┘ └──────────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## Compact Format Specification

The EZF format is formally specified in [COMPACT-FORMAT-SPEC.md](./COMPACT-FORMAT-SPEC.md).
That document defines the grammar, serialization rules, parsing rules, and verification
algorithm. A compliant implementation must be able to serialize any StructureDefinition
to EZF and parse any EZF file back to a structured representation that can be verified
against the source. See §7.4 of the spec for the round-trip verification algorithm.

Below is a concrete example for the Patient resource:

```
@format ezf/0.1
@resource Patient : DomainResource
@description Individual receiving care or other health-related services.
@scope Patient Administration
@compartment Patient (subject)

@elements
identifier       : 0..* Identifier       [Σ]      # An identifier for this patient
active           : 0..1 boolean          [?!Σ]    # Whether record is in active use
name             : 0..* HumanName        [Σ]      # A name associated with the patient
telecom          : 0..* ContactPoint     [Σ]      # A contact detail for the individual
gender           : 0..1 code             [Σ]      # male | female | other | unknown
  @binding required http://hl7.org/fhir/ValueSet/administrative-gender
birthDate        : 0..1 date             [Σ]      # Date of birth
deceased[x]      : 0..1 boolean|dateTime [?!Σ]    # Indicates if the patient is deceased
address          : 0..* Address          [Σ]      # An address for the individual
maritalStatus    : 0..1 CodeableConcept           # Marital (civil) status
  @binding extensible http://hl7.org/fhir/ValueSet/marital-status
multipleBirth[x] : 0..1 boolean|integer           # Whether patient is part of a multiple birth
photo            : 0..* Attachment                 # Image of the patient
contact          : 0..* BackboneElement            # A contact party for the patient
  relationship   : 0..* CodeableConcept            # The kind of relationship
    @binding extensible http://hl7.org/fhir/ValueSet/patient-contactrelationship
  name           : 0..1 HumanName                  # A name associated with the contact
  telecom        : 0..* ContactPoint               # A contact detail for the person
  address        : 0..1 Address                    # Address for the contact person
  gender         : 0..1 code                       # male | female | other | unknown
  organization   : 0..1 Reference(Organization)    # Organization associated with the contact
  period         : 0..1 Period                     # Period during which contact is valid
communication    : 0..* BackboneElement            # Language for communicating with patient
  language       : 1..1 CodeableConcept            # The language for communication
    @binding required http://hl7.org/fhir/ValueSet/all-languages
  preferred      : 0..1 boolean                    # Language preference indicator
generalPractitioner : 0..* Reference(Organization|Practitioner|PractitionerRole)
managingOrganization : 0..1 Reference(Organization)  [Σ]
link             : 0..* BackboneElement  [?!Σ]    # Link to a Patient or RelatedPerson
  other          : 1..1 Reference(Patient|RelatedPerson) [Σ]
  type           : 1..1 code             [Σ]      # replaced-by | replaces | refer | seealso
    @binding required http://hl7.org/fhir/ValueSet/link-type

@search
name             : string    (HumanName)
identifier       : token     (Identifier)
birthdate        : date      (date)
gender           : token     (code)
family           : string    (HumanName.family)
given            : string    (HumanName.given)
phone            : token     (ContactPoint /phone)
email            : token     (ContactPoint /email)
address          : string    (Address)
address-city     : string    (Address.city)
address-state    : string    (Address.state)
address-postalcode : string  (Address.postalCode)
general-practitioner : reference (generalPractitioner)
organization     : reference (managingOrganization)
active           : token     (boolean)
deceased         : token     (deceased)
death-date       : date      (deceased as dateTime)
link             : reference (link.other)
language         : token     (communication.language)

@operations
$everything      : Returns all information related to one or more patients
$match           : Find matching patient records using MPI logic
$merge           : Merge duplicate patient records

@invariants
pat-1 : contact SHALL contain contact details or a reference to organization
```

This is ~2,500 characters for Patient's complete definition. Compare:
- Patient StructureDefinition JSON snapshot: ~85,000 characters
- Patient StructureDefinition XML: ~95,000 characters
- GoFSH output for Patient: ~15,000-20,000 characters (estimated)

That's roughly a **34x compression** over JSON and potentially **6-8x over FSH** while retaining all structurally important information.

For a **profile** (e.g., US Core Patient), the format shows the delta:

```
@format ezf/0.1
@profile USCorePatient : Patient
@ig hl7.fhir.us.core
@description Defines constraints on Patient for US Core.

@constraints (delta from Patient)
identifier       : 1..* Identifier       [Σ MS]   # TIGHTENED from 0..*
  system         : 1..1 uri              [Σ]      # ADDED
  value          : 1..1 string           [Σ MS]   # ADDED
name             : 1..* HumanName        [Σ MS]   # TIGHTENED from 0..*
  family         : 0..1 string           [Σ MS]   # ADDED MS
  given          : 0..* string           [Σ MS]   # ADDED MS
gender           : 1..1 code             [Σ MS]   # TIGHTENED from 0..1

@extensions
us-core-race          : 0..1 complex              # US Core Race
us-core-ethnicity     : 0..1 complex              # US Core Ethnicity
us-core-birthsex      : 0..1 code                 # Birth Sex
us-core-genderIdentity : 0..* CodeableConcept     # Gender Identity

@mustsupport
identifier, name, name.family, name.given, telecom, telecom.system,
telecom.value, telecom.use, gender, birthDate, address, address.line,
address.city, address.state, address.postalCode, address.period,
communication, communication.language
```

---

## Phased Implementation Plan

### Phase 0: Spike & Validation (3-4 days)

**Goal:** Prove the concept works end-to-end for ONE resource with ONE IG. Includes the
first round-trip fidelity test and token benchmark to establish the go/no-go decision.

| Task | Model | Rationale |
|---|---|---|
| 0.1 Set up Node/TypeScript project with build tooling (vitest, TypeScript, ESM) | Sonnet | Routine scaffolding |
| 0.2 Install fhir-package-loader, load hl7.fhir.r5.core, explore SD structure | Sonnet | Follow existing docs |
| 0.3 Write StructureDefinition→EZF serializer for a single resource (Patient), conforming to COMPACT-FORMAT-SPEC.md | Opus | Requires deep understanding of SD structure; must implement §6 serialization rules correctly |
| 0.4 Write EZF parser that produces the EZFElement structure defined in COMPACT-FORMAT-SPEC.md §7.3 | Haiku | Grammar is fully defined in spec; mechanical implementation of a context-free parser |
| 0.5 Write round-trip verifier (COMPACT-FORMAT-SPEC.md §7.4) and run it on Patient | Sonnet | First fidelity test — does serialize→parse→verify pass? |
| 0.6 Install GoFSH, run it on Patient SD, measure token counts for all four formats (JSON, XML, FSH, EZF) | Sonnet | Quantitative benchmark per TESTING-STRATEGY.md §3 |
| 0.7 Build minimal MCP server with one resource (Patient compact) and one tool (lookup_element) | Sonnet | MCP SDK is well-documented |
| 0.8 Run mini AI evaluation: 5-10 FHIR questions with and without ezfhir (per TESTING-STRATEGY.md §5) | Opus | Judgment call on whether output quality justifies the project |

**Exit criteria:**
1. Round-trip fidelity: Patient serialize→parse→verify passes with 0 element mismatches.
2. Token efficiency: EZF/JSON ratio ≤ 5% (20x compression) for Patient.
3. AI quality: On the mini evaluation, ezfhir composite score ≥ 7/9 vs. baseline ≤ 6/9.
4. Hallucination: At least one question where baseline hallucinates and ezfhir does not.

If any of (1)-(3) fail, stop and reassess before proceeding to Phase 1.

**Task dependencies:**
- 0.1 → 0.2 → 0.3 → 0.4 → 0.5 (sequential — each builds on prior)
- 0.6 depends on 0.2 (needs loaded SD) + 0.3 (needs EZF output). Can run in parallel with 0.4-0.5.
- 0.7 depends on 0.3 (needs compact file to serve)
- 0.8 depends on 0.7 (needs running MCP server)

### Phase 1: Ingestion Pipeline (1-1.5 weeks)

**Goal:** Automated pipeline that converts any FHIR package into compact format.

| Task | Model | Rationale |
|---|---|---|
| 1.1 Generalize the SD→compact converter to handle all resource types | Sonnet | Pattern is established in Phase 0, now scale it |
| 1.2 Add datatype conversion (Identifier, CodeableConcept, HumanName, etc.) | Haiku | Repetitive, follows same pattern as resources |
| 1.3 Add search parameter extraction and formatting | Haiku | Mechanical extraction from SearchParameter resources |
| 1.4 Add operation definition extraction | Haiku | Same pattern |
| 1.5 Add value set summary extraction (name, URL, binding strength, code count) | Sonnet | Needs judgment about how much to include inline vs. expand-on-demand |
| 1.6 Add extension definition processing | Sonnet | Extensions have tricky structure (complex extensions, nested) |
| 1.7 Generate index files (categorized resource list, datatype list, etc.) | Haiku | Templating |
| 1.8 Build profile processing — delta format showing what a profile changes | Opus | Most complex transform; must correctly compute constraint tightening, added MS flags, slicing, new extensions |
| 1.9 Run pipeline on R5 core + US Core, validate output | Sonnet | Integration testing |
| 1.10 Run pipeline on R6 CI build + C-CDA on FHIR + extension pack | Sonnet | Verify IG generality |

**Output:** A `generate` command that takes a list of FHIR package IDs and produces a complete compact file hierarchy.

**Task dependencies:**
- 1.1 must complete first (generalizes the converter all others build on)
- 1.2, 1.3, 1.4, 1.5, 1.6 can run in parallel after 1.1
- 1.7 depends on 1.1-1.6 (needs all artifact types to generate complete index)
- 1.8 depends on 1.1 + 1.6 (profile deltas need base resource converter + extension handling)
- 1.9 depends on 1.1-1.8 (integration test of full pipeline)
- 1.10 depends on 1.9 (same pipeline, different packages)

### Phase 2: MCP Server — Resources & Navigation (1 week)

**Goal:** AI can browse the spec via MCP resources with progressive disclosure.

| Task | Model | Rationale |
|---|---|---|
| 2.1 Implement MCP resource for spec index (list of all resources by category) | Haiku | Simple file serving |
| 2.2 Implement MCP resource for individual resource/datatype/profile compact files | Haiku | Same pattern |
| 2.3 Implement `search_spec` tool — keyword/semantic search across resource descriptions, element names, short descriptions | Sonnet | Needs a lightweight search index (lunr.js or similar); design of what's searchable matters |
| 2.4 Implement `lookup_element` tool — given a path like `Patient.contact.relationship`, return full detail including constraints, invariants, bindings | Haiku | Path traversal of an already-loaded SD; pattern established in Phase 0 serializer |
| 2.5 Implement `get_examples` tool — return example instances for a resource type | Sonnet | Examples come from the spec package; need to select good ones |
| 2.6 Implement `get_search_params` tool — return search parameters with full detail | Haiku | Mechanical extraction |
| 2.7 Implement `load_ig` tool — user can request a new IG be loaded at runtime | Sonnet | Uses fhir-package-loader, then runs the generation pipeline |
| 2.8 Implement `list_igs` tool — show what's currently loaded | Haiku | Trivial |

**Task dependencies:**
- 2.1, 2.2 can run in parallel (independent resource handlers)
- 2.3 depends on Phase 1 compact files existing (builds search index over them)
- 2.4, 2.5, 2.6 can run in parallel (independent tools)
- 2.7 depends on Phase 1 pipeline (runs it at runtime)
- 2.8 is independent

**Note on search index design:** The `search_spec` tool (2.3) builds a search index
over compact files. The fields to index are: resource/datatype/profile names, element
names and paths, short descriptions, search parameter names, operation names, and
extension names. This should be decided before Phase 1 compact file generation is
finalized, so the serializer can ensure these fields are consistently populated.

### Phase 3: MCP Server — Deterministic Analysis Tools (1-1.5 weeks)

**Goal:** AI can request precise, computed comparisons and expansions.

| Task | Model | Rationale |
|---|---|---|
| 3.1 Build StructureDefinition diff engine — compare two SDs element by element | Opus | Core algorithmic work; must handle cardinality changes, type narrowing, binding strength changes, added constraints, slicing, extensions. This is the intellectual heart of the project. |
| 3.2 Implement `compare_profiles` tool — wraps the diff engine, outputs compact delta | Haiku | Thin wrapper around 3.1; MCP tool boilerplate follows established pattern |
| 3.3 Implement `compare_versions` tool — loads same resource from two package versions, runs diff | Haiku | Composition of existing pieces: package loader + diff engine |
| 3.4 Implement `expand_valueset` tool — calls tx.fhir.org, formats result compactly | Sonnet | HTTP client + formatting; needs to handle huge value sets (SNOMED) by truncating with count |
| 3.5 Implement `to_fsh` tool — runs GoFSH on a specific SD, returns FSH | Sonnet | Wrapping GoFSH programmatic API |
| 3.6 Implement `get_bindings` tool — given a resource, return all coded elements with their value set bindings and strengths | Haiku | Extraction from SD |
| 3.7 Implement `get_references` tool — given a resource, return all Reference-typed elements with their allowed target types | Haiku | Extraction from SD |
| 3.8 Implement `get_constraints` tool — given a resource, return all FHIRPath invariants with their expressions and human descriptions | Haiku | Extraction from SD |

**Task dependencies:**
- 3.1 must complete first (diff engine used by 3.2 and 3.3)
- 3.2, 3.3 depend on 3.1
- 3.4, 3.5, 3.6, 3.7, 3.8 are independent of 3.1 and each other; can run in parallel

### Phase 4: Testing, Documentation & Polish (1-1.5 weeks)

**Goal:** Comprehensive test coverage, AI evaluation, and packaging. See
[TESTING-STRATEGY.md](./TESTING-STRATEGY.md) for full details on each test category.

| Task | Model | Rationale |
|---|---|---|
| 4.1 Round-trip fidelity tests: run serializer→parser→verifier on ALL R5 core resources. Target: 100% element coverage. (TESTING-STRATEGY.md §2.1) | Sonnet | Structural test code, moderate complexity |
| 4.2 Create golden file test set: curate expected EZF output for 8+ resources/profiles. (TESTING-STRATEGY.md §2.2) | Opus | Requires understanding what correct output looks like |
| 4.3 Implement edge case tests for tricky SD features. (TESTING-STRATEGY.md §2.3) | Opus (identification) + Haiku (implementation) | Opus identifies what to test, Haiku writes the repetitive test code |
| 4.4 Build token benchmark tooling and run full benchmark across test set. (TESTING-STRATEGY.md §3) | Haiku | Mechanical measurement code |
| 4.5 Write tool correctness tests with golden input/output pairs for every MCP tool. (TESTING-STRATEGY.md §4) | Sonnet | Needs understanding of each tool's contract |
| 4.6 Write diff engine unit tests — comprehensive coverage of cardinality, type, binding, slicing, extension scenarios. (TESTING-STRATEGY.md §4.3) | Opus | Correctness of the diff engine is critical; must be thorough |
| 4.7 Author full AI evaluation question set (30-50 questions with reference answers). (TESTING-STRATEGY.md §5.1) | Opus | Requires FHIR expertise + understanding of LLM failure modes |
| 4.8 Build AI evaluation scoring framework and run full evaluation. (TESTING-STRATEGY.md §5.2-5.5) | Sonnet | Running the protocol, analyzing results |
| 4.9 Write Claude skill/system prompt for effective ezfhir usage patterns | Opus | Prompt engineering for optimal tool use |
| 4.10 README, installation docs, example configurations | Haiku | Standard docs; content derives from existing plan and code |
| 4.11 Package for distribution (npm publish, Claude Code MCP config), set up CI pipeline (TESTING-STRATEGY.md §6.3) | Sonnet | Standard packaging |

**Note on testing during earlier phases:** Tasks 4.1-4.6 describe the *complete* test
suite. In practice, tests are written alongside the code they validate:
- Phase 0 produces the first round-trip test and benchmark (tasks 0.5, 0.6)
- Phase 1 adds round-trip tests for each new artifact type as it's implemented
- Phase 2 adds tool correctness tests for each new MCP tool
- Phase 3 adds diff engine tests alongside the engine itself
- Phase 4 fills gaps, adds edge cases, runs the full suite, and runs AI evaluation

---

## MCP Tool Interface Specification

### Resources (progressive disclosure)

```
fhir://index
  → Categorized list of all resources, one line each
  → ~3,000 tokens for full R5 spec

fhir://resource/{name}
  → Compact format for a single resource (see format spec above)
  → ~500-800 tokens per resource

fhir://datatype/{name}
  → Compact format for a datatype
  → ~100-300 tokens per datatype

fhir://profile/{package}/{id}
  → Compact delta format for a profile
  → ~200-500 tokens per profile

fhir://ig/{package}/index
  → List of profiles, extensions, value sets in an IG
  → ~500-1000 tokens per IG
```

### Tools

```typescript
// Navigation & search
search_spec(query: string, scope?: string[])
  → Search across all loaded artifacts. Returns ranked matches with snippets.

lookup_element(path: string, ig?: string)
  → Full detail on a single element. E.g., "Patient.contact.relationship"
  → Returns: type, cardinality, binding, constraints, short description,
    definition, comments, and any profile-specific overrides.

get_examples(resourceType: string, count?: number)
  → Example instances from the spec or IGs.

// Deterministic analysis
compare_profiles(base: string, profile: string)
  → Element-by-element diff. Shows tightened cardinalities, added MS flags,
    new extensions, modified bindings, added slicing.
  → Output in compact delta format.

compare_versions(resource: string, versionA: string, versionB: string)
  → What changed in a resource between two FHIR versions.
  → Output: added elements, removed elements, renamed elements,
    changed types, changed cardinalities, new/removed search params.

expand_valueset(url: string, filter?: string, count?: number)
  → Expands a value set. For large sets (SNOMED, LOINC), returns
    top-level concepts with count. Filter narrows by display text.
  → On tx.fhir.org error/timeout: returns cached expansion if available,
    otherwise returns error with the value set URL and binding strength
    so the AI can still reason about it without hallucinating codes.

to_fsh(artifact: string, ig?: string)
  → Converts a StructureDefinition to FSH via GoFSH.
  → Use when the AI needs to generate or modify a conformant profile.

// Structural queries
get_search_params(resourceType: string)
  → All search parameters with types, expressions, targets.

get_bindings(resourceType: string, ig?: string)
  → All coded elements with value set URLs and binding strengths.

get_references(resourceType: string)
  → All Reference-typed elements with allowed target types.

get_constraints(resourceType: string, ig?: string)
  → All FHIRPath invariants with human descriptions.

// Package management
load_ig(packageId: string, version?: string)
  → Downloads and processes an IG from registry.fhir.org.

list_igs()
  → Lists all currently loaded packages with version and artifact counts.
```

---

## Technology Stack

- **Runtime:** Node.js / TypeScript
- **MCP SDK:** @modelcontextprotocol/sdk
- **FHIR packages:** fhir-package-loader
- **FSH conversion:** gofsh (GoFSH npm package)
- **Terminology:** tx.fhir.org REST API (or bundled local expansion for common value sets)
- **Search index:** lunr.js (lightweight, no external dependencies)
- **Testing:** vitest
- **Packaging:** npm, with MCP server config for Claude Code / Claude Desktop

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Compact format loses important nuance | Phase 0 validates with real queries before scaling |
| GoFSH doesn't handle all SDs cleanly | Fallback to direct SD parsing; GoFSH is optional path |
| tx.fhir.org rate limits or downtime | Cache expansions locally; bundle common value sets; define error contract so tools degrade gracefully (return binding metadata without codes) |
| Profile diff engine can't handle slicing | Slicing is the hardest case; scope it carefully in Phase 3, accept incremental coverage |
| Token savings don't translate to better answers | Phase 0 exit criteria explicitly tests this |
| Too many tools overwhelm the AI's tool selection | Group tools logically; the skill/prompt in 4.4 guides tool selection |

---

## Model Assignment Summary

| Model | When to use | % of tasks |
|---|---|---|
| **Opus** | Design decisions, diff engine algorithm, evaluation design, prompt engineering, complex transforms (profile delta computation), golden file curation | ~20% |
| **Sonnet** | Core implementation work: serializer generalization, converters with judgment calls, MCP tools with non-trivial logic, integration testing, search index design | ~40% |
| **Haiku** | Parsers from defined grammars, thin tool wrappers, extraction tools, templating, docs, mechanical test code, any task where the pattern is already established | ~40% |

---

## Implementation Directives

These rules apply across all phases and should be followed by any agent working on this project.

1. **Every EZF file must start with `@format ezf/0.1`.** This includes examples in docs,
   golden test files, and generated output. The parser must validate this directive.

2. **Tests accompany code, not follow it.** Each task that produces code must also produce
   its tests. Phase 4 fills gaps and runs the full suite, but it should not be the first
   time most tests are written.

3. **Explore dependencies empirically in Phase 0.** The APIs of `fhir-package-loader`,
   `gofsh`, and `@modelcontextprotocol/sdk` are not documented in this plan. Task 0.2
   should produce a brief `DEPENDENCIES.md` capturing the actual API shapes discovered
   (key functions, type signatures, gotchas). This saves every subsequent task from
   re-exploring the same packages.

4. **The AI evaluation (0.8) requires a separate harness.** It cannot be run by the same
   agent being tested. Build a small script that calls the Claude API directly, sends
   questions with and without the MCP server configured, and collects responses. Scoring
   can be manual for Phase 0; automate it in Phase 4.

5. **Model assignment is a guideline, not a constraint.** If a Haiku-assigned task turns
   out to be harder than expected (e.g., an edge case in the parser), escalate to Sonnet.
   If a Sonnet-assigned task is pure boilerplate, use Haiku. The assignments optimize for
   cost; correctness always wins.

6. **Error contracts must be defined before implementation.** Every MCP tool must define
   what it returns on invalid input, missing data, and external service failure. Define
   these in the tool's test plan (TESTING-STRATEGY.md §4.2) before writing the tool code.

---

## Estimated Timeline

| Phase | Duration | Cumulative |
|---|---|---|
| Phase 0: Spike & Validation | 3-4 days | 3-4 days |
| Phase 1: Ingestion Pipeline | 7-10 days | 10-14 days |
| Phase 2: MCP Resources & Navigation | 5-7 days | 15-21 days |
| Phase 3: Deterministic Analysis Tools | 7-10 days | 22-31 days |
| Phase 4: Testing & Polish | 5-7 days | 27-38 days |

Total: **~4-6 weeks** for a fully functional v1.

Phase 0 is the critical go/no-go gate. If token savings are < 10x or AI answer quality doesn't measurably improve, reconsider the approach before investing in Phases 1-4.
