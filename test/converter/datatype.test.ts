import { describe, it, expect, beforeAll } from "vitest";
import { serialize } from "../../src/converter/serializer.js";
import { parse } from "../../src/converter/parser.js";
import { verify } from "../../src/converter/verifier.js";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

describe("Datatype Conversion", () => {
  let loader: FPLPackageLoader;

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
  }, 120000);

  const complexTypes = [
    "Identifier",
    "CodeableConcept",
    "HumanName",
    "Address",
    "ContactPoint",
    "Period",
    "Quantity",
    "Range",
    "Ratio",
    "Coding",
    "Attachment",
    "Reference",
    "Annotation",
    "Signature",
    "Timing",
    "Dosage",
    "Meta",
    "Money",
    "Age",
    "Duration",
    "SampledData",
  ];

  const primitiveTypes = [
    "string",
    "boolean",
    "integer",
    "decimal",
    "uri",
    "url",
    "canonical",
    "code",
    "date",
    "dateTime",
    "instant",
    "time",
    "id",
    "markdown",
    "oid",
    "uuid",
    "base64Binary",
    "positiveInt",
    "unsignedInt",
  ];

  describe("complex datatypes", () => {
    for (const name of complexTypes) {
      it(`serializes ${name} as @datatype`, () => {
        const sd = getStructureDefinition(loader, name);
        expect(sd, `${name} not found`).toBeDefined();
        const ezf = serialize(sd!);
        expect(ezf).toContain("@format ezf/0.1");
        expect(ezf).toContain(`@datatype ${name}`);
        expect(ezf).toContain("@elements");
      });
    }

    it("Identifier has expected elements", () => {
      const sd = getStructureDefinition(loader, "Identifier")!;
      const ezf = serialize(sd);
      const doc = parse(ezf);
      expect(doc.type).toBe("datatype");
      expect(doc.name).toBe("Identifier");
      const paths = doc.elements!.map((e) => e.path);
      expect(paths).toContain("use");
      expect(paths).toContain("system");
      expect(paths).toContain("value");
      expect(paths).toContain("period");
    });

    it("CodeableConcept round-trips correctly", () => {
      const sd = getStructureDefinition(loader, "CodeableConcept")!;
      const ezf = serialize(sd);
      const doc = parse(ezf);
      expect(doc.elements).toBeDefined();
      const result = verify(doc.elements!, sd);
      expect(result.passed).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    });

    it("HumanName round-trips correctly", () => {
      const sd = getStructureDefinition(loader, "HumanName")!;
      const ezf = serialize(sd);
      const doc = parse(ezf);
      expect(doc.elements).toBeDefined();
      const result = verify(doc.elements!, sd);
      expect(result.passed).toBe(true);
    });

    it("Timing with nested BackboneElement round-trips", () => {
      const sd = getStructureDefinition(loader, "Timing")!;
      const ezf = serialize(sd);
      const doc = parse(ezf);
      expect(doc.elements).toBeDefined();
      // Timing.repeat is a BackboneElement
      const repeat = doc.elements!.find((e) => e.path === "repeat");
      expect(repeat).toBeDefined();
      expect(repeat!.children).toBeDefined();
      expect(repeat!.children!.length).toBeGreaterThan(0);
    });
  });

  describe("primitive datatypes", () => {
    for (const name of primitiveTypes) {
      it(`serializes ${name} as @datatype`, () => {
        const sd = getStructureDefinition(loader, name);
        expect(sd, `${name} not found`).toBeDefined();
        const ezf = serialize(sd!);
        expect(ezf).toContain("@format ezf/0.1");
        expect(ezf).toContain(`@datatype ${name}`);
      });
    }

    it("primitive types have minimal elements", () => {
      // Primitive types should have only 'value' after filtering inherited elements
      const sd = getStructureDefinition(loader, "string")!;
      const ezf = serialize(sd);
      const doc = parse(ezf);
      // After filtering id/extension, should have just 'value'
      expect(doc.elements).toBeDefined();
      expect(doc.elements!.length).toBeLessThanOrEqual(2);
    });
  });

  describe("round-trip verification for complex types", () => {
    const keyTypes = [
      "Identifier",
      "CodeableConcept",
      "HumanName",
      "Address",
      "ContactPoint",
      "Quantity",
      "Timing",
      "Dosage",
      "Meta",
    ];

    for (const name of keyTypes) {
      it(`${name} round-trips with 0 mismatches`, () => {
        const sd = getStructureDefinition(loader, name)!;
        const ezf = serialize(sd);
        const doc = parse(ezf);
        expect(doc.elements).toBeDefined();
        const result = verify(doc.elements!, sd);

        if (!result.passed) {
          console.log(
            `${name} mismatches:`,
            JSON.stringify(result.mismatches.slice(0, 3), null, 2)
          );
          console.log(`${name} missing:`, result.missingInEZF.slice(0, 3));
        }

        expect(result.passed).toBe(true);
      });
    }
  });
});
