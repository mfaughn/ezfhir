/**
 * Extension definition processing for EZF output.
 *
 * Handles both simple extensions (single value[x]) and
 * complex extensions (nested sub-extensions).
 */

import type { PackageLoader as FPLPackageLoader } from "fhir-package-loader";
import type { EZFExtension } from "../converter/types.js";

interface SDElement {
  path: string;
  min: number;
  max: string;
  short?: string;
  type?: Array<{
    code: string;
    targetProfile?: string[];
  }>;
  binding?: {
    strength: string;
    valueSet?: string;
  };
}

interface ExtensionSD {
  resourceType: string;
  name: string;
  url: string;
  title?: string;
  description?: string;
  type: string;
  derivation?: string;
  context?: Array<{
    type: string;
    expression: string;
  }>;
  snapshot?: {
    element: SDElement[];
  };
}

/**
 * Extracts extension definition into EZF format.
 *
 * @param sd - The StructureDefinition for the extension
 * @returns EZFExtension or undefined if not an extension
 */
export function extractExtension(
  sd: Record<string, unknown>
): EZFExtension | undefined {
  const ext = sd as unknown as ExtensionSD;

  if (ext.type !== "Extension") return undefined;
  if (!ext.snapshot?.element) return undefined;

  const elements = ext.snapshot.element;

  // Determine if simple or complex
  // Simple: has Extension.value[x] with types
  // Complex: has Extension.extension slices (nested sub-extensions)
  const valueElement = elements.find(
    (el) => el.path === "Extension.value[x]" || el.path.startsWith("Extension.value")
  );

  const hasNestedExtensions = elements.some(
    (el) =>
      el.path.startsWith("Extension.extension.") &&
      el.path !== "Extension.extension.url" &&
      el.path !== "Extension.extension.id"
  );

  let kind: "simple" | "complex";
  let valueTypes: string[] = [];

  if (valueElement?.type && valueElement.type.length > 0) {
    kind = "simple";
    valueTypes = valueElement.type.map((t) => t.code);
  } else if (hasNestedExtensions) {
    kind = "complex";
  } else {
    kind = "simple";
  }

  // Get cardinality from the root Extension element or context
  const rootEl = elements.find((el) => el.path === "Extension");
  const min = rootEl?.min ?? 0;
  const max = rootEl?.max ?? "*";

  // Build description
  let description = ext.description ?? ext.title ?? "";
  if (description.length > 80) {
    description = description.slice(0, 77) + "...";
  }

  return {
    name: ext.name,
    url: ext.url,
    kind,
    min,
    max,
    valueTypes,
    description: description || undefined,
    context: ext.context?.map((c) => c.expression),
  };
}

/**
 * Finds and extracts all extension definitions from a package.
 */
export function extractAllExtensions(
  loader: FPLPackageLoader,
  scope: string
): EZFExtension[] {
  const infos = loader.findResourceInfos("*", {
    type: ["StructureDefinition"],
    scope,
  });

  const results: EZFExtension[] = [];

  for (const info of infos) {
    if (!info.name) continue;

    const sd = loader.findResourceJSON(info.name, {
      type: ["StructureDefinition"],
      scope,
    }) as Record<string, unknown> | undefined;

    if (!sd) continue;

    const ext = extractExtension(sd);
    if (ext) results.push(ext);
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}
