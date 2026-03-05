/**
 * StructureDefinition → EZF serializer.
 *
 * Implements COMPACT-FORMAT-SPEC.md §6 serialization rules.
 * Converts a FHIR StructureDefinition JSON into EZF text format.
 */

import type {
  EZFBinding,
  EZFElement,
  EZFDocument,
  EZFDocumentType,
  EZFFlags,
  EZFInvariant,
  EZFMetadata,
  EZFOperation,
  EZFSearchParam,
  EZFType,
} from "./types.js";

/** Format version emitted by this serializer. */
const FORMAT_VERSION = "ezf/0.1";

/**
 * Paths inherited from DomainResource that should be excluded (§6.2).
 * The root element itself (e.g., "Patient") is also excluded.
 */
const INHERITED_SUFFIXES = [
  "", // root element
  ".id",
  ".meta",
  ".implicitRules",
  ".language",
  ".text",
  ".contained",
  ".extension",
  ".modifierExtension",
];

/** Maximum description length before truncation (§6.6). */
const MAX_DESCRIPTION_LENGTH = 80;

/** Binding strengths to include (§6.5). Example bindings are omitted. */
const INCLUDED_BINDING_STRENGTHS = new Set([
  "required",
  "extensible",
  "preferred",
]);

// ─── SD Element type (from DEPENDENCIES.md) ───────────────────────────

interface SDElementType {
  code: string;
  targetProfile?: string[];
  profile?: string[];
}

interface SDConstraint {
  key: string;
  severity: string;
  human: string;
  expression?: string;
  source?: string;
}

interface SDBinding {
  strength: string;
  description?: string;
  valueSet?: string;
}

interface SDElement {
  id?: string;
  path: string;
  short?: string;
  definition?: string;
  min: number;
  max: string;
  type?: SDElementType[];
  contentReference?: string;
  constraint?: SDConstraint[];
  mustSupport?: boolean;
  isModifier?: boolean;
  isSummary?: boolean;
  binding?: SDBinding;
}

