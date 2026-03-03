# EZF Compact Format Specification v0.1

## 1. Overview

EZF (ezfhir compact format) is a line-oriented text format for representing FHIR
StructureDefinitions, ValueSets, CodeSystems, SearchParameters, OperationDefinitions,
and related artifacts in a token-efficient form suitable for consumption by large
language models. The format is designed to be both human-readable and machine-parseable.

**Design goals:**
1. Lossless for structurally significant information (see §1.1 for what is excluded)
2. Parseable by a context-free grammar (no ambiguity)
3. Minimal token footprint (target: ≤5% of equivalent JSON StructureDefinition)
4. Round-trippable: `SD → EZF → parse(EZF) → verify(SD)` must pass for all retained fields

### 1.1 Information retained vs. excluded

**Retained:** element paths, cardinalities, types (including choice types and reference
targets), flags (summary, modifier, must-support, trial-use, normative), value set
bindings with strength, short descriptions, backbone element nesting, search parameters,
operations, FHIRPath invariants with human descriptions, extensions (for profiles),
compartment membership, resource scope/category.

**Excluded:** element IDs, full definitions (available via `lookup_element` tool),
comments, mappings (V2, RIM, etc.), examples (available via `get_examples` tool),
element ordering rationale, conditions, constraints context, snapshot vs. differential
metadata, publishing metadata (date, publisher, contact, jurisdiction), narrative HTML.

The excluded information is not lost — it remains accessible via MCP tools that read
the source StructureDefinition directly. EZF is a projection, not a replacement.

---

## 2. Lexical Rules

### 2.1 Encoding
UTF-8. No BOM.

### 2.2 Line structure
Each line is one of:
- **Directive line:** starts with `@` (after optional indentation)
- **Element line:** defines a single element (within an `@elements` or `@constraints` block)
- **Entry line:** a key-value pair within a section (within `@search`, `@operations`, etc.)
- **Comment line:** starts with `//` (after optional indentation). Ignored by parsers.
- **Blank line:** separates sections. Ignored by parsers.

### 2.3 Indentation
Two spaces per nesting level. Indentation is semantically significant only within
`@elements` and `@constraints` blocks, where it indicates backbone element nesting.
Tabs are not permitted.

### 2.4 Line length
No hard limit, but generators SHOULD keep lines under 120 characters. The `#` comment
portion of element lines MAY be truncated or omitted if it would exceed this limit.

---

## 3. Document Types

EZF defines six document types, each identified by its opening directive.

| Opening directive | Artifact type | File extension |
|---|---|---|
| `@resource` | Base resource definition | `.ezf` |
| `@datatype` | DataType definition (complex or primitive) | `.ezf` |
| `@profile` | Profile (constrained StructureDefinition) | `.ezf` |
| `@extension` | Extension definition | `.ezf` |
| `@valueset` | ValueSet summary | `.ezf` |
| `@codesystem` | CodeSystem summary | `.ezf` |

---

## 4. Grammar

### 4.1 Notation conventions
- `IDENTIFIER`: `[a-zA-Z][a-zA-Z0-9-]*` (FHIR element names, resource names)
- `URL`: any valid URL (no spaces)
- `TEXT`: arbitrary text until end of line (or until `#` for element lines)
- `INDENT`: exactly two spaces per nesting level
- `WS`: one or more spaces (for alignment; not semantically significant except in indentation)
- `?` suffix: optional
- `*` suffix: zero or more
- `+` suffix: one or more
- `|`: alternation

### 4.2 Document structure

```
document :=
  format_directive?
  header
  (section)*

format_directive :=
  "@format" WS "ezf/" VERSION       // e.g., @format ezf/0.1
```

### 4.3 Header

```
header :=
  type_directive
  metadata_directive*

type_directive :=
  "@resource" WS IDENTIFIER WS ":" WS IDENTIFIER     // name : parent
  | "@datatype" WS IDENTIFIER WS ":" WS IDENTIFIER   // name : parent
  | "@profile" WS IDENTIFIER WS ":" WS IDENTIFIER    // name : base_resource
  | "@extension" WS IDENTIFIER                         // name (parent is always Extension)
  | "@valueset" WS IDENTIFIER                          // name
  | "@codesystem" WS IDENTIFIER                        // name

metadata_directive :=
  "@description" WS TEXT
  | "@url" WS URL
  | "@version" WS TEXT
  | "@status" WS ("draft" | "active" | "retired" | "unknown")
  | "@scope" WS TEXT                          // resource category
  | "@compartment" WS IDENTIFIER WS "(" WS IDENTIFIER WS ")"  // compartment (param)
  | "@ig" WS TEXT                             // package ID for profiles
  | "@maturity" WS ("0"|"1"|"2"|"3"|"4"|"5"|"N")  // FMM level or Normative
  | "@abstract" WS ("true" | "false")         // for abstract resources
```

