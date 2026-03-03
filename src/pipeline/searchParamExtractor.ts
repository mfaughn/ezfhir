/**
 * Extracts search parameters from a FHIR package for a given resource.
 *
 * SearchParameter resources have:
 *   - base: string[] — resource types this param applies to
 *   - code: string — the search param name
 *   - type: string — search type (string, token, reference, date, etc.)
 *   - expression: string — FHIRPath expression
 */

import type { PackageLoader as FPLPackageLoader } from "fhir-package-loader";
import type { EZFSearchParam } from "../converter/types.js";

interface FHIRSearchParameter {
  resourceType: string;
  name: string;
  code: string;
  type: string;
  base: string[];
  expression?: string;
}

/**
 * Extracts search parameters for a specific resource type.
 *
 * @param loader - Package loader with loaded FHIR packages
 * @param resourceName - Resource type name (e.g., "Patient")
 * @param scope - Package scope to search in
 * @returns Array of EZF search parameters
 */
export function extractSearchParams(
  loader: FPLPackageLoader,
  resourceName: string,
  scope: string
): EZFSearchParam[] {
  const infos = loader.findResourceInfos("*", {
    type: ["SearchParameter"],
    scope,
  });

  const results: EZFSearchParam[] = [];

  for (const info of infos) {
    if (!info.name) continue;

    const sp = loader.findResourceJSON(info.name, {
      type: ["SearchParameter"],
      scope,
    }) as unknown as FHIRSearchParameter | undefined;

    if (!sp || !sp.base || !sp.base.includes(resourceName)) continue;

    // Extract the expression path (remove resource prefix for brevity)
    let expression = sp.expression ?? "";
    // Simplify common patterns like "Patient.gender" → "gender"
    const prefix = `${resourceName}.`;
    if (expression.startsWith(prefix)) {
      expression = expression.slice(prefix.length);
    }

    results.push({
      name: sp.code,
      type: sp.type,
      expression,
    });
  }

  // Sort by name for deterministic output
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}
