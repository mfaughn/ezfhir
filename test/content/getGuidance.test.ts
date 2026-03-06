/**
 * Tests for the getGuidance() function and MCP guide resources.
 *
 * These tests use the actual server's content store and verify that
 * the guidance retrieval tool works correctly with populated content.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  getGuidance,
  getContentStore,
  getTopicRegistry,
} from "../../src/server.js";
import { TopicRegistry } from "../../src/content/topicRegistry.js";
import { ContentStore } from "../../src/content/contentStore.js";
import { extractPageContent } from "../../src/pipeline/specPageExtractor.js";

/**
 * Populates the content store with realistic content for testing.
 * This simulates what would happen after loading FHIR spec pages.
 */
function populateTestContent(store: ContentStore, registry: TopicRegistry): void {
  // Register sub-topics
  const subtopics = [
    { path: "exchange/search", name: "Search", description: "FHIR search mechanism", parent: "exchange" },
    { path: "exchange/rest-api", name: "REST API", description: "FHIR REST interactions", parent: "exchange" },
    { path: "terminology/bindings", name: "Bindings", description: "Terminology bindings", parent: "terminology" },
    { path: "foundation/datatypes", name: "Datatypes", description: "FHIR datatypes", parent: "foundation" },
    { path: "clinical/patient", name: "Patient", description: "Patient resource guidance", parent: "clinical" },
  ];
  for (const t of subtopics) {
    try {
      registry.register({ ...t, children: [] });
    } catch {
      // Topic may already exist
    }
  }

  // Simulate content from different sources
  store.addBatch([
    {
      id: "spec:search-intro",
      topicPath: "exchange/search",
      title: "Search Introduction",
      summary: "FHIR search allows clients to query for resources using parameters.",
      body: "The search interaction allows clients to filter and retrieve resources " +
        "from a FHIR server. Searches use parameter=value pairs. Results are returned " +
        "in a Bundle resource. Search supports modifiers like :exact and :contains.",
      source: { type: "fhir-spec", name: "FHIR Core Specification", url: "https://hl7.org/fhir/search.html", version: "5.0.0" },
      refs: [
        { type: "resource", target: "Bundle" },
        { type: "topic", target: "exchange/rest-api" },
      ],
      keywords: ["search", "query", "parameter", "filter", "bundle"],
    },
    {
      id: "spec:search-modifiers",
      topicPath: "exchange/search",
      title: "Search Modifiers",
      summary: "Modifiers alter search parameter behavior.",
      body: "Modifiers are appended to parameter names with a colon. " +
        ":exact requires an exact match for string parameters. " +
        ":contains matches anywhere within the string. " +
        ":missing tests for presence/absence of a value.",
      source: { type: "fhir-spec", name: "FHIR Core Specification", url: "https://hl7.org/fhir/search.html#modifiers", version: "5.0.0" },
      refs: [],
      keywords: ["modifier", "exact", "contains", "missing", "search"],
    },
    {
      id: "spec:patient-demographics",
      topicPath: "clinical/patient",
      title: "Patient Demographics",
      summary: "Patient resource captures administrative and demographic information.",
      body: "The Patient resource covers data about individuals receiving care. " +
        "Key elements include Patient.name, Patient.gender, Patient.birthDate, " +
        "and Patient.address. Patient.gender uses a required binding to " +
        "AdministrativeGender value set.",
      source: { type: "fhir-spec", name: "FHIR Core Specification", url: "https://hl7.org/fhir/patient.html", version: "5.0.0" },
      refs: [
        { type: "resource", target: "Patient" },
        { type: "element", target: "Patient.name" },
        { type: "element", target: "Patient.gender" },
        { type: "element", target: "Patient.birthDate" },
        { type: "element", target: "Patient.address" },
      ],
      keywords: ["patient", "demographics", "name", "gender", "birthdate"],
    },
    {
      id: "ig:uscore-patient",
      topicPath: "conformance/profiling",
      title: "US Core Patient Profile",
      summary: "US Core constrains Patient with must-support elements for US healthcare.",
      body: "The US Core Patient Profile requires must-support on key elements: " +
        "Patient.name, Patient.gender, Patient.birthDate. " +
        "Servers SHALL populate these when data is available. " +
        "Race and ethnicity are captured via US Core extensions.",
      source: { type: "ig", name: "hl7.fhir.us.core", version: "8.0.1", packageName: "hl7.fhir.us.core" },
      refs: [
        { type: "resource", target: "Patient" },
        { type: "element", target: "Patient.name" },
        { type: "element", target: "Patient.gender" },
        { type: "element", target: "Patient.birthDate" },
      ],
      keywords: ["patient", "uscore", "must-support", "profile"],
    },
    {
      id: "spec:codeableconcept",
      topicPath: "foundation/datatypes",
      title: "CodeableConcept Datatype",
      summary: "CodeableConcept represents a concept with optional coding representations.",
      body: "CodeableConcept is used for elements bound to value sets. " +
        "It allows multiple Coding entries plus a text fallback. " +
        "When the binding strength is required, at least one Coding must " +
        "come from the bound ValueSet.",
      source: { type: "fhir-spec", name: "FHIR Core Specification", url: "https://hl7.org/fhir/datatypes.html#CodeableConcept", version: "5.0.0" },
      refs: [
        { type: "datatype", target: "CodeableConcept" },
        { type: "datatype", target: "Coding" },
      ],
      keywords: ["codeableconcept", "coding", "terminology", "binding", "valueset"],
    },
    {
      id: "spec:bindings",
      topicPath: "terminology/bindings",
      title: "Terminology Bindings",
      summary: "How coded elements are bound to value sets with different strengths.",
      body: "Binding strength determines validation rules for coded elements. " +
        "Required: code must come from the value set. " +
        "Extensible: code should come from the value set if a suitable code exists. " +
        "Preferred: encouraged but not required. " +
        "Example: illustrative only.",
      source: { type: "fhir-spec", name: "FHIR Core Specification", url: "https://hl7.org/fhir/terminologies.html#bindings", version: "5.0.0" },
      refs: [
        { type: "topic", target: "terminology/overview" },
      ],
      keywords: ["binding", "required", "extensible", "preferred", "example", "terminology", "validation"],
    },
  ]);
}