### 4.4 Sections

```
section :=
  elements_section
  | constraints_section    // profiles only
  | extensions_section     // profiles only
  | mustsupport_section    // profiles only
  | search_section
  | operations_section
  | invariants_section
  | slicing_section        // profiles only
  | valueset_content_section   // valuesets only
  | codesystem_content_section // codesystems only

elements_section :=
  "@elements" NEWLINE
  element_line+

constraints_section :=
  "@constraints" WS "(" TEXT ")" NEWLINE     // parenthetical describes base
  element_line+

extensions_section :=
  "@extensions" NEWLINE
  extension_line+

mustsupport_section :=
  "@mustsupport" NEWLINE
  TEXT                                        // comma-separated element paths

search_section :=
  "@search" NEWLINE
  search_line+

operations_section :=
  "@operations" NEWLINE
  operation_line+

invariants_section :=
  "@invariants" NEWLINE
  invariant_line+

slicing_section :=
  "@slicing" NEWLINE
  slice_line+

valueset_content_section :=
  "@codes" WS "(" TEXT ")" NEWLINE           // parenthetical: system URL or "multiple systems"
  code_line+

codesystem_content_section :=
  "@concepts" NEWLINE
  concept_line+
```

### 4.5 Element lines

Element lines are the core of the format. They appear in `@elements` and `@constraints` blocks.

```
element_line :=
  INDENT* name WS ":" WS cardinality WS type_expr (WS flags)? (WS "#" WS description)?

name :=
  IDENTIFIER                     // e.g., "identifier"
  | IDENTIFIER "[x]"            // choice type, e.g., "deceased[x]"

cardinality :=
  INTEGER ".." (INTEGER | "*")   // e.g., "0..1", "1..*", "0..*"

type_expr :=
  type_single ("|" type_single)* // pipe-separated for choice types

type_single :=
  IDENTIFIER                     // simple type, e.g., "boolean", "string"
  | IDENTIFIER "(" ref_targets ")"  // parameterized, e.g., "Reference(Patient|Practitioner)"
  | "BackboneElement"            // inline complex type
  | "@ref(" IDENTIFIER "." IDENTIFIER ("." IDENTIFIER)* ")"  // contentReference, e.g., @ref(Questionnaire.item)

ref_targets :=
  IDENTIFIER ("|" IDENTIFIER)*

flags :=
  "[" flag_item ("" flag_item)* "]"  // no separator between flags

flag_item :=
  "Σ"     // isSummary
  | "?!"  // isModifier
  | "MS"  // mustSupport
  | "TU"  // trial-use
  | "N"   // normative
  | "D"   // draft
```

**Binding sub-line:** Immediately follows the element it applies to, indented one level deeper.

```
binding_line :=
  INDENT+ "@binding" WS strength WS URL (WS "#" WS TEXT)?

strength :=
  "required" | "extensible" | "preferred" | "example"
```

**Annotation sub-line:** For profile `@constraints` blocks, indicates what changed.

```
// Annotations appear as trailing comments on element lines in @constraints blocks:
//   # TIGHTENED from <old_cardinality>
//   # ADDED
//   # ADDED MS
//   # BINDING CHANGED from <old_strength>
//   # TYPE NARROWED from <old_types>
//
// These annotations are informational. A parser MAY ignore them.
// The canonical change information is in the element definition itself.
```

### 4.6 Nesting rules

Elements that are children of a BackboneElement are indented one level (two spaces)
deeper than their parent. This mirrors the StructureDefinition path hierarchy.

```
contact          : 0..* BackboneElement            # parent
  relationship   : 0..* CodeableConcept            # child (2-space indent)
    @binding extensible http://...                  # binding (4-space indent)
  name           : 0..1 HumanName                  # another child
```

