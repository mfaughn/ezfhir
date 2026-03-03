import { createPackageLoader, loadPackage, getStructureDefinition } from "../src/pipeline/packageLoader.js";
import { serialize } from "../src/converter/serializer.js";

async function main() {
  const loader = await createPackageLoader();
  await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
  const patient = getStructureDefinition(loader, "Patient")!;
  const output = serialize(patient, {
    scope: "Patient Administration",
    compartments: [{ compartment: "Patient", param: "subject" }],
    operations: [
      { name: "everything", description: "Returns all information related to one or more patients" },
      { name: "match", description: "Find matching patient records using MPI logic" },
      { name: "merge", description: "Merge duplicate patient records" },
    ],
    searchParams: [
      { name: "name", type: "string", expression: "HumanName" },
      { name: "identifier", type: "token", expression: "Identifier" },
      { name: "birthdate", type: "date", expression: "date" },
      { name: "gender", type: "token", expression: "code" },
    ],
  });
  console.log(output);
  console.log(`\n--- ${output.length} characters ---`);
}
main().catch(console.error);
