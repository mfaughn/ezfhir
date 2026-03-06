#!/usr/bin/env node
/**
 * ezfhir — AI-first MCP server for token-efficient FHIR specification access.
 *
 * Entry point for the `ezfhir` CLI command. Starts the MCP server on stdio.
 */

export { VERSION, createServer, startServer } from "./server.js";

import { startServer } from "./server.js";

// Run if executed directly (via `ezfhir` CLI or `node dist/index.js`)
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith("/index.js") ||
    process.argv[1].endsWith("/index.ts") ||
    process.argv[1].endsWith("/ezfhir"));

if (isMainModule) {
  startServer().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
