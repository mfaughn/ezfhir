/**
 * Round-trip verifier for EZF format.
 *
 * Implements COMPACT-FORMAT-SPEC.md §7.4 verification algorithm.
 * Compares parsed EZF elements against source StructureDefinition
 * to ensure the serializer preserves all structurally significant information.
 */

import type { EZFElement } from "./types.js";

/**
 * A single verification mismatch.
 */
export interface VerificationMismatch {
  path: string;
  field: string;
  expected: string;
  actual: string;
}

/**
 * Result of running the verifier.
 */
export interface VerificationResult {
  passed: boolean;
  totalElementsChecked: number;
  mismatches: VerificationMismatch[];
  missingInEZF: string[];
  extraInEZF: string[];
}

/** SD element shape (subset of fields we verify). */
interface SDElement {
  path: string;
  min: number;
  max: string;
  type?: Array<{
    code: string;
    targetProfile?: string[];
  }>;
  contentReference?: string;
  binding?: {
    strength: string;
    valueSet?: string;
  };
  isSummary?: boolean;
  isModifier?: boolean;
  mustSupport?: boolean;
}

/**
 * Paths inherited from DomainResource/Resource that are excluded from EZF.
 * Same list as serializer uses.
 */
const INHERITED_SUFFIXES = [
  "",
  ".id",
  ".meta",
  ".implicitRules",
  ".language",
  ".text",
  ".contained",
  ".extension",
  ".modifierExtension",
];

const BACKBONE_INFRA = new Set(["id", "extension", "modifierExtension"]);

/**
 * Binding strengths included in EZF (example bindings are excluded).
 */
const INCLUDED_BINDING_STRENGTHS = new Set([
  "required",
  "extensible",
  "preferred",
]);

/**
 * Verifies parsed EZF elements against a source StructureDefinition.
 *
 * @param ezfElements - Flat list of EZF elements (call flattenTree first)
 * @param sd - The source StructureDefinition JSON
 * @returns VerificationResult with any mismatches
 */
