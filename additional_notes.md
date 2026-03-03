# Implementation Notes (Resolved)

These items were identified during plan review and have been addressed inline
in the companion documents.

### Dependency/API knowledge gaps → Resolved
PLAN.md Implementation Directive #3 now requires task 0.2 to produce a
`DEPENDENCIES.md` capturing discovered API shapes, so subsequent tasks
don't re-explore the same packages.

### StructureDefinition shape not documented → Resolved
Addressed by the same directive. Phase 0 discovers this empirically and
documents it rather than speculating upfront.

### AI evaluation not automatable → Resolved
PLAN.md Implementation Directive #4 now requires a separate harness script
that calls the Claude API directly. Scoring is manual in Phase 0, automated
in Phase 4.

### Task ordering within phases → Resolved
Explicit dependency graphs added to each phase in PLAN.md, noting which
tasks can run in parallel and which are sequential.

### ContentReference elements underspecified → Added
COMPACT-FORMAT-SPEC.md §6.7 now defines `@ref(path)` syntax for
contentReference elements, with grammar production and serialization rules.

### @format directive inconsistency → Fixed
All examples in PLAN.md and COMPACT-FORMAT-SPEC.md now include the
`@format ezf/0.1` directive. Grammar updated to include `format_directive`
as optional first production.

### R4 package missing from day-one targets → Fixed
`hl7.fhir.r4.core` added to the package list, since `compare_versions`
tests reference R4→R5 diffs.

### Error contracts for external services → Added
`expand_valueset` tool spec now defines degradation behavior. Error/timeout
test cases added to TESTING-STRATEGY.md §4.2. `to_fsh` error cases added.
Risk table updated with error contract mention.

### Search index design timing → Added
Note added after Phase 2 task table specifying which fields should be
indexed, with guidance to finalize this before Phase 1 compact file
generation is complete.

### Model assignments adjusted
- 0.4 (parser): Sonnet → Haiku (grammar fully specified)
- 2.4 (lookup_element): Sonnet → Haiku (path traversal, pattern established)
- 3.2 (compare_profiles tool): Sonnet → Haiku (thin wrapper)
- 3.3 (compare_versions tool): Sonnet → Haiku (composition of existing pieces)
- 4.10 (docs): Sonnet → Haiku (derives from existing content)
- Summary split updated from 20/50/30 to 20/40/40 (Opus/Sonnet/Haiku)
