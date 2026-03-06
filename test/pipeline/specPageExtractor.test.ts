import { describe, it, expect } from "vitest";
import {
  extractRefs,
  getTopicPath,
  extractPageContent,
  getPageTopicMappings,
  PRIORITY_PAGES,
} from "../../src/pipeline/specPageExtractor.js";

describe("specPageExtractor", () => {
  describe("getTopicPath", () => {
    it("maps search.html to exchange/search", () => {
      expect(getTopicPath("search.html")).toBe("exchange/search");
    });

    it("maps datatypes.html to foundation/datatypes", () => {
      expect(getTopicPath("datatypes.html")).toBe("foundation/datatypes");
    });

    it("maps security.html to security/overview", () => {
      expect(getTopicPath("security.html")).toBe("security/overview");
    });

    it("falls back to foundation/ for unknown pages", () => {
      expect(getTopicPath("unknown-page.html")).toBe("foundation/unknown-page");
    });
  });

  describe("extractRefs", () => {
    it("detects resource name references", () => {
      const body = "The Patient resource contains demographic information.";
      const refs = extractRefs(body, new Map());
      expect(refs.some(r => r.type === "resource" && r.target === "Patient")).toBe(true);
    });

    it("detects element path references", () => {
      const body = "The Patient.gender element uses a required binding.";
      const refs = extractRefs(body, new Map());
      expect(refs.some(r => r.type === "element" && r.target === "Patient.gender")).toBe(true);
    });

    it("detects datatype references", () => {
      const body = "Values are represented using CodeableConcept.";
      const refs = extractRefs(body, new Map());
      expect(refs.some(r => r.type === "datatype" && r.target === "CodeableConcept")).toBe(true);
    });

    it("detects topic references from links", () => {
      const links = new Map([["search.html", "Search"]]);
      const refs = extractRefs("See search for more.", links);
      expect(refs.some(r => r.type === "topic" && r.target === "exchange/search")).toBe(true);
    });

    it("deduplicates references", () => {
      const body = "Patient and Patient are mentioned twice.";
      const refs = extractRefs(body, new Map());
      const patientRefs = refs.filter(r => r.target === "Patient");
      expect(patientRefs).toHaveLength(1);
    });
  });

  describe("extractPageContent", () => {
    it("produces ContentChunks from HTML", () => {
      const html = `
        <html>
          <head><title>Search - FHIR v5.0.0</title></head>
          <body>
            <h2>Overview</h2>
            <p>The search mechanism allows clients to find resources matching criteria.
            Searching uses the Patient and Observation resources frequently.</p>
            <h2>Parameters</h2>
            <p>Each search parameter has a name and type. CodeableConcept elements
            support token search parameters.</p>
          </body>
        </html>
      `;
      const chunks = extractPageContent(html, "search.html", "5.0.0");
      expect(chunks.length).toBeGreaterThanOrEqual(2);

      // Check first chunk
      const overview = chunks.find(c => c.title === "Overview");
      expect(overview).toBeDefined();
      expect(overview!.topicPath).toBe("exchange/search");
      expect(overview!.source.type).toBe("fhir-spec");
      expect(overview!.source.version).toBe("5.0.0");
      expect(overview!.source.url).toContain("search.html");

      // Check cross-references
      expect(overview!.refs.some(r => r.target === "Patient")).toBe(true);
      expect(overview!.refs.some(r => r.target === "Observation")).toBe(true);
    });

    it("sets correct IDs with page and anchor", () => {
      const html = `
        <html><body>
          <h2>Content Section</h2>
          <p>This section has meaningful content about FHIR resources and their usage.</p>
        </body></html>
      `;
      const chunks = extractPageContent(html, "test.html", "5.0.0");
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].id).toMatch(/^fhir-spec:test\.html#/);
    });

    it("generates summaries for each chunk", () => {
      const html = `
        <html><body>
          <h2>Topic</h2>
          <p>This is a detailed explanation of the topic that should be summarized.
          It contains multiple sentences that describe various aspects.</p>
        </body></html>
      `;
      const chunks = extractPageContent(html, "test.html", "5.0.0");
      expect(chunks[0].summary).toBeTruthy();
      expect(chunks[0].summary.length).toBeLessThanOrEqual(350);
    });

    it("skips sections with very short bodies", () => {
      const html = `
        <html><body>
          <h2>Short</h2>
          <p>Too short</p>
          <h2>Long Enough</h2>
          <p>This section has enough content to be worth keeping as a chunk in the system.</p>
        </body></html>
      `;
      const chunks = extractPageContent(html, "test.html", "5.0.0");
      // Short section (< 20 chars body) should be skipped
      const shortChunk = chunks.find(c => c.title === "Short");
      expect(shortChunk).toBeUndefined();
    });

    it("extracts keywords", () => {
      const html = `
        <html><body>
          <h2>Terminology Bindings</h2>
          <p>Elements with coded values have bindings to value sets. The binding strength
          determines validation behavior. Required bindings enforce specific codes.</p>
        </body></html>
      `;
      const chunks = extractPageContent(html, "test.html", "5.0.0");
      expect(chunks[0].keywords).toContain("binding");
      expect(chunks[0].keywords).toContain("terminology");
    });
  });

  describe("configuration", () => {
    it("has priority pages defined", () => {
      expect(PRIORITY_PAGES.length).toBeGreaterThan(5);
      expect(PRIORITY_PAGES).toContain("search.html");
      expect(PRIORITY_PAGES).toContain("datatypes.html");
    });

    it("all priority pages have topic mappings", () => {
      const mappings = getPageTopicMappings();
      for (const page of PRIORITY_PAGES) {
        expect(mappings[page]).toBeDefined();
      }
    });
  });
});
