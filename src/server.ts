/**
 * EZFhir MCP Server.
 *
 * Provides token-efficient FHIR specification access via MCP protocol.
 * Phase 2: serves resource/datatype indices, individual resources,
 * datatypes, and lookup tools.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "./pipeline/packageLoader.js";
import { serialize } from "./converter/serializer.js";
import { parse } from "./converter/parser.js";
import { extractSearchParams } from "./pipeline/searchParamExtractor.js";
import { extractOperations } from "./pipeline/operationExtractor.js";
import {
  generateResourceIndex,
  generateDatatypeIndex,
} from "./pipeline/indexGenerator.js";
import { buildSearchIndex, searchSpec } from "./pipeline/searchIndex.js";
import { compareProfiles, renderDiff, diffStructureDefinitions } from "./pipeline/sdDiff.js";
import type { EZFElement } from "./converter/types.js";

export const VERSION = "0.1.0";

const DEFAULT_SCOPE = "hl7.fhir.r5.core";
const DEFAULT_VERSION = "5.0.0";

/** Cache of serialized EZF text per resource name. */
const ezfCache = new Map<string, string>();

/** Cache for indices. */
let resourceIndexCache: string | null = null;
let datatypeIndexCache: string | null = null;

/** Shared package loader instance. */
let loader: FPLPackageLoader | null = null;

/** Track loaded packages for list_igs. */
export interface LoadedPackage {
  name: string;
  version: string;
  artifactCount: number;
}
const loadedPackages: LoadedPackage[] = [];

/**
 * Initializes the package loader and loads the R5 core package.
 */
export async function initLoader(): Promise<FPLPackageLoader> {
  if (loader) return loader;
  loader = await createPackageLoader();
  await loadPackage(loader, DEFAULT_SCOPE, DEFAULT_VERSION);
  const count = loader.findResourceInfos("*", { scope: DEFAULT_SCOPE }).length;
  loadedPackages.push({ name: DEFAULT_SCOPE, version: DEFAULT_VERSION, artifactCount: count });
  buildSearchIndex(loader, DEFAULT_SCOPE);
  return loader;
}

/**
 * Gets the current loader instance (for testing).
 */
export function getLoader(): FPLPackageLoader | null {
  return loader;
}

/**
 * Loads an additional IG package into the server.
 */
export async function loadIG(packageName: string, version: string): Promise<LoadedPackage> {
  if (!loader) throw new Error("Loader not initialized");

  // Check if already loaded
  const existing = loadedPackages.find(p => p.name === packageName && p.version === version);
  if (existing) return existing;

  await loadPackage(loader, packageName, version);
  const count = loader.findResourceInfos("*", { scope: packageName }).length;
  const pkg: LoadedPackage = { name: packageName, version, artifactCount: count };
  loadedPackages.push(pkg);

  // Rebuild search index to include new package
  buildSearchIndex(loader, DEFAULT_SCOPE);

  // Clear caches since new package may affect results
  ezfCache.clear();
  resourceIndexCache = null;
  datatypeIndexCache = null;

  return pkg;
}

/**
 * Lists all loaded packages.
 */
export function listIGs(): LoadedPackage[] {
  return [...loadedPackages];
}

/**
 * Gets the EZF text for a resource, with search params and operations.
 */
export function getEZF(resourceName: string): string {
  const cached = ezfCache.get(`resource:${resourceName}`);
  if (cached) return cached;

  if (!loader) throw new Error("Loader not initialized");

  const sd = getStructureDefinition(loader, resourceName);
  if (!sd) throw new Error(`Resource "${resourceName}" not found`);

  const searchParams = extractSearchParams(loader, resourceName, DEFAULT_SCOPE);
  const operations = extractOperations(loader, resourceName, DEFAULT_SCOPE);
  const ezfText = serialize(sd, { searchParams, operations });
  ezfCache.set(`resource:${resourceName}`, ezfText);
  return ezfText;
}