Maximum nesting depth: 6 levels (matching FHIR's practical maximum).

### 4.7 Search parameter lines

```
search_line :=
  IDENTIFIER WS ":" WS search_type WS "(" TEXT ")" (WS "#" WS TEXT)?

search_type :=
  "string" | "token" | "reference" | "date" | "number" | "quantity"
  | "uri" | "composite" | "special"
```

The parenthetical contains either:
- An element path: `(HumanName.family)`
- A type: `(Identifier)`
- An expression: `(deceased as dateTime)`
- A filter: `(ContactPoint /phone)` — where `/phone` indicates a filter on ContactPoint.use

### 4.8 Operation lines

```
operation_line :=
  "$" IDENTIFIER WS ":" WS TEXT
```

### 4.9 Invariant lines

```
invariant_line :=
  IDENTIFIER WS ":" WS TEXT                  // key : human description

// If the FHIRPath expression is needed, it appears on a continuation line:
  INDENT+ "expr:" WS TEXT
```

### 4.10 Extension lines (profile sections)

```
extension_line :=
  IDENTIFIER WS ":" WS cardinality WS type_expr (WS "#" WS TEXT)?
```

### 4.11 Slice lines (profile sections)

```
slice_line :=
  IDENTIFIER WS "/" WS IDENTIFIER WS ":" WS TEXT    // element / slice_name : description
  (INDENT element_line)*                              // constrained elements within the slice
```

Example:
```
@slicing
identifier / MRN : Medical Record Number
  system         : 1..1 uri          # fixed to http://hospital.example.org/mrn
  value          : 1..1 string [MS]
identifier / SSN : Social Security Number
  system         : 1..1 uri          # fixed to http://hl7.org/fhir/sid/us-ssn
```

### 4.12 ValueSet content

```
code_line :=
  IDENTIFIER WS ":" WS TEXT (WS "(" INTEGER ")" )?   // code : display (child_count)?

// For large value sets, a truncation indicator:
//   ... and N more codes
```

Example:
```
@format ezf/0.1
@valueset AdministrativeGender
@url http://hl7.org/fhir/ValueSet/administrative-gender
@description The gender of a person used for administrative purposes.

@codes (http://hl7.org/fhir/administrative-gender)
male       : Male
female     : Female
other      : Other
unknown    : Unknown
```

### 4.13 CodeSystem content

```
concept_line :=
  INDENT* IDENTIFIER WS ":" WS TEXT

// Indentation indicates hierarchy. Same nesting rules as elements.
```

---

## 5. Index File Format

Index files provide the progressive disclosure entry point. They are not EZF documents
but use a simpler format:

```
index_file :=
  index_header
  (category_block)*

index_header :=
  "# " TEXT NEWLINE              // title
  ("@package" WS TEXT NEWLINE)?  // package ID
  ("@version" WS TEXT NEWLINE)?  // FHIR version

category_block :=
  NEWLINE
  "## " TEXT NEWLINE             // category name
  index_line+

index_line :=
  IDENTIFIER WS ":" WS TEXT     // name : one-line description
```

Example:
```
# FHIR R5 Resource Index
@package hl7.fhir.r5.core
@version 5.0.0

## Patient Administration
Patient          : Demographics and administrative information about an individual receiving care
RelatedPerson    : Information about a person involved in the care of a patient
Practitioner     : A person with a formal responsibility in the provisioning of healthcare
Organization     : A formally or informally recognized grouping of people or organizations
...

## Clinical Summary
Condition        : A clinical condition, problem, diagnosis, or other event
AllergyIntolerance : Risk of harmful or undesirable physiological response
Procedure        : An action performed on or for a patient
...
```

---

## 6. Serialization Rules

These rules define how a generator MUST produce EZF from a StructureDefinition.

### 6.1 Element ordering
Elements MUST appear in the same order as in the StructureDefinition snapshot.

### 6.2 Inherited elements
For `@resource` and `@datatype` documents, DomainResource-inherited elements (id, meta,
implicitRules, language, text, contained, extension, modifierExtension) MUST be omitted.
They are universal and waste tokens.

For `@profile` documents using `@constraints`, ONLY elements that differ from the base
definition MUST appear. An element "differs" if any of these changed:
- Cardinality (min or max)
- Type list (narrowed or changed)
- Must-support flag (added)
- Binding (strength changed, or value set URL changed)
- Fixed or pattern value (added)
- New constraints (invariants added)
- Slicing (introduced or modified)

### 6.3 Type representation
- Simple types: lowercase (`string`, `boolean`, `code`, `date`, `uri`, etc.)
- Complex types: PascalCase (`Identifier`, `CodeableConcept`, `HumanName`, etc.)
- Reference types: `Reference(Target1|Target2)` — targets in alphabetical order
- Canonical references: `canonical(StructureDefinition|ValueSet)` — lowercase `canonical`
- Choice types: `boolean|dateTime` — types separated by `|`, matching the `[x]` suffix on the name
- BackboneElement: always spelled out as `BackboneElement` (never `Element`)

### 6.4 Flag representation
Flags appear in a fixed order within brackets: `[?!ΣMS]`. Missing flags are omitted,
not represented as false. If no flags apply, the entire bracket is omitted.

Flag precedence order: `?!` `Σ` `MS` `TU` `N` `D`

### 6.5 Binding representation
Bindings appear on the line immediately following the element they apply to, indented
one level deeper. Only `required`, `extensible`, and `preferred` bindings MUST be included.
`example` bindings MAY be omitted (generator SHOULD omit to save tokens unless the
value set is particularly informative).

### 6.6 Description truncation
The `# description` portion of element lines uses the `short` field from the
StructureDefinition. If `short` is absent, the first sentence of `definition` is used.
Descriptions longer than 80 characters SHOULD be truncated with `…`.

### 6.7 ContentReference elements

Some elements in a StructureDefinition are defined by reference to another element in
the same resource (e.g., `Questionnaire.item.item` references `Questionnaire.item`).
These appear in the SD with a `contentReference` field instead of a `type` array.

In EZF, contentReference elements MUST be serialized using a `@ref` type:

```
item             : 0..* @ref(Questionnaire.item)    # Nested items
```

The `@ref(path)` syntax indicates the element's structure is identical to the referenced
element. Parsers MUST resolve `@ref` by looking up the referenced path in the same
document. The verifier (§7.4) MUST treat `@ref` elements as matching the referenced
element's type structure.

### 6.8 Profile delta annotations
In `@constraints` blocks, the `#` comment MUST indicate what changed:
- `# TIGHTENED from <old_card>` — if only cardinality changed
- `# ADDED` — if the element is not in the base (new sub-element or slice)
- `# ADDED MS` — if only must-support was added
- `# BINDING CHANGED from <old_strength>` — if binding strength changed
- `# TYPE NARROWED from <old_types>` — if type list was narrowed
- Multiple changes: combine with `;`, e.g., `# TIGHTENED from 0..*; ADDED MS`

---

## 7. Parsing Rules

These rules define how a consumer MUST interpret EZF.

### 7.1 Structural parsing

1. Split input into lines.
2. Classify each line by its prefix (after stripping indentation):
   - `@` → directive
   - `//` → comment (discard)
   - blank → section separator (discard)
   - other → content line (element, entry, etc., depending on current section)
3. Directives create or switch sections. Content lines belong to the current section.

### 7.2 Element tree reconstruction

1. Track current nesting depth by counting leading 2-space indents.
2. An element at depth N is a child of the nearest preceding element at depth N-1.
3. `@binding` lines at depth N apply to the element at depth N-1.

### 7.3 Reconstructing a partial StructureDefinition

A parser can produce a structured object from EZF with the following fields per element:

```typescript
interface EZFElement {
  path: string;              // fully qualified, e.g., "Patient.contact.relationship"
  min: number;
  max: string;               // number or "*"
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
  children?: EZFElement[];   // for BackboneElement
}

interface EZFType {
  code: string;
  targetProfile?: string[];  // for Reference and canonical
}
```

### 7.4 Verification against source StructureDefinition

A round-trip verifier compares the parsed EZF against the source SD:

For each element in the EZF:
1. Find the corresponding element in the SD snapshot by path.
2. Assert `min` matches.
3. Assert `max` matches.
4. Assert type codes match (order-independent).
5. Assert reference targets match (order-independent).
6. Assert binding strength matches (if binding present in EZF).
7. Assert binding valueSet URL matches.
8. Assert isSummary matches the `Σ` flag.
9. Assert isModifier matches the `?!` flag.
10. Assert mustSupport matches the `MS` flag.

For each element in the SD snapshot (minus excluded inherited elements per §6.2):
11. Assert a corresponding element exists in the EZF (no elements dropped).

This verifier is the **primary correctness test** for the serializer.

---

## 8. File Naming Conventions

```
{package}/
  index.ezf                        # package index (see §5)
  resources/
    {ResourceName}.ezf              # e.g., Patient.ezf, Observation.ezf
  datatypes/
    {DatatypeName}.ezf              # e.g., Identifier.ezf, CodeableConcept.ezf
  profiles/
    {ProfileId}.ezf                 # e.g., us-core-patient.ezf
  extensions/
    {ExtensionId}.ezf               # e.g., us-core-race.ezf
  valuesets/
    {ValueSetName}.ezf              # e.g., administrative-gender.ezf
  codesystems/
    {CodeSystemName}.ezf            # e.g., condition-clinical.ezf
  search-params/
    {ResourceName}.search.ezf       # if not inlined in resource file
```

Package names follow FHIR package ID convention: `hl7.fhir.r5.core`, `hl7.fhir.us.core`, etc.

---

## 9. Versioning

This specification is versioned. The version appears in this document's title.
Generators SHOULD include a `@format` directive as the first line of every EZF file:

```
@format ezf/0.1
```

Parsers MUST check this directive and reject files with unrecognized major versions.
Minor version increments (0.1 → 0.2) add features but remain backwards-compatible.
Major version increments (0.x → 1.0) may break compatibility.
