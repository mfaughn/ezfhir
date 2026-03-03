import { describe, it, expect, beforeAll } from "vitest";
import { verify, flattenTree } from "../../src/converter/verifier.js";
import { serialize } from "../../src/converter/serializer.js";
import { parse } from "../../src/converter/parser.js";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

describe("EZF Round-trip Verifier", () => {
  let loader: FPLPackageLoader;

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
  }, 120000);

  describe("Patient round-trip", () => {
    it("serialize → parse → verify passes with 0 mismatches", () => {
      const patientSD = getStructureDefinition(loader, "Patient")!;
      const ezfText = serialize(patientSD);
      const doc = parse(ezfText);

      expect(doc.elements).toBeDefined();
      const result = verify(doc.elements!, patientSD);

      if (!result.passed) {
        console.log("Mismatches:", JSON.stringify(result.mismatches, null, 2));
        console.log("Missing in EZF:", result.missingInEZF);
        console.log("Extra in EZF:", result.extraInEZF);
      }

      expect(result.mismatches).toHaveLength(0);
      expect(result.missingInEZF).toHaveLength(0);
      expect(result.extraInEZF).toHaveLength(0);
      expect(result.passed).toBe(true);
      expect(result.totalElementsChecked).toBeGreaterThan(15);
    });
  });

  describe("Observation round-trip", () => {
    it("serialize → parse → verify passes", () => {
      const obsSD = getStructureDefinition(loader, "Observation")!;
      const ezfText = serialize(obsSD);
      const doc = parse(ezfText);

      expect(doc.elements).toBeDefined();
      const result = verify(doc.elements!, obsSD);

      if (!result.passed) {
        console.log("Mismatches:", JSON.stringify(result.mismatches.slice(0, 5), null, 2));
        console.log("Missing in EZF (first 5):", result.missingInEZF.slice(0, 5));
        console.log("Extra in EZF (first 5):", result.extraInEZF.slice(0, 5));
      }

      expect(result.mismatches).toHaveLength(0);
      expect(result.missingInEZF).toHaveLength(0);
      expect(result.extraInEZF).toHaveLength(0);
      expect(result.passed).toBe(true);
    });
  });

  describe("Questionnaire round-trip (contentReference)", () => {
    it("serialize → parse → verify passes for resource with contentReference", () => {
      const qSD = getStructureDefinition(loader, "Questionnaire")!;
      const ezfText = serialize(qSD);
      const doc = parse(ezfText);

      expect(doc.elements).toBeDefined();
      const result = verify(doc.elements!, qSD);

      if (!result.passed) {
        console.log("Mismatches:", JSON.stringify(result.mismatches.slice(0, 5), null, 2));
        console.log("Missing (first 5):", result.missingInEZF.slice(0, 5));
      }

      expect(result.mismatches).toHaveLength(0);
      expect(result.missingInEZF).toHaveLength(0);
      expect(result.extraInEZF).toHaveLength(0);
      expect(result.passed).toBe(true);
    });
  });

  describe("flattenTree", () => {
    it("qualifies paths correctly", () => {
      const elements = [
        {
          path: "identifier",
          min: 0,
          max: "*",
          types: [{ code: "Identifier" }],
          flags: { summary: true, modifier: false, mustSupport: false },
        },
        {
          path: "contact",
          min: 0,
          max: "*",
          types: [{ code: "BackboneElement" }],
          flags: { summary: false, modifier: false, mustSupport: false },
          children: [
            {
              path: "name",
              min: 0,
              max: "1",
              types: [{ code: "HumanName" }],
              flags: { summary: false, modifier: false, mustSupport: false },
            },
          ],
        },
      ];

      const flat = flattenTree(elements, "Patient");
      expect(flat).toHaveLength(3);
      expect(flat[0].path).toBe("Patient.identifier");
      expect(flat[1].path).toBe("Patient.contact");
      expect(flat[2].path).toBe("Patient.contact.name");
    });
  });

  describe("error handling", () => {
    it("fails gracefully on SD without snapshot", () => {
      const result = verify([], { name: "Test" });
      expect(result.passed).toBe(false);
      expect(result.mismatches[0].field).toBe("snapshot");
    });
  });
});
