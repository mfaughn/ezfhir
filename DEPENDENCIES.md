# Dependency API Reference

Discovered API shapes for key dependencies. Created during TASK-002 exploration.

---

## fhir-package-loader

**Package:** `fhir-package-loader` (npm)

### Loading

```typescript
import { defaultPackageLoader, LoadStatus, SafeMode } from "fhir-package-loader";

const loader = await defaultPackageLoader({
  log?: (level: string, message: string) => void,
  safeMode?: SafeMode,  // OFF | FREEZE | CLONE
});

const status: LoadStatus = await loader.loadPackage("hl7.fhir.r5.core", "5.0.0");
// LoadStatus: LOADED | NOT_LOADED | FAILED
```

### Querying

```typescript
// Get single resource JSON by name, id, or URL
const sd = loader.findResourceJSON("Patient", {
  type: ["StructureDefinition"],
  scope: "hl7.fhir.r5.core",  // optional
});

// Get resource metadata
const info = loader.findResourceInfo("Patient", {
  type: ["StructureDefinition"],
});

// Get all matching resources
const infos = loader.findResourceInfos("*", {
  type: ["StructureDefinition"],
  scope: "hl7.fhir.r5.core",
});

// Package info
const pkgInfo = loader.findPackageInfo("hl7.fhir.r5.core", "5.0.0");
// { name, version, packagePath?, packageJSONPath? }
```

### Gotchas
- `findResourceJSON("*", ...)` does NOT return all resources. Use `findResourceInfos("*", ...)` to get metadata, then look up each by name.
- Version strings support: exact (`5.0.0`), wildcard patch (`5.0.x`), `latest`, `current`, `dev`.
- SafeMode.FREEZE is recommended: prevents accidental mutation without clone overhead.

---

## StructureDefinition JSON Shape

### Top-level keys
`resourceType, id, meta, text, extension, url, version, name, status, experimental, date, publisher, contact, description, jurisdiction, purpose, fhirVersion, mapping, kind, abstract, type, baseDefinition, derivation, snapshot, differential`

### Snapshot element shape
```typescript
interface SDElement {
  id: string;             // e.g., "Patient.identifier"
  path: string;           // e.g., "Patient.identifier"
  short?: string;         // brief description
  definition?: string;    // full definition
  comment?: string;       // usage notes
  requirements?: string;  // why this element exists
  alias?: string[];       // alternative names
  min: number;            // 0, 1
  max: string;            // "1", "*"
  base: {
    path: string;
    min: number;
    max: string;
  };
  type?: Array<{
    code: string;                // "Identifier", "Reference", "code", "boolean", etc.
    targetProfile?: string[];    // for Reference: full URLs like "http://hl7.org/fhir/StructureDefinition/Organization"
    profile?: string[];          // for profiled types
  }>;
  contentReference?: string;     // e.g., "#Questionnaire.item" — element defined by ref to another
  constraint?: Array<{
    key: string;         // e.g., "pat-1"
    severity: string;    // "error" | "warning"
    human: string;       // human-readable description
    expression: string;  // FHIRPath expression
    source?: string;     // URL of defining resource
  }>;
  mustSupport?: boolean;
  isModifier?: boolean;
  isModifierReason?: string;
  isSummary?: boolean;
  binding?: {
    strength: string;    // "required" | "extensible" | "preferred" | "example"
    description?: string;
    valueSet?: string;   // ValueSet URL, may include version: "url|version"
    extension?: Array<{
      url: string;
      valueString?: string;
    }>;
  };
  mapping?: Array<{
    identity: string;
    map: string;
  }>;
  extension?: Array<{
    url: string;
    valueString?: string;
    valueBoolean?: boolean;
  }>;
}
```

### Key observations
- **Root element** (e.g., `Patient`): has no `type`, has `constraint` array with inherited constraints
- **Inherited elements** (first ~9): `id, meta, implicitRules, language, text, contained, extension, modifierExtension`. Root element type for `id` is `http://hl7.org/fhirpath/System.String` (not `id`).
- **Choice types**: path ends with `[x]`, `type` array has multiple entries
- **BackboneElement**: `type[0].code === "BackboneElement"`, children follow with deeper paths
- **Reference targets**: `type[0].targetProfile` contains full URLs; extract resource name from the URL suffix
- **ContentReference**: element has `contentReference` (like `#Questionnaire.item`) instead of `type`. Format: `#ResourceName.path`
- **Bindings**: `valueSet` may include version suffix (`|5.0.0`); strip for EZF output
- **Constraints**: filter by `source` — only include constraints where `source` matches the current resource URL (others are inherited)
- **154 elements across R5 core** have contentReference instead of type

### Inherited elements to exclude (per EZF §6.2)
Paths matching: `{Resource}`, `{Resource}.id`, `{Resource}.meta`, `{Resource}.implicitRules`, `{Resource}.language`, `{Resource}.text`, `{Resource}.contained`, `{Resource}.extension`, `{Resource}.modifierExtension`

---

## @modelcontextprotocol/sdk

API to be explored in TASK-007.

---

## gofsh

API to be explored in TASK-006.
