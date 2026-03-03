/**
 * Profile delta processing.
 *
 * Computes the constraint delta between a profile (constrained SD)
 * and its base resource, identifying changes in cardinality,
 * must-support, bindings, types, and extensions.
 */

import type { PackageLoader as FPLPackageLoader } from "fhir-package-loader";

/** A single change in the delta. */
export interface DeltaChange {
  path: string;
  changeType:
    | "cardinality"
    | "must-support"
    | "binding"
    | "type-narrowing"
    | "fixed-value"
    | "pattern"
    | "slicing"
    | "extension";
  base: string;
  profile: string;
  description?: string;
}

/** Complete delta result. */
export interface ProfileDelta {
  profileName: string;
  baseResourceName: string;
  changes: DeltaChange[];
  addedExtensions: string[];
  mustSupportPaths: string[];
}

interface SDElement {
  path: string;
  min?: number;
  max?: string;
  mustSupport?: boolean;
  type?: Array<{
    code: string;
    profile?: string[];
    targetProfile?: string[];
  }>;
  binding?: {
    strength: string;
    valueSet?: string;
  };
  fixedUri?: string;
  fixedCode?: string;
  fixedString?: string;
  patternCodeableConcept?: unknown;
  patternCoding?: unknown;
  slicing?: {
    discriminator?: Array<{ type: string; path: string }>;
    rules: string;
  };
}

interface StructureDefinition {
  name: string;
  type: string;
  baseDefinition?: string;
  derivation?: string;
  snapshot?: { element: SDElement[] };
  differential?: { element: SDElement[] };
}

/**
 * Computes the delta between a profile and its base resource.
 *
 * @param profileSD - The profile StructureDefinition
 * @param baseSD - The base resource StructureDefinition
 * @returns ProfileDelta with all changes
 */
export function computeDelta(
  profileSD: Record<string, unknown>,
  baseSD: Record<string, unknown>
): ProfileDelta {
  const profile = profileSD as unknown as StructureDefinition;
  const base = baseSD as unknown as StructureDefinition;

  const changes: DeltaChange[] = [];
  const addedExtensions: string[] = [];
  const mustSupportPaths: string[] = [];

  if (!profile.differential?.element) {
    return {
      profileName: profile.name,
      baseResourceName: base.name,
      changes,
      addedExtensions,
      mustSupportPaths,
    };
  }

  // Build base element map from snapshot
  const baseElements = new Map<string, SDElement>();
  if (base.snapshot?.element) {
    for (const el of base.snapshot.element) {
      baseElements.set(el.path, el);
    }
  }

  // Process each differential element
  for (const diffEl of profile.differential.element) {
    const basePath = diffEl.path;
    const baseEl = baseElements.get(basePath);

    // Skip the root element
    if (basePath === profile.type) continue;

    // Check for must-support
    if (diffEl.mustSupport === true) {
      mustSupportPaths.push(basePath);
    }

    // Check for extensions
    if (basePath.endsWith(".extension") && diffEl.type) {
      for (const t of diffEl.type) {
        if (t.profile) {
          for (const extUrl of t.profile) {
            addedExtensions.push(extractName(extUrl));
          }
        }
      }
      continue;
    }

    // Check for slicing
    if (diffEl.slicing) {
      changes.push({
        path: basePath,
        changeType: "slicing",
        base: "(none)",
        profile: `rules=${diffEl.slicing.rules}`,
        description: diffEl.slicing.discriminator
          ?.map((d) => `${d.type}(${d.path})`)
          .join(", "),
      });
      continue;
    }

    if (!baseEl) {
      // New element (slice entry, extension, etc.)
      continue;
    }

    // Cardinality tightening
    const baseMin = baseEl.min ?? 0;
    const baseMax = baseEl.max ?? "*";
    const profMin = diffEl.min;
    const profMax = diffEl.max;
    if (profMin !== undefined && profMin !== baseMin) {
      changes.push({
        path: basePath,
        changeType: "cardinality",
        base: `${baseMin}..${baseMax}`,
        profile: `${profMin}..${profMax ?? baseMax}`,
      });
    } else if (profMax !== undefined && profMax !== baseMax) {
      changes.push({
        path: basePath,
        changeType: "cardinality",
        base: `${baseMin}..${baseMax}`,
        profile: `${profMin ?? baseMin}..${profMax}`,
      });
    }

    // Must-support addition
    if (diffEl.mustSupport === true && !baseEl.mustSupport) {
      changes.push({
        path: basePath,
        changeType: "must-support",
        base: "false",
        profile: "true",
      });
    }

    // Binding changes
    if (diffEl.binding && baseEl.binding) {
      const baseBinding = `${baseEl.binding.strength} ${baseEl.binding.valueSet ?? ""}`;
      const profBinding = `${diffEl.binding.strength} ${diffEl.binding.valueSet ?? ""}`;
      if (baseBinding !== profBinding) {
        changes.push({
          path: basePath,
          changeType: "binding",
          base: baseBinding.trim(),
          profile: profBinding.trim(),
        });
      }
    } else if (diffEl.binding && !baseEl.binding) {
      changes.push({
        path: basePath,
        changeType: "binding",
        base: "(none)",
        profile: `${diffEl.binding.strength} ${diffEl.binding.valueSet ?? ""}`.trim(),
      });
    }

    // Type narrowing
    if (diffEl.type && baseEl.type) {
      const baseTypes = baseEl.type.map((t) => t.code).sort();
      const profTypes = diffEl.type.map((t) => t.code).sort();
      if (JSON.stringify(baseTypes) !== JSON.stringify(profTypes)) {
        changes.push({
          path: basePath,
          changeType: "type-narrowing",
          base: baseTypes.join("|"),
          profile: profTypes.join("|"),
        });
      }
    }

    // Fixed values
    if (diffEl.fixedUri || diffEl.fixedCode || diffEl.fixedString) {
      const fixedValue =
        diffEl.fixedUri ?? diffEl.fixedCode ?? diffEl.fixedString ?? "";
      changes.push({
        path: basePath,
        changeType: "fixed-value",
        base: "(none)",
        profile: fixedValue,
      });
    }

    // Pattern values
    if (diffEl.patternCodeableConcept || diffEl.patternCoding) {
      changes.push({
        path: basePath,
        changeType: "pattern",
        base: "(none)",
        profile: "(pattern set)",
      });
    }
  }

  return {
    profileName: profile.name,
    baseResourceName: base.name,
    changes,
    addedExtensions,
    mustSupportPaths,
  };
}

