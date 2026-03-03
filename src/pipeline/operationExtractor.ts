/**
 * Extracts operation definitions from a FHIR package for a given resource.
 *
 * OperationDefinition resources have:
 *   - code: string — operation name (without $)
 *   - resource: string[] — resource types this operation applies to
 *   - title: string — human-readable title
 *   - description: string — longer description
 */

import type { PackageLoader as FPLPackageLoader } from "fhir-package-loader";
import type { EZFOperation } from "../converter/types.js";

interface FHIROperationDefinition {
  resourceType: string;
  name: string;
  code: string;
  title?: string;
  resource?: string[];
  description?: string;
  system?: boolean;
  type?: boolean;
  instance?: boolean;
}

/**
 * Extracts operation definitions for a specific resource type.
 *
 * @param loader - Package loader with loaded FHIR packages
 * @param resourceName - Resource type name (e.g., "Patient")
 * @param scope - Package scope to search in
 * @returns Array of EZF operations
 */
export function extractOperations(
  loader: FPLPackageLoader,
  resourceName: string,
  scope: string
): EZFOperation[] {
  const infos = loader.findResourceInfos("*", {
    type: ["OperationDefinition"],
    scope,
  });

  const results: EZFOperation[] = [];

  for (const info of infos) {
    if (!info.name) continue;

    const op = loader.findResourceJSON(info.name, {
      type: ["OperationDefinition"],
      scope,
    }) as unknown as FHIROperationDefinition | undefined;

    if (!op || !op.resource || !op.resource.includes(resourceName)) continue;

    // Use title if available, otherwise truncate description
    let description = op.title ?? op.description ?? op.name;
    if (description.length > 80) {
      description = description.slice(0, 77) + "...";
    }

    results.push({
      name: op.code,
      description,
    });
  }

  // Sort by name for deterministic output
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}
