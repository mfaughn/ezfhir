import { createPackageLoader, loadPackage } from "../src/pipeline/packageLoader.js";

async function main() {
  const loader = await createPackageLoader({
    log: (level, msg) => { if (level === "error") console.error(msg); }
  });
  await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");

  // Check Questionnaire for contentReference
  const q = loader.findResourceJSON("Questionnaire", { type: ["StructureDefinition"] }) as Record<string, unknown>;
  if (q) {
    const snapshot = q.snapshot as { element: Array<Record<string, unknown>> };
    for (const el of snapshot.element) {
      if (el.contentReference) {
        console.log(`${el.path}: contentReference = ${el.contentReference}`);
      }
    }
  }

  // Count total resources with contentReference
  const allInfos = loader.findResourceInfos("*", { type: ["StructureDefinition"] });
  let total = 0;
  for (const info of allInfos) {
    if (!info.name) continue;
    const sd = loader.findResourceJSON(info.name, { type: ["StructureDefinition"] }) as Record<string, unknown> | undefined;
    if (!sd || !sd.snapshot) continue;
    const snapshot = sd.snapshot as { element: Array<Record<string, unknown>> };
    for (const el of snapshot.element) {
      if (el.contentReference) {
        total++;
        if (total <= 10) {
          console.log(`${(sd.name || info.name)}.${el.path}: ${el.contentReference}`);
        }
      }
    }
  }
  console.log(`\nTotal elements with contentReference across all SDs: ${total}`);
}

main().catch(console.error);
