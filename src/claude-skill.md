# ezfhir MCP Server — Claude Skill Guide

You have access to the **ezfhir MCP server**, which provides token-efficient access to the FHIR specification (Fast Healthcare Interoperability Resources). This server gives you precise, deterministic information about FHIR resources, profiles, data types, and Implementation Guides.

## Core Principle: Progressive Disclosure

FHIR is a large specification (hundreds of resources, thousands of elements). To avoid overwhelming responses, follow this pattern:

1. **Start broad** — Use indices to discover what exists
2. **Narrow scope** — Read specific resources or datatypes
3. **Drill into details** — Use tools for targeted lookups

## Available Resources

### Index Resources (Start Here)

- **fhir://index/resources** — Categorized list of all FHIR resources (Patient, Observation, etc.)
- **fhir://index/datatypes** — List of complex and primitive data types (Identifier, HumanName, string, code, etc.)

**When to use:** Beginning a FHIR exploration, answering "What resources are available?" or "What category does X belong to?"

### Individual Resource/Datatype Resources

- **fhir://resource/{name}** — Full definition in compact EZF format (~60x smaller than JSON)
  - Example: `fhir://resource/Patient`
  - Includes: elements, cardinalities, types, flags, bindings, search params, operations

- **fhir://datatype/{name}** — Datatype definition in EZF format
  - Example: `fhir://datatype/Identifier`

**When to use:** Understanding a specific resource's structure, validating element paths, seeing all available elements and their types.

**EZF Format Notes:**
- Line-oriented text format (human and machine readable)
- Elements use dot notation: `Patient.contact.name`
- Cardinality: `0..1` (optional), `1..1` (required), `0..*` (array), etc.
- Flags: `[Σ]` (summary), `[?!]` (modifier), `[MS]` (must-support)
- Bindings show strength: `required`, `extensible`, `preferred`, `example`
- See COMPACT-FORMAT-SPEC.md for full grammar

## Available Tools

### Discovery & Search

#### search_spec
**Purpose:** Discover FHIR resources, elements, or search parameters by keyword

**When to use:**
- User asks "Is there a resource for X?"
- Finding all resources related to a concept (e.g., "medication", "patient demographics")
- Broad exploratory queries

**Input:**
- `query`: Search string (e.g., "blood pressure", "medication", "identifier")
- `limit`: Max results (default 10)

**Example:**
```
search_spec({query: "medication", limit: 5})
→ Returns: MedicationRequest, MedicationAdministration, MedicationStatement, etc.
```

### Element Lookup & Navigation

#### lookup_element
**Purpose:** Get detailed information about a specific element in a resource

**When to use:**
- User asks about a specific field (e.g., "What type is Patient.gender?")
- Validating element paths
- Understanding element constraints (cardinality, type, bindings)
- Navigating nested structures (use dot notation)

**Input:**
- `resource`: Resource name (e.g., "Patient")
- `path`: Dot-separated element path (e.g., "contact.name")

**Output:** Cardinality, type, flags, bindings, description, children (if backbone element)

**Example:**
```
lookup_element({resource: "Patient", path: "gender"})
→ Cardinality: 0..1
→ Type: code
→ Binding: required http://hl7.org/fhir/ValueSet/administrative-gender
→ Flags: [Σ]
```

**Choice types:** Use `[x]` suffix for polymorphic elements:
```
lookup_element({resource: "Observation", path: "value[x]"})
→ Type: Quantity|CodeableConcept|string|boolean|integer|Range|...
```

### Resource Analysis Tools

#### get_bindings
**Purpose:** Extract all coded/terminology bindings for a resource

**When to use:**
- "What value sets does Resource X use?"
- Understanding which elements have controlled vocabularies
- Validating codes against FHIR requirements

**Input:**
- `resource`: Resource name

**Output:** List of element paths with binding strength and ValueSet URLs

#### get_references
**Purpose:** Find all Reference-typed elements and their allowed targets

**When to use:**
- "What can this resource reference?"
- Understanding resource relationships
- Building reference validation logic

**Input:**
- `resource`: Resource name

**Output:** Element paths with allowed target resource types

#### get_constraints
**Purpose:** Get all FHIRPath invariants/constraints

**When to use:**
- Understanding validation rules
- "What constraints does Patient have?"
- Debugging validation errors