/**
 * Gets the EZF text for a datatype.
 */
export function getDatatypeEZF(datatypeName: string): string {
  const cached = ezfCache.get(`datatype:${datatypeName}`);
  if (cached) return cached;

  if (!loader) throw new Error("Loader not initialized");

  const sd = getStructureDefinition(loader, datatypeName);
  if (!sd) throw new Error(`Datatype "${datatypeName}" not found`);

  const ezfText = serialize(sd);
  ezfCache.set(`datatype:${datatypeName}`, ezfText);
  return ezfText;
}

/**
 * Gets the categorized resource index.
 */
export function getResourceIndex(): string {
  if (resourceIndexCache) return resourceIndexCache;
  if (!loader) throw new Error("Loader not initialized");
  resourceIndexCache = generateResourceIndex(loader, DEFAULT_SCOPE, DEFAULT_VERSION);
  return resourceIndexCache;
}

/**
 * Gets the datatype index.
 */
export function getDatatypeIndex(): string {
  if (datatypeIndexCache) return datatypeIndexCache;
  if (!loader) throw new Error("Loader not initialized");
  datatypeIndexCache = generateDatatypeIndex(loader, DEFAULT_SCOPE);
  return datatypeIndexCache;
}

/**
 * Looks up an element by dot-path in a resource's EZF representation.
 */
export function lookupElement(
  resourceName: string,
  elementPath: string
): string {
  const ezfText = getEZF(resourceName);
  const doc = parse(ezfText);

  if (!doc.elements) {
    return `No elements found in ${resourceName}`;
  }

  const pathParts = elementPath.split(".");
  let elements: EZFElement[] = doc.elements;
  let found: EZFElement | undefined;

  for (let i = 0; i < pathParts.length; i++) {
    found = elements.find((el) => el.path === pathParts[i]);
    if (!found) {
      return `Element "${elementPath}" not found in ${resourceName}. Available: ${elements.map((e) => e.path).join(", ")}`;
    }
    if (i < pathParts.length - 1) {
      if (!found.children) {
        return `Element "${pathParts.slice(0, i + 1).join(".")}" has no children in ${resourceName}`;
      }
      elements = found.children;
    }
  }

  if (!found) {
    return `Element "${elementPath}" not found in ${resourceName}`;
  }

  return formatElement(found, resourceName, elementPath);
}

function formatElement(
  el: EZFElement,
  resourceName: string,
  path: string
): string {
  const lines: string[] = [];
  lines.push(`${resourceName}.${path}`);
  lines.push(`  Cardinality: ${el.min}..${el.max}`);

  if (el.contentReference) {
    lines.push(`  ContentReference: @ref(${el.contentReference})`);
  } else if (el.types.length > 0) {
    const typeStr = el.types
      .map((t) => {
        if (t.targetProfile && t.targetProfile.length > 0) {
          return `${t.code}(${t.targetProfile.join("|")})`;
        }
        return t.code;
      })
      .join("|");
    lines.push(`  Type: ${typeStr}`);
  }

  const flags: string[] = [];
  if (el.flags.modifier) flags.push("?!");
  if (el.flags.summary) flags.push("Σ");
  if (el.flags.mustSupport) flags.push("MS");
  if (flags.length > 0) {
    lines.push(`  Flags: [${flags.join(" ")}]`);
  }

  if (el.binding) {
    lines.push(
      `  Binding: ${el.binding.strength} ${el.binding.valueSet}`
    );
  }

  if (el.short) {
    lines.push(`  Description: ${el.short}`);
  }

  if (el.children && el.children.length > 0) {
    lines.push(`  Children: ${el.children.map((c) => c.path).join(", ")}`);
  }

  return lines.join("\n");
}

export interface ExampleInstance {
  id: string;
  resourceType: string;
  description?: string;
}

