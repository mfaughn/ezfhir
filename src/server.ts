/**
 * EZFhir MCP Server.
 *
 * Provides token-efficient FHIR specification access via MCP protocol.
 * Phase 0: serves Patient compact file and lookup_element tool.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
import type { EZFElement } from "./converter/types.js";

export const VERSION = "0.1.0";

/** Cache of serialized EZF text per resource name. */
const ezfCache = new Map<string, string>();

/** Shared package loader instance. */
let loader: FPLPackageLoader | null = null;

/**
 * Initializes the package loader and loads the R5 core package.
 */
export async function initLoader(): Promise<FPLPackageLoader> {
  if (loader) return loader;
  loader = await createPackageLoader();
  await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
  return loader;
}

/**
 * Gets the EZF text for a resource, using cache.
 */
export function getEZF(resourceName: string): string {
  const cached = ezfCache.get(resourceName);
  if (cached) return cached;

  if (!loader) throw new Error("Loader not initialized");

  const sd = getStructureDefinition(loader, resourceName);
  if (!sd) throw new Error(`Resource "${resourceName}" not found`);

  const ezfText = serialize(sd);
  ezfCache.set(resourceName, ezfText);
  return ezfText;
}

/**
 * Looks up an element by dot-path in a resource's EZF representation.
 * Returns the matching element line(s) with context.
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

  // Search for the element by path (supports dotted paths like "contact.name")
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

/**
 * Formats an element for display.
 */
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

/**
 * Creates and configures the MCP server instance.
 * Separated from startup for testability.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "ezfhir",
    version: VERSION,
  });

  // Resource: serve EZF compact files
  server.registerResource(
    "fhir-resource-patient",
    "fhir://resource/Patient",
    {
      description:
        "FHIR Patient resource in compact EZF format (~60x smaller than JSON)",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: getEZF("Patient"),
        },
      ],
    })
  );

  // Tool: lookup_element
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
