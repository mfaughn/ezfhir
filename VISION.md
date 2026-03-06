# ezfhir Vision

## What This Is

ezfhir is an **AI knowledge layer** for HL7 standards.

Its purpose is to capture the full body of institutional knowledge around HL7 standards — documented specifications, commentary, guidance, best practices, and the accumulated understanding of how these standards work in practice — and make it available to AI in a form that enables the AI to understand, reason about, and correctly apply these standards at a level that no individual human can.

No single person holds the complete picture of FHIR, v2, terminology, implementation guides, working group decisions, and the countless contextual details that matter for correct implementation. ezfhir's role is to synthesize this dispersed knowledge into a coherent, navigable, authoritative body that AI can draw from when helping people — or when acting autonomously — on tasks involving HL7 standards.

## Who It Serves

The primary consumer is **AI acting as intermediary or primary actor**. Humans are in the loop, but the trend is toward AI doing most of the work and humans reviewing. The AI needs to be deeply competent — not just aware of element names and cardinalities, but genuinely understanding how things fit together, when to use what, what the gotchas are, and where the authoritative source for a claim lives.

When a human does ask "where did you get that?", the system must be able to point back to the source — a hyperlink to a published spec page, a Confluence article, an IG narrative. **Provenance is not optional.** Every piece of knowledge should carry its origin.

## What Knowledge Looks Like

The knowledge in ezfhir is not a tree. It's a **graph**.

A piece of information about how `CodeableConcept` bindings interact with terminology expansion is simultaneously relevant to:
- The CodeableConcept datatype
- Terminology binding mechanics
- Value set expansion behavior
- Validation rules
- Specific resources that use CodeableConcept with required bindings

Pigeonholing that information into one category loses the connections that make it useful. The system must support **rich cross-referencing** — any piece of knowledge can be relevant to multiple concepts, and following those connections is how AI (and humans) build understanding.

## Sources of Knowledge

Knowledge comes from multiple sources, and the boundaries between them are not meaningful to the consumer. When AI needs to understand how Patient demographics work, it shouldn't matter whether that understanding comes from the FHIR core spec, a US Core IG, an HL7 Confluence page, or a terminology.hl7.org guide. The knowledge system must **aggregate by subject**, not segregate by origin.

Current and planned sources:
- **FHIR core specification** — structural definitions (StructureDefinitions, ValueSets, CodeSystems, SearchParameters, OperationDefinitions) AND prose documentation (~150+ HTML pages of guidance)
- **Implementation Guides** — profiles, extensions, and their narrative guidance (US Core, C-CDA, IPS, etc.)
- **terminology.hl7.org** — terminology use and development guidance
- **HL7 Confluence** — working group documentation, implementation notes, institutional knowledge (pending API access)
- **HL7 v2** — eventually, the v2 specification and its own body of knowledge
- **Future sources** — whatever becomes relevant

## What Makes This Different

Most FHIR tools give you structure — "Patient has these elements with these types." That's necessary but insufficient. ezfhir aims to provide **understanding** — the "how," "why," "when," and "watch out for" that turns structural knowledge into competent practice.

This means:
- When you look up an element, you don't just see its type and cardinality. You see the guidance: what it means, how it's used, what goes wrong, what the spec authors intended.
- When you search for something, you find both the structural definition AND the relevant documentation. They're part of the same knowledge graph, not separate silos.
- When you ask about a topic like "search," you get a coherent synthesis drawn from every relevant source, not a pointer to go read a 50-page HTML document.

## Token Efficiency Remains Core

The compact representation that started this project — EZF achieving ~1.7% of raw JSON size — is still fundamental. AI context windows are finite. The ability to fit an entire resource definition in a few hundred tokens, and then selectively drill into guidance on demand, is what makes this practical. The same principle extends to documentation: compact summaries with the ability to drill deeper, not walls of text.

## Content Governance

### Licensing and Intellectual Property

The knowledge base is provisioned exclusively with content **owned or published by HL7 International**. However, this requires ongoing vigilance because:

- Some content within HL7 publications is copyrighted by other organizations and included through licensing agreements (e.g., SNOMED International, Regenstrief/LOINC, WHO/ICD). ezfhir repackaging and redistributing this content may constitute a further step removed from those agreements.
- Implementation Guides like US Core are published by HL7 but their licensing terms for derivative works need to be confirmed.
- Content from HL7 Confluence may have different terms than published specifications.

**This requires human review.** A content licensing audit should be conducted before broad distribution, particularly for:
- Terminology content (code systems, value sets) that reference external vocabularies
- Any content derived from non-HL7 sources that appears within HL7 publications
- The distinction between structural metadata (element names, cardinalities) and copyrightable expression (descriptions, guidance text)

### User Content Isolation

**Default behavior: user interactions do NOT feed back into the knowledge base.** When users interact with ezfhir (via MCP or any future interface), their queries, context, and any artifacts they provide are ephemeral to that session. Nothing is retained or incorporated into the system's body of knowledge.

In the future, there may be a mechanism for users to contribute knowledge (corrections, annotations, implementation experience). This would require:
- Explicit opt-in by the contributor
- Curation and review before incorporation
- Clear provenance marking distinguishing contributed content from authoritative sources

This is not being implemented now. It is noted here as a future consideration that requires careful design and governance.

## This Pattern Is General

While ezfhir focuses on HL7 standards, the underlying pattern — capturing institutional knowledge from multiple sources, organizing it as a graph, making it available to AI with provenance and progressive disclosure — applies to any domain with a large body of standards, documentation, and accumulated expertise. The architecture should reflect this generality where it doesn't add complexity.

## Iteration Is the Strategy

This will be built, used, learned from, and rebuilt. Many times. The goal at each iteration is to be meaningfully better than the last, not to be perfect. The architecture must support this — it should be straightforward to add new sources, refine the knowledge model, and improve how information is organized and surfaced as we learn what actually helps AI perform well.
