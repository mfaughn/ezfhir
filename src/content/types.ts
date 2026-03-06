/** Source provenance for a piece of content. */
export interface ContentSource {
  /** Source type: "fhir-spec", "ig", "confluence", "terminology" */
  type: string;
  /** Human-readable source name (e.g., "FHIR R5 Core Specification") */
  name: string;
  /** URL to the original source page */
  url?: string;
  /** Version of the source */
  version?: string;
  /** Package name if from a FHIR package */
  packageName?: string;
}

/** Cross-reference to a FHIR artifact or another content chunk. */
export interface ContentRef {
  /** Type of reference target */
  type:
    | "resource"
    | "element"
    | "datatype"
    | "valueset"
    | "codesystem"
    | "searchparam"
    | "operation"
    | "topic"
    | "page";
  /** Target identifier (e.g., "Patient", "Patient.gender", "exchange/search") */
  target: string;
  /** Display text for the reference */
  display?: string;
}

/** Atomic unit of documentation content. */
export interface ContentChunk {
  /** Unique identifier (e.g., "fhir-spec:search.html#modifiers") */
  id: string;
  /** Topic path this chunk belongs to (e.g., "exchange/search/modifiers") */
  topicPath: string;
  /** Section title */
  title: string;
  /** Short summary (~300 chars max) for progressive disclosure */
  summary: string;
  /** Full content body in markdown */
  body: string;
  /** Source provenance */
  source: ContentSource;
  /** Cross-references to artifacts and other content */
  refs: ContentRef[];
  /** Keywords for search indexing */
  keywords: string[];
  /** Heading level in source (2 = h2, 3 = h3, etc.) */
  headingLevel?: number;
  /** Order within the topic for consistent display */
  order?: number;
}

/** A topic node in the hierarchy. */
export interface Topic {
  /** Topic path (e.g., "exchange/search") — serves as the unique ID */
  path: string;
  /** Display name */
  name: string;
  /** Short description of what this topic covers */
  description: string;
  /** Parent topic path, or undefined for root topics */
  parent?: string;
  /** Child topic paths */
  children: string[];
}
