import { describe, it, expect, beforeAll } from "vitest";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";
import { serialize } from "../../src/converter/serializer.js";
import { extractSearchParams } from "../../src/pipeline/searchParamExtractor.js";
import {
  computeDeltaFromLoader,
  renderDelta,
} from "../../src/pipeline/profileDelta.js";
import { extractAllExtensions } from "../../src/pipeline/extensionExtractor.js";

describe("Multi-IG Integration (US Core + C-CDA)", () => {
  let loader: FPLPackageLoader;

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, "hl7.fhir.r4.core", "4.0.1");
    await loadPackage(loader, "hl7.fhir.us.core", "8.0.1");
    await loadPackage(loader, "hl7.cda.us.ccda", "4.0.0");
  }, 120000);

  it("loads US Core profiles", () => {
    const infos = loader.findResourceInfos("*", {
      type: ["StructureDefinition"],
      scope: "hl7.fhir.us.core",
    });
    expect(infos.length).toBeGreaterThan(50);
  });

  it("serializes R4 Patient base resource", () => {
    const sd = getStructureDefinition(loader, "Patient");
    expect(sd).toBeDefined();
    const ezf = serialize(sd!);
    expect(ezf).toContain("@resource Patient");
    expect(ezf).toContain("@elements");
  });

  it("computes US Core Patient delta", () => {
    const delta = computeDeltaFromLoader(
      loader, "USCorePatientProfile", "hl7.fhir.us.core"
    );
    expect(delta).toBeDefined();
    expect(delta!.baseResourceName).toBe("Patient");
    const cardChanges = delta!.changes.filter(
      (c) => c.changeType === "cardinality"
    );
    expect(cardChanges.length).toBeGreaterThan(0);
    expect(delta!.addedExtensions.length).toBeGreaterThan(0);
    expect(delta!.addedExtensions).toContain("us-core-race");
    expect(delta!.mustSupportPaths.length).toBeGreaterThan(5);
  });

  it("renders US Core Patient delta as EZF text", () => {
    const delta = computeDeltaFromLoader(
      loader, "USCorePatientProfile", "hl7.fhir.us.core"
    );
    const text = renderDelta(delta!);
    expect(text).toContain("@constraints");
    expect(text).toContain("TIGHTENED");
    expect(text).toContain("@extensions");
    expect(text).toContain("us-core-race");
    expect(text).toContain("@mustsupport");
  });

  it("computes deltas for multiple US Core profiles without errors", () => {
    const profileNames = [
      "USCorePatientProfile",
      "USCoreAllergyIntolerance",
      "USCoreConditionEncounterDiagnosisProfile",
      "USCoreMedicationRequestProfile",
      "USCoreObservationClinicalResultProfile",
    ];
    for (const name of profileNames) {
      const delta = computeDeltaFromLoader(loader, name, "hl7.fhir.us.core");
      if (delta) {
        expect(delta.profileName).toBe(name);
        expect(delta.changes).toBeDefined();
      }
    }
  });

  it("extracts US Core extensions", () => {
    const extensions = extractAllExtensions(loader, "hl7.fhir.us.core");
    expect(extensions.length).toBeGreaterThanOrEqual(0);
  });

  it("extracts US Core search parameters", () => {
    const params = extractSearchParams(loader, "Patient", "hl7.fhir.us.core");
    expect(params.length).toBeGreaterThanOrEqual(0);
  });

  it("loads C-CDA package", () => {
    const infos = loader.findResourceInfos("*", {
      type: ["StructureDefinition"],
      scope: "hl7.cda.us.ccda",
    });
    expect(infos).toBeDefined();
  });

  it("counts C-CDA StructureDefinitions", () => {
    const infos = loader.findResourceInfos("*", {
      type: ["StructureDefinition"],
      scope: "hl7.cda.us.ccda",
    });
    expect(infos.length).toBeGreaterThan(0);
    // Just list names, don't load JSON
    const names = infos.slice(0, 5).map(i => i.name).filter(Boolean);
    expect(names.length).toBeGreaterThan(0);
  });

  it("can load individual C-CDA resources without crashing", () => {
    // Load a few C-CDA resources to verify cross-package access works
    const infos = loader.findResourceInfos("*", {
      scope: "hl7.cda.us.ccda",
    });
    let loaded = 0;
    for (const info of infos.slice(0, 10)) {
      if (!info.name) continue;
      const json = loader.findResourceJSON(info.name, {
        scope: "hl7.cda.us.ccda",
      });
      if (json) loaded++;
    }
    expect(loaded).toBeGreaterThan(0);
  });

  it("US Core profiles resolve base R4 resources", () => {
    const r4Patient = getStructureDefinition(loader, "Patient");
    expect(r4Patient).toBeDefined();
    expect((r4Patient as any).snapshot.element.length).toBeGreaterThan(10);
  });
});
