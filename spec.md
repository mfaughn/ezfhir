# Product Specification

This document defines **WHAT** we are building.

---

## 1. Overview

### Problem Statement

AI models know FHIR approximately but lack precise knowledge of element-level details, search parameters, operations, profile constraints, and version differences. This causes hallucinated element names, incorrect cardinalities, wrong binding strengths, and missed profile requirements. Raw FHIR StructureDefinitions are too large (85K+ characters each) to fit efficiently in LLM context windows.

### Target Users

1. **AI models** (primary) — Claude, GPT, and other LLMs working on FHIR-related tasks via MCP
2. **Developers** using AI assistants for FHIR implementation work
3. **Interoperability specialists** who need AI help navigating profiles and IGs

### Success Criteria

1. EZF format achieves ≤5% token ratio vs JSON StructureDefinitions (20x+ compression)
2. Round-trip fidelity: serialize→parse→verify passes for 100% of R5 core resource elements
3. AI quality: composite score ≥8/9 on FHIR evaluation set (vs ~5-6/9 baseline)
4. Hallucination rate ≤5% with ezfhir (vs ~30-40% baseline)
5. Full R5 spec fits in ≤150K tokens as EZF

---

## 2. Features

### Feature 1: Compact FHIR Representation (EZF Format)

**Description:** A token-efficient text format for representing FHIR StructureDefinitions, ValueSets, CodeSystems, and related artifacts. Formally specified in COMPACT-FORMAT-SPEC.md.

**User Stories:**
- As an AI model, I want to read a resource definition in ~500-800 tokens so that I can answer questions without consuming most of my context window
- As an AI model, I want profile definitions to show only the delta from the base resource so that I can quickly understand what an IG changes

**Acceptance Criteria:**
- [ ] EZF serializer handles all R5 core resource types
- [ ] EZF parser reconstructs structured EZFElement objects
- [ ] Round-trip verifier passes for all retained fields
- [ ] Profile delta format correctly identifies constraint changes
- [ ] ContentReference elements serialize as `@ref(path)`

### Feature 2: MCP Server with Progressive Disclosure

**Description:** An MCP server that exposes compact files as browsable resources and deterministic tools for precise operations.

**User Stories:**
- As an AI model, I want to browse a categorized index of all FHIR resources so that I can find the right resource type for a use case
- As an AI model, I want to look up a specific element path so that I can get exact type, cardinality, and binding information
- As an AI model, I want to search across the spec by keyword so that I can find relevant resources and elements

**Acceptance Criteria:**
- [ ] MCP resources serve index, resource, datatype, profile, and IG compact files
- [ ] `search_spec` returns relevant results for keyword queries
- [ ] `lookup_element` resolves paths including nested backbone elements
- [ ] `get_examples` returns example instances from spec packages
- [ ] `load_ig` downloads and processes IGs from registry.fhir.org at runtime
- [ ] `list_igs` shows loaded packages with artifact counts

### Feature 3: Deterministic Analysis Tools

**Description:** MCP tools that wrap deterministic FHIR operations — profile comparison, version comparison, value set expansion, FSH conversion.

**User Stories:**
- As an AI model, I want to compare a profile against its base resource so that I can precisely describe what constraints a profile adds
- As an AI model, I want to compare a resource between FHIR versions so that I can identify what changed
- As an AI model, I want to expand a value set so that I can list valid codes without hallucinating

**Acceptance Criteria:**
- [ ] `compare_profiles` produces element-by-element diffs with change annotations
- [ ] `compare_versions` identifies added, removed, renamed elements across versions
- [ ] `expand_valueset` calls tx.fhir.org, truncates large sets, degrades gracefully on error
- [ ] `to_fsh` runs GoFSH and returns valid FSH
- [ ] `get_bindings`, `get_references`, `get_constraints` extract structural information

### Feature 4: Ingestion Pipeline

**Description:** Automated pipeline that converts any FHIR package from registry.fhir.org into compact EZF format.

**User Stories:**
- As a developer, I want to run a single command to generate compact files for any published IG
- As a developer, I want to load additional IGs at runtime without restarting the server

**Acceptance Criteria:**
- [ ] `generate` command accepts package IDs and produces complete EZF file hierarchy
- [ ] Pipeline handles resources, datatypes, profiles, extensions, value sets, code systems
- [ ] Index files are generated with categorized listings
- [ ] Day-one packages: hl7.fhir.r4.core, hl7.fhir.r5.core, hl7.fhir.r6.core, hl7.fhir.us.core, hl7.fhir.us.ccda, hl7.fhir.uv.extensions

---

## 3. Non-Functional Requirements

### Performance
- Single resource EZF lookup: <100ms
- Full pipeline generation for one package: <5 minutes
- Value set expansion: timeout after 10s, fall back to cached/error response

### Compatibility
- MCP-capable clients: Claude Code, Claude Desktop, Cursor, VS Code
- Transport: stdio (local) and HTTP+SSE (remote)
- Node.js ≥18

### Reliability
- tx.fhir.org failures must degrade gracefully (return binding metadata without codes)
- GoFSH failures must return clear errors with artifact URL for fallback

---

## 4. Out of Scope (v1)

- FHIR instance validation (use HAPI validator directly)
- FHIR instance generation/templating
- Custom profile authoring (ezfhir reads profiles, doesn't create them)
- GUI or web interface
- Real-time spec updates (manual regeneration required)
- Non-FHIR healthcare standards (HL7v2, CDA outside of C-CDA on FHIR)

---

## 5. Open Questions

- None remaining (addressed during plan review)

---

## 6. Approval

- [x] Specification reviewed and approved
- **Approved by:** User
- **Date:** 2026-03-02
