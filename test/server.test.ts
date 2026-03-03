import { describe, it, expect, beforeAll } from "vitest";
import {
  initLoader,
  getEZF,
  lookupElement,
  createServer,
} from "../src/server.js";

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

    it("caches results on second call", () => {
      const first = getEZF("Patient");
      const second = getEZF("Patient");
      // Same reference means cache hit
      expect(first).toBe(second);
    });

    it("throws for unknown resource", () => {
      expect(() => getEZF("NotARealResource")).toThrow("not found");
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

    it("returns available elements when path not found", () => {
      const result = lookupElement("Patient", "nonexistent");
      expect(result).toContain("not found");
      expect(result).toContain("Available:");
      expect(result).toContain("gender");
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

  describe("createServer", () => {
    it("creates an MCP server instance", () => {
      const server = createServer();
      expect(server).toBeDefined();
    });
  });
});
