/**
 * Wrapper around fhir-package-loader for loading FHIR packages
 * and retrieving StructureDefinitions and other artifacts.
 */

import {
  defaultPackageLoader,
  LoadStatus,
  SafeMode,
} from "fhir-package-loader";

import type { PackageLoader as FPLPackageLoader } from "fhir-package-loader";

export type { FPLPackageLoader };

/**
 * Options for creating a package loader.
 */
export interface PackageLoaderOptions {
  /** Custom log function. Defaults to no-op. */
  log?: (level: string, message: string) => void;
}

/**
 * Creates a configured FHIR package loader.
 *
 * Uses FREEZE safe mode to prevent accidental mutation of cached resources
 * while avoiding the overhead of deep cloning.
 */
export async function createPackageLoader(
  options: PackageLoaderOptions = {}
): Promise<FPLPackageLoader> {
  const loader = await defaultPackageLoader({
    log: options.log ?? (() => {}),
    safeMode: SafeMode.FREEZE,
  });
  return loader;
}

/**
 * Loads a FHIR package by name and version.
 * Returns the load status.
 */
export async function loadPackage(
  loader: FPLPackageLoader,
  packageId: string,
  version: string = "latest"
): Promise<LoadStatus> {
  return loader.loadPackage(packageId, version);
}

/**
 * Retrieves a StructureDefinition JSON from the loaded packages.
 *
 * @param key - Resource name, id, or URL (e.g., "Patient", "us-core-patient")
 * @param scope - Optional package name to limit search
 * @returns The StructureDefinition JSON or undefined if not found
 */
export function getStructureDefinition(
  loader: FPLPackageLoader,
  key: string,
  scope?: string
): Record<string, unknown> | undefined {
  const options: { type: string[]; scope?: string } = {
    type: ["StructureDefinition"],
  };
  if (scope) {
    options.scope = scope;
  }
  return loader.findResourceJSON(key, options) as
    | Record<string, unknown>
    | undefined;
}

/**
 * Retrieves all StructureDefinitions from a loaded package.
 *
 * @param loader - The package loader
 * @param scope - Package name to get SDs from
 * @returns Array of ResourceInfo objects for all SDs in the package
 */
export function getAllStructureDefinitions(
  loader: FPLPackageLoader,
  scope: string
): Array<Record<string, unknown>> {
  // Use wildcard search to get all, filtered by type and scope
  const infos = loader.findResourceInfos("*", {
    type: ["StructureDefinition"],
    scope,
  });
  const results: Array<Record<string, unknown>> = [];
  for (const info of infos) {
    if (info.name) {
      const json = loader.findResourceJSON(info.name, {
        type: ["StructureDefinition"],
        scope,
      });
      if (json) {
        results.push(json as Record<string, unknown>);
      }
    }
  }
  return results;
}
