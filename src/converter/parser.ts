/**
 * EZF text → EZFDocument parser.
 *
 * Implements COMPACT-FORMAT-SPEC.md §7 parsing rules.
 * Parses EZF text into a structured EZFDocument with EZFElement trees.
 */

import type {
  EZFBinding,
  EZFDocument,
  EZFDocumentType,
  EZFElement,
  EZFExtension,
  EZFFlags,
  EZFInvariant,
  EZFMetadata,
  EZFOperation,
  EZFSearchParam,
  EZFType,
} from "./types.js";

/** Current section being parsed. */
type Section =
  | "none"
  | "elements"
  | "constraints"
  | "extensions"
  | "mustsupport"
  | "search"
  | "operations"
  | "invariants"
  | "slicing"
  | "codes"
  | "concepts";

/**
 * Parses EZF text into a structured EZFDocument.
 *
 * @param text - The EZF text to parse
 * @returns The parsed EZFDocument
 * @throws Error if the text is malformed
 */
export function parse(text: string): EZFDocument {
  const lines = text.split("\n");
  let currentSection: Section = "none";

  let format: string | undefined;
  let docType: EZFDocumentType | undefined;
  let name: string | undefined;
  let parent: string | undefined;
  const metadata: EZFMetadata = {};
  const elements: EZFElement[] = [];
  const constraints: EZFElement[] = [];
  const extensions: EZFExtension[] = [];
  const mustSupportPaths: string[] = [];
  const search: EZFSearchParam[] = [];
  const operations: EZFOperation[] = [];
  const invariants: EZFInvariant[] = [];

  // Stack for building element tree from indented lines
  let elementStack: { element: EZFElement; depth: number }[] = [];
  let currentElementList: EZFElement[] = elements;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip blank lines and comments
    if (trimmed === "" || trimmed.startsWith("//")) continue;

    // Directive lines
    if (trimmed.startsWith("@")) {
      const directive = parseDirective(trimmed);

      if (directive.name === "format") {
        format = directive.value;
        continue;
      }

      // Type directives
      if (
        ["resource", "datatype", "profile", "extension", "valueset", "codesystem"].includes(
          directive.name
        )
      ) {
        docType = directive.name as EZFDocumentType;
        const parsed = parseTypeDirective(directive.value);
        name = parsed.name;
        parent = parsed.parent;
        continue;
      }

      // Metadata directives
      if (directive.name === "description") {
        metadata.description = directive.value;
        continue;
      }
      if (directive.name === "url") {
        metadata.url = directive.value;
        continue;
      }
      if (directive.name === "version") {
        metadata.version = directive.value;
        continue;
      }
      if (directive.name === "status") {
        metadata.status = directive.value;
        continue;
      }
      if (directive.name === "scope") {
        metadata.scope = directive.value;
        continue;
      }
      if (directive.name === "ig") {
        metadata.ig = directive.value;
        continue;
      }
      if (directive.name === "maturity") {
        metadata.maturity = directive.value;
        continue;
      }
      if (directive.name === "abstract") {
        metadata.abstract = directive.value === "true";
        continue;
      }
      if (directive.name === "compartment") {
        const match = directive.value.match(/^(\S+)\s+\((\S+)\)$/);
        if (match) {
          if (!metadata.compartments) metadata.compartments = [];
          metadata.compartments.push({
            compartment: match[1],
            param: match[2],
          });
        }
        continue;
      }

      // Section directives
      if (directive.name === "elements") {
        currentSection = "elements";
        elementStack = [];
        currentElementList = elements;
        continue;
      }
      if (directive.name === "constraints") {
        currentSection = "constraints";
        elementStack = [];
        currentElementList = constraints;
        continue;
      }
      if (directive.name === "extensions") {
        currentSection = "extensions";
        continue;
      }
      if (directive.name === "mustsupport") {
        currentSection = "mustsupport";
        continue;
      }
      if (directive.name === "search") {
        currentSection = "search";
        continue;
      }
      if (directive.name === "operations") {
        currentSection = "operations";
        continue;
      }
      if (directive.name === "invariants") {
        currentSection = "invariants";
        continue;
      }
      if (directive.name === "slicing") {
        currentSection = "slicing";
        continue;
      }
      if (directive.name === "codes") {
        currentSection = "codes";
        continue;
      }
      if (directive.name === "concepts") {
        currentSection = "concepts";
        continue;
      }

      // Binding sub-line within elements/constraints section
      if (
        directive.name === "binding" &&
        (currentSection === "elements" || currentSection === "constraints")
      ) {
        const binding = parseBindingDirective(directive.value);
        if (binding && elementStack.length > 0) {
          const lastElement =
            elementStack[elementStack.length - 1].element;
          lastElement.binding = binding;
        }
        continue;
      }

      // Unknown directive — skip
      continue;
    }

    // Content lines (non-directive)
    switch (currentSection) {
      case "elements":
      case "constraints": {
        const depth = getIndentDepth(line);
        const el = parseElementLine(trimmed, name ?? "");
        if (el) {
          // Build tree structure
          while (
            elementStack.length > 0 &&
            elementStack[elementStack.length - 1].depth >= depth
          ) {
            elementStack.pop();
          }

          if (elementStack.length === 0) {
            currentElementList.push(el);
          } else {
            const parentEl =
              elementStack[elementStack.length - 1].element;
            if (!parentEl.children) parentEl.children = [];
            parentEl.children.push(el);
          }

          elementStack.push({ element: el, depth });
        }
        break;
      }
      case "extensions": {
        const ext = parseExtensionLine(trimmed);
        if (ext) extensions.push(ext);
        break;
      }
      case "mustsupport": {
        // Comma-separated element paths, possibly spanning multiple lines
        const paths = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
        mustSupportPaths.push(...paths);
        break;
      }
      case "search": {
        const sp = parseSearchLine(trimmed);
        if (sp) search.push(sp);
        break;
      }
      case "operations": {
        const op = parseOperationLine(trimmed);
        if (op) operations.push(op);
        break;
      }
      case "invariants": {
        const inv = parseInvariantLine(trimmed);
        if (inv) invariants.push(inv);
        break;
      }
      // slicing, codes, concepts — not yet implemented
      default:
        break;
    }
  }

  if (!docType || !name) {
    throw new Error("EZF document missing type directive");
  }

  const doc: EZFDocument = {
    format: format ?? "ezf/0.1",
    type: docType,
    name,
    parent,
    metadata,
  };

  if (elements.length > 0) doc.elements = elements;
  if (constraints.length > 0) doc.constraints = constraints;
  if (extensions.length > 0) doc.extensions = extensions;
  if (mustSupportPaths.length > 0) doc.mustSupport = mustSupportPaths;
  if (search.length > 0) doc.search = search;
  if (operations.length > 0) doc.operations = operations;
  if (invariants.length > 0) doc.invariants = invariants;

  return doc;
}