/**
 * Loads a profile and its base, then computes the delta.
 */
export function computeDeltaFromLoader(
  loader: FPLPackageLoader,
  profileName: string,
  scope: string
): ProfileDelta | undefined {
  const profileSD = loader.findResourceJSON(profileName, {
    type: ["StructureDefinition"],
    scope,
  }) as Record<string, unknown> | undefined;

  if (!profileSD) return undefined;

  const baseUrl = profileSD.baseDefinition as string | undefined;
  if (!baseUrl) return undefined;

  // Extract base name from URL
  const baseName = extractName(baseUrl);
  const baseSD = loader.findResourceJSON(baseName, {
    type: ["StructureDefinition"],
  }) as Record<string, unknown> | undefined;

  if (!baseSD) return undefined;

  return computeDelta(profileSD, baseSD);
}

/**
 * Renders a ProfileDelta as EZF text for inclusion in a profile document.
 */
export function renderDelta(delta: ProfileDelta): string {
  const lines: string[] = [];

  if (delta.changes.length > 0) {
    lines.push("@constraints (delta from " + delta.baseResourceName + ")");
    for (const change of delta.changes) {
      const shortPath = change.path.replace(`${delta.baseResourceName}.`, "");
      switch (change.changeType) {
        case "cardinality":
          lines.push(
            `${shortPath} : ${change.profile} # TIGHTENED from ${change.base}`
          );
          break;
        case "must-support":
          lines.push(`${shortPath} : MS # Added must-support`);
          break;
        case "binding":
          lines.push(
            `${shortPath} : @binding ${change.profile} # Changed from ${change.base}`
          );
          break;
        case "type-narrowing":
          lines.push(
            `${shortPath} : ${change.profile} # NARROWED from ${change.base}`
          );
          break;
        case "fixed-value":
          lines.push(
            `${shortPath} : fixed ${change.profile}`
          );
          break;
        case "pattern":
          lines.push(
            `${shortPath} : pattern set`
          );
          break;
        case "slicing":
          lines.push(
            `${shortPath} : sliced ${change.profile}${change.description ? " (" + change.description + ")" : ""}`
          );
          break;
      }
    }
  }

  if (delta.addedExtensions.length > 0) {
    lines.push("");
    lines.push("@extensions");
    for (const ext of delta.addedExtensions) {
      lines.push(`${ext}`);
    }
  }

  if (delta.mustSupportPaths.length > 0) {
    lines.push("");
    lines.push("@mustsupport");
    const shortPaths = delta.mustSupportPaths.map((p) =>
      p.replace(`${delta.baseResourceName}.`, "")
    );
    lines.push(shortPaths.join(", "));
  }

  return lines.join("\n");
}

function extractName(url: string): string {
  const parts = url.split("/");
  return parts[parts.length - 1];
}
