/**
 * StructureDefinition diff engine.
 *
 * Performs element-by-element comparison between two StructureDefinitions,
 * detecting all categories of change: cardinality, type narrowing, binding,
 * must-support, slicing, extensions, fixed values, new/removed elements.
 */

import type { PackageLoader as FPLPackageLoader } from "fhir-package-loader";

export interface SDDiffChange {
  path: string;
  category:
    | "cardinality"
    | "type"
    | "binding"
    | "must-support"
    | "slicing"
    | "extension"
    | "fixed-value"
    | "pattern"
    | "new-element"
    | "removed-element"
    | "constraint"
    | "short-description";
  left: string;
  right: string;
  severity: "breaking" | "narrowing" | "compatible";
}

export interface SDDiffResult {
  leftName: string;
  rightName: string;
  changes: SDDiffChange[];
  summary: {
    total: number;
    breaking: number;
    narrowing: number;
    compatible: number;
  };
}

interface Element {
  path: string;
  min?: number;
  max?: string;
  mustSupport?: boolean;
  short?: string;
  type?: Array<{
    code: string;
    profile?: string[];
    targetProfile?: string[];
  }>;
  binding?: {
    strength: string;
    valueSet?: string;
  };
  constraint?: Array<{
    key: string;
    severity: string;
    human: string;
    expression?: string;
  }>;
  slicing?: {
    discriminator?: Array<{ type: string; path: string }>;
    rules: string;
  };
  fixedUri?: string;
  fixedCode?: string;
  fixedString?: string;
  fixedBoolean?: boolean;
  fixedInteger?: number;
  patternCodeableConcept?: unknown;
  patternCoding?: unknown;
  [key: string]: unknown;
}

/**
 * Compares two StructureDefinitions element by element.
 * Uses snapshot elements for comprehensive comparison.
 */
export function diffStructureDefinitions(
  leftSD: Record<string, unknown>,
  rightSD: Record<string, unknown>
): SDDiffResult {
  const leftName = (leftSD.name as string) || "left";
  const rightName = (rightSD.name as string) || "right";

  const leftSnapshot = leftSD.snapshot as { element: Element[] } | undefined;
  const rightSnapshot = rightSD.snapshot as { element: Element[] } | undefined;

  if (!leftSnapshot?.element || !rightSnapshot?.element) {
    return {
      leftName,
      rightName,
      changes: [],
      summary: { total: 0, breaking: 0, narrowing: 0, compatible: 0 },
    };
  }

  const leftMap = new Map<string, Element>();
  for (const el of leftSnapshot.element) {
    leftMap.set(el.path, el);
  }

  const rightMap = new Map<string, Element>();
  for (const el of rightSnapshot.element) {
    rightMap.set(el.path, el);
  }

  const changes: SDDiffChange[] = [];

  // Compare elements present in both
  for (const [path, leftEl] of leftMap) {
    const rightEl = rightMap.get(path);
    if (!rightEl) {
      // Skip root element
      if (path === leftSD.type || !path.includes(".")) continue;
      changes.push({
        path,
        category: "removed-element",
        left: formatElementBrief(leftEl),
        right: "(removed)",
        severity: "breaking",
      });
      continue;
    }
    compareElements(path, leftEl, rightEl, changes);
  }

  // Find new elements in right
  for (const [path, rightEl] of rightMap) {
    if (leftMap.has(path)) continue;
    if (path === rightSD.type || !path.includes(".")) continue;
    changes.push({
      path,
      category: "new-element",
      left: "(new)",
      right: formatElementBrief(rightEl),
      severity: "compatible",
    });
  }

  // Sort changes by path
  changes.sort((a, b) => a.path.localeCompare(b.path));

  return {
    leftName,
    rightName,
    changes,
    summary: {
      total: changes.length,
      breaking: changes.filter((c) => c.severity === "breaking").length,
      narrowing: changes.filter((c) => c.severity === "narrowing").length,
      compatible: changes.filter((c) => c.severity === "compatible").length,
    },
  };
}

