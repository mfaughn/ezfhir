/**
 * Startup configuration for ezfhir.
 *
 * Determines which FHIR packages to load at startup, with env var override.
 * The first package in the list is the "primary" package used for default lookups.
 */

export interface PackageRef {
  name: string;
  version: string;
}

export interface EzfhirConfig {
  /** Packages to load at startup. First entry is the primary. */
  startupPackages: PackageRef[];
  /** Scope name of the primary package (first in startupPackages). */
  primaryScope: string;
  /** Version of the primary package. */
  primaryVersion: string;
}

const DEFAULT_PACKAGES = "hl7.fhir.r5.core@5.0.0,hl7.fhir.r4.core@4.0.1";

/**
 * Parses a comma-separated list of `name@version` strings into PackageRef[].
 * Throws if any entry is malformed.
 */
export function parsePackageList(raw: string): PackageRef[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("EZFHIR_STARTUP_PACKAGES is empty");
  }

  const refs: PackageRef[] = [];
  for (const entry of trimmed.split(",")) {
    const part = entry.trim();
    if (!part) continue;
    const atIdx = part.lastIndexOf("@");
    if (atIdx <= 0 || atIdx === part.length - 1) {
      throw new Error(
        `Invalid package reference "${part}": expected "name@version" format`
      );
    }
    refs.push({
      name: part.slice(0, atIdx),
      version: part.slice(atIdx + 1),
    });
  }

  if (refs.length === 0) {
    throw new Error("EZFHIR_STARTUP_PACKAGES contains no valid entries");
  }

  return refs;
}

/**
 * Loads startup configuration from the EZFHIR_STARTUP_PACKAGES env var,
 * falling back to the default (R5 + R4).
 */
export function loadConfig(): EzfhirConfig {
  const raw = process.env.EZFHIR_STARTUP_PACKAGES ?? DEFAULT_PACKAGES;
  const startupPackages = parsePackageList(raw);
  return {
    startupPackages,
    primaryScope: startupPackages[0].name,
    primaryVersion: startupPackages[0].version,
  };
}
