# Architecture

High-level system design and component relationships for ezfhir.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────┐
│                 MCP Client (AI)                  │
│  Reads resources (compact files) for orientation │
│  Calls tools for precise operations              │
└────────────────────┬────────────────────────────┘
                     │ MCP Protocol (stdio or HTTP+SSE)
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
│                      ├─ get_bindings              │
│                      ├─ get_references            │
│                      ├─ get_constraints           │
│                      ├─ get_search_params         │
│                      ├─ load_ig                   │
│                      └─ list_igs                  │
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

**Core principle:** Deterministic code for structural operations. AI for interpretation and navigation.

---

## 2. Component Structure

```
src/
├── index.ts                    # Entry point, MCP server bootstrap
├── converter/
│   ├── serializer.ts           # StructureDefinition → EZF
│   ├── parser.ts               # EZF text → EZFElement tree
│   ├── verifier.ts             # Round-trip verification
│   ├── profileDelta.ts         # Profile constraint delta computation
│   └── types.ts                # EZFElement, EZFType, EZFDocument interfaces
├── server/
│   ├── mcpServer.ts            # MCP server setup and configuration
│   ├── resources/
│   │   ├── indexResource.ts    # fhir://index handler
│   │   ├── resourceResource.ts # fhir://resource/{name} handler
│   │   ├── datatypeResource.ts # fhir://datatype/{name} handler
│   │   ├── profileResource.ts  # fhir://profile/{pkg}/{id} handler
│   │   └── igResource.ts       # fhir://ig/{pkg}/index handler
│   └── tools/
│       ├── lookupElement.ts    # lookup_element tool
│       ├── compareProfiles.ts  # compare_profiles tool
│       ├── compareVersions.ts  # compare_versions tool
│       ├── expandValueset.ts   # expand_valueset tool
│       ├── toFsh.ts            # to_fsh tool
│       ├── searchSpec.ts       # search_spec tool
│       ├── getExamples.ts      # get_examples tool
│       ├── getBindings.ts      # get_bindings tool
│       ├── getReferences.ts    # get_references tool
│       ├── getConstraints.ts   # get_constraints tool
│       ├── getSearchParams.ts  # get_search_params tool
│       ├── loadIg.ts           # load_ig tool
│       └── listIgs.ts          # list_igs tool
├── diff/
│   ├── diffEngine.ts           # Element-by-element SD comparison
│   └── types.ts                # DiffResult, ElementChange interfaces
├── pipeline/
│   ├── generate.ts             # CLI entry point for generation
│   ├── packageLoader.ts        # fhir-package-loader wrapper
│   ├── resourceConverter.ts    # Batch resource conversion
│   ├── datatypeConverter.ts    # Batch datatype conversion
│   ├── profileConverter.ts     # Batch profile conversion
│   ├── extensionConverter.ts   # Extension processing
│   ├── valuesetConverter.ts    # ValueSet summary extraction
│   ├── codesystemConverter.ts  # CodeSystem summary extraction
│   ├── searchParamExtractor.ts # Search parameter extraction
│   ├── operationExtractor.ts   # Operation definition extraction
│   └── indexGenerator.ts       # Index file generation
├── terminology/
│   ├── client.ts               # tx.fhir.org HTTP client
│   └── cache.ts                # Local expansion cache
└── search/
    └── searchIndex.ts          # lunr.js index builder and querier

test/
├── converter/                  # Mirrors src/converter/
├── server/                     # Mirrors src/server/
├── diff/                       # Mirrors src/diff/
├── pipeline/                   # Mirrors src/pipeline/
├── terminology/                # Mirrors src/terminology/
└── fixtures/
    ├── packages/               # Cached FHIR packages for tests
    ├── golden/                 # Golden EZF files
    └── evaluation/             # AI quality evaluation data
```

---

## 3. Data Models

### Core EZF Types

```typescript
interface EZFElement {
  path: string;
  min: number;
  max: string;
  types: EZFType[];
  flags: {
    summary: boolean;
    modifier: boolean;
    mustSupport: boolean;
    maturity?: "TU" | "N" | "D";
  };
  short?: string;
  binding?: {
    strength: "required" | "extensible" | "preferred" | "example";
    valueSet: string;
  };
  children?: EZFElement[];
}

interface EZFType {
  code: string;
  targetProfile?: string[];
}

interface EZFDocument {
  format: string;
  type: "resource" | "datatype" | "profile" | "extension" | "valueset" | "codesystem";
  name: string;
  parent?: string;
  metadata: Record<string, string>;
  elements?: EZFElement[];
  constraints?: EZFElement[];
  extensions?: EZFExtension[];
  search?: EZFSearchParam[];
  operations?: EZFOperation[];
  invariants?: EZFInvariant[];
}
```

### Diff Engine Types

```typescript
interface DiffResult {
  base: string;
  compared: string;
  changes: ElementChange[];
  addedElements: string[];
  removedElements: string[];
  addedExtensions: string[];
  addedSearchParams: string[];
  removedSearchParams: string[];
}

interface ElementChange {
  path: string;
  changeType: "cardinality" | "type" | "binding" | "mustSupport" | "fixed" | "slicing";
  from: string;
  to: string;
}
```

---

## 4. External Integrations

| Service | Purpose | Error Handling |
|---------|---------|----------------|
| registry.fhir.org | FHIR package download via fhir-package-loader | Fail with clear error if package not found |
| tx.fhir.org | Value set expansion ($expand) | Cache + graceful degradation (return binding metadata without codes) |
| GoFSH (local) | StructureDefinition → FSH conversion | Return error with artifact URL for fallback |

---

## 5. Conventions

### Naming
- Source files: camelCase (`ezfSerializer.ts`)
- Types/interfaces: PascalCase (`EZFElement`)
- Constants: SCREAMING_SNAKE_CASE (`INHERITED_ELEMENTS`)
- Test files: co-located (`ezfSerializer.test.ts`)

### File Organization
- One module per file, one responsibility per module
- Co-locate tests with source in parallel `test/` tree
- Types shared within a component go in that component's `types.ts`

### Error Handling
- External service errors: degrade gracefully, return partial results with error context
- Invalid user input: return clear error messages identifying what was wrong
- Internal bugs: throw with context, let MCP SDK handle the error response

---

## 6. Security Considerations

- No authentication (local tool; users control what packages are loaded)
- No user data stored
- tx.fhir.org calls are read-only (GET/$expand)
- Package downloads come from registry.fhir.org (trusted source)
