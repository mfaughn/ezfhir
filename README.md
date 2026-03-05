# ezfhir - AI-First FHIR Specification Tool

An MCP (Model Context Protocol) server that gives AI models precise, token-efficient access to the FHIR specification, Implementation Guides, and related artifacts via pre-processed compact representations and deterministic tooling.

**Why ezfhir?** FHIR StructureDefinitions are verbose JSON documents (20-100KB each). ezfhir compresses them to a compact text format (EZF) achieving ~60x compression while preserving all structurally significant information. This lets AI models access complete FHIR definitions within token budgets, enabling precise answers about cardinalities, types, bindings, constraints, and cross-resource relationships.

## Quick Start

### Installation

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Verify tests pass
npm test
```

**Requirements:** Node.js ≥18

### Running the Server

```bash
# Start MCP server on stdio (for Claude Desktop or Claude Code)
node dist/index.js

# Or use npm:
npm start
```

The server will initialize with the HL7 FHIR R5 Core package by default.

## MCP Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ezfhir": {
      "command": "node",
      "args": ["/path/to/ezfhir/dist/index.js"]
    }
  }
}
```

**Configuration path:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Restart Claude Desktop to load the server.

### Claude Code

```bash
# Install ezfhir globally or in a project
npm install ezfhir

# In Claude Code, use the MCP server:
# Tools → Configure MCP → Add server
# Command: node
# Args: /path/to/node_modules/ezfhir/dist/index.js
```

### Manual Testing

```bash
# Test the server with a simple query
echo '{"jsonrpc":"2.0","id":1,"method":"resources/list"}' | node dist/index.js
```

## Available Tools & Resources

### Resources (MCP)

**Static Resources:**
- `fhir://index/resources` — Categorized FHIR resource index (all 52+ resources listed by category)
- `fhir://index/datatypes` — FHIR datatype index (complex + primitive types)

**Dynamic Resources (URI templates):**
- `fhir://resource/{name}` — FHIR resource definition in compact EZF format (e.g., `fhir://resource/Patient`)
  - Includes element structure, search parameters, and operations
  - ~60x smaller than JSON StructureDefinition
- `fhir://datatype/{name}` — FHIR datatype definition in EZF format (e.g., `fhir://datatype/CodeableConcept`)

### Tools

#### Discovery & Navigation

- **`search_spec`** — Full-text search over resources, datatypes, elements, and search parameters
  - Query: `"Patient"`, `"blood pressure"`, `"medication"`
  - Returns ranked results with descriptions

- **`lookup_element`** — Look up a specific element in a resource definition
  - Inputs: resource name (e.g., `Patient`), element path (e.g., `contact.name`)
  - Returns: cardinality, type, flags, bindings, description
  - Use dot notation for nested elements

#### Information Extraction

- **`get_examples`** — Get example instances of a resource type
  - Returns example IDs for understanding typical resource usage
  - Default: 5 examples (configurable)

- **`get_search_params`** — Get all search parameters for a resource
  - Returns: parameter names, types (token, reference, string, etc.), FHIRPath expressions
  - Example: `Patient` has 50+ search parameters (e.g., `name`, `birthdate`, `phone`)

- **`get_bindings`** — Get all coded element bindings for a resource
  - Returns: element paths, binding strengths (required/extensible/preferred/example), value set URLs
  - Useful for understanding what vocabularies apply to which elements

- **`get_references`** — Get all Reference-typed elements in a resource
  - Returns: element paths and allowed target resource types
  - Example: `Patient.generalPractitioner` → `[Practitioner, PractitionerRole, Organization]`

- **`get_constraints`** — Get all FHIRPath invariants/constraints for a resource
  - Returns: constraint keys, human descriptions, severity, FHIRPath expressions
  - Useful for validation and data quality rules

#### Comparison & Analysis

- **`compare_profiles`** — Compare two StructureDefinitions element by element
  - Detects: cardinality changes, type narrowing/widening, binding strength changes, must-support additions/removals, new/removed elements
  - Severity classification: breaking, narrowing, compatible
  - Use to understand profile constraints vs. base resource

- **`compare_versions`** — Compare the same resource across two package versions
  - Useful for understanding changes between FHIR R4 and R5
  - Also works for comparing different IG versions
  - Inputs: resource name, left_package, left_version, right_package, right_version

#### Package Management

