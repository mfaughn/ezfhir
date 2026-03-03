/**
 * Extracts ValueSet summaries for EZF output.
 *
 * For small value sets (≤ 20 codes), includes inline codes.
 * For large value sets, includes only the count and system reference.
 */

import type { PackageLoader as FPLPackageLoader } from "fhir-package-loader";

/** Threshold: value sets with more codes than this get count-only treatment. */
const INLINE_CODE_THRESHOLD = 20;

export interface ValueSetSummary {
  name: string;
  url: string;
  title?: string;
  description?: string;
  status: string;
  codeCount: number;
  /** Inline codes (only for small value sets). */
  codes?: string[];
  /** System URLs referenced by compose.include. */
  systems: string[];
}

interface FHIRValueSet {
  resourceType: string;
  name: string;
  url: string;
  title?: string;
  description?: string;
  status: string;
  compose?: {
    include: Array<{
      system?: string;
      concept?: Array<{ code: string; display?: string }>;
      filter?: Array<{ property: string; op: string; value: string }>;
    }>;
  };
  expansion?: {
    total?: number;
    contains?: Array<{ code: string; system?: string; display?: string }>;
  };
}

interface FHIRCodeSystem {
  resourceType: string;
  name: string;
  url: string;
  concept?: Array<{ code: string; display?: string }>;
  count?: number;
}

/**
 * Extracts a summary for a single ValueSet.
 */
export function extractValueSetSummary(
  loader: FPLPackageLoader,
  valueSetName: string,
  scope: string
): ValueSetSummary | undefined {
  const vs = loader.findResourceJSON(valueSetName, {
    type: ["ValueSet"],
    scope,
  }) as unknown as FHIRValueSet | undefined;

  if (!vs) return undefined;

  const systems: string[] = [];
  let codes: string[] = [];

  if (vs.compose?.include) {
    for (const inc of vs.compose.include) {
      if (inc.system) systems.push(inc.system);

      if (inc.concept) {
        // Inline concepts in compose
        codes.push(...inc.concept.map((c) => c.code));
      } else if (inc.system && !inc.filter) {
        // Reference to entire code system — look up the code system
        const csCodes = getCodeSystemCodes(loader, inc.system, scope);
        codes.push(...csCodes);
      }
      // If there's a filter, we can't easily enumerate — leave codes empty
    }
  }

  // If expansion is available and has contents, use that instead
  if (vs.expansion?.contains && vs.expansion.contains.length > 0) {
    codes = vs.expansion.contains.map((c) => c.code);
  }

  const codeCount =
    codes.length > 0
      ? codes.length
      : vs.expansion?.total ?? 0;

  return {
    name: vs.name,
    url: vs.url,
    title: vs.title,
    description: vs.description
      ? vs.description.length > 120
        ? vs.description.slice(0, 117) + "..."
        : vs.description
      : undefined,
    status: vs.status,
    codeCount,
    codes: codeCount <= INLINE_CODE_THRESHOLD && codes.length > 0 ? codes : undefined,
    systems: [...new Set(systems)],
  };
}

/**
 * Gets all codes from a CodeSystem by its URL.
 */
function getCodeSystemCodes(
  loader: FPLPackageLoader,
  systemUrl: string,
  scope: string
): string[] {
  // Extract name from URL (e.g., http://hl7.org/fhir/administrative-gender → administrative-gender)
  const urlParts = systemUrl.split("/");
  const csName = urlParts[urlParts.length - 1];

  const cs = loader.findResourceJSON(csName, {
    type: ["CodeSystem"],
    scope,
  }) as unknown as FHIRCodeSystem | undefined;

  if (!cs?.concept) return [];

  return flattenConcepts(cs.concept);
}

/**
 * Flattens nested CodeSystem concepts into a flat list of codes.
 */
function flattenConcepts(
  concepts: Array<{ code: string; concept?: Array<{ code: string; concept?: any }> }>
): string[] {
  const result: string[] = [];
  for (const c of concepts) {
    result.push(c.code);
    if (c.concept) {
      result.push(...flattenConcepts(c.concept));
    }
  }
  return result;
}

/**
 * Extracts summaries for all ValueSets in a package.
 */
export function extractAllValueSetSummaries(
  loader: FPLPackageLoader,
  scope: string
): ValueSetSummary[] {
  const infos = loader.findResourceInfos("*", {
    type: ["ValueSet"],
    scope,
  });

  const results: ValueSetSummary[] = [];
  for (const info of infos) {
    if (!info.name) continue;
    const summary = extractValueSetSummary(loader, info.name, scope);
    if (summary) results.push(summary);
  }

  results.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  return results;
}