// ─── Internal: Directive parsing ─────────────────────────────────────

interface Directive {
  name: string;
  value: string;
}

function parseDirective(line: string): Directive {
  // Remove leading @
  const rest = line.slice(1);
  const spaceIdx = rest.indexOf(" ");
  if (spaceIdx === -1) {
    return { name: rest, value: "" };
  }
  return {
    name: rest.slice(0, spaceIdx),
    value: rest.slice(spaceIdx + 1).trim(),
  };
}

function parseTypeDirective(value: string): { name: string; parent?: string } {
  const match = value.match(/^(\S+)\s*:\s*(\S+)$/);
  if (match) {
    return { name: match[1], parent: match[2] };
  }
  return { name: value.trim() };
}

function parseBindingDirective(value: string): EZFBinding | undefined {
  // Format: "required http://..." or "extensible http://... # description"
  const match = value.match(/^(required|extensible|preferred|example)\s+(\S+)/);
  if (!match) return undefined;
  return {
    strength: match[1] as EZFBinding["strength"],
    valueSet: match[2],
  };
}

// ─── Internal: Element line parsing ──────────────────────────────────

function getIndentDepth(line: string): number {
  const match = line.match(/^( *)/);
  if (!match) return 0;
  return Math.floor(match[1].length / 2);
}

