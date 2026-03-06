/**
 * Extracts narrative/documentation content from IG (Implementation Guide)
 * resources loaded via fhir-package-loader.
 *
 * Produces ContentChunk objects ready to be added to a ContentStore.
 */

import type { ContentChunk, ContentRef } from "../content/types.js";
import type { PackageLoader as FPLPackageLoader } from "fhir-package-loader";

/** Minimum description length to consider a resource worth extracting. */
const MIN_DESCRIPTION_LENGTH = 20;

/** Maximum summary length in characters. */
const MAX_SUMMARY_LENGTH = 300;

/**
 * Strips HTML tags from a string, returning plain text.
 */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Determines the topic path for a resource based on its type and properties.
 */
export function getTopicPath(resource: Record<string, unknown>): string {
  const resourceType = resource.resourceType as string;

  switch (resourceType) {
    case "StructureDefinition": {
      const kind = resource.kind as string | undefined;
      const derivation = resource.derivation as string | undefined;
      if (derivation === "constraint") {
        return "conformance/profiling";
      }
      if (kind === "resource") {
        const type = resource.type as string | undefined;
        return `clinical/${(type ?? "unknown").toLowerCase()}`;
      }
      if (kind === "complex-type" || kind === "primitive-type") {
        return "foundation/datatypes";
      }
      return "conformance/implementation-guides";
    }
    case "ValueSet":
    case "CodeSystem":
      return "terminology/overview";
    case "SearchParameter":
      return "exchange/search";
    case "CapabilityStatement":
      return "conformance/capability";
    case "OperationDefinition":
      return "exchange/operations";
    default:
      return "conformance/implementation-guides";
  }
}

/**
 * Extracts cross-references from description text.
 * Detects references to FHIR resource types and elements.
 */
export function extractRefs(text: string): ContentRef[] {
  const refs: ContentRef[] = [];
  const seen = new Set<string>();

  // Match resource type references like "Patient", "Observation"
  const resourcePattern =
    /\b(Patient|Observation|Condition|Encounter|Procedure|MedicationRequest|DiagnosticReport|AllergyIntolerance|Immunization|CarePlan|Goal|ServiceRequest|DocumentReference|Practitioner|Organization|Location|Device|Specimen|Medication|Substance|Coverage|Claim|ExplanationOfBenefit|Bundle|Composition|Questionnaire|QuestionnaireResponse)\b/g;
  let match;
  while ((match = resourcePattern.exec(text)) !== null) {
    const target = match[1];
    if (!seen.has(target)) {
      seen.add(target);
      refs.push({ type: "resource", target, display: target });
    }
  }

  // Match element references like "Patient.name" or "Observation.value[x]"
  const elementPattern =
    /\b([A-Z][a-zA-Z]+)\.([a-z][a-zA-Z.[\]x]+)\b/g;
  while ((match = elementPattern.exec(text)) !== null) {
    const target = `${match[1]}.${match[2]}`;
    if (!seen.has(target)) {
      seen.add(target);
      refs.push({ type: "element", target, display: target });
    }
  }

  return refs;
}

/**
 * Extracts keywords from a resource name and description.
 */
function extractKeywords(name: string, description: string): string[] {
  const keywords = new Set<string>();

  // Split name by common separators (camelCase, hyphens, underscores)
  const nameParts = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length > 2);
  for (const part of nameParts) {
    keywords.add(part);
  }

  // Extract significant words from description (first 200 chars)
  const descWords = description
    .slice(0, 200)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  for (const word of descWords.slice(0, 10)) {
    keywords.add(word);
  }

  return Array.from(keywords);
}

/**
 * Builds the body text from a resource's description, purpose, and narrative.
 */
function buildBody(resource: Record<string, unknown>): string {
  const parts: string[] = [];

  const description = resource.description as string | undefined;
  if (description) {
    parts.push(description);
  }

  const purpose = resource.purpose as string | undefined;
  if (purpose) {
    parts.push(`**Purpose:** ${purpose}`);
  }

  const text = resource.text as
    | { div?: string; status?: string }
    | undefined;
  if (text?.div) {
    const narrativeText = stripHtmlTags(text.div);
    if (narrativeText.length > MIN_DESCRIPTION_LENGTH) {
      parts.push(narrativeText);
    }
  }

  return parts.join("\n\n");
}

/**
 * Gets the effective description text for determining whether a resource
 * has enough content to extract.
 */
function getDescription(resource: Record<string, unknown>): string {
  return (
    (resource.description as string | undefined) ??
    (resource.purpose as string | undefined) ??
    ""
  );
}

/**
 * Creates a summary from description text, truncated to MAX_SUMMARY_LENGTH.
 */
function makeSummary(description: string): string {
  if (description.length <= MAX_SUMMARY_LENGTH) {
    return description;
  }
  const truncated = description.slice(0, MAX_SUMMARY_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 50 ? truncated.slice(0, lastSpace) : truncated) + "...";
}

/** Resource types we extract narrative content from. */
const EXTRACTABLE_TYPES = [
  "StructureDefinition",
  "ValueSet",
  "CodeSystem",
  "SearchParameter",
  "CapabilityStatement",
  "OperationDefinition",
  "ImplementationGuide",
];

/**
 * Extracts narrative/documentation content from a loaded FHIR package.
 * Returns ContentChunks ready to be added to a ContentStore.
 */
export function extractIGNarrative(
  loader: FPLPackageLoader,
  packageName: string,
  version: string
): ContentChunk[] {
  const chunks: ContentChunk[] = [];

  for (const resourceType of EXTRACTABLE_TYPES) {
    const infos = loader.findResourceInfos("*", {
      type: [resourceType],
      scope: packageName,
    });

    for (const info of infos) {
      if (!info.name) continue;

      const json = loader.findResourceJSON(info.name, {
        type: [resourceType],
        scope: packageName,
      }) as Record<string, unknown> | undefined;

      if (!json) continue;

      const description = getDescription(json);
      const body = buildBody(json);

      // Skip resources without meaningful content
      if (description.length < MIN_DESCRIPTION_LENGTH && body.length < MIN_DESCRIPTION_LENGTH) {
        continue;
      }

      const name = (json.name as string) ?? info.name;
      const topicPath = getTopicPath(json);
      const summary = makeSummary(description || body.slice(0, MAX_SUMMARY_LENGTH));
      const refs = extractRefs(body);
      const keywords = extractKeywords(name, description || body);

      const chunk: ContentChunk = {
        id: `ig:${packageName}:${resourceType}:${name}`,
        topicPath,
        title: name,
        summary,
        body,
        source: {
          type: "ig",
          name: packageName,
          version,
          packageName,
        },
        refs,
        keywords,
      };

      chunks.push(chunk);
    }
  }

  return chunks;
}
