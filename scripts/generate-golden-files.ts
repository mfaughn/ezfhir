/**
 * Script to generate golden EZF files for testing.
 * Serializes core FHIR R5 resources to EZF format.
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { serialize } from "../src/converter/serializer.js";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
} from "../src/pipeline/packageLoader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resources to generate golden files for
const RESOURCES = [
  "Patient",
  "Observation",
  "MedicationRequest",
  "Bundle",
  "Identifier",
  "Extension",
];

async function main() {
  console.log("Loading FHIR R5 package...");
  const loader = await createPackageLoader();
  await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");

  const outputDir = resolve(__dirname, "..", "test", "fixtures", "golden");
  mkdirSync(outputDir, { recursive: true });

  console.log(`\nGenerating golden files in ${outputDir}\n`);

  for (const name of RESOURCES) {
    console.log(`Processing ${name}...`);
    const sd = getStructureDefinition(loader, name);

    if (!sd) {
      console.error(`  ERROR: ${name} not found`);
      continue;
    }

    const ezf = serialize(sd);
    const outputPath = resolve(outputDir, `${name}.ezf`);
    writeFileSync(outputPath, ezf, "utf-8");
    console.log(`  ✓ Wrote ${outputPath} (${ezf.length} bytes)`);
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
