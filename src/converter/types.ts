/**
 * EZF type definitions.
 * Corresponds to COMPACT-FORMAT-SPEC.md §7.3 and related sections.
 */

/** A single type reference in an element definition. */
export interface EZFType {
  code: string;
  targetProfile?: string[];
}

/** Flags on an element. */
export interface EZFFlags {
  summary: boolean;
  modifier: boolean;
  mustSupport: boolean;
  maturity?: "TU" | "N" | "D";
}

/** Binding on a coded element. */
export interface EZFBinding {
  strength: "required" | "extensible" | "preferred" | "example";
  valueSet: string;
}

/** A single element in the EZF tree. */
export interface EZFElement {
  path: string;
  min: number;
  max: string;
  types: EZFType[];
  flags: EZFFlags;
  short?: string;
  binding?: EZFBinding;
  children?: EZFElement[];
  /** For contentReference elements: the referenced path. */
  contentReference?: string;
}

/** A search parameter entry. */
export interface EZFSearchParam {
  name: string;
  type: string;
  expression: string;
}

/** An operation entry. */
export interface EZFOperation {
  name: string;
  description: string;
}

/** An invariant/constraint entry. */
export interface EZFInvariant {
  key: string;
  human: string;
  expression?: string;
}

/** An extension entry. */
export interface EZFExtension {
  name: string;
  url?: string;
  kind: "simple" | "complex";
  min: number;
  max: string;
  /** For simple extensions: the value types. */
  valueTypes?: string[];
  description?: string;
  /** Resource types or paths this extension can be used on. */
  context?: string[];
}

/** Metadata about the document. */
export interface EZFMetadata {
  description?: string;
  url?: string;
  version?: string;
  status?: string;
  scope?: string;
  compartments?: Array<{ compartment: string; param: string }>;
  ig?: string;
  maturity?: string;
  abstract?: boolean;
}

/** Supported EZF document types. */
export type EZFDocumentType =
  | "resource"
  | "datatype"
  | "profile"
  | "extension"
  | "valueset"
  | "codesystem";

/** A complete EZF document. */
export interface EZFDocument {
  format: string;
  type: EZFDocumentType;
  name: string;
  parent?: string;
  metadata: EZFMetadata;
  elements?: EZFElement[];
  constraints?: EZFElement[];
  extensions?: EZFExtension[];
  mustSupport?: string[];
  search?: EZFSearchParam[];
  operations?: EZFOperation[];
  invariants?: EZFInvariant[];
}
