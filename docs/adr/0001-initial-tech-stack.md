# ADR-0001: Initial Tech Stack

## Status

Accepted

## Date

2026-03-02

## Context

We are building an MCP server that gives AI models token-efficient access to the FHIR specification. The system needs to:

1. Load and parse FHIR packages (npm-style packages from registry.fhir.org)
2. Serialize StructureDefinitions into a custom compact format (EZF)
3. Serve compact files and deterministic tools via the MCP protocol
4. Wrap existing FHIR tooling (GoFSH, terminology services)
5. Be distributable as an npm package for easy installation

The FHIR ecosystem's existing tooling is predominantly JavaScript/TypeScript (fhir-package-loader, GoFSH/SUSHI, the MCP SDK). The target deployment is local developer machines alongside AI coding assistants.

## Decision

- **Runtime:** Node.js with TypeScript (ESM modules, strict mode)
- **MCP framework:** @modelcontextprotocol/sdk
- **FHIR package loading:** fhir-package-loader
- **FSH conversion:** gofsh (GoFSH npm package)
- **Terminology:** tx.fhir.org REST API with local caching
- **Search:** lunr.js (lightweight, zero-dependency full-text search)
- **Testing:** vitest
- **Distribution:** npm package

## Consequences

### Good
- All key dependencies are native npm packages — no polyglot build, no FFI, no external processes
- GoFSH and fhir-package-loader are maintained by the FHIR community; we wrap rather than reimplement
- TypeScript provides type safety for the complex StructureDefinition data structures
- vitest is fast and has good TypeScript/ESM support out of the box
- npm distribution means one-line installation for users

### Bad
- Node.js single-threaded model could be slow for large pipeline generation (mitigated: generation is a batch operation, not real-time)
- GoFSH may not handle all StructureDefinitions cleanly (mitigated: GoFSH is optional, used only for the `to_fsh` tool)
- tx.fhir.org dependency means network calls for value set expansion (mitigated: local caching and graceful degradation)
- lunr.js is not as powerful as Elasticsearch/MeiliSearch (mitigated: search corpus is small — hundreds of resources, not millions of documents)

### Neutral
- ESM-only means no CommonJS compatibility — acceptable for a modern tool
- TypeScript strict mode means more upfront type annotations — worth it for SD parsing correctness

## Alternatives Considered

### Python with FastAPI
- **Pros:** Strong FHIR libraries exist in Python; good for data processing
- **Cons:** FHIR's primary toolchain is JS/TS; MCP SDK is JS-first; would need to bridge to GoFSH via subprocess; npm distribution not possible

### Rust with MCP bindings
- **Pros:** Performance; single binary distribution
- **Cons:** No existing FHIR package tooling; MCP SDK is not mature in Rust; development speed much slower for this type of project

### Deno instead of Node.js
- **Pros:** Better TypeScript support; built-in testing
- **Cons:** npm package compatibility is still rough for some packages (fhir-package-loader, gofsh); smaller deployment footprint but less proven in production

## References

- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [fhir-package-loader](https://github.com/FHIR/fhir-package-loader)
- [GoFSH](https://github.com/FHIR/GoFSH)
- [lunr.js](https://lunrjs.com/)
- [vitest](https://vitest.dev/)
