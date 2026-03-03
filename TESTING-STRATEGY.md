# ezfhir Testing Strategy

## 1. Testing Categories

There are four distinct categories of testing required, each with different goals
and methods:

| Category | What it validates | When it runs | Failure = |
|---|---|---|---|
| **Format fidelity** | EZF serializer produces correct, lossless output | Every build (CI) | Bug in converter |
| **Token efficiency** | Compression targets are met | Per-release benchmark | Design problem in format |
| **Tool correctness** | MCP tools return correct results | Every build (CI) | Bug in tool implementation |
| **AI quality** | The whole system improves AI answers about FHIR | Per-release evaluation | Project may not be worth building |

---

## 2. Format Fidelity Testing

### 2.1 Round-trip verification

The spec (§7.4) defines a verification algorithm. This becomes an automated test:

```
For each StructureDefinition SD in a FHIR package:
  1. Run the serializer: ezf = serialize(SD)
  2. Run the parser: parsed = parse(ezf)
  3. Run the verifier: verify(parsed, SD)
```

The verifier checks, per element:
- path matches
- min cardinality matches
- max cardinality matches
- type codes match (order-independent set comparison)
- reference/canonical targets match (order-independent)
- binding strength matches (if present)
- binding valueSet URL matches
- isSummary flag matches
- isModifier flag matches
- mustSupport flag matches

And globally:
- every non-inherited element in the SD snapshot has a corresponding EZF element
- no EZF element exists that doesn't correspond to an SD element

### 2.2 Golden file tests

For a curated set of resources, maintain checked-in `.ezf` files alongside the source
StructureDefinitions. The test asserts that the serializer output matches the golden
file byte-for-byte. This catches unintentional format drift.

**Golden file set (minimum):**
- Patient (broad, common, has backbone elements)
- Observation (choice types, many bindings, critical resource)
- MedicationRequest (deep nesting, multiple reference types)
- Bundle (structural resource, distinct from clinical)
- Identifier (complex datatype)
- Extension (meta-resource)
- US Core Patient profile (profile delta format)
- US Core Condition profile (slicing example)

### 2.3 Edge case tests

Specific unit tests for tricky StructureDefinition features:

| Edge case | What to test |
|---|---|
| Choice types with many options | `Observation.value[x]` has 11 types — all must appear |
| Deeply nested backbone elements | `Claim.item.detail.subDetail` — 3+ levels of nesting |
| Recursive references | `Questionnaire.item.item` — self-referencing elements |
| Abstract resources | `Resource`, `DomainResource` — `@abstract true` |
| Primitive type extensions | Elements like `_birthDate` — should be excluded from EZF |
| Elements with no short description | Must fall back to first sentence of definition |
| Empty backbone elements | Backbone with zero children after filtering — should not appear |
| Sliced elements in profiles | e.g., `Observation.component` sliced by code |
| Multiple bindings on same element | Different profiles may override binding differently |
| ContentReference elements | `Questionnaire.item.item` — must serialize as `@ref(Questionnaire.item)` per §6.7; verifier must resolve the reference and compare against the target element's structure |

### 2.4 Coverage metric

The test suite MUST track: "What percentage of all elements across all resources in
hl7.fhir.r5.core pass round-trip verification?" Target: 100%. Any element that fails
must have a documented reason (e.g., a known exclusion per §6.2) or be treated as a bug.

---

## 3. Token Efficiency Testing

### 3.1 Benchmark protocol

For each resource in the test set:

```
1. Load the StructureDefinition
2. Produce four representations:
   a. JSON StructureDefinition (snapshot)
   b. XML StructureDefinition (snapshot)
   c. FSH (via GoFSH)
   d. EZF (via serializer)
3. For each representation, measure:
   a. Character count
   b. Token count (using tiktoken cl100k_base as proxy; also Claude tokenizer if available)
   c. Gzip compressed size (as a density measure)
```

### 3.2 Test set for benchmarks

Run benchmarks on a representative cross-section, not just Patient:

**Simple resources (few elements):** Basic, Binary, Bundle
**Medium resources (10-30 elements):** Patient, Practitioner, Organization, Location
**Complex resources (30+ elements):** Observation, MedicationRequest, Claim, ExplanationOfBenefit
**Datatypes:** Identifier, CodeableConcept, HumanName, Address, Quantity, Period, Reference
**Profiles:** US Core Patient, US Core Observation, US Core Condition

