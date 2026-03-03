import { describe, it, expect, beforeAll } from "vitest";
import {
  initLoader,
  getEZF,
  lookupElement,
  createServer,
  getResourceIndex,
  getDatatypeIndex,
  getDatatypeEZF,
  getExamples,
  getSearchParams,
  listIGs,
} from "../src/server.js";
import { searchSpec } from "../src/pipeline/searchIndex.js";

describe("MCP Server", () => {
  beforeAll(async () => {
    await initLoader();
  }, 120000);

  describe("getEZF", () => {
    it("returns EZF text for Patient", () => {
      const ezf = getEZF("Patient");
      expect(ezf).toContain("@format ezf/0.1");
      expect(ezf).toContain("@resource Patient");
      expect(ezf).toContain("@elements");
      expect(ezf).toContain("gender");
    });

    it("includes search params in output", () => {
      const ezf = getEZF("Patient");
      expect(ezf).toContain("@search");
    });

    it("includes operations in output", () => {
      const ezf = getEZF("Patient");
      expect(ezf).toContain("@operations");
      expect(ezf).toContain("$match");
    });

    it("caches results on second call", () => {
      const first = getEZF("Patient");
      const second = getEZF("Patient");
      expect(first).toBe(second);
    });

    it("throws for unknown resource", () => {
      expect(() => getEZF("NotARealResource")).toThrow("not found");
    });
  });

  describe("getResourceIndex", () => {
    it("returns categorized resource index", () => {
      const index = getResourceIndex();
      expect(index).toContain("# FHIR Resource Index");
      expect(index).toContain("## Administration");
      expect(index).toContain("Patient");
    });

    it("caches on second call", () => {
      const first = getResourceIndex();
      const second = getResourceIndex();
      expect(first).toBe(second);
    });
  });

  describe("getDatatypeIndex", () => {
    it("returns datatype index with complex and primitive types", () => {
      const index = getDatatypeIndex();
      expect(index).toContain("## Complex Types");
      expect(index).toContain("## Primitive Types");
      expect(index).toContain("Identifier");
      expect(index).toContain("string");
    });
  });

  describe("getDatatypeEZF", () => {
    it("returns EZF for a complex datatype", () => {
      const ezf = getDatatypeEZF("HumanName");
      expect(ezf).toContain("@datatype HumanName");
      expect(ezf).toContain("@elements");
    });

    it("returns EZF for a primitive datatype", () => {
      const ezf = getDatatypeEZF("string");
      expect(ezf).toContain("@datatype string");
    });

    it("throws for unknown datatype", () => {
      expect(() => getDatatypeEZF("NotAType")).toThrow("not found");
    });

    it("caches results", () => {
      const first = getDatatypeEZF("Identifier");
      const second = getDatatypeEZF("Identifier");
      expect(first).toBe(second);
    });
  });

  describe("lookupElement", () => {
    it("finds top-level element", () => {
      const result = lookupElement("Patient", "gender");
      expect(result).toContain("Patient.gender");
      expect(result).toContain("Cardinality: 0..1");
      expect(result).toContain("Type: code");
      expect(result).toContain("Binding: required");
    });

    it("finds nested element via dot path", () => {
      const result = lookupElement("Patient", "contact.name");
      expect(result).toContain("Patient.contact.name");
      expect(result).toContain("Type: HumanName");
    });

    it("resolves choice types (value[x])", () => {
      const result = lookupElement("Observation", "value[x]");
      expect(result).toContain("Observation.value[x]");
      expect(result).toContain("Quantity");
      expect(result).toContain("CodeableConcept");
      expect(result).toContain("string");
    });

    it("returns available elements when path not found", () => {
      const result = lookupElement("Patient", "nonexistent");
      expect(result).toContain("not found");
      expect(result).toContain("Available:");
      expect(result).toContain("gender");
    });

    it("returns clear error for invalid paths", () => {
      const result = lookupElement("Patient", "gender.nonexistent");
      expect(result).toContain("has no children");
    });

    it("handles element with reference types", () => {
      const result = lookupElement("Patient", "generalPractitioner");
      expect(result).toContain("Reference");
      expect(result).toContain("Organization");
    });

    it("shows flags", () => {
      const result = lookupElement("Patient", "active");
      expect(result).toContain("?!");
      expect(result).toContain("Σ");
    });

    it("shows children list for backbone elements", () => {
      const result = lookupElement("Patient", "contact");
      expect(result).toContain("Children:");
    });
  });

  describe("getExamples", () => {
    it("returns array for any resource type", () => {
      const examples = getExamples("Patient");
      expect(Array.isArray(examples)).toBe(true);
    });

    it("returns CapabilityStatement examples (present in core package)", () => {
      const examples = getExamples("CapabilityStatement");
      expect(examples.length).toBeGreaterThan(0);
      expect(examples[0].resourceType).toBe("CapabilityStatement");
    });

    it("respects count parameter", () => {
      const examples = getExamples("CapabilityStatement", 2);
      expect(examples.length).toBeLessThanOrEqual(2);
    });

    it("returns empty array for resource with no instances in core", () => {
      // Core package doesn't contain Patient example instances
      const examples = getExamples("Patient");
      expect(examples).toEqual([]);
    });
  });

  describe("getSearchParams", () => {
    it("returns search params for Patient", () => {
      const params = getSearchParams("Patient");
      expect(params.length).toBeGreaterThan(5);
    });

    it("includes name, type, and expression", () => {
      const params = getSearchParams("Patient");
      const genderParam = params.find((p) => p.name === "gender");
      expect(genderParam).toBeDefined();
      expect(genderParam!.type).toBe("token");
      expect(genderParam!.expression).toBeTruthy();
    });

    it("returns params for Observation", () => {
      const params = getSearchParams("Observation");
      expect(params.length).toBeGreaterThan(5);
    });

    it("returns empty array for unknown resource", () => {
      const params = getSearchParams("NotAResource");
      expect(params).toEqual([]);
    });
  });

  describe("search_spec (via searchSpec)", () => {
    it("finds Patient via search index", () => {
      const results = searchSpec("Patient");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("Patient");
    });
  });

  describe("listIGs", () => {
    it("lists the default R5 core package", () => {
      const packages = listIGs();
      expect(packages.length).toBeGreaterThan(0);
      expect(packages[0].name).toBe("hl7.fhir.r5.core");
      expect(packages[0].version).toBe("5.0.0");
      expect(packages[0].artifactCount).toBeGreaterThan(100);
    });
  });

  describe("createServer", () => {
    it("creates an MCP server instance", () => {
      const server = createServer();
      expect(server).toBeDefined();
    });
  });
});