interface StructureDefinition {
  resourceType: string;
  url?: string;
  version?: string;
  name: string;
  status?: string;
  description?: string;
  kind?: string;
  abstract?: boolean;
  type?: string;
  baseDefinition?: string;
  snapshot?: { element: SDElement[] };
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Serializes a StructureDefinition to EZF text.
 *
 * @param sd - The StructureDefinition JSON (must have snapshot)
 * @param options - Additional metadata not in the SD (compartments, scope, operations, search params)
 * @returns The EZF text string
 */
export function serialize(
  sd: Record<string, unknown>,
  options?: SerializeOptions
): string {
  const parsed = sd as unknown as StructureDefinition;

  if (!parsed.snapshot?.element?.length) {
    throw new Error(
      `StructureDefinition ${parsed.name} has no snapshot elements`
    );
  }

  const docType = resolveDocType(parsed);
  const parentName = resolveParentName(parsed);
  const elements = buildElementTree(parsed, docType);
  const invariants = extractInvariants(parsed);

  const doc: EZFDocument = {
    format: FORMAT_VERSION,
    type: docType,
    name: parsed.name,
    parent: parentName,
    metadata: buildMetadata(parsed, options),
    elements: docType !== "profile" ? elements : undefined,
    invariants: invariants.length > 0 ? invariants : undefined,
    search: options?.searchParams,
    operations: options?.operations,
  };

  return renderDocument(doc);
}

/** Options for serialization that come from outside the SD itself. */
export interface SerializeOptions {
  /** Resource scope/category (e.g., "Patient Administration"). */
  scope?: string;
  /** Compartment membership entries. */
  compartments?: Array<{ compartment: string; param: string }>;
  /** Search parameters for this resource. */
  searchParams?: EZFSearchParam[];
  /** Operations defined on this resource. */
  operations?: EZFOperation[];
}

// ─── Internal: Document type resolution ──────────────────────────────

function resolveDocType(sd: StructureDefinition): EZFDocumentType {
  if (sd.kind === "resource") {
    if (sd.baseDefinition && sd.baseDefinition !== "http://hl7.org/fhir/StructureDefinition/DomainResource"
        && sd.baseDefinition !== "http://hl7.org/fhir/StructureDefinition/Resource") {
      // Check if it's a profile (derivation: constraint) vs a resource definition
      const derivation = (sd as unknown as Record<string, unknown>).derivation as string | undefined;
      if (derivation === "constraint") {
        return "profile";
      }
    }
    return "resource";
  }
  if (sd.kind === "complex-type" || sd.kind === "primitive-type") {
    return "datatype";
  }
  // Fallback
  return "resource";
}

function resolveParentName(sd: StructureDefinition): string | undefined {
  if (!sd.baseDefinition) return undefined;
  // Extract name from URL: http://hl7.org/fhir/StructureDefinition/DomainResource → DomainResource
  const parts = sd.baseDefinition.split("/");
  return parts[parts.length - 1];
}

// ─── Internal: Metadata ─────────────────────────────────────────────

function buildMetadata(
  sd: StructureDefinition,
  options?: SerializeOptions
): EZFMetadata {
  return {
    description: sd.description,
    url: sd.url,
    version: sd.version,
    status: sd.status,
    scope: options?.scope,
    compartments: options?.compartments,
    abstract: sd.abstract === true ? true : undefined,
  };
}

// ─── Internal: Element tree building ─────────────────────────────────

/**
 * Backbone element children that should be excluded (infrastructure elements).
 * These appear in every BackboneElement but waste tokens.
 */
const BACKBONE_INHERITED_SUFFIXES = [".id", ".extension", ".modifierExtension"];

function isInheritedElement(path: string, resourceName: string): boolean {
  // Check top-level inherited elements
  for (const suffix of INHERITED_SUFFIXES) {
    if (path === resourceName + suffix) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an element is an infrastructure child of a BackboneElement.
 * E.g., Patient.contact.id, Patient.contact.extension, Patient.contact.modifierExtension
 */
function isBackboneInfrastructureElement(
  path: string,
  resourceName: string
): boolean {
  // Must be at depth 3+ (e.g., Patient.contact.id)
  const parts = path.split(".");
  if (parts.length < 3) return false;

  // Check if the element name (last part) is an infrastructure element
  const elementName = "." + parts[parts.length - 1];
  return BACKBONE_INHERITED_SUFFIXES.includes(elementName);
}

function buildElementTree(
  sd: StructureDefinition,
  docType: EZFDocumentType
): EZFElement[] {
  const allElements = sd.snapshot!.element;
  // For profiles (derivation=constraint), element paths use the base type name
  // (e.g., "Group.identifier" not "ActualGroup.identifier"), so we use sd.type
  // for path matching. For base resources, sd.type === sd.name.
  const resourceName = sd.type ?? sd.name;

  // Filter out inherited elements (§6.2) and backbone infrastructure elements
  const filtered = allElements.filter(
    (el) =>
      !isInheritedElement(el.path, resourceName) &&
      !isBackboneInfrastructureElement(el.path, resourceName)
  );

  // Build a flat list of EZFElements
  const ezfElements = filtered.map((el) => convertElement(el, sd));

  // Build the tree based on path depth
  return buildTree(ezfElements, resourceName);
}

function convertElement(
  el: SDElement,
  sd: StructureDefinition
): EZFElement {
  const types = convertTypes(el);
  const flags = convertFlags(el);
  const binding = convertBinding(el);
  const short = truncateDescription(
    el.short ?? extractFirstSentence(el.definition)
  );

  const result: EZFElement = {
    path: el.path,
    min: el.min,
    max: el.max,
    types,
    flags,
    short,
  };

  if (binding) {
    result.binding = binding;
  }

  if (el.contentReference) {
    // ContentReference: strip leading '#' per §6.7
    result.contentReference = el.contentReference.replace(/^#/, "");
  }

  return result;
}

function convertTypes(el: SDElement): EZFType[] {
  // ContentReference elements have no type array
  if (el.contentReference) {
    return []; // Will be rendered as @ref(path) instead
  }

  if (!el.type) {
    return [];
  }

  return el.type.map((t) => {
    const result: EZFType = { code: t.code };
    if (t.targetProfile && t.targetProfile.length > 0) {
      // Extract resource names from full URLs, sorted alphabetically (§6.3)
      result.targetProfile = t.targetProfile
        .map((url) => {
          const parts = url.split("/");
          return parts[parts.length - 1];
        })
        .sort();
    }
    return result;
  });
}

function convertFlags(el: SDElement): EZFFlags {
  return {
    modifier: el.isModifier === true,
    summary: el.isSummary === true,
    mustSupport: el.mustSupport === true,
  };
}

function convertBinding(el: SDElement): EZFBinding | undefined {
  if (!el.binding) return undefined;
  if (!INCLUDED_BINDING_STRENGTHS.has(el.binding.strength)) return undefined;
  if (!el.binding.valueSet) return undefined;

  // Strip version suffix from valueSet URL (e.g., "url|5.0.0" → "url")
  const valueSet = el.binding.valueSet.split("|")[0];

  return {
    strength: el.binding.strength as EZFBinding["strength"],
    valueSet,
  };
}

// ─── Internal: Tree building from flat path list ─────────────────────

function getDepth(path: string): number {
  return path.split(".").length - 1; // Patient.contact.name → depth 2
}

function buildTree(
  elements: EZFElement[],
  resourceName: string
): EZFElement[] {
  const roots: EZFElement[] = [];
  const stack: EZFElement[] = [];

  for (const el of elements) {
    // Depth relative to resource root (Patient.x = depth 1, Patient.contact.x = depth 2)
    const depth = getDepth(el.path);
    // We want depth 1 elements at root level (since we exclude Patient itself)
    const targetDepth = depth - 1;

    // Pop stack to find the parent
    while (stack.length > targetDepth) {
      stack.pop();
    }

    if (stack.length === 0) {
      // Top-level element
      roots.push(el);
    } else {
      // Child of the current stack top
      const parent = stack[stack.length - 1];
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(el);
    }

    // Push onto stack if this could be a parent (BackboneElement or has children)
    stack.push(el);
  }

  return roots;
}

// ─── Internal: Invariant extraction ─────────────────────────────────

function extractInvariants(sd: StructureDefinition): EZFInvariant[] {
  const resourceUrl = sd.url;
  const seen = new Set<string>();
  const result: EZFInvariant[] = [];

  for (const el of sd.snapshot!.element) {
    if (!el.constraint) continue;
    for (const c of el.constraint) {
      // Only include constraints defined by this resource (not inherited)
      if (c.source && c.source !== resourceUrl) continue;
      // Skip the universal ele-1 constraint
      if (c.key === "ele-1") continue;
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      result.push({
        key: c.key,
        human: c.human,
        expression: c.expression,
      });
    }
  }

  return result;
}

// ─── Internal: Description helpers ──────────────────────────────────

function truncateDescription(text: string | undefined): string | undefined {
  if (!text) return undefined;
  if (text.length <= MAX_DESCRIPTION_LENGTH) return text;
  return text.slice(0, MAX_DESCRIPTION_LENGTH - 1) + "…";
}

function extractFirstSentence(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const match = text.match(/^[^.!?]+[.!?]/);
  return match ? match[0] : text;
}

// ─── Internal: EZF text rendering ───────────────────────────────────

function renderDocument(doc: EZFDocument): string {
  const lines: string[] = [];

  // Format directive
  lines.push(`@format ${doc.format}`);

  // Type directive
  if (doc.parent) {
    lines.push(`@${doc.type} ${doc.name} : ${doc.parent}`);
  } else {
    lines.push(`@${doc.type} ${doc.name}`);
  }

  // Metadata
  const meta = doc.metadata;
  if (meta.description) {
    lines.push(`@description ${meta.description}`);
  }
  if (meta.scope) {
    lines.push(`@scope ${meta.scope}`);
  }
  if (meta.abstract) {
    lines.push(`@abstract true`);
  }
  if (meta.compartments) {
    for (const c of meta.compartments) {
      lines.push(`@compartment ${c.compartment} (${c.param})`);
    }
  }

  // Elements
  if (doc.elements && doc.elements.length > 0) {
    lines.push("");
    lines.push("@elements");
    for (const el of doc.elements) {
      renderElement(el, 0, lines);
    }
  }

  // Search parameters
  if (doc.search && doc.search.length > 0) {
    lines.push("");
    lines.push("@search");
    for (const sp of doc.search) {
      lines.push(renderSearchParam(sp));
    }
  }

  // Operations
  if (doc.operations && doc.operations.length > 0) {
    lines.push("");
    lines.push("@operations");
    for (const op of doc.operations) {
      lines.push(`$${op.name}${padTo(op.name.length + 1, 17)}: ${op.description}`);
    }
  }

  // Invariants
  if (doc.invariants && doc.invariants.length > 0) {
    lines.push("");
    lines.push("@invariants");
    for (const inv of doc.invariants) {
      lines.push(`${inv.key}${padTo(inv.key.length, 9)}: ${inv.human}`);
    }
  }

  // Trailing newline
  lines.push("");

  return lines.join("\n");
}

function renderElement(
  el: EZFElement,
  depth: number,
  lines: string[]
): void {
  const indent = "  ".repeat(depth);
  const name = extractElementName(el.path);
  const typeStr = renderTypeExpr(el);
  const flagStr = renderFlags(el.flags);
  const descStr = el.short ? ` # ${el.short}` : "";

  // Pad name to align columns
  const paddedName = name + padTo(name.length, 17 - depth * 2);
  const cardStr = `${el.min}..${el.max}`;
  const paddedCard = cardStr + padTo(cardStr.length, 4);

  // Pad type for alignment
  const paddedType = typeStr + padTo(typeStr.length, 17);

  const flagPart = flagStr ? ` ${flagStr}` : "";
  // Keep line under 120 chars where possible
  const line = `${indent}${paddedName}: ${paddedCard}${paddedType}${flagPart}${descStr}`;

  lines.push(trimEnd(line));

  // Binding sub-line
  if (el.binding) {
    const bindIndent = "  ".repeat(depth + 1);
    lines.push(
      `${bindIndent}@binding ${el.binding.strength} ${el.binding.valueSet}`
    );
  }

  // Children (BackboneElement sub-elements)
  if (el.children) {
    for (const child of el.children) {
      renderElement(child, depth + 1, lines);
    }
  }
}

function extractElementName(path: string): string {
  const parts = path.split(".");
  return parts[parts.length - 1];
}

function renderTypeExpr(el: EZFElement): string {
  // ContentReference
  if (el.contentReference) {
    return `@ref(${el.contentReference})`;
  }

  if (el.types.length === 0) {
    return "Element";
  }

  return el.types.map(renderSingleType).join("|");
}

function renderSingleType(t: EZFType): string {
  if (t.targetProfile && t.targetProfile.length > 0) {
    return `${t.code}(${t.targetProfile.join("|")})`;
  }
  return t.code;
}

function renderFlags(flags: EZFFlags): string {
  // Flag order per §6.4: ?! Σ MS TU N D
  const parts: string[] = [];
  if (flags.modifier) parts.push("?!");
  if (flags.summary) parts.push("Σ");
  if (flags.mustSupport) parts.push("MS");
  if (flags.maturity === "TU") parts.push("TU");
  if (flags.maturity === "N") parts.push("N");
  if (flags.maturity === "D") parts.push("D");

  if (parts.length === 0) return "";
  return `[${parts.join("")}]`;
}

function renderSearchParam(sp: EZFSearchParam): string {
  const paddedName = sp.name + padTo(sp.name.length, 17);
  const paddedType = sp.type + padTo(sp.type.length, 10);
  return `${paddedName}: ${paddedType}(${sp.expression})`;
}

/** Pad with spaces to reach a target width. */
function padTo(currentLength: number, targetLength: number): string {
  const needed = targetLength - currentLength;
  return needed > 0 ? " ".repeat(needed) : " ";
}

function trimEnd(line: string): string {
  return line.replace(/\s+$/, "");
}

// ─── Re-exports for testing ─────────────────────────────────────────

export {
  isInheritedElement,
  isBackboneInfrastructureElement,
  convertElement,
  convertTypes,
  convertFlags,
  convertBinding,
  extractInvariants,
  buildTree,
  truncateDescription,
  extractFirstSentence,
};

export type { SDElement, StructureDefinition };