/**
 * Gets example instances for a given resource type from the loaded package.
 * Scans the package for actual resource instances (not definitions).
 */
export function getExamples(resourceName: string, count = 5): ExampleInstance[] {
  if (!loader) throw new Error("Loader not initialized");

  // findResourceInfos with type filter matches by resourceType in the package
  const infos = loader.findResourceInfos("*", {
    scope: DEFAULT_SCOPE,
  });

  const examples: ExampleInstance[] = [];
  for (const info of infos) {
    if (!info.name) continue;
    if (info.resourceType !== resourceName) continue;

    examples.push({
      id: info.name,
      resourceType: resourceName,
    });

    if (examples.length >= count) break;
  }

  return examples;
}

export interface SearchParamInfo {
  name: string;
  type: string;
  expression: string;
  description?: string;
}

/**
 * Gets all search parameters for a resource with full details.
 */
export function getSearchParams(resourceName: string): SearchParamInfo[] {
  if (!loader) throw new Error("Loader not initialized");

  const spInfos = loader.findResourceInfos("*", {
    type: ["SearchParameter"],
    scope: DEFAULT_SCOPE,
  });

  const results: SearchParamInfo[] = [];
  for (const info of spInfos) {
    if (!info.name) continue;
    const sp = loader.findResourceJSON(info.name, {
      type: ["SearchParameter"],
      scope: DEFAULT_SCOPE,
    }) as Record<string, unknown> | undefined;
    if (!sp) continue;

    const base = sp.base as string[] | undefined;
    if (!base?.includes(resourceName)) continue;

    results.push({
      name: sp.name as string,
      type: sp.type as string,
      expression: (sp.expression as string) || "",
      description: ((sp.description as string) || "").slice(0, 120),
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export interface BindingInfo {
  path: string;
  strength: string;
  valueSet: string;
}

/**
 * Gets all coded bindings for a resource.
 */
export function getBindings(resourceName: string): BindingInfo[] {
  const ezfText = getEZF(resourceName);
  const doc = parse(ezfText);
  if (!doc.elements) return [];

  const bindings: BindingInfo[] = [];
  collectBindings(doc.elements, resourceName, bindings);
  return bindings;
}

function collectBindings(
  elements: EZFElement[],
  prefix: string,
  bindings: BindingInfo[]
): void {
  for (const el of elements) {
    const path = `${prefix}.${el.path}`;
    if (el.binding) {
      bindings.push({
        path,
        strength: el.binding.strength,
        valueSet: el.binding.valueSet,
      });
    }
    if (el.children) {
      collectBindings(el.children, path, bindings);
    }
  }
}

export interface ReferenceInfo {
  path: string;
  targets: string[];
}

/**
 * Gets all Reference-typed elements with their allowed targets.
 */
export function getReferences(resourceName: string): ReferenceInfo[] {
  const ezfText = getEZF(resourceName);
  const doc = parse(ezfText);
  if (!doc.elements) return [];

  const refs: ReferenceInfo[] = [];
  collectReferences(doc.elements, resourceName, refs);
  return refs;
}

function collectReferences(
  elements: EZFElement[],
  prefix: string,
  refs: ReferenceInfo[]
): void {
  for (const el of elements) {
    const path = `${prefix}.${el.path}`;
    const refTypes = el.types.filter((t) => t.code === "Reference");
    if (refTypes.length > 0) {
      const targets = refTypes
        .flatMap((t) => t.targetProfile || [])
        .filter(Boolean);
      refs.push({ path, targets });
    }
    if (el.children) {
      collectReferences(el.children, path, refs);
    }
  }
}

export interface ConstraintInfo {
  key: string;
  severity: string;
  human: string;
  expression?: string;
  path: string;
}

/**
 * Gets all FHIRPath constraints/invariants for a resource.
 */
export function getConstraints(resourceName: string): ConstraintInfo[] {
  if (!loader) throw new Error("Loader not initialized");

  const sd = getStructureDefinition(loader, resourceName);
  if (!sd) return [];

  const snapshot = (sd as Record<string, unknown>).snapshot as
    | { element: Array<Record<string, unknown>> }
    | undefined;
  if (!snapshot?.element) return [];

  const constraints: ConstraintInfo[] = [];
  for (const el of snapshot.element) {
    const path = el.path as string;
    const elConstraints = el.constraint as
      | Array<{ key: string; severity: string; human: string; expression?: string }>
      | undefined;
    if (!elConstraints) continue;
    for (const c of elConstraints) {
      constraints.push({
        key: c.key,
        severity: c.severity,
        human: c.human,
        expression: c.expression,
        path,
      });
    }
  }

  // Deduplicate by key (constraints inherited from base show up multiple times)
  const seen = new Set<string>();
  return constraints.filter((c) => {
    if (seen.has(c.key)) return false;
    seen.add(c.key);
    return true;
  });
}

/**
 * Creates and configures the MCP server instance.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "ezfhir",
    version: VERSION,
  });

  // ─── Static Resources ──────────────────────────────────────────

  server.registerResource(
    "fhir-resource-index",
    "fhir://index/resources",
    {
      description: "Categorized FHIR resource index listing all available resources",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/plain", text: getResourceIndex() }],
    })
  );

  server.registerResource(
    "fhir-datatype-index",
    "fhir://index/datatypes",
    {
      description: "FHIR datatype index listing complex and primitive types",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/plain", text: getDatatypeIndex() }],
    })
  );

  // ─── Resource Templates ────────────────────────────────────────

  server.registerResource(
    "fhir-resource",
    new ResourceTemplate("fhir://resource/{name}", { list: undefined }),
    {
      description: "FHIR resource definition in compact EZF format (~60x smaller than JSON). Includes elements, search params, and operations.",
      mimeType: "text/plain",
    },
    async (uri, params) => {
      const name = params.name as string;
      return {
        contents: [{ uri: uri.href, mimeType: "text/plain", text: getEZF(name) }],
      };
    }
  );

  server.registerResource(
    "fhir-datatype",
    new ResourceTemplate("fhir://datatype/{name}", { list: undefined }),
    {
      description: "FHIR datatype definition in compact EZF format",
      mimeType: "text/plain",
    },
    async (uri, params) => {
      const name = params.name as string;
      return {
        contents: [{ uri: uri.href, mimeType: "text/plain", text: getDatatypeEZF(name) }],
      };
    }
  );

  // ─── Tools ─────────────────────────────────────────────────────

  server.registerTool(
    "search_spec",
    {
      description:
        "Search the FHIR specification for resources, datatypes, elements, and search parameters. " +
        "Returns ranked results by relevance. Use this to discover what FHIR resources are available.",
      inputSchema: {
        query: z.string().describe("Search query (e.g., 'Patient', 'blood pressure', 'medication')"),
        limit: z.number().optional().describe("Max results to return (default 10)"),
      },
    },
    async ({ query, limit }) => {
      try {
        const results = searchSpec(query, limit);
        if (results.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No results found for "${query}"` }],
          };
        }
        const text = results
          .map((r, i) => `${i + 1}. ${r.name} (${r.type}) — ${r.description.slice(0, 100)}`)
          .join("\n");
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "lookup_element",
    {
      description:
        "Look up a specific element in a FHIR resource definition. " +
        "Returns cardinality, type, flags, bindings, and description. " +
        "Use dot notation for nested elements (e.g., 'contact.name').",
      inputSchema: {
        resource: z
          .string()
          .describe("FHIR resource name (e.g., 'Patient')"),
        path: z
          .string()
          .describe(
            "Element path using dot notation (e.g., 'gender', 'contact.name')"
          ),
      },
    },
    async ({ resource, path }) => {
      try {
        const result = lookupElement(resource, path);
        return {
          content: [{ type: "text" as const, text: result }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_examples",
    {
      description:
        "Get example instances of a FHIR resource type from the specification. " +
        "Returns example IDs that can be used to understand typical resource usage.",
      inputSchema: {
        resource: z.string().describe("FHIR resource type (e.g., 'Patient', 'Observation')"),
        count: z.number().optional().describe("Max examples to return (default 5)"),
      },
    },
    async ({ resource, count }) => {
      try {
        const examples = getExamples(resource, count);
        if (examples.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No examples found for "${resource}"` }],
          };
        }
        const text = examples
          .map((e) => `- ${e.id} (${e.resourceType})`)
          .join("\n");
        return {
          content: [{ type: "text" as const, text: `Examples for ${resource}:\n${text}` }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_search_params",
    {
      description:
        "Get all search parameters for a FHIR resource type. " +
        "Returns parameter names, types (token, reference, string, etc.), and FHIRPath expressions.",
      inputSchema: {
        resource: z.string().describe("FHIR resource type (e.g., 'Patient', 'Observation')"),
      },
    },
    async ({ resource }) => {
      try {
        const params = getSearchParams(resource);
        if (params.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No search parameters found for "${resource}"` }],
          };
        }
        const text = params
          .map((p) => `${p.name} : ${p.type} : ${p.expression}`)
          .join("\n");
        return {
          content: [{ type: "text" as const, text: `Search parameters for ${resource} (${params.length}):\n${text}` }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "load_ig",
    {
      description:
        "Load a FHIR Implementation Guide package from the registry. " +
        "Makes the IG's resources, profiles, and extensions available for lookup. " +
        "Package format: 'package.name' with version (e.g., 'hl7.fhir.us.core' version '8.0.1').",
      inputSchema: {
        package_name: z.string().describe("FHIR package name (e.g., 'hl7.fhir.us.core')"),
        version: z.string().describe("Package version (e.g., '8.0.1')"),
      },
    },
    async ({ package_name, version }) => {
      try {
        const pkg = await loadIG(package_name, version);
        return {
          content: [{
            type: "text" as const,
            text: `Loaded ${pkg.name}@${pkg.version} (${pkg.artifactCount} artifacts)`,
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error loading package: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "list_igs",
    {
      description: "List all loaded FHIR packages with their versions and artifact counts.",
      inputSchema: {},
    },
    async () => {
      const packages = listIGs();
      if (packages.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No packages loaded" }],
        };
      }
      const text = packages
        .map((p) => `${p.name}@${p.version} (${p.artifactCount} artifacts)`)
        .join("\n");
      return {
        content: [{ type: "text" as const, text: `Loaded packages:\n${text}` }],
      };
    }
  );

  server.registerTool(
    "compare_profiles",
    {
      description:
        "Compare two FHIR StructureDefinitions element by element. " +
        "Detects cardinality, type, binding, must-support, slicing, and other changes. " +
        "Use to compare a profile against its base, or two profiles against each other.",
      inputSchema: {
        left: z.string().describe("Name of the first (base) StructureDefinition"),
        right: z.string().describe("Name of the second (constrained) StructureDefinition"),
        scope: z.string().optional().describe("Package scope to search in"),
      },
    },
    async ({ left, right, scope: toolScope }) => {
      try {
        if (!loader) throw new Error("Loader not initialized");
        const result = compareProfiles(loader, left, right, toolScope);
        if (!result) {
          return {
            content: [{ type: "text" as const, text: `Could not find one or both profiles: "${left}", "${right}"` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: renderDiff(result) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "compare_versions",
    {
      description:
        "Compare the same FHIR resource across two package versions. " +
        "Useful for understanding changes between FHIR R4 and R5, or between IG versions.",
      inputSchema: {
        resource: z.string().describe("Resource or profile name to compare"),
        left_package: z.string().describe("First package name (e.g., 'hl7.fhir.r4.core')"),
        left_version: z.string().describe("First package version"),
        right_package: z.string().describe("Second package name (e.g., 'hl7.fhir.r5.core')"),
        right_version: z.string().describe("Second package version"),
      },
    },
    async ({ resource, left_package, left_version, right_package, right_version }) => {
      try {
        if (!loader) throw new Error("Loader not initialized");

        // Ensure both packages are loaded
        await loadIG(left_package, left_version);
        await loadIG(right_package, right_version);

        const leftSD = loader.findResourceJSON(resource, {
          type: ["StructureDefinition"],
          scope: left_package,
        }) as Record<string, unknown> | undefined;

        const rightSD = loader.findResourceJSON(resource, {
          type: ["StructureDefinition"],
          scope: right_package,
        }) as Record<string, unknown> | undefined;

        if (!leftSD && !rightSD) {
          return {
            content: [{ type: "text" as const, text: `"${resource}" not found in either package` }],
            isError: true,
          };
        }
        if (!leftSD) {
          return {
            content: [{ type: "text" as const, text: `"${resource}" only exists in ${right_package}@${right_version} (new resource)` }],
          };
        }
        if (!rightSD) {
          return {
            content: [{ type: "text" as const, text: `"${resource}" only exists in ${left_package}@${left_version} (removed resource)` }],
          };
        }

        const result = diffStructureDefinitions(leftSD, rightSD);
        return {
          content: [{ type: "text" as const, text: renderDiff(result) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_bindings",
    {
      description:
        "Get all coded element bindings for a FHIR resource. " +
        "Returns element paths, binding strengths (required/extensible/preferred/example), and value set URLs.",
      inputSchema: {
        resource: z.string().describe("FHIR resource name (e.g., 'Patient')"),
      },
    },
    async ({ resource }) => {
      try {
        const bindings = getBindings(resource);
        if (bindings.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No bindings found for "${resource}"` }],
          };
        }
        const text = bindings
          .map((b) => `${b.path} : ${b.strength} ${b.valueSet}`)
          .join("\n");
        return {
          content: [{ type: "text" as const, text: `Bindings for ${resource} (${bindings.length}):\n${text}` }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_references",
    {
      description:
        "Get all Reference-typed elements in a FHIR resource with their allowed target types.",
      inputSchema: {
        resource: z.string().describe("FHIR resource name (e.g., 'Patient')"),
      },
    },
    async ({ resource }) => {
      try {
        const refs = getReferences(resource);
        if (refs.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No reference elements found in "${resource}"` }],
          };
        }
        const text = refs
          .map((r) => `${r.path} → ${r.targets.length > 0 ? r.targets.join("|") : "(any)"}`)
          .join("\n");
        return {
          content: [{ type: "text" as const, text: `References in ${resource} (${refs.length}):\n${text}` }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_constraints",
    {
      description:
        "Get all FHIRPath invariants/constraints defined on a FHIR resource. " +
        "Returns constraint keys, human descriptions, severity, and FHIRPath expressions.",
      inputSchema: {
        resource: z.string().describe("FHIR resource name (e.g., 'Patient')"),
      },
    },
    async ({ resource }) => {
      try {
        const constraints = getConstraints(resource);
        if (constraints.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No constraints found for "${resource}"` }],
          };
        }
        const text = constraints
          .map((c) => `${c.key} (${c.severity}): ${c.human}${c.expression ? ` [${c.expression}]` : ""}`)
          .join("\n");
        return {
          content: [{ type: "text" as const, text: `Constraints for ${resource} (${constraints.length}):\n${text}` }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

/**
 * Starts the MCP server on stdio transport.
 */
export async function startServer(): Promise<void> {
  await initLoader();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ezfhir MCP server running on stdio");
}

// Run if executed directly
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith("/server.js") ||
    process.argv[1].endsWith("/server.ts"));

if (isMainModule) {
  startServer().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
