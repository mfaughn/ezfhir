/**
 * FHIR Specification Package Loader.
 *
 * Downloads, caches, and provides access to the FHIR specification HTML
 * pages for documentation extraction. Uses a local cache directory
 * to avoid repeated downloads.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

/** Default cache directory for FHIR spec downloads. */
const DEFAULT_CACHE_DIR = join(homedir(), ".fhir", "spec-cache");

/** Known FHIR version download URLs. */
const SPEC_URLS: Record<string, string> = {
  "5.0.0": "https://hl7.org/fhir/R5/fhir-spec.zip",
  "4.0.1": "https://hl7.org/fhir/R4/fhir-spec.zip",
  "4.3.0": "https://hl7.org/fhir/R4B/fhir-spec.zip",
};

/** Cache directory override for testing. */
let cacheDir = DEFAULT_CACHE_DIR;

/**
 * Sets the cache directory path. Primarily for testing.
 */
export function setCacheDir(dir: string): void {
  cacheDir = dir;
}

/**
 * Gets the cache directory for a specific FHIR version.
 */
function getVersionCacheDir(version: string): string {
  return join(cacheDir, `fhir-${version}`);
}

/**
 * Finds the directory containing HTML spec pages within the cache.
 * The zip may extract to different subdirectory structures, so we
 * search for the actual location of the HTML files.
 */
function findHtmlDir(baseDir: string): string | null {
  // Check base directory first
  try {
    const files = readdirSync(baseDir);
    if (files.some(f => f === "search.html" || f === "datatypes.html")) {
      return baseDir;
    }
  } catch {
    return null;
  }

  // Check known subdirectory patterns from fhir-spec.zip
  const candidates = [
    join(baseDir, "fhir-spec", "site"),
    join(baseDir, "site"),
    join(baseDir, "fhir-spec"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const files = readdirSync(candidate);
      if (files.some(f => f === "search.html" || f === "datatypes.html")) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Checks if spec pages are cached for a given FHIR version.
 */
export function isSpecCached(version: string): boolean {
  const dir = getVersionCacheDir(version);
  if (!existsSync(dir)) return false;
  return findHtmlDir(dir) !== null;
}

/**
 * Downloads and extracts the FHIR spec package for a given version.
 * Returns the path to the directory containing the HTML files.
 *
 * If already cached, returns immediately without re-downloading.
 */
export async function downloadSpec(version: string): Promise<string> {
  const dir = getVersionCacheDir(version);

  // Check if already cached
  const existingHtmlDir = findHtmlDir(dir);
  if (existingHtmlDir) {
    return existingHtmlDir;
  }

  const url = SPEC_URLS[version];
  if (!url) {
    throw new Error(
      `No download URL configured for FHIR version ${version}. ` +
      `Available versions: ${Object.keys(SPEC_URLS).join(", ")}`
    );
  }

  // Create cache directory
  mkdirSync(dir, { recursive: true });

  // Download the zip file
  const zipPath = join(dir, "fhir-spec.zip");
  console.error(`Downloading FHIR ${version} spec (~400MB)...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download FHIR spec from ${url}: ${response.status} ${response.statusText}`);
  }

  // Write response to file
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(zipPath, buffer);
  console.error("Download complete, extracting...");

  // Extract zip
  await extractZip(zipPath, dir);

  const htmlDir = findHtmlDir(dir);
  if (!htmlDir) {
    throw new Error("Spec zip extracted but could not find HTML files");
  }

  return htmlDir;
}

/**
 * Extracts a zip file to a directory using the unzip command.
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const { execSync } = await import("child_process");
  try {
    execSync(`unzip -o -q "${zipPath}" -d "${destDir}"`, {
      timeout: 300000, // 5 minutes for large zip
      stdio: "ignore",
    });
  } catch (error) {
    throw new Error(
      `Failed to extract FHIR spec zip. Ensure 'unzip' is installed. Error: ${error}`
    );
  }
}

/**
 * Lists all available HTML page files in the cached spec directory.
 * Only returns top-level HTML files (not in subdirectories).
 */
export function listSpecPages(version: string): string[] {
  const dir = getVersionCacheDir(version);
  const htmlDir = findHtmlDir(dir);
  if (!htmlDir) return [];

  try {
    return readdirSync(htmlDir)
      .filter(f => f.endsWith(".html"))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Reads a single HTML spec page from the cache.
 * Returns null if the page doesn't exist.
 */
export function readSpecPage(version: string, filename: string): string | null {
  const dir = getVersionCacheDir(version);
  const htmlDir = findHtmlDir(dir);
  if (!htmlDir) return null;

  const filePath = join(htmlDir, filename);
  if (!existsSync(filePath)) return null;

  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Loads a spec page from a raw file path (for testing or pre-downloaded content).
 */
export function readSpecPageFromPath(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