### 3.3 Targets

| Metric | Target | Rationale |
|---|---|---|
| EZF vs JSON character ratio | ≤ 5% (20x+ compression) | Must meaningfully reduce context window usage |
| EZF vs JSON token ratio | ≤ 5% (20x+ compression) | Tokens are what actually matter for LLM cost |
| EZF vs FSH character ratio | ≤ 30% (3x+ compression over FSH) | Must justify a new format rather than just using FSH |
| All R5 core resources as EZF | ≤ 150K tokens total | Full spec should fit in extended context window |
| Single resource EZF | ≤ 800 tokens average | Single resource shouldn't dominate context |

### 3.4 Benchmark output

The benchmark produces a table (also saved as JSON for trend tracking):

```
Resource            | JSON    | XML     | FSH     | EZF     | EZF/JSON | EZF/FSH
--------------------|---------|---------|---------|---------|----------|--------
Patient             | 25,400t | 28,100t | 5,200t  | 680t    | 2.7%     | 13.1%
Observation         | 18,200t | 20,500t | 3,800t  | 520t    | 2.9%     | 13.7%
MedicationRequest   | 31,000t | 35,200t | 6,100t  | 890t    | 2.9%     | 14.6%
...
```

(The numbers above are illustrative. Actual measurements happen in Phase 0.)

---

## 4. Tool Correctness Testing

Each MCP tool needs deterministic tests with known inputs and expected outputs.

### 4.1 Test approach: Golden input/output pairs

For each tool, maintain a set of `(input, expected_output)` pairs. The test calls the
tool with the input and asserts the output matches. Where outputs are complex (e.g.,
profile diffs), use snapshot testing with manually reviewed golden files.

### 4.2 Tool-specific test plans

#### `lookup_element`

| Test case | Input | Expected behavior |
|---|---|---|
| Simple element | `Patient.birthDate` | Returns date type, 0..1, Σ flag, short description |
| Nested element | `Patient.contact.relationship` | Returns CodeableConcept, 0..*, binding info |
| Choice type | `Observation.value[x]` | Returns all 11 type options |
| Invalid path | `Patient.nonexistent` | Returns clear error |
| Profile-scoped | `Patient.identifier` in US Core | Returns tightened 1..*, MS flag |
| Deep path | `Claim.item.detail.subDetail.factor` | Resolves correctly through 3 backbone levels |

#### `compare_profiles`

| Test case | Input | Expected behavior |
|---|---|---|
| US Core Patient vs Patient | base=Patient, profile=us-core-patient | Shows tightened cardinalities, added MS, added extensions |
| Identical inputs | base=Patient, profile=Patient | Returns "no differences" |
| Observation profiles | base=Observation, profile=us-core-vital-signs | Shows fixed category, constrained value[x] types |
| Profile chain | base=Observation, profile=us-core-blood-pressure | Shows constraints from both vital-signs and blood-pressure |
| Cross-IG | base=us-core-patient, profile=custom-patient | Works across packages |

**Verification method:** The diff output is compared against a manually curated golden
file. The golden file is created by a human reviewing the two StructureDefinitions and
documenting every difference. This is a one-time investment per test case but provides
high-confidence validation.

#### `compare_versions`

| Test case | Input | Expected behavior |
|---|---|---|
| Patient R4→R5 | resource=Patient, A=R4, B=R5 | Lists added/removed/renamed elements |
| Observation R4→R5 | resource=Observation, A=R4, B=R5 | Captures value[x] type changes |
| New resource | resource=NutritionIntake, A=R4, B=R5 | Indicates resource didn't exist in R4 |
| Unchanged resource | resource=Binary, A=R4, B=R5 | Reports minimal/no changes |

#### `expand_valueset`

| Test case | Input | Expected behavior |
|---|---|---|
| Small valueset | administrative-gender | Returns all 4 codes |
| Medium valueset | condition-clinical | Returns all codes with hierarchy |
| Huge valueset | SNOMED CT | Returns top-level concepts + total count, respects count param |
| Filtered | SNOMED CT, filter="diabetes" | Returns matching concepts only |
| Invalid URL | nonexistent URL | Returns clear error |
| Composed valueset | us-core-condition-code (SNOMED + ICD-10) | Shows both systems |
| Server unavailable | Valid URL + simulated tx.fhir.org timeout | Returns cached expansion if available, otherwise returns error with value set URL and binding strength (not empty/null) |
| Server error | Valid URL + simulated 500 response | Same graceful degradation as timeout |