- **`load_ig`** — Load a FHIR Implementation Guide package
  - Makes the IG's resources, profiles, and extensions available for lookup
  - Package format: `hl7.fhir.us.core` with version `8.0.1`
  - Example: Load US Core 8.0.1 to access US-specific profiles

- **`list_igs`** — List all loaded FHIR packages
  - Returns package names, versions, and artifact counts

## Usage Examples

### Example 1: Understand a Resource Structure

```
User: What are the elements in a Patient resource?

Claude uses:
1. search_spec("Patient") → finds Patient resource
2. fhir://resource/Patient → retrieves EZF definition (~1.5KB)
3. lookup_element("Patient", "contact") → details on contact element

Response: The Patient resource has 30 elements including:
- id, meta, identifier (identifiers)
- name (HumanName, 0..*), gender (code)
- contact (BackboneElement, 0..*)
  - contact.relationship, contact.name, contact.telecom, contact.address, contact.organization
- generalPractitioner (Reference to Practitioner|PractitionerRole|Organization)
```

### Example 2: Find Search Parameters

```
User: How do I search for patients by name or phone?

Claude uses:
1. get_search_params("Patient") → returns 50+ parameters
2. Filters to "name" and "phone"

Response: Use these search parameters:
- name : string : Patient.name
- phone : token : Patient.telecom(system=phone).value
- telecom : token : Patient.telecom
```

### Example 3: Compare R4 to R5 Changes

```
User: What changed in the Patient resource between FHIR R4 and R5?

Claude uses:
1. load_ig("hl7.fhir.r4.core", "4.0.1")
2. compare_versions("Patient", "hl7.fhir.r4.core", "4.0.1", "hl7.fhir.r5.core", "5.0.0")

Response: Shows all element changes, cardinality differences, new elements added, removed elements, etc.
```

### Example 4: Understand Profile Constraints

```
User: How is the US Core Patient profile different from the base Patient?

Claude uses:
1. load_ig("hl7.fhir.us.core", "8.0.1")
2. compare_profiles("Patient", "USCorePatient")

Response: Shows constraints like:
- birthDate: now Required (was 0..1)
- name: Must Support added
- identifier: Slicing on type added
- New extensions for race, ethnicity
```

### Example 5: Find Coding Constraints

```
User: What are the allowed gender values for a Patient?

Claude uses:
1. get_bindings("Patient") → finds Patient.gender binding
2. lookup_element("Patient", "gender")

Response: The gender element binds to:
- Binding strength: Required
- Value Set: http://hl7.org/fhir/ValueSet/administrative-gender
- Codes: male, female, other, unknown
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run in watch mode (re-runs on file changes)
npm run test:watch

# Run specific test file
npm test -- test/converter/ezfSerializer.test.ts
```

**Test suite:**
- 296+ tests covering serializer, parser, round-trip verification, all tools, diff engine
- All tests pass with 100% element coverage on supported resources

### Token Efficiency Benchmarks

```bash
# Run benchmarks (compares EZF vs JSON token counts)
npm run benchmark

# Output: Shows 22 artifacts with ~1.7% average EZF/JSON ratio
# Example: Patient resource is 1.6% of JSON size
```

### Type Checking

```bash
# Check TypeScript without building
npm run typecheck
```

### Linting

```bash
# Run ESLint
npm run lint
```

### Generate Ingestion Pipeline

```bash
# Process FHIR packages and generate compact definitions
npm run generate
```

## Architecture

### Converter Pipeline (`src/converter/`)

- **`serializer.ts`** — Converts FHIR StructureDefinition JSON → EZF compact format
  - Handles all element types, cardinalities, flags, bindings
  - Omits inherited DomainResource elements
  - Produces ~60x smaller output

- **`parser.ts`** — Parses EZF text → EZFElement tree
  - Fully specified grammar (see COMPACT-FORMAT-SPEC.md)
  - Handles indentation-based nesting, type expressions, flags

- **`types.ts`** — Type definitions for EZF documents and elements

### MCP Server (`src/server.ts`)

- Entry point for the MCP protocol
- Registers resources and tools
- Manages caching for performance
- Coordinates with package loader and diff engine

### Pipeline (`src/pipeline/`)

