import { describe, it, expect, beforeAll } from "vitest";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";
import { LoadStatus } from "fhir-package-loader";

describe("packageLoader", () => {
  let loader: FPLPackageLoader;

  beforeAll(async () => {
    loader = await createPackageLoader();
    const status = await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
    expect(status).toBe(LoadStatus.LOADED);
  }, 120000); // Package download can be slow

  it("loads the R5 core package successfully", () => {
    const info = loader.findPackageInfo("hl7.fhir.r5.core", "5.0.0");
    expect(info).toBeDefined();
    expect(info!.name).toBe("hl7.fhir.r5.core");
  });

  it("retrieves the Patient StructureDefinition", () => {
    const patient = getStructureDefinition(loader, "Patient");
    expect(patient).toBeDefined();
    expect(patient!.resourceType).toBe("StructureDefinition");
    expect(patient!.name).toBe("Patient");
    expect(patient!.kind).toBe("resource");
  });

  it("Patient SD has snapshot with elements", () => {
    const patient = getStructureDefinition(loader, "Patient");
    expect(patient).toBeDefined();

    const snapshot = patient!.snapshot as { element: unknown[] } | undefined;
    expect(snapshot).toBeDefined();
    expect(snapshot!.element).toBeDefined();
    expect(snapshot!.element.length).toBeGreaterThan(10);
  });

  it("Patient SD elements have expected structure", () => {
    const patient = getStructureDefinition(loader, "Patient");
    const snapshot = patient!.snapshot as { element: Array<Record<string, unknown>> };
    const elements = snapshot.element;

    // Find the 'identifier' element
    const identifier = elements.find(
      (e) => e.path === "Patient.identifier"
    );
    expect(identifier).toBeDefined();
    expect(identifier!.min).toBe(0);
    expect(identifier!.max).toBe("*");

    // Check type structure
    const types = identifier!.type as Array<{ code: string }>;
    expect(types).toBeDefined();
    expect(types.length).toBe(1);
    expect(types[0].code).toBe("Identifier");

    // Check isSummary flag
    expect(identifier!.isSummary).toBe(true);
  });

  it("Patient SD has binding information on coded elements", () => {
    const patient = getStructureDefinition(loader, "Patient");
    const snapshot = patient!.snapshot as { element: Array<Record<string, unknown>> };
    const elements = snapshot.element;

    // Find 'gender' element which has a required binding
    const gender = elements.find((e) => e.path === "Patient.gender");
    expect(gender).toBeDefined();

    const binding = gender!.binding as {
      strength: string;
      valueSet: string;
    };
    expect(binding).toBeDefined();
    expect(binding.strength).toBe("required");
    expect(binding.valueSet).toContain("administrative-gender");
  });

  it("Patient SD has choice type elements", () => {
    const patient = getStructureDefinition(loader, "Patient");
    const snapshot = patient!.snapshot as { element: Array<Record<string, unknown>> };
    const elements = snapshot.element;

    // deceased[x] is a choice type
    const deceased = elements.find(
      (e) => e.path === "Patient.deceased[x]"
    );
    expect(deceased).toBeDefined();

    const types = deceased!.type as Array<{ code: string }>;
    expect(types.length).toBe(2);
    const typeCodes = types.map((t) => t.code).sort();
    expect(typeCodes).toEqual(["boolean", "dateTime"]);
  });

  it("Patient SD has reference type elements with targets", () => {
    const patient = getStructureDefinition(loader, "Patient");
    const snapshot = patient!.snapshot as { element: Array<Record<string, unknown>> };
    const elements = snapshot.element;

    // generalPractitioner references Organization, Practitioner, PractitionerRole
    const gp = elements.find(
      (e) => e.path === "Patient.generalPractitioner"
    );
    expect(gp).toBeDefined();

    const types = gp!.type as Array<{
      code: string;
      targetProfile?: string[];
    }>;
    expect(types.length).toBe(1);
    expect(types[0].code).toBe("Reference");
    expect(types[0].targetProfile).toBeDefined();
    expect(types[0].targetProfile!.length).toBe(3);
  });

  it("returns undefined for non-existent resource", () => {
    const result = getStructureDefinition(loader, "NonExistentResource");
    expect(result).toBeUndefined();
  });
});