**Verification method:** Compare expanded codes against tx.fhir.org/$expand result.
For deterministic value sets (fixed enumeration), assert exact code match.
For large value sets, assert count matches and spot-check specific codes.

#### `to_fsh`

| Test case | Input | Expected behavior |
|---|---|---|
| Base resource | Patient | Produces valid FSH that SUSHI can compile back |
| Profile | us-core-patient | Produces FSH with Parent: Patient and constraint rules |
| Extension | us-core-race | Produces FSH Extension definition |
| Invalid artifact | nonexistent-id | Returns clear error identifying the artifact was not found |
| GoFSH failure | SD that GoFSH can't handle | Returns error with the artifact URL so the AI can fall back to reading the raw SD |

**Verification method:** Run SUSHI on the FSH output. It must compile without errors.
Then compare the SUSHI output StructureDefinition against the original — they must be
structurally equivalent (modulo metadata). This is a true round-trip test for GoFSH.

#### `search_spec`

| Test case | Input | Expected behavior |
|---|---|---|
| Exact resource name | "Patient" | Patient is top result |
| Element concept | "blood pressure" | Observation (vital-signs related) ranks high |
| Operation name | "$everything" | Returns Patient/$everything and Encounter/$everything |
| Vague query | "allergies" | AllergyIntolerance ranks high |
| No results | "xyzzy" | Returns empty result set, not an error |

**Verification method:** Relevance-based. For each test query, define the expected
top-3 results. The test asserts these appear in the actual top-5. This tolerates
ranking variation while catching gross search failures.

#### `get_bindings`, `get_references`, `get_constraints`

These are extraction tools. Test by comparing output against known values from the
StructureDefinition:

- `get_bindings(Patient)` must include `gender → administrative-gender (required)`
- `get_references(Patient)` must include `generalPractitioner → Organization|Practitioner|PractitionerRole`
- `get_constraints(Patient)` must include `pat-1` with its human description

### 4.3 Diff engine unit tests

The diff engine (Phase 3.1) is the most complex piece and needs the most thorough testing.

| Scenario | Input A | Input B | Expected diff |
|---|---|---|---|
| Cardinality tightening | `0..*` | `1..*` | `min: 0→1` |
| Cardinality loosening | `1..1` | `0..1` | `min: 1→0` |
| Type narrowing | `boolean\|dateTime\|integer` | `dateTime` | `types removed: boolean, integer` |
| Binding strengthening | `extensible` | `required` | `binding: extensible→required` |
| Must-support added | `MS: false` | `MS: true` | `mustSupport: added` |
| New element (sub-element) | absent | present | `added: <path>` |
| Removed element | present | absent | `removed: <path>` |
| Renamed element | `effectiveDateTime` (R4 name) | `effective` (R5 name) | Detected as rename if mapping exists |
| Slicing introduced | unsliced | sliced | Reports slicing discriminator and slices |
| Extension added | none | us-core-race | Reports new extension with URL |
| Fixed value added | none | `fixed: "phone"` | Reports fixed value |
| No changes | identical SDs | identical SDs | Empty diff |

---

## 5. AI Quality Evaluation

This is the ultimate test: does ezfhir make AI models give better answers about FHIR?

### 5.1 Evaluation set

A set of 30-50 FHIR questions spanning different difficulty levels and knowledge areas.
Each question has a reference answer written by a FHIR expert.

**Question categories:**

**Category A: Resource selection (which resource for a use case?)**
- "What FHIR resource should I use to represent a lab result?"
- "How do I represent a medication prescription in FHIR?"
- "What's the difference between Condition and Observation for diagnoses?"

**Category B: Element detail (what are the specifics?)**
- "What is the binding on Observation.code?"
- "What types can Observation.value[x] have?"
- "Is Patient.identifier required in US Core?"

**Category C: Cross-cutting (relationships, operations, search)**
- "How do I search for all Observations for a patient?"
- "What does Patient/$everything return?"
- "What resources reference Patient?"

