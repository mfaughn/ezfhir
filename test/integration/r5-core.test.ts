import { describe, it, expect, beforeAll } from "vitest";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";
import { serialize } from "../../src/converter/serializer.js";
import { parse } from "../../src/converter/parser.js";
import { verify } from "../../src/converter/verifier.js";
import { extractSearchParams } from "../../src/pipeline/searchParamExtractor.js";
import { extractOperations } from "../../src/pipeline/operationExtractor.js";
import {
  extractValueSetSummary,
  extractAllValueSetSummaries,
} from "../../src/pipeline/valueSetExtractor.js";
import {
  generateResourceIndex,
  generateDatatypeIndex,
} from "../../src/pipeline/indexGenerator.js";
import { computeDeltaFromLoader } from "../../src/pipeline/profileDelta.js";

describe("R5 Core Integration", () => {
  let loader: FPLPackageLoader;
  const scope = "hl7.fhir.r5.core";

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, scope, "5.0.0");
  }, 120000);

  describe("full pipeline for Patient", () => {
    it("serializes with search params and operations", () => {
      const sd = getStructureDefinition(loader, "Patient")!;
      const searchParams = extractSearchParams(loader, "Patient", scope);
      const operations = extractOperations(loader, "Patient", scope);

      const ezf = serialize(sd, { searchParams, operations });

      expect(ezf).toContain("@format ezf/0.1");
      expect(ezf).toContain("@resource Patient");
      expect(ezf).toContain("@elements");
      expect(ezf).toContain("@search");
      expect(ezf).toContain("@operations");
      expect(ezf).toContain("$match");
    });

    it("round-trips with search params included", () => {
      const sd = getStructureDefinition(loader, "Patient")!;
      const searchParams = extractSearchParams(loader, "Patient", scope);
      const operations = extractOperations(loader, "Patient", scope);

      const ezf = serialize(sd, { searchParams, operations });
      const doc = parse(ezf);

      expect(doc.search).toBeDefined();
      expect(doc.search!.length).toBeGreaterThan(0);
      expect(doc.operations).toBeDefined();
      expect(doc.operations!.length).toBeGreaterThan(0);
    });
  });

  describe("full pipeline for 5 key resources", () => {
    const resources = [
      "Patient",
      "Observation",
      "MedicationRequest",
      "Encounter",
      "Condition",
    ];

    for (const name of resources) {
      it(`${name}: serialize + search + ops + verify`, () => {
        const sd = getStructureDefinition(loader, name)!;
        const searchParams = extractSearchParams(loader, name, scope);
        const operations = extractOperations(loader, name, scope);

        const ezf = serialize(sd, { searchParams, operations });
        const doc = parse(ezf);

        // Verify element round-trip
        expect(doc.elements).toBeDefined();
        const result = verify(doc.elements!, sd);
        expect(result.passed).toBe(true);

        // Verify search params were included
        if (searchParams.length > 0) {
          expect(doc.search).toBeDefined();
          expect(doc.search!.length).toBe(searchParams.length);
        }
      });
    }
  });

  describe("index generation", () => {
    it("generates resource index with all categories", () => {
      const index = generateResourceIndex(loader, scope, "5.0.0");
      expect(index).toContain("# FHIR Resource Index");
      expect(index).toContain("## Administration");
      expect(index).toContain("Patient");
      // Check it's reasonable size
      expect(index.length).toBeGreaterThan(500);
      expect(index.length).toBeLessThan(50000);
    });

    it("generates datatype index", () => {
      const index = generateDatatypeIndex(loader, scope);
      expect(index).toContain("## Complex Types");
      expect(index).toContain("## Primitive Types");
      expect(index).toContain("Identifier");
      expect(index).toContain("string");
    });
  });

  describe("value set extraction", () => {
    it("extracts administrative-gender with codes", () => {
      const vs = extractValueSetSummary(loader, "administrative-gender", scope);
      expect(vs).toBeDefined();
      expect(vs!.codes).toContain("male");
    });

    it("extracts all value sets without errors", () => {
      const all = extractAllValueSetSummaries(loader, scope);
      expect(all.length).toBeGreaterThan(500);
    });
  });

  describe("profile delta processing", () => {
    it("processes R5 core profiles", () => {
      const profiles = ["ActualGroup", "vitalsigns", "Observationbmi"];
      for (const name of profiles) {
        const delta = computeDeltaFromLoader(loader, name, scope);
        expect(delta, `${name} delta should exist`).toBeDefined();
        expect(delta!.changes.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("output size budget", () => {
    it("all resource EZF outputs fit in a reasonable context window", () => {
      const resources = [
        "Patient", "Observation", "MedicationRequest", "Condition",
        "Encounter", "Bundle", "Claim", "ExplanationOfBenefit",
      ];
      let totalChars = 0;
      for (const name of resources) {
        const sd = getStructureDefinition(loader, name)!;
        const searchParams = extractSearchParams(loader, name, scope);
        const operations = extractOperations(loader, name, scope);
        const ezf = serialize(sd, { searchParams, operations });
        totalChars += ezf.length;
      }
      // 8 resources should fit well within 100K chars (~25K tokens)
      expect(totalChars).toBeLessThan(100000);
    });
  });
});
