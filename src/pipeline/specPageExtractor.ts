/**
 * FHIR Specification Page Extractor.
 *
 * Orchestrates the processing of FHIR spec HTML pages into ContentChunks,
 * maps pages to topics, and extracts cross-references to FHIR artifacts.
 */

import { processHtmlPage, generateSummary, type HtmlSection } from "./htmlProcessor.js";
import type { ContentChunk, ContentSource, ContentRef } from "../content/types.js";

/** Maps FHIR spec page filenames to topic paths. */
const PAGE_TOPIC_MAP: Record<string, string> = {
  // Foundation
  "datatypes.html": "foundation/datatypes",
  "references.html": "foundation/references",
  "extensibility.html": "foundation/extensions",
  "formats.html": "foundation/formats",
  "json.html": "foundation/formats",
  "xml.html": "foundation/formats",
  "element.html": "foundation/element-model",
  "backboneelement.html": "foundation/element-model",
  "resource.html": "foundation/resource-model",
  "domainresource.html": "foundation/resource-model",
  "narrative.html": "foundation/narrative",
  "types.html": "foundation/datatypes",

  // Exchange
  "http.html": "exchange/rest-api",
  "search.html": "exchange/search",
  "searchparameter.html": "exchange/search",
  "operations.html": "exchange/operations",
  "bundle.html": "exchange/bundles",
  "messaging.html": "exchange/messaging",
  "documents.html": "exchange/documents",
  "async.html": "exchange/async",
  "subscription.html": "exchange/subscriptions",

  // Terminology
  "terminologies.html": "terminology/overview",
  "terminologies-systems.html": "terminology/code-systems",
  "terminologies-valuesets.html": "terminology/value-sets",
  "terminologies-conceptmaps.html": "terminology/concept-maps",
  "terminologies-binding.html": "terminology/bindings",

  // Conformance
  "profiling.html": "conformance/profiling",
  "validation.html": "conformance/validation",
  "implementationguide.html": "conformance/implementation-guides",
  "capabilitystatement.html": "conformance/capability",

  // Security
  "security.html": "security/overview",
  "security-labels.html": "security/labels",

  // Workflow
  "lifecycle.html": "workflow/lifecycle",
  "workflow.html": "workflow/overview",
  "workflow-module.html": "workflow/overview",
  "task.html": "workflow/task",

  // Clinical (resource-specific, mapped broadly)
  "patient.html": "clinical/patient",
  "observation.html": "clinical/observation",
  "condition.html": "clinical/condition",
  "procedure.html": "clinical/procedure",
  "medication.html": "clinical/medication",
  "diagnosticreport.html": "clinical/diagnostics",
};

/** Priority pages that should be loaded eagerly. */
export const PRIORITY_PAGES = [
  "http.html",
  "search.html",
  "datatypes.html",
  "terminologies.html",
  "profiling.html",
  "operations.html",
  "bundle.html",
  "references.html",
  "extensibility.html",
  "lifecycle.html",
  "security.html",
];

/** Known FHIR resource names for cross-reference detection. */
const FHIR_RESOURCE_NAMES = new Set([
  "Patient", "Observation", "Condition", "Procedure", "Encounter",
  "Medication", "MedicationRequest", "MedicationAdministration",
  "DiagnosticReport", "AllergyIntolerance", "Immunization",
  "CarePlan", "CareTeam", "Goal", "ServiceRequest",
  "Practitioner", "PractitionerRole", "Organization", "Location",
  "Bundle", "Composition", "DocumentReference",
  "ValueSet", "CodeSystem", "ConceptMap", "StructureDefinition",
  "CapabilityStatement", "ImplementationGuide", "SearchParameter",
  "OperationDefinition", "Questionnaire", "QuestionnaireResponse",
  "Consent", "AuditEvent", "Provenance",
  "Task", "Subscription", "SubscriptionTopic",
  "Claim", "ExplanationOfBenefit", "Coverage",
]);

/** Known FHIR datatype names for cross-reference detection. */
const FHIR_DATATYPE_NAMES = new Set([
  "string", "boolean", "integer", "decimal", "uri", "url", "canonical",
  "code", "id", "oid", "uuid", "markdown", "base64Binary",
  "instant", "date", "dateTime", "time",
  "Identifier", "HumanName", "Address", "ContactPoint",
  "CodeableConcept", "Coding", "Quantity", "Money", "Range", "Ratio",
  "Period", "Attachment", "Reference", "Annotation", "Signature",
  "Age", "Distance", "Duration", "Count",
  "SampledData", "ContactDetail", "UsageContext",
  "Meta", "Narrative", "Extension",
]);

/**
 * Extracts cross-references from a section's content.
 * Looks for references to FHIR resources, datatypes, and element paths.
 */
