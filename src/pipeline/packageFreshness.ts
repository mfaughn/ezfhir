/**
 * Pre-release package freshness detection.
 *
 * Checks whether a cached pre-release FHIR package (ballot, draft, snapshot,
 * cibuild) is stale by comparing against the FHIR package registry.
 * Allows invalidation to force re-download on next load.
 */

import { readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PRERELEASE_SUFFIXES = ["-ballot", "-draft", "-snapshot", "-cibuild"];
const REGISTRY_BASE = "https://packages2.fhir.org/packages";

/**
 * Returns true if the version string looks like a pre-release version.
 */
export function isPrereleaseVersion(version: string): boolean {
  return PRERELEASE_SUFFIXES.some((suffix) =>
    version.toLowerCase().includes(suffix)
  );
}

/**
 * Gets the local cache directory for a FHIR package.
 */
function getCachePath(packageName: string, version: string): string {
  return join(homedir(), ".fhir", "packages", `${packageName}#${version}`);
}

/**
 * Reads the `date` field from a cached package's package.json.
 * Returns null if not found or unreadable.
 */
function getCachedPackageDate(
  packageName: string,
  version: string
): string | null {
  const pkgJsonPath = join(
    getCachePath(packageName, version),
    "package",
    "package.json"
  );
  try {
    const raw = readFileSync(pkgJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return (parsed.date as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetches the `date` field from the FHIR package registry for a given version.
 * Returns null if the registry is unreachable or the response is unexpected.
 */
async function getRegistryPackageDate(
  packageName: string,
  version: string
): Promise<string | null> {
  const url = `${REGISTRY_BASE}/${packageName}/${version}`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    return (data.date as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Checks if a cached pre-release package is stale by comparing local vs
 * registry `date` fields. Returns true if the registry has a newer version.
 *
 * Fails gracefully: if the registry is unreachable or the package is not
 * cached, returns false (not stale).
 */
export async function isPrereleaseStale(
  packageName: string,
  version: string
): Promise<boolean> {
  if (!isPrereleaseVersion(version)) return false;

  const localDate = getCachedPackageDate(packageName, version);
  if (!localDate) {
    // No cache — nothing is stale; let the loader do a fresh download
    return false;
  }

  const registryDate = await getRegistryPackageDate(packageName, version);
  if (!registryDate) {
    // Registry unreachable — keep cached version
    return false;
  }

  // Compare ISO date strings lexicographically
  return registryDate > localDate;
}

/**
 * Deletes the local cache for a specific package version,
 * forcing fhir-package-loader to re-download it on next load.
 */
export function invalidatePackageCache(
  packageName: string,
  version: string
): void {
  const cachePath = getCachePath(packageName, version);
  if (existsSync(cachePath)) {
    rmSync(cachePath, { recursive: true, force: true });
  }
}