**Input:**
- `resource`: Resource name

**Output:** Constraint keys, severity, human descriptions, FHIRPath expressions

#### get_search_params
**Purpose:** List all search parameters for a resource

**When to use:**
- "How do I search for X in Resource Y?"
- Building FHIR API queries
- Understanding available filters

**Input:**
- `resource`: Resource name

**Output:** Parameter name, type (token/reference/string/date/etc.), FHIRPath expression

#### get_examples
**Purpose:** Get example instances from the specification

**When to use:**
- "Show me an example Patient resource"
- Understanding typical resource usage
- Testing/validation scenarios

**Input:**
- `resource`: Resource type
- `count`: Max examples (default 5)

**Output:** Example IDs

### Profile Comparison Tools

#### compare_profiles
**Purpose:** Compare two StructureDefinitions element-by-element

**When to use:**
- "How does Profile X differ from base resource Y?"
- Understanding profile constraints
- Comparing two profiles

**Input:**
- `left`: Base StructureDefinition name
- `right`: Constrained StructureDefinition name
- `scope`: (optional) Package scope

**Output:** Detailed diff showing cardinality changes, type narrowing, binding changes, must-support additions, slicing, fixed values, etc.

**Severity levels:**
- **Breaking:** Incompatible changes (cardinality loosening, type changes)
- **Narrowing:** Stricter constraints (cardinality tightening, type narrowing)
- **Compatible:** Additive changes (must-support flags, documentation)

#### compare_versions
**Purpose:** Compare same resource across FHIR versions or IG versions

**When to use:**
- "What changed in Patient between R4 and R5?"
- "How did US Core Patient change from v6 to v7?"
- Migration planning

**Input:**
- `resource`: Resource/profile name
- `left_package`, `left_version`: First package
- `right_package`, `right_version`: Second package

**Output:** Version-to-version diff (same format as compare_profiles)

### Implementation Guide Management

#### load_ig
**Purpose:** Load additional FHIR Implementation Guide packages

**When to use:**
- User asks about US Core, C-CDA, or other IGs
- Accessing profiles/extensions from specific IGs

**Input:**
- `package_name`: FHIR package ID (e.g., "hl7.fhir.us.core")
- `version`: Package version (e.g., "8.0.1")

**Output:** Confirmation with artifact count

**Note:** Only load IGs when explicitly needed. R5 core is pre-loaded.

#### list_igs
**Purpose:** See what packages are currently loaded

**When to use:**
- Verifying available packages
- Debugging missing resources

**Input:** None

**Output:** List of loaded packages with versions and artifact counts

## Optimal Usage Patterns

### Pattern 1: Answering "What is Resource X?"

1. **First**, check if you already know the resource (from your training data)
2. If uncertain, use `search_spec` to verify it exists
3. Read `fhir://resource/{name}` for structure
4. Use `lookup_element` for specific element questions

**Example:**
```
User: "What is a FHIR Patient resource?"

1. Read fhir://resource/Patient
2. Provide overview from @description and key elements
3. If user asks about specific field, use lookup_element
```

### Pattern 2: "How do I represent X in FHIR?"

1. `search_spec` to find candidate resources
2. Read the top 1-2 candidates
3. Use `lookup_element` to drill into specific elements
4. Use `get_bindings` if terminology/coding is involved

**Example:**
```
User: "How do I represent a patient's blood type?"

1. search_spec({query: "blood type"})
2. Read fhir://resource/Observation
3. lookup_element({resource: "Observation", path: "code"})
4. get_bindings({resource: "Observation"})
```

### Pattern 3: "What changed between versions?"

1. Use `compare_versions` directly if you know the resource name
2. Otherwise, `search_spec` first to confirm existence in both versions

**Example:**
```
User: "What changed in Observation from R4 to R5?"

compare_versions({
  resource: "Observation",
  left_package: "hl7.fhir.r4.core",
  left_version: "4.0.1",
  right_package: "hl7.fhir.r5.core",
  right_version: "5.0.0"
})
```

### Pattern 4: Implementation Guide Questions

1. `load_ig` to make IG available
2. Use `compare_profiles` to understand profile constraints
3. Use `lookup_element` on profile names to see constrained elements