export function verify(
  ezfElements: EZFElement[],
  sd: Record<string, unknown>
): VerificationResult {
  const snapshot = sd.snapshot as { element: SDElement[] } | undefined;
  if (!snapshot) {
    return {
      passed: false,
      totalElementsChecked: 0,
      mismatches: [
        {
          path: "(root)",
          field: "snapshot",
          expected: "present",
          actual: "missing",
        },
      ],
      missingInEZF: [],
      extraInEZF: [],
    };
  }

  const resourceName = sd.name as string;
  const mismatches: VerificationMismatch[] = [];
  const missingInEZF: string[] = [];
  const extraInEZF: string[] = [];

  // Flatten the EZF tree into a path→element map
  const flatEZF = flattenTree(ezfElements, resourceName);
  const ezfPaths = new Map<string, EZFElement>();
  for (const el of flatEZF) {
    ezfPaths.set(el.path, el);
  }

  // Get non-inherited SD elements for comparison
  const sdElements = snapshot.element.filter(
    (el) => !isExcludedElement(el.path, resourceName)
  );
  const sdPaths = new Map<string, SDElement>();
  for (const el of sdElements) {
    sdPaths.set(el.path, el);
  }

  // §7.4 steps 1-10: For each EZF element, verify against SD
  for (const ezfEl of flatEZF) {
    const sdEl = sdPaths.get(ezfEl.path);
    if (!sdEl) {
      extraInEZF.push(ezfEl.path);
      continue;
    }

    // Step 2: min matches
    if (ezfEl.min !== sdEl.min) {
      mismatches.push({
        path: ezfEl.path,
        field: "min",
        expected: String(sdEl.min),
        actual: String(ezfEl.min),
      });
    }

    // Step 3: max matches
    if (ezfEl.max !== sdEl.max) {
      mismatches.push({
        path: ezfEl.path,
        field: "max",
        expected: sdEl.max,
        actual: ezfEl.max,
      });
    }

    // Steps 4-5: type codes and reference targets
    if (sdEl.contentReference) {
      // ContentReference: verify EZF has the right contentReference
      const expectedRef = sdEl.contentReference.replace(/^#/, "");
      if (ezfEl.contentReference !== expectedRef) {
        mismatches.push({
          path: ezfEl.path,
          field: "contentReference",
          expected: expectedRef,
          actual: ezfEl.contentReference ?? "(none)",
        });
      }
    } else if (sdEl.type) {
      const sdTypeCodes = sdEl.type.map((t) => t.code).sort();
      const ezfTypeCodes = ezfEl.types.map((t) => t.code).sort();

      if (JSON.stringify(sdTypeCodes) !== JSON.stringify(ezfTypeCodes)) {
        mismatches.push({
          path: ezfEl.path,
          field: "typeCodes",
          expected: sdTypeCodes.join(", "),
          actual: ezfTypeCodes.join(", "),
        });
      }

      // Check reference targets (for Reference/canonical types)
      for (const sdType of sdEl.type) {
        if (sdType.targetProfile && sdType.targetProfile.length > 0) {
          const ezfType = ezfEl.types.find((t) => t.code === sdType.code);
          if (ezfType) {
            const sdTargets = sdType.targetProfile
              .map(extractResourceName)
              .sort();
            const ezfTargets = (ezfType.targetProfile ?? []).sort();

            if (JSON.stringify(sdTargets) !== JSON.stringify(ezfTargets)) {
              mismatches.push({
                path: ezfEl.path,
                field: `referenceTargets(${sdType.code})`,
                expected: sdTargets.join(", "),
                actual: ezfTargets.join(", "),
              });
            }
          }
        }
      }
    }

    // Steps 6-7: binding (if included)
    if (
      sdEl.binding &&
      sdEl.binding.valueSet &&
      INCLUDED_BINDING_STRENGTHS.has(sdEl.binding.strength)
    ) {
      if (!ezfEl.binding) {
        mismatches.push({
          path: ezfEl.path,
          field: "binding",
          expected: `${sdEl.binding.strength} ${sdEl.binding.valueSet}`,
          actual: "(none)",
        });
      } else {
        if (ezfEl.binding.strength !== sdEl.binding.strength) {
          mismatches.push({
            path: ezfEl.path,
            field: "bindingStrength",
            expected: sdEl.binding.strength,
            actual: ezfEl.binding.strength,
          });
        }
        // Compare valueSet URL (strip version suffix from SD)
        const sdValueSet = sdEl.binding.valueSet.split("|")[0];
        if (ezfEl.binding.valueSet !== sdValueSet) {
          mismatches.push({
            path: ezfEl.path,
            field: "bindingValueSet",
            expected: sdValueSet,
            actual: ezfEl.binding.valueSet,
          });
        }
      }
    }

    // Step 8: isSummary matches Σ flag
    const sdSummary = sdEl.isSummary === true;
    if (ezfEl.flags.summary !== sdSummary) {
      mismatches.push({
        path: ezfEl.path,
        field: "isSummary",
        expected: String(sdSummary),
        actual: String(ezfEl.flags.summary),
      });
    }

    // Step 9: isModifier matches ?! flag
    const sdModifier = sdEl.isModifier === true;
    if (ezfEl.flags.modifier !== sdModifier) {
      mismatches.push({
        path: ezfEl.path,
        field: "isModifier",
        expected: String(sdModifier),
        actual: String(ezfEl.flags.modifier),
      });
    }

    // Step 10: mustSupport matches MS flag
    const sdMustSupport = sdEl.mustSupport === true;
    if (ezfEl.flags.mustSupport !== sdMustSupport) {
      mismatches.push({
        path: ezfEl.path,
        field: "mustSupport",
        expected: String(sdMustSupport),
        actual: String(ezfEl.flags.mustSupport),
      });
    }
  }

  // Step 11: every non-inherited SD element has a corresponding EZF element
  for (const sdEl of sdElements) {
    if (!ezfPaths.has(sdEl.path)) {
      missingInEZF.push(sdEl.path);
    }
  }

  return {
    passed:
      mismatches.length === 0 &&
      missingInEZF.length === 0 &&
      extraInEZF.length === 0,
    totalElementsChecked: flatEZF.length,
    mismatches,
    missingInEZF,
    extraInEZF,
  };
}

/**
 * Flattens an EZF element tree into a flat list with fully qualified paths.
 */
export function flattenTree(
  elements: EZFElement[],
  resourceName: string,
  parentPath?: string
): EZFElement[] {
  const result: EZFElement[] = [];

  for (const el of elements) {
    // Build fully qualified path
    const qualifiedPath = parentPath
      ? `${parentPath}.${el.path}`
      : `${resourceName}.${el.path}`;

    // Create a copy with qualified path
    const flatEl: EZFElement = {
      ...el,
      path: qualifiedPath,
    };

    result.push(flatEl);

    if (el.children) {
      result.push(...flattenTree(el.children, resourceName, qualifiedPath));
    }
  }

  return result;
}

// ─── Internal helpers ───────────────────────────────────────────────

function isExcludedElement(path: string, resourceName: string): boolean {
  // Top-level inherited elements
  for (const suffix of INHERITED_SUFFIXES) {
    if (path === resourceName + suffix) return true;
  }

  // Backbone infrastructure elements (id, extension, modifierExtension at any depth)
  const parts = path.split(".");
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    if (BACKBONE_INFRA.has(lastPart)) return true;
  }

  return false;
}

function extractResourceName(url: string): string {
  const parts = url.split("/");
  return parts[parts.length - 1];
}
