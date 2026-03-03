import { describe, it, expect, beforeAll } from "vitest";
import { serialize } from "../../src/converter/serializer.js";
import type { SerializeOptions } from "../../src/converter/serializer.js";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

describe("EZF Serializer", () => {
  let loader: FPLPackageLoader;
  let patientSD: Record<string, unknown>;

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
    patientSD = getStructureDefinition(loader, "Patient")!;
  }, 120000);

  describe("serialize Patient", () => {
    let output: string;

    beforeAll(() => {
      const options: SerializeOptions = {
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
      };
      output = serialize(patientSD, options);
    });

    it("starts with @format directive", () => {
      expect(output.startsWith("@format ezf/0.1\n")).toBe(true);
    });

    it("has correct type directive", () => {
      expect(output).toContain("@resource Patient : DomainResource");
    });

    it("includes description metadata", () => {
      expect(output).toContain("@description");
    });

    it("includes scope metadata", () => {
      expect(output).toContain("@scope Patient Administration");
    });

    it("includes compartment metadata", () => {
      expect(output).toContain("@compartment Patient (subject)");
    });

    it("has @elements section", () => {
      expect(output).toContain("@elements");
    });

    it("excludes inherited DomainResource elements", () => {
      const lines = output.split("\n");
      const elementLines = lines.filter(
        (l) => !l.startsWith("@") && !l.startsWith("//") && l.trim() !== ""
      );
      // Should not have lines for 'id', 'meta', 'text', etc. at root level
      const rootElements = elementLines
        .filter((l) => !l.startsWith("  ")) // non-indented = root level
        .map((l) => l.trim().split(/\s+/)[0]);

      expect(rootElements).not.toContain("id");
      expect(rootElements).not.toContain("meta");
      expect(rootElements).not.toContain("implicitRules");
      expect(rootElements).not.toContain("language");
      expect(rootElements).not.toContain("text");
      expect(rootElements).not.toContain("contained");
      expect(rootElements).not.toContain("extension");
      expect(rootElements).not.toContain("modifierExtension");
    });

    it("includes identifier element with correct cardinality and type", () => {
      expect(output).toMatch(/identifier\s+:\s+0\.\.\*\s+Identifier/);
    });

    it("includes active element with modifier and summary flags", () => {
      expect(output).toMatch(/active\s+:\s+0\.\.1\s+boolean\s+\[\?\!Σ\]/);
    });

    it("includes gender element with summary flag", () => {
      expect(output).toMatch(/gender\s+:\s+0\.\.1\s+code\s+\[Σ\]/);
    });

    it("includes required binding for gender", () => {
      // Find the gender line, then the next line should be the binding
      const lines = output.split("\n");
      const genderIdx = lines.findIndex((l) => /^\s*gender\s+:/.test(l));
      expect(genderIdx).toBeGreaterThan(-1);
      const bindingLine = lines[genderIdx + 1];
      expect(bindingLine).toMatch(
        /\s+@binding required http:\/\/hl7\.org\/fhir\/ValueSet\/administrative-gender/
      );
    });

    it("includes deceased[x] as choice type", () => {
      expect(output).toMatch(
        /deceased\[x\]\s+:\s+0\.\.1\s+boolean\|dateTime\s+\[\?\!Σ\]/
      );
    });

    it("includes contact as BackboneElement with children", () => {
      expect(output).toMatch(/contact\s+:\s+0\.\.\*\s+BackboneElement/);
      // Children should be indented
      expect(output).toMatch(/\s{2}relationship\s+:\s+0\.\.\*\s+CodeableConcept/);
      expect(output).toMatch(/\s{2}name\s+:\s+0\.\.1\s+HumanName/);
    });

    it("includes generalPractitioner with reference targets in alphabetical order", () => {
      expect(output).toMatch(
        /generalPractitioner\s+:\s+0\.\.\*\s+Reference\(Organization\|Practitioner\|PractitionerRole\)/
      );
    });

    it("includes link as modifier backbone with children", () => {
      expect(output).toMatch(/link\s+:\s+0\.\.\*\s+BackboneElement\s+\[\?\!Σ\]/);
      expect(output).toMatch(
        /\s{2}other\s+:\s+1\.\.1\s+Reference\(Patient\|RelatedPerson\)/
      );
    });

    it("includes link.type with required binding", () => {
      const lines = output.split("\n");
      const typeIdx = lines.findIndex(
        (l) => /^\s{2}type\s+:\s+1\.\.1\s+code/.test(l)
      );
      expect(typeIdx).toBeGreaterThan(-1);
      const bindingLine = lines[typeIdx + 1];
      expect(bindingLine).toMatch(/@binding required/);
      expect(bindingLine).toMatch(/link-type/);
    });

    it("includes communication backbone with required language binding", () => {
      expect(output).toMatch(
        /communication\s+:\s+0\.\.\*\s+BackboneElement/
      );
      expect(output).toMatch(/\s{2}language\s+:\s+1\.\.1\s+CodeableConcept/);
    });

    it("includes search parameters section", () => {
      expect(output).toContain("@search");
      expect(output).toMatch(/name\s+:\s+string\s+\(HumanName\)/);
      expect(output).toMatch(/identifier\s+:\s+token\s+\(Identifier\)/);
    });

    it("includes operations section", () => {
      expect(output).toContain("@operations");
      expect(output).toContain("$everything");
      expect(output).toContain("$match");
      expect(output).toContain("$merge");
    });

    it("includes invariants section", () => {
      expect(output).toContain("@invariants");
      expect(output).toMatch(/pat-1/);
    });

    it("does not include example bindings", () => {
      // maritalStatus has extensible binding (should be included)
      expect(output).toMatch(/@binding extensible.*marital-status/);
      // But we should not see any "example" strength bindings
      expect(output).not.toMatch(/@binding example/);
    });

    it("produces reasonable output length", () => {
      // Patient EZF should be roughly 2000-3500 characters
      expect(output.length).toBeGreaterThan(1500);
      expect(output.length).toBeLessThan(5000);
    });
  });

  describe("serializer edge cases", () => {
    it("throws on SD without snapshot", () => {
      expect(() =>
        serialize({ name: "Test", resourceType: "StructureDefinition" })
      ).toThrow("has no snapshot elements");
    });

    it("serializes Observation (choice type with many options)", () => {
      const obsSD = getStructureDefinition(loader, "Observation")!;
      const output = serialize(obsSD);

      expect(output).toContain("@resource Observation");
      // value[x] should have multiple types
      expect(output).toMatch(/value\[x\]/);
    });

    it("handles contentReference elements", () => {
      const qSD = getStructureDefinition(loader, "Questionnaire")!;
      const output = serialize(qSD);

      // Questionnaire.item.item should be @ref(Questionnaire.item)
      expect(output).toMatch(/@ref\(Questionnaire\.item\)/);
    });
  });
});
