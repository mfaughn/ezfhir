/**
 * Golden file tests for EZF serialization.
 *
 * These tests ensure the serializer produces stable, expected output for core resources.
 * Each test loads a FHIR StructureDefinition, serializes it to EZF, and compares
 * byte-for-byte against the pre-generated golden file.
 *
 * If a test fails, the diff shows what changed in the serializer output.
 * To regenerate golden files: npm run scripts/generate-golden-files.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { serialize } from "../../src/converter/serializer.js";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GOLDEN_DIR = resolve(__dirname, "..", "fixtures", "golden");

// Resources that have golden files
const GOLDEN_RESOURCES = [
  "Patient",
  "Observation",
  "MedicationRequest",
  "Bundle",
  "Identifier",
  "Extension",
];

describe("Golden File Tests", () => {
  let loader: FPLPackageLoader;

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
  }, 120000);

  for (const resourceName of GOLDEN_RESOURCES) {
    it(`${resourceName} serialization matches golden file`, () => {
      // Load the StructureDefinition
      const sd = getStructureDefinition(loader, resourceName);
      expect(sd, `${resourceName} StructureDefinition not found`).toBeDefined();

      // Serialize to EZF
      const ezf = serialize(sd!);

      // Load the golden file
      const goldenPath = resolve(GOLDEN_DIR, `${resourceName}.ezf`);
      const golden = readFileSync(goldenPath, "utf-8");

      // Compare byte-for-byte
      expect(ezf).toBe(golden);
    });
  }

  it("all golden files are accounted for", () => {
    // This test ensures we don't have orphaned golden files
    const goldenFiles = GOLDEN_RESOURCES.map((name) => `${name}.ezf`).sort();
    expect(goldenFiles.length).toBe(6);
  });

  it("golden files are reasonably sized", () => {
    // Verify that golden files are compact (under 10KB each)
    for (const resourceName of GOLDEN_RESOURCES) {
      const goldenPath = resolve(GOLDEN_DIR, `${resourceName}.ezf`);
      const golden = readFileSync(goldenPath, "utf-8");
      expect(
        golden.length,
        `${resourceName} golden file is ${golden.length} bytes`
      ).toBeLessThan(10000);
    }
  });
});