export function extractRefs(body: string, links: Map<string, string>): ContentRef[] {
  const refs: ContentRef[] = [];
  const seen = new Set<string>();

  // Check for resource name references in the text
  for (const name of FHIR_RESOURCE_NAMES) {
    if (body.includes(name) && !seen.has(`resource:${name}`)) {
      refs.push({ type: "resource", target: name });
      seen.add(`resource:${name}`);
    }
  }

  // Check for datatype references
  for (const name of FHIR_DATATYPE_NAMES) {
    // Only match PascalCase datatypes as whole words to avoid false positives
    if (name[0] === name[0].toUpperCase()) {
      const pattern = new RegExp(`\\b${name}\\b`);
      if (pattern.test(body) && !seen.has(`datatype:${name}`)) {
        refs.push({ type: "datatype", target: name });
        seen.add(`datatype:${name}`);
      }
    }
  }

  // Check for element path references (e.g., "Patient.gender", "Observation.value[x]")
  const elementPattern = /\b([A-Z][a-zA-Z]+)\.([a-z][a-zA-Z[\]x]+(?:\.[a-z][a-zA-Z[\]x]+)*)\b/g;
  let match;
  while ((match = elementPattern.exec(body)) !== null) {
    const resourceName = match[1];
    const fullPath = `${resourceName}.${match[2]}`;
    if (FHIR_RESOURCE_NAMES.has(resourceName) && !seen.has(`element:${fullPath}`)) {
      refs.push({ type: "element", target: fullPath });
      seen.add(`element:${fullPath}`);
    }
  }

  // Check links for spec page references
  for (const [href] of links) {
    if (href.endsWith(".html")) {
      const pageFile = href.split("/").pop()!;
      const topicPath = PAGE_TOPIC_MAP[pageFile];
      if (topicPath && !seen.has(`topic:${topicPath}`)) {
        refs.push({ type: "topic", target: topicPath });
        seen.add(`topic:${topicPath}`);
      }
    }
  }

  return refs;
}

/**
 * Extracts keywords from a section for search indexing.
 */
function extractKeywords(title: string, body: string): string[] {
  const keywords = new Set<string>();

  // Add significant words from the title
  for (const word of title.toLowerCase().split(/\s+/)) {
    if (word.length > 3) keywords.add(word);
  }

  // Add FHIR-specific terms found in the body
  const fhirTerms = [
    "cardinality", "binding", "constraint", "invariant", "profile",
    "extension", "modifier", "search", "query", "operation",
    "bundle", "transaction", "batch", "reference", "canonical",
    "valueset", "codesystem", "terminology", "validation",
    "slicing", "discriminator", "must-support", "summary",
  ];
  const bodyLower = body.toLowerCase();
  for (const term of fhirTerms) {
    if (bodyLower.includes(term)) keywords.add(term);
  }

  return [...keywords];
}

/**
 * Resolves the topic path for a given spec page filename.
 * Falls back to a generic path if no explicit mapping exists.
 */
export function getTopicPath(pageFilename: string): string {
  return PAGE_TOPIC_MAP[pageFilename] || `foundation/${pageFilename.replace(".html", "")}`;
}

/**
 * Processes a single FHIR spec HTML page into ContentChunks.
 */
export function extractPageContent(
  html: string,
  pageFilename: string,
  fhirVersion: string
): ContentChunk[] {
  const processed = processHtmlPage(html);
  const topicPath = getTopicPath(pageFilename);

  const source: ContentSource = {
    type: "fhir-spec",
    name: "FHIR Core Specification",
    url: `https://hl7.org/fhir/${pageFilename}`,
    version: fhirVersion,
  };

  const chunks: ContentChunk[] = [];

  for (let i = 0; i < processed.sections.length; i++) {
    const section = processed.sections[i];
    if (!section.body || section.body.length < 20) continue;

    const anchor = section.anchor || section.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const chunkId = `fhir-spec:${pageFilename}#${anchor}`;

    // Filter links relevant to this section
    const sectionRefs = extractRefs(section.body, processed.links);

    chunks.push({
      id: chunkId,
      topicPath: buildSectionTopicPath(topicPath, section),
      title: section.title,
      summary: generateSummary(section.body),
      body: section.body,
      source,
      refs: sectionRefs,
      keywords: extractKeywords(section.title, section.body),
      headingLevel: section.headingLevel,
      order: i,
    });
  }

  return chunks;
}

/**
 * Builds a topic path for a section, adding sub-paths for h3+ sections.
 */
function buildSectionTopicPath(basePath: string, section: HtmlSection): string {
  if (section.headingLevel <= 2) return basePath;

  const subPath = section.title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);

  return `${basePath}/${subPath}`;
}

/**
 * Returns the set of known page-to-topic mappings.
 */
export function getPageTopicMappings(): Record<string, string> {
  return { ...PAGE_TOPIC_MAP };
}
