# ezfhir - AI-First FHIR Specification Tool

An MCP server that gives AI models precise, token-efficient access to the FHIR specification, Implementation Guides, and related artifacts via pre-processed compact representations and deterministic tooling.

## UADF Configuration

- uadf_team_mode: false

## Build & Test Commands

```bash
npm install            # Install dependencies
npm run build          # TypeScript compilation
npm test               # Unit + integration tests (vitest)
npm run test:watch     # Watch mode
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run benchmark      # Token efficiency benchmarks
npm run eval           # AI quality evaluation (manual, requires API key)
npm run generate       # Run ingestion pipeline on configured packages
```

## Tech Stack

- **Runtime:** Node.js / TypeScript (ESM)
- **MCP SDK:** @modelcontextprotocol/sdk
- **FHIR packages:** fhir-package-loader
- **FSH conversion:** gofsh
- **Terminology:** tx.fhir.org REST API
- **Search index:** lunr.js
- **Testing:** vitest
- **Packaging:** npm

## Project Conventions

### Code Style
- TypeScript strict mode
- ESM modules (no CommonJS)
- Explicit return types on public functions
- Descriptive variable names; avoid abbreviations except well-known ones (SD, EZF, FSH, MCP)

### File Organization
- `src/` — source code
- `src/converter/` — SD-to-EZF serializer, EZF parser, round-trip verifier
- `src/server/` — MCP server, resource handlers, tool handlers
- `src/diff/` — StructureDefinition diff engine
- `src/pipeline/` — ingestion pipeline (package loading, generation)
- `src/terminology/` — tx.fhir.org client, caching
- `test/` — test files mirroring src/ structure
- `test/fixtures/` — golden files, test packages, evaluation data

### Naming
- Source files: camelCase (`ezfSerializer.ts`)
- Test files: co-located pattern (`ezfSerializer.test.ts`)
- Types/interfaces: PascalCase (`EZFElement`, `DiffResult`)
- Constants: SCREAMING_SNAKE_CASE (`INHERITED_ELEMENTS`)

### Git Workflow
- All work on feature branches: `feature/<task-id>-<description>`
- TDD commits: `RED:`, `GREEN:`, `REFACTOR:` prefixes
- Main branch stays deployable
- No force pushes to main

### Model Assignment (for agent work)
- **Opus:** Design decisions, diff engine, evaluation design, complex transforms (~20%)
- **Sonnet:** Core implementation, converters, tools with non-trivial logic (~40%)
- **Haiku:** Parsers, thin wrappers, extraction tools, docs, mechanical work (~40%)
- Escalate model if a task proves harder than expected; correctness > cost savings

## Key References

- `PLAN.md` — Full project plan with phased implementation
- `COMPACT-FORMAT-SPEC.md` — EZF format grammar and rules
- `TESTING-STRATEGY.md` — Testing approach per category
- `spec.md` — Product specification (UADF)
- `blueprint.md` — Implementation blueprint (UADF)