function compareElements(
  path: string,
  left: Element,
  right: Element,
  changes: SDDiffChange[]
): void {
  // Cardinality
  const lMin = left.min ?? 0;
  const lMax = left.max ?? "*";
  const rMin = right.min ?? 0;
  const rMax = right.max ?? "*";
  if (lMin !== rMin || lMax !== rMax) {
    const leftCard = `${lMin}..${lMax}`;
    const rightCard = `${rMin}..${rMax}`;
    // Narrowing: increasing min or decreasing max
    const narrowing = rMin > lMin || (rMax !== "*" && lMax === "*") ||
      (rMax !== "*" && lMax !== "*" && parseInt(rMax) < parseInt(lMax));
    // Breaking: relaxing in ways that might break expectations
    const breaking = rMin < lMin;
    changes.push({
      path,
      category: "cardinality",
      left: leftCard,
      right: rightCard,
      severity: breaking ? "breaking" : narrowing ? "narrowing" : "compatible",
    });
  }

  // Types
  if (left.type && right.type) {
    const lTypes = left.type.map((t) => t.code).sort().join("|");
    const rTypes = right.type.map((t) => t.code).sort().join("|");
    if (lTypes !== rTypes) {
      const leftSet = new Set(left.type.map((t) => t.code));
      const rightSet = new Set(right.type.map((t) => t.code));
      const removed = [...leftSet].filter((t) => !rightSet.has(t));
      changes.push({
        path,
        category: "type",
        left: lTypes,
        right: rTypes,
        severity: removed.length > 0 ? "breaking" : "narrowing",
      });
    }
  }

  // Bindings
  const lBinding = left.binding;
  const rBinding = right.binding;
  if (lBinding || rBinding) {
    const lStr = lBinding ? `${lBinding.strength} ${lBinding.valueSet || ""}`.trim() : "(none)";
    const rStr = rBinding ? `${rBinding.strength} ${rBinding.valueSet || ""}`.trim() : "(none)";
    if (lStr !== rStr) {
      // Binding strength tightening is narrowing
      const strengths = ["example", "preferred", "extensible", "required"];
      const lIdx = strengths.indexOf(lBinding?.strength || "");
      const rIdx = strengths.indexOf(rBinding?.strength || "");
      changes.push({
        path,
        category: "binding",
        left: lStr,
        right: rStr,
        severity: rIdx > lIdx ? "narrowing" : rIdx < lIdx ? "breaking" : "compatible",
      });
    }
  }

  // Must-support
  if (left.mustSupport !== right.mustSupport) {
    changes.push({
      path,
      category: "must-support",
      left: String(!!left.mustSupport),
      right: String(!!right.mustSupport),
      severity: right.mustSupport ? "narrowing" : "compatible",
    });
  }

  // Slicing
  const lSlicing = left.slicing;
  const rSlicing = right.slicing;
  if (!lSlicing && rSlicing) {
    changes.push({
      path,
      category: "slicing",
      left: "(none)",
      right: `rules=${rSlicing.rules}`,
      severity: "narrowing",
    });
  } else if (lSlicing && !rSlicing) {
    changes.push({
      path,
      category: "slicing",
      left: `rules=${lSlicing.rules}`,
      right: "(removed)",
      severity: "breaking",
    });
  }

  // Fixed values
  const lFixed = getFixedValue(left);
  const rFixed = getFixedValue(right);
  if (lFixed !== rFixed) {
    if (lFixed !== null || rFixed !== null) {
      changes.push({
        path,
        category: "fixed-value",
        left: lFixed ?? "(none)",
        right: rFixed ?? "(none)",
        severity: rFixed !== null ? "narrowing" : "breaking",
      });
    }
  }

  // Constraints
  const lConstraints = (left.constraint || []).map((c) => c.key).sort();
  const rConstraints = (right.constraint || []).map((c) => c.key).sort();
  const lKeys = lConstraints.join(",");
  const rKeys = rConstraints.join(",");
  if (lKeys !== rKeys) {
    changes.push({
      path,
      category: "constraint",
      left: lKeys || "(none)",
      right: rKeys || "(none)",
      severity: "compatible",
    });
  }
}

function getFixedValue(el: Element): string | null {
  for (const key of Object.keys(el)) {
    if (key.startsWith("fixed") && key !== "fixedValue") {
      const val = el[key];
      if (val !== undefined && val !== null) {
        return String(val);
      }
    }
  }
  if (el.patternCodeableConcept || el.patternCoding) {
    return "(pattern)";
  }
  return null;
}

function formatElementBrief(el: Element): string {
  const types = el.type?.map((t) => t.code).join("|") || "";
  const card = `${el.min ?? 0}..${el.max ?? "*"}`;
  return `${card} ${types}`.trim();
}

/**
 * Renders a diff result as readable text.
 */
export function renderDiff(result: SDDiffResult): string {
  const lines: string[] = [];
  lines.push(`Diff: ${result.leftName} → ${result.rightName}`);
  lines.push(`Changes: ${result.summary.total} (${result.summary.breaking} breaking, ${result.summary.narrowing} narrowing, ${result.summary.compatible} compatible)`);

  if (result.changes.length === 0) {
    lines.push("No differences found.");
    return lines.join("\n");
  }

  lines.push("");
  for (const change of result.changes) {
    const severity = change.severity === "breaking" ? "⚠" : change.severity === "narrowing" ? "▸" : "·";
    const shortPath = change.path.split(".").slice(1).join(".") || change.path;
    lines.push(`${severity} ${shortPath} [${change.category}]: ${change.left} → ${change.right}`);
  }

  return lines.join("\n");
}

/**
 * Compares two profiles by name using the loader.
 */
export function compareProfiles(
  loader: FPLPackageLoader,
  leftName: string,
  rightName: string,
  scope?: string
): SDDiffResult | undefined {
  const leftSD = loader.findResourceJSON(leftName, {
    type: ["StructureDefinition"],
    ...(scope ? { scope } : {}),
  }) as Record<string, unknown> | undefined;

  const rightSD = loader.findResourceJSON(rightName, {
    type: ["StructureDefinition"],
    ...(scope ? { scope } : {}),
  }) as Record<string, unknown> | undefined;

  if (!leftSD || !rightSD) return undefined;

  return diffStructureDefinitions(leftSD, rightSD);
}