describe("getGuidance", () => {
  beforeAll(() => {
    const store = getContentStore();
    const registry = getTopicRegistry();
    store.clear();
    populateTestContent(store, registry);
  });

  describe("artifact-based queries", () => {
    it("finds guidance about Patient via ref index", () => {
      const results = getGuidance("Patient");
      expect(results.length).toBeGreaterThanOrEqual(2);

      // Should include both core spec and US Core content
      const titles = results.map(r => r.title);
      expect(titles).toContain("Patient Demographics");
      expect(titles).toContain("US Core Patient Profile");
    });

    it("finds guidance about Patient.gender specifically", () => {
      const results = getGuidance("Patient.gender");
      expect(results.length).toBeGreaterThanOrEqual(1);

      // All results should actually mention Patient.gender
      for (const r of results) {
        const mentionsGender = r.body.includes("Patient.gender") ||
          r.refs.some(ref => ref.target === "Patient.gender");
        expect(mentionsGender).toBe(true);
      }
    });

    it("finds guidance about CodeableConcept datatype", () => {
      const results = getGuidance("CodeableConcept");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].body).toContain("CodeableConcept");
    });

    it("finds guidance about Bundle via ref", () => {
      const results = getGuidance("Bundle");
      expect(results.length).toBeGreaterThanOrEqual(1);
      // The search intro references Bundle
      expect(results.some(r => r.title === "Search Introduction")).toBe(true);
    });
  });

  describe("topic-based queries", () => {
    it("finds content by topic path", () => {
      const results = getGuidance("exchange/search");
      expect(results.length).toBeGreaterThanOrEqual(2);
      const titles = results.map(r => r.title);
      expect(titles).toContain("Search Introduction");
      expect(titles).toContain("Search Modifiers");
    });

    it("finds content by parent topic path", () => {
      const results = getGuidance("terminology/bindings");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toBe("Terminology Bindings");
    });
  });

  describe("keyword-based queries", () => {
    it("finds content by keyword when no ref or topic match", () => {
      const results = getGuidance("modifier");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.title.includes("Modifier"))).toBe(true);
    });

    it("finds content about 'binding' across topics", () => {
      const results = getGuidance("binding");
      expect(results.length).toBeGreaterThanOrEqual(2);
      // Should find both the dedicated bindings section and the CodeableConcept section
      const topics = new Set(results.map(r => r.topicPath));
      expect(topics.size).toBeGreaterThanOrEqual(2);
    });

    it("finds content about 'must-support' from IG content", () => {
      const results = getGuidance("must-support");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.source.type === "ig")).toBe(true);
    });
  });

  describe("result quality", () => {
    it("deduplicates results across retrieval methods", () => {
      // Patient demographics should appear once even if found by ref AND keyword
      const results = getGuidance("Patient");
      const ids = results.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it("respects the limit parameter", () => {
      const results = getGuidance("Patient", 1);
      expect(results).toHaveLength(1);
    });

    it("every result has source provenance", () => {
      const results = getGuidance("Patient");
      for (const r of results) {
        expect(r.source).toBeDefined();
        expect(r.source.type).toBeTruthy();
        expect(r.source.name).toBeTruthy();
      }
    });

    it("every result has a non-empty summary", () => {
      const results = getGuidance("Patient");
      for (const r of results) {
        expect(r.summary.length).toBeGreaterThan(0);
      }
    });

    it("every result has a non-empty body", () => {
      const results = getGuidance("search");
      for (const r of results) {
        expect(r.body.length).toBeGreaterThan(0);
      }
    });

    it("returns empty array for completely unknown queries", () => {
      const results = getGuidance("zyxwvutsrqp");
      expect(results).toHaveLength(0);
    });
  });

  describe("multi-source aggregation", () => {
    it("aggregates core spec and IG content for the same artifact", () => {
      const results = getGuidance("Patient.name");
      expect(results.length).toBeGreaterThanOrEqual(2);

      const sourceTypes = new Set(results.map(r => r.source.type));
      expect(sourceTypes.has("fhir-spec")).toBe(true);
      expect(sourceTypes.has("ig")).toBe(true);
    });

    it("each source retains its own provenance URL", () => {
      const results = getGuidance("Patient");
      const specResult = results.find(r => r.source.type === "fhir-spec");
      expect(specResult!.source.url).toContain("hl7.org/fhir");

      const igResult = results.find(r => r.source.type === "ig");
      expect(igResult!.source.packageName).toBe("hl7.fhir.us.core");
    });
  });
});