function parseElementLine(
  trimmed: string,
  resourceName: string
): EZFElement | undefined {
  // Format: name : cardinality type_expr [flags] # description
  // The description part (after #) is optional
  let mainPart = trimmed;
  let description: string | undefined;

  const hashIdx = findDescriptionHash(trimmed);
  if (hashIdx !== -1) {
    mainPart = trimmed.slice(0, hashIdx).trim();
    description = trimmed.slice(hashIdx + 1).trim();
  }

  // Split on " : " to get name and the rest
  const colonMatch = mainPart.match(/^(\S+)\s+:\s+(.+)$/);
  if (!colonMatch) return undefined;

  const elementName = colonMatch[1];
  const rest = colonMatch[2].trim();

  // Parse cardinality
  const cardMatch = rest.match(/^(\d+)\.\.(\d+|\*)\s+(.+)$/);
  if (!cardMatch) return undefined;

  const min = parseInt(cardMatch[1], 10);
  const max = cardMatch[2];
  let remaining = cardMatch[3].trim();

  // Parse flags (if present, in brackets at the end)
  let flags: EZFFlags = {
    summary: false,
    modifier: false,
    mustSupport: false,
  };
  const flagMatch = remaining.match(/\[([^\]]+)\]$/);
  if (flagMatch) {
    flags = parseFlagString(flagMatch[1]);
    remaining = remaining.slice(0, remaining.lastIndexOf("[")).trim();
  }

  // Parse type expression
  const types = parseTypeExpr(remaining);
  let contentReference: string | undefined;

  // Check for @ref syntax
  const refMatch = remaining.match(/^@ref\(([^)]+)\)$/);
  if (refMatch) {
    contentReference = refMatch[1];
  }

  const el: EZFElement = {
    path: elementName, // Will be fully qualified later if needed
    min,
    max,
    types,
    flags,
    short: description,
  };

  if (contentReference) {
    el.contentReference = contentReference;
  }

  return el;
}

function findDescriptionHash(line: string): number {
  // Find the # that starts the description comment.
  // Must not be inside parentheses (reference targets use |).
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "(") parenDepth++;
    if (ch === ")") parenDepth--;
    if (ch === "[") bracketDepth++;
    if (ch === "]") bracketDepth--;
    if (ch === "#" && parenDepth === 0 && bracketDepth === 0) {
      return i;
    }
  }
  return -1;
}

function parseFlagString(flagStr: string): EZFFlags {
  return {
    modifier: flagStr.includes("?!"),
    summary: flagStr.includes("Σ"),
    mustSupport: flagStr.includes("MS"),
    maturity: flagStr.includes("TU")
      ? "TU"
      : flagStr.includes("N")
        ? "N"
        : flagStr.includes("D")
          ? "D"
          : undefined,
  };
}

function parseTypeExpr(typeStr: string): EZFType[] {
  // Handle @ref
  if (typeStr.startsWith("@ref(")) return [];

  const types: EZFType[] = [];

  // Split on | but not inside parentheses
  const typeParts = splitOutsideParens(typeStr, "|");

  for (const part of typeParts) {
    const trimPart = part.trim();
    if (!trimPart) continue;

    // Check for parameterized type: Reference(Org|Patient) or canonical(SD|VS)
    const paramMatch = trimPart.match(/^(\w+)\(([^)]+)\)$/);
    if (paramMatch) {
      const targets = paramMatch[2]
        .split("|")
        .map((t) => t.trim())
        .filter(Boolean);
      types.push({
        code: paramMatch[1],
        targetProfile: targets.length > 0 ? targets : undefined,
      });
    } else {
      types.push({ code: trimPart });
    }
  }

  return types;
}

function splitOutsideParens(str: string, sep: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);

  return parts;
}

// ─── Internal: Section line parsers ──────────────────────────────────

function parseSearchLine(line: string): EZFSearchParam | undefined {
  // Format: name : type (expression)
  const match = line.match(/^(\S+)\s+:\s+(\S+)\s+\((.+)\)$/);
  if (!match) return undefined;
  return {
    name: match[1],
    type: match[2],
    expression: match[3],
  };
}

function parseOperationLine(line: string): EZFOperation | undefined {
  // Format: $name : description
  const match = line.match(/^\$(\S+)\s+:\s+(.+)$/);
  if (!match) return undefined;
  return {
    name: match[1],
    description: match[2].trim(),
  };
}

function parseInvariantLine(line: string): EZFInvariant | undefined {
  // Format: key : human description
  // Or continuation: expr: expression
  if (line.startsWith("expr:")) {
    // This is a continuation — handled elsewhere if needed
    return undefined;
  }
  const match = line.match(/^(\S+)\s+:\s+(.+)$/);
  if (!match) return undefined;
  return {
    key: match[1],
    human: match[2].trim(),
  };
}

function parseExtensionLine(line: string): EZFExtension | undefined {
  // Format: name : cardinality type # description
  let mainPart = line;
  let description: string | undefined;

  const hashIdx = findDescriptionHash(line);
  if (hashIdx !== -1) {
    mainPart = line.slice(0, hashIdx).trim();
    description = line.slice(hashIdx + 1).trim();
  }

  const match = mainPart.match(/^(\S+)\s+:\s+(\d+)\.\.(\d+|\*)\s+(\S+)$/);
  if (!match) return undefined;

  return {
    name: match[1],
    min: parseInt(match[2], 10),
    max: match[3],
    type: match[4],
    description,
  };
}
