/**
 * Exploration script: dumps the structure of a Patient SD element
 * to understand the exact shapes for the serializer.
 * Run with: npx tsx scripts/explore-sd.ts
 */
import { createPackageLoader, loadPackage, getStructureDefinition } from "../src/pipeline/packageLoader.js";

async function main() {
  const loader = await createPackageLoader({
    log: (level, msg) => { if (level === "error") console.error(msg); }
  });
  await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");

  const patient = getStructureDefinition(loader, "Patient")!;
  const snapshot = patient.snapshot as { element: Array<Record<string, unknown>> };

  console.log("=== Patient SD top-level keys ===");
  console.log(Object.keys(patient).join(", "));

  console.log("\n=== Sample elements ===");
  const interesting = [
    "Patient", // root
    "Patient.identifier",
    "Patient.gender",
    "Patient.deceased[x]",
    "Patient.contact",
    "Patient.contact.relationship",
    "Patient.generalPractitioner",
    "Patient.link",
    "Patient.link.type",
  ];

  for (const path of interesting) {
    const el = snapshot.element.find((e: Record<string, unknown>) => e.path === path);
    if (el) {
      console.log(`\n--- ${path} ---`);
      console.log(JSON.stringify(el, null, 2).slice(0, 2000));
    }
  }

  // Check for contentReference
  console.log("\n=== Elements with contentReference ===");
  for (const el of snapshot.element) {
    if ((el as Record<string, unknown>).contentReference) {
      console.log(`${(el as Record<string, unknown>).path}: ${(el as Record<string, unknown>).contentReference}`);
    }
  }

  // Count elements
  console.log(`\n=== Total elements: ${snapshot.element.length} ===`);

  // Check what inherited elements look like
  console.log("\n=== First 8 elements (inherited) ===");
  for (const el of snapshot.element.slice(0, 9)) {
    const e = el as Record<string, unknown>;
    const types = e.type as Array<{code: string}> | undefined;
    console.log(`${e.path} : ${e.min}..${e.max} ${types?.map(t => t.code).join("|") ?? "(no type)"}`);
  }
}

main().catch(console.error);