**Category D: Profile/IG specifics**
- "What does US Core require for Patient beyond base FHIR?"
- "What extensions does US Core add to Patient?"
- "What slices does C-CDA on FHIR define on Composition.section?"

**Category E: Version differences**
- "What changed in Observation between R4 and R5?"
- "Is DeviceRequest still in R5 or was it renamed?"
- "When was the NutritionIntake resource introduced?"

### 5.2 Evaluation protocol

For each question:

```
1. Ask the question to the AI model WITHOUT ezfhir (baseline).
   Record the full response.
2. Ask the same question to the AI model WITH ezfhir connected.
   Record the full response and note which tools/resources were used.
3. Score both responses against the reference answer on:
   a. Factual accuracy (0-3): Are all stated facts correct?
      0 = major errors, 1 = some errors, 2 = minor inaccuracies, 3 = fully correct
   b. Completeness (0-3): Does it cover all important aspects?
      0 = missing critical info, 1 = partial, 2 = mostly complete, 3 = comprehensive
   c. Specificity (0-3): Are version numbers, URLs, cardinalities precise?
      0 = vague/wrong, 1 = some specifics, 2 = mostly specific, 3 = fully precise
   d. Hallucination (0/1): Did the model invent any non-existent element, resource, or constraint?
      0 = no hallucination, 1 = hallucination detected
```

### 5.3 Scoring

Composite score per question: `accuracy + completeness + specificity - (3 × hallucination)`

This heavily penalizes hallucination, which is the primary failure mode for FHIR questions.

**Targets:**
- Baseline (no ezfhir) expected composite: ~5-6/9 (LLMs know FHIR approximately)
- With ezfhir target composite: ≥ 8/9
- Hallucination rate baseline: ~30-40% of questions (estimated)
- Hallucination rate with ezfhir target: ≤ 5%

### 5.4 Evaluation execution

The Phase 0 spike runs a mini-evaluation (5-10 questions) to validate the approach.
The Phase 4 evaluation runs the full set.

The evaluation should be run with multiple models to verify cross-model benefit:
- Claude Sonnet (primary target)
- Claude Haiku (can cheaper models benefit too?)
- Claude Opus (ceiling test)

### 5.5 Token cost measurement

For each evaluation question with ezfhir:
1. Record total tokens consumed (input + output)
2. Record which MCP resources and tools were invoked
3. Calculate cost in USD at current model pricing

Compare against: just stuffing the raw JSON StructureDefinition into the context
(the naive approach). This validates that the compressed format isn't just smaller but
actually more cost-effective end-to-end (i.e., the model doesn't need to make more
tool calls to compensate for the compression).

---

## 6. Test Infrastructure

### 6.1 Test framework
vitest (consistent with the project's TypeScript stack).

### 6.2 Test data management
- FHIR packages are downloaded once and cached in `test/fixtures/packages/`
- Golden files live in `test/fixtures/golden/` alongside the tests
- Reference answers for AI evaluation live in `test/fixtures/evaluation/`

### 6.3 CI pipeline

```
npm test
  ├── unit tests (converter, parser, diff engine, each tool)
  ├── golden file tests (serializer output matches expected)
  ├── round-trip fidelity tests (all R5 core resources)
  └── token benchmark (outputs table, fails if regression > 10%)

# AI evaluation runs manually per-release (requires API access + cost)
npm run eval
  ├── baseline evaluation (no ezfhir)
  ├── ezfhir evaluation (with MCP server)
  └── scoring + report generation
```

### 6.4 Model assignment for test development

| Test category | Model | Rationale |
|---|---|---|
| Round-trip verification test harness | Sonnet | Structural test code, moderate complexity |
| Golden file creation (initial curation) | Opus | Requires understanding what correct output looks like |
| Edge case test identification | Opus | Requires FHIR expertise to know what's tricky |
| Edge case test implementation | Haiku | Pattern follows from identification |
| Token benchmark tooling | Haiku | Mechanical measurement code |
| Tool correctness test implementation | Sonnet | Needs understanding of each tool's contract |
| Diff engine test cases | Opus | Must be thorough; correctness of the diff engine is critical |
| AI evaluation question authoring | Opus | Requires FHIR expertise + understanding of LLM failure modes |
| AI evaluation scoring framework | Sonnet | Software engineering, not FHIR judgment |
| AI evaluation execution & analysis | Sonnet | Running the protocol, analyzing results |
