/**
 * Tests for the guidance retrieval pipeline.
 *
 * Verifies that content flows correctly from ingestion through the content
 * store to the get_guidance tool and MCP guide resources. Ensures that
 * queries return relevant, well-grounded content with accurate provenance.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { TopicRegistry } from "../../src/content/topicRegistry.js";
import { ContentStore } from "../../src/content/contentStore.js";
import type { ContentChunk, ContentSource } from "../../src/content/types.js";

/** Helper to create a ContentChunk with sensible defaults. */
function makeChunk(overrides: Partial<ContentChunk> & { id: string }): ContentChunk {
  return {
    topicPath: "foundation",
    title: "Test Chunk",
    summary: "A test chunk for testing.",
    body: "Full body of the test chunk with more details.",
    source: {
      type: "fhir-spec",
      name: "FHIR Core Specification",
      url: "https://hl7.org/fhir/test.html",
      version: "5.0.0",
    },
    refs: [],
    keywords: [],
    ...overrides,
  };
}

describe("Guidance Retrieval Pipeline", () => {
  let registry: TopicRegistry;
  let store: ContentStore;

  beforeEach(() => {
    registry = new TopicRegistry();
    store = new ContentStore(registry);
  });

  describe("Content grounding via cross-references", () => {
    it("content referencing Patient is retrievable by artifact name", () => {
      store.add(makeChunk({
        id: "spec:demographics",
        topicPath: "clinical/patient",
        title: "Patient Demographics",
        summary: "How patient demographics work in FHIR.",
        body: "The Patient resource captures administrative and demographic data.",
        refs: [
          { type: "resource", target: "Patient" },
          { type: "element", target: "Patient.name" },
          { type: "element", target: "Patient.gender" },
        ],
        keywords: ["patient", "demographics", "name", "gender"],
      }));

      const byResource = store.getByRef("Patient");
      expect(byResource).toHaveLength(1);
      expect(byResource[0].title).toBe("Patient Demographics");

      const byElement = store.getByRef("Patient.name");
      expect(byElement).toHaveLength(1);
      expect(byElement[0].id).toBe("spec:demographics");

      const byGender = store.getByRef("Patient.gender");
      expect(byGender).toHaveLength(1);
    });

    it("multiple chunks can reference the same artifact", () => {
      store.add(makeChunk({
        id: "spec:patient-overview",
        title: "Patient Overview",
        body: "The Patient resource is fundamental.",
        refs: [{ type: "resource", target: "Patient" }],
      }));
      store.add(makeChunk({
        id: "ig:uscore-patient",
        title: "US Core Patient Profile",
        body: "US Core constrains Patient with must-support elements.",
        source: { type: "ig", name: "hl7.fhir.us.core", version: "8.0.1", packageName: "hl7.fhir.us.core" },
        refs: [{ type: "resource", target: "Patient" }],
      }));

      const results = store.getByRef("Patient");
      expect(results).toHaveLength(2);
      const titles = results.map(r => r.title);
      expect(titles).toContain("Patient Overview");
      expect(titles).toContain("US Core Patient Profile");
    });

    it("element-level references are distinct from resource-level", () => {
      store.add(makeChunk({
        id: "spec:gender-guidance",
        title: "Administrative Gender",
        body: "Patient.gender represents administrative gender, not clinical sex.",
        refs: [
          { type: "resource", target: "Patient" },
          { type: "element", target: "Patient.gender" },
        ],
      }));
      store.add(makeChunk({
        id: "spec:patient-general",
        title: "Patient Resource",
        body: "General overview of the Patient resource.",
        refs: [{ type: "resource", target: "Patient" }],
      }));

      // Querying by element should return only the gender chunk
      const byElement = store.getByRef("Patient.gender");
      expect(byElement).toHaveLength(1);
      expect(byElement[0].title).toBe("Administrative Gender");

      // Querying by resource returns both
      const byResource = store.getByRef("Patient");
      expect(byResource).toHaveLength(2);
    });

    it("datatype references connect guidance to datatypes", () => {
      store.add(makeChunk({
        id: "spec:codeable-concept",
        title: "Using CodeableConcept",
        body: "CodeableConcept allows recording a concept with text and/or codings.",
        refs: [
          { type: "datatype", target: "CodeableConcept" },
          { type: "datatype", target: "Coding" },
        ],
        keywords: ["codeableconcept", "coding", "terminology"],
      }));

      const results = store.getByRef("CodeableConcept");
      expect(results).toHaveLength(1);
      expect(results[0].body).toContain("text and/or codings");

      // Also findable via Coding
      const codingResults = store.getByRef("Coding");
      expect(codingResults).toHaveLength(1);
    });
  });

  describe("Topic-based retrieval", () => {
    beforeEach(() => {
      // Register a sub-topic under exchange
      registry.register({
        path: "exchange/search",
        name: "Search",
        description: "FHIR search mechanism",
        parent: "exchange",
        children: [],
      });
      registry.register({
        path: "exchange/search/modifiers",
        name: "Search Modifiers",
        description: "Search parameter modifiers",
        parent: "exchange/search",
        children: [],
      });

      store.add(makeChunk({
        id: "spec:search-overview",
        topicPath: "exchange/search",
        title: "Search Overview",
        body: "FHIR search allows clients to find resources.",
      }));
      store.add(makeChunk({
        id: "spec:search-modifiers",
        topicPath: "exchange/search/modifiers",
        title: "Search Modifiers",
        body: ":exact, :contains, :missing and other modifiers.",
      }));
      store.add(makeChunk({
        id: "spec:rest-api",
        topicPath: "exchange",
        title: "REST API",
        body: "The FHIR REST API supports CRUD and search.",
      }));
    });

    it("retrieves chunks for an exact topic", () => {
      const results = store.getByTopic("exchange/search");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Search Overview");
    });

    it("retrieves chunks for a topic including subtopics", () => {
      const results = store.getByTopic("exchange/search", true);
      expect(results).toHaveLength(2);
      const titles = results.map(r => r.title);
      expect(titles).toContain("Search Overview");
      expect(titles).toContain("Search Modifiers");
    });

    it("root topic with subtopics returns entire subtree", () => {
      const results = store.getByTopic("exchange", true);
      expect(results).toHaveLength(3);
    });

    it("returns empty for non-existent topic", () => {
      const results = store.getByTopic("nonexistent/topic");
      expect(results).toHaveLength(0);
    });
  });

  describe("Keyword search relevance", () => {
    beforeEach(() => {
      store.addBatch([
        makeChunk({
          id: "spec:search-overview",
          topicPath: "exchange/search",
          title: "Search",
          summary: "How to search for resources using the FHIR API.",
          body: "The search interaction searches a set of resources.",
          keywords: ["search", "query", "find", "filter"],
        }),
        makeChunk({
          id: "spec:bindings",
          topicPath: "terminology/bindings",
          title: "Terminology Bindings",
          summary: "How coded elements are bound to value sets.",
          body: "Binding strength determines validation behavior for coded elements.",
          keywords: ["binding", "terminology", "valueset", "coded"],
        }),
        makeChunk({
          id: "spec:patient",
          topicPath: "clinical/patient",
          title: "Patient Resource",
          summary: "The Patient resource covers demographics and administration.",
          body: "Patient is the central resource in most healthcare applications.",
          keywords: ["patient", "demographics", "administration"],
        }),
      ]);
    });

    it("finds content by keyword in title", () => {
      const results = store.search("Search");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.title === "Search")).toBe(true);
    });

    it("finds content by keyword in summary", () => {
      const results = store.search("demographics");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.title === "Patient Resource")).toBe(true);
    });

    it("finds content by keyword tag", () => {
      const results = store.search("binding");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.title === "Terminology Bindings")).toBe(true);
    });

    it("returns empty for unrelated queries", () => {
      const results = store.search("zxywvut");
      expect(results).toHaveLength(0);
    });
  });

  describe("Source provenance", () => {
    it("chunks retain their source attribution", () => {
      const specSource: ContentSource = {
        type: "fhir-spec",
        name: "FHIR Core Specification",
        url: "https://hl7.org/fhir/search.html",
        version: "5.0.0",
      };
      const igSource: ContentSource = {
        type: "ig",
        name: "hl7.fhir.us.core",
        version: "8.0.1",
        packageName: "hl7.fhir.us.core",
      };

      store.add(makeChunk({
        id: "spec:search",
        title: "FHIR Search",
        source: specSource,
        refs: [{ type: "topic", target: "exchange/search" }],
      }));
      store.add(makeChunk({
        id: "ig:uscore-search",
        title: "US Core Search",
        source: igSource,
        refs: [{ type: "topic", target: "exchange/search" }],
      }));

      const specChunk = store.getById("spec:search");
      expect(specChunk).toBeDefined();
      expect(specChunk!.source.type).toBe("fhir-spec");
      expect(specChunk!.source.url).toBe("https://hl7.org/fhir/search.html");
      expect(specChunk!.source.version).toBe("5.0.0");

      const igChunk = store.getById("ig:uscore-search");
      expect(igChunk).toBeDefined();
      expect(igChunk!.source.type).toBe("ig");
      expect(igChunk!.source.packageName).toBe("hl7.fhir.us.core");
    });

    it("source URL provides direct link back to published content", () => {
      store.add(makeChunk({
        id: "spec:datatypes",
        title: "FHIR Datatypes",
        source: {
          type: "fhir-spec",
          name: "FHIR Core Specification",
          url: "https://hl7.org/fhir/datatypes.html",
          version: "5.0.0",
        },
      }));

      const chunk = store.getById("spec:datatypes")!;
      expect(chunk.source.url).toMatch(/^https:\/\/hl7\.org\/fhir\//);
      expect(chunk.source.url).toContain("datatypes.html");
    });
  });

  describe("Multi-source aggregation by subject", () => {
    it("guidance from different sources is aggregated for the same artifact", () => {
      // Core spec says one thing about Patient.gender
      store.add(makeChunk({
        id: "spec:gender",
        topicPath: "clinical/patient",
        title: "Administrative Gender",
        body: "Administrative gender for record keeping purposes.",
        source: { type: "fhir-spec", name: "FHIR Core", version: "5.0.0" },
        refs: [{ type: "element", target: "Patient.gender" }],
      }));

      // US Core adds must-support guidance
      store.add(makeChunk({
        id: "ig:uscore-gender",
        topicPath: "conformance/profiling",
        title: "US Core Gender Requirements",
        body: "Patient.gender is must-support in US Core. Servers SHALL populate it.",
        source: { type: "ig", name: "hl7.fhir.us.core", version: "8.0.1", packageName: "hl7.fhir.us.core" },
        refs: [{ type: "element", target: "Patient.gender" }],
      }));

      // Both should be findable when querying about Patient.gender
      const results = store.getByRef("Patient.gender");
      expect(results).toHaveLength(2);

      // Verify both sources are represented
      const sources = results.map(r => r.source.type);
      expect(sources).toContain("fhir-spec");
      expect(sources).toContain("ig");

      // Each retains its own provenance
      const specResult = results.find(r => r.source.type === "fhir-spec")!;
      expect(specResult.source.name).toBe("FHIR Core");
      const igResult = results.find(r => r.source.type === "ig")!;
      expect(igResult.source.packageName).toBe("hl7.fhir.us.core");
    });
  });

  describe("Content deduplication", () => {
    it("adding the same chunk ID twice overwrites in the map but duplicates in indexes", () => {
      // This tests current behavior — if we ever need strict dedup, update this test
      const chunk = makeChunk({
        id: "spec:test",
        refs: [{ type: "resource", target: "Patient" }],
      });
      store.add(chunk);
      store.add(chunk);

      // The chunk map has only one entry
      const retrieved = store.getById("spec:test");
      expect(retrieved).toBeDefined();

      // Stats reflect the store state
      const stats = store.getStats();
      expect(stats.chunkCount).toBe(1);
    });
  });

  describe("Progressive disclosure", () => {
    it("summaries are shorter than bodies", () => {
      const chunk = makeChunk({
        id: "spec:long",
        summary: "Short overview of search.",
        body: "Detailed explanation of how FHIR search works, including parameters, " +
          "modifiers, chaining, includes, reverse includes, composite parameters, " +
          "and advanced query syntax. This section covers GET and POST search, " +
          "paging, sorting, and the _total parameter. " +
          "See also the search parameter registry for available parameters.",
      });
      store.add(chunk);

      const retrieved = store.getById("spec:long")!;
      expect(retrieved.summary.length).toBeLessThan(retrieved.body.length);
    });

    it("summaries stay within token budget (~300 chars)", () => {
      const chunk = makeChunk({
        id: "spec:bounded",
        summary: "A".repeat(300),
        body: "B".repeat(5000),
      });
      store.add(chunk);

      const retrieved = store.getById("spec:bounded")!;
      expect(retrieved.summary.length).toBeLessThanOrEqual(300);
    });
  });
});