- **`packageLoader.ts`** — Loads FHIR packages from npm registry via fhir-package-loader
- **`indexGenerator.ts`** — Generates categorized resource/datatype indices
- **`searchIndex.ts`** — Builds full-text search index using lunr.js
- **`searchParamExtractor.ts`** — Extracts SearchParameter artifacts
- **`operationExtractor.ts`** — Extracts OperationDefinition artifacts
- **`sdDiff.ts`** — StructureDefinition diff engine for comparing versions/profiles

### Format Specification (`COMPACT-FORMAT-SPEC.md`)

The EZF format is fully documented:
- §1-2: Overview, lexical rules
- §3-4: Directives, element syntax, type expressions
- §5: Structure (resources, datatypes, indices)
- §6: Serialization rules
- §7: Parsing rules and round-trip verification

## Tech Stack

| Component | Package | Purpose |
|-----------|---------|---------|
| Runtime | Node.js 18+ | JavaScript execution |
| Language | TypeScript 5.4+ | Type-safe development |
| MCP SDK | @modelcontextprotocol/sdk 1.27+ | MCP protocol implementation |
| FHIR Packages | fhir-package-loader 2.2+ | Loading FHIR specification packages |
| Search | lunr.js 2.3+ | Full-text search indexing |
| Testing | vitest 2.0+ | Unit & integration tests |
| Validation | zod 4.3+ | Type validation for tool inputs |

## Compact Format (EZF) Example

Here's what a Patient resource looks like in EZF format:

```
@format 0.1
@title Patient
@url http://hl7.org/fhir/StructureDefinition/Patient
@abstract false
@type Patient
@category Administration
@elements
  id [0..1] string
  meta [0..1] Meta
  identifier [0..*] Identifier
  active [0..1] boolean
  name [0..*] HumanName
    Σ given [0..*] string
    Σ family [0..1] string
    use [0..1] code
  telecom [0..*] ContactPoint
    Σ system [0..1] code
    Σ value [0..1] string
  gender [0..1] code
    ⊆ http://hl7.org/fhir/ValueSet/administrative-gender
  birthDate [0..1] date
  contact [0..*] BackboneElement
    relationship [0..*] CodeableConcept
    name [0..1] HumanName
    telecom [0..*] ContactPoint
    address [0..1] Address
    organization [0..1] Reference(Organization)
  generalPractitioner [0..*] Reference(Practitioner|PractitionerRole|Organization)
    MS
@search
  _id : token : (resource id)
  active : token : Patient.active
  birthdate : date : Patient.birthDate
  family : string : Patient.name.family
  given : string : Patient.name.given
  name : string : Patient.name
  phone : token : Patient.telecom(system=phone).value
  telecom : token : Patient.telecom
```

## Performance

- **Serialization:** ~1ms per resource (includes full SD processing)
- **Parsing:** ~0.5ms per resource document
- **Search:** ~50ms over 52 resources + 40 datatypes (lunr.js)
- **Memory:** ~50MB for R5 core + indices (includes full package metadata)

## Limitations & Future Work

- **Currently Deferred:**
  - `expand_valueset` tool — requires external HTTP calls to tx.fhir.org
  - `to_fsh` tool — requires GoFSH binary (not available in standard environments)

- **Planned:**
  - Full AI evaluation suite (Questions, scoring, model comparison)
  - Claude Desktop plugin/skill
  - Packaging as npm module with pre-built commands
  - CI/CD pipeline

## Key References

- **`COMPACT-FORMAT-SPEC.md`** — Complete grammar and serialization rules for EZF format
- **`PLAN.md`** — Full project implementation plan with phased roadmap
- **`TESTING-STRATEGY.md`** — Testing methodology and coverage goals
- **`TASKS.md`** — Progress tracking (296+ tests completed, all phases on track)

## License

MIT

## Contributing

This is a research/evaluation project. For improvements:

1. Ensure tests pass: `npm test`
2. Run benchmarks to check token efficiency: `npm run benchmark`
3. Follow TypeScript strict mode and ESLint conventions
4. Add tests for new features
5. Create a feature branch: `feature/<task-id>-<description>`

## Support

For FHIR specification questions, use the tools in the server:
- Start with `search_spec` to find relevant resources
- Use `lookup_element` for detailed element information
- Use comparison tools to understand profile constraints
- Use extraction tools (bindings, references, constraints) for specific questions

For tool development or MCP integration issues, check test files for examples:
- `test/server/` — Tool input/output examples
- `test/converter/` — Serializer and parser tests
- `test/diff/` — Comparison engine examples