describe("Guide Resources", () => {
  beforeAll(() => {
    const store = getContentStore();
    const registry = getTopicRegistry();
    store.clear();
    populateTestContent(store, registry);
  });

  describe("fhir://guide/index", () => {
    it("topic registry renders a readable index", () => {
      const registry = getTopicRegistry();
      const index = registry.renderIndex();
      expect(index).toContain("foundation");
      expect(index).toContain("exchange");
      expect(index).toContain("terminology");
      expect(index).toContain("security");
      expect(index).toContain("clinical");
      expect(index).toContain("workflow");
    });

    it("content store reports accurate stats", () => {
      const store = getContentStore();
      const stats = store.getStats();
      expect(stats.chunkCount).toBe(6); // 6 chunks in test content
      expect(stats.topicCount).toBeGreaterThanOrEqual(4);
      expect(stats.refCount).toBeGreaterThanOrEqual(5);
    });
  });

  describe("fhir://guide/{topicId}", () => {
    it("retrieves content for a topic with subtopics", () => {
      const store = getContentStore();
      const chunks = store.getByTopic("exchange/search", true);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty for non-existent topic", () => {
      const store = getContentStore();
      const chunks = store.getByTopic("nonexistent/topic");
      expect(chunks).toHaveLength(0);
    });
  });
});