**Example:**
```
User: "What are US Core Patient requirements?"

1. load_ig({package_name: "hl7.fhir.us.core", version: "8.0.1"})
2. compare_profiles({left: "Patient", right: "USCorePatientProfile"})
```

### Pattern 5: Building FHIR API Queries

1. `get_search_params` to see available filters
2. `lookup_element` to understand element types for proper query syntax

**Example:**
```
User: "How do I search for patients by name?"

1. get_search_params({resource: "Patient"})
   → Shows: name : string : (HumanName.family | HumanName.given)
2. Explain: GET /Patient?name=Smith
```

## Common Mistakes to Avoid

### ❌ Don't read full resources for simple questions
If user asks "Is Patient.gender required?", use `lookup_element`, not the full resource.

### ❌ Don't search when you already know the answer
If the question is about a well-known resource (Patient, Observation), skip search_spec.

### ❌ Don't load IGs unnecessarily
R5 core covers base FHIR. Only load IGs when user explicitly mentions them (US Core, C-CDA, etc.).

### ❌ Don't compare profiles without loading their IG first
If comparing a US Core profile, run `load_ig` first.

### ❌ Don't use indices for detailed questions
Indices are for discovery. Use specific resources/tools for details.

## Response Quality Guidelines

### Be Precise
- Cite exact element paths (e.g., "Patient.contact.name")
- Quote cardinalities accurately ("0..1" vs "1..1" matters)
- Distinguish between "required" and "extensible" bindings

### Be Concise
- Don't dump entire resource definitions
- Answer the specific question asked
- Use progressive disclosure: start with summary, offer to drill deeper

### Be Accurate About Optionality
- `0..1` or `0..*` = OPTIONAL
- `1..1` or `1..*` = REQUIRED
- Flags: `[MS]` = must-support (profile requirement, not base cardinality)

### Cite Sources
- Mention "FHIR R5 spec" or specific resource names
- For profiles, cite the IG: "US Core v8.0.1 requires..."

## Tool Selection Decision Tree

```
Question type                          → Tool to use
─────────────────────────────────────────────────────────────
"What resources exist for X?"          → search_spec
"What is Resource X?"                  → fhir://resource/X
"What type is Element Y?"              → lookup_element
"What bindings does Resource X have?"  → get_bindings
"What can Resource X reference?"       → get_references
"What constraints exist?"              → get_constraints
"How do I search for X?"               → get_search_params
"Show me an example"                   → get_examples
"What changed between versions?"       → compare_versions
"How does Profile X constrain Y?"      → compare_profiles
"What IGs are loaded?"                 → list_igs
"Access IG-specific content"           → load_ig first
```

## Multi-Step Workflow Example

```
User: "I need to record a patient's blood pressure. How do I do that in FHIR?"

Step 1: Identify resource
  → search_spec({query: "blood pressure"})
  → Result: Observation (vitalsigns profile)

Step 2: Get structure
  → Read fhir://resource/Observation
  → Identify key elements: code, value[x], subject

Step 3: Answer specifics
  → lookup_element({resource: "Observation", path: "code"})
    → Type: CodeableConcept, binding to LOINC
  → lookup_element({resource: "Observation", path: "value[x]"})
    → Suggests Quantity or Component pattern for systolic/diastolic

Step 4: Provide answer
  → "Use Observation resource with code for BP, component for systolic/diastolic values"
  → Offer to show bindings or search params if needed
```

## Technical Notes

- **EZF format** is optimized for token efficiency (~60x compression vs JSON)
- All tools are **deterministic** (no LLM interpretation, direct from spec)
- **Caching** is automatic (repeated queries are fast)
- **R5 core** is always loaded; other packages require `load_ig`
- **Profile deltas** show only differences from base (constraints, not full structure)

## Summary

**Start broad, narrow with precision:**
1. Indices for discovery
2. Resources for structure
3. Tools for targeted answers

**Tool selection:**
- Lookup/navigation → `lookup_element`
- Discovery → `search_spec`
- Relationships → `get_references`
- Validation → `get_constraints`
- Querying → `get_search_params`
- Terminology → `get_bindings`
- Comparison → `compare_profiles` or `compare_versions`
- Examples → `get_examples`
- IG access → `load_ig`

**Quality principles:**
- Precise (cite paths, cardinalities, bindings)
- Concise (answer the question, don't over-explain)
- Progressive (offer to drill deeper if needed)
