/**
 * Integration tests for the spec page ingestion pipeline.
 *
 * Verifies the end-to-end flow: HTML page → htmlProcessor → specPageExtractor
 * → ContentChunks → ContentStore → retrieval by topic, ref, and search.
 *
 * Uses realistic FHIR spec HTML fragments (not mocks) to validate that the
 * pipeline produces correct, well-grounded content.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { TopicRegistry } from "../../src/content/topicRegistry.js";
import { ContentStore } from "../../src/content/contentStore.js";
import { extractPageContent, PRIORITY_PAGES, getTopicPath } from "../../src/pipeline/specPageExtractor.js";
import { processHtmlPage, generateSummary, splitIntoSections } from "../../src/pipeline/htmlProcessor.js";

/**
 * Realistic FHIR search page HTML fragment.
 * Modeled after the actual hl7.org/fhir/search.html page structure.
 */
const SEARCH_PAGE_HTML = `
<html>
<head><title>Search - FHIR v5.0.0</title></head>
<body>
<nav>Navigation bar content that should be stripped</nav>
<script>console.log("should be removed")</script>

<h1>Search</h1>

<h2>Introduction</h2>
<p>In the simplest case, a search is executed by performing a GET operation
in the RESTful framework:</p>
<pre>GET [base]/[type]?name=value&amp;...</pre>
<p>For this RESTful search, the parameters are a series of name=[value] pairs
encoded in the URL. The server returns the results in a
<a href="bundle.html">Bundle</a> which includes all the resources that
match the search criteria.</p>
<p>Search operations can also be initiated by a POST operation, allowing
searches with large parameter sets.</p>

<h2>Search Parameters</h2>
<p>Each search parameter has a defined type. These are the defined types:</p>
<ul>
<li><b>number</b> - Search parameter is a simple numerical value</li>
<li><b>date</b> - Search parameter is on a date/time</li>
<li><b>string</b> - Search parameter is a simple string, like a name part</li>
<li><b>token</b> - Search parameter on a coded element or <a href="datatypes.html#Identifier">Identifier</a></li>
<li><b>reference</b> - Search parameter that refers to another <a href="references.html">Reference</a></li>
<li><b>quantity</b> - Search parameter is on a <a href="datatypes.html#Quantity">Quantity</a></li>
</ul>

<h2>Modifiers</h2>
<p>Parameters are defined per resource, and their names may additionally specify
a modifier as a suffix, separated from the parameter name with a colon.
Modifiers are:</p>
<ul>
<li><b>:missing</b> - Tests whether the value in a resource is present</li>
<li><b>:exact</b> - For string parameters, match must be exact</li>
<li><b>:contains</b> - For string parameters, match must contain the string</li>
<li><b>:text</b> - For token parameters, match the text portion</li>
<li><b>:in</b> - For token parameters, match against a value set</li>
</ul>

<h2>Chaining</h2>
<p>In order to save a client from performing a series of search operations,
reference parameters may be "chained" by appending them with a period (.)
followed by the name of a search parameter defined for the target resource.
For example, given that the <a href="diagnosticreport.html">DiagnosticReport</a>
resource has a search parameter named <code>subject</code>, which is a
reference to a <a href="patient.html">Patient</a> resource, the search:</p>
<pre>GET [base]/DiagnosticReport?subject:Patient.name=peter</pre>
<p>would return all lab reports for patients with the name "peter".</p>

<h2>Including Other Resources</h2>
<p>Clients can request that the engine return resources related to the search results,
in order to reduce the overall network delay of retrieving the related resources.
This is useful when the client knows that it will need the related resources.</p>
<p>This is done using the <code>_include</code> and <code>_revinclude</code> parameters.
Each Observation has a reference to a Patient, so including the Patient resources
reduces round trips:</p>
<pre>GET [base]/Observation?_include=Observation:subject</pre>

<footer>Copyright HL7 International</footer>
</body>
</html>
`;

/**
 * Realistic FHIR terminology page HTML fragment.
 */
const TERMINOLOGY_PAGE_HTML = `
<html>
<head><title>Using Terminologies - FHIR v5.0.0</title></head>
<body>
<h1>Using Terminologies</h1>

<h2>Binding to Terminologies</h2>
<p>In FHIR, coded elements have a <b>binding</b> to a value set. The binding
declares the degree to which the codes in the value set are required.
There are four binding strengths:</p>
<ul>
<li><b>Required</b> - To be conformant, the concept SHALL come from the specified value set</li>
<li><b>Extensible</b> - To be conformant, the concept SHALL come from the value set if applicable</li>
<li><b>Preferred</b> - Encouraged to draw from the value set; other codes may be used</li>
<li><b>Example</b> - May draw from the value set; no particular preference</li>
</ul>

<h2>CodeableConcept Usage</h2>
<p>The <a href="datatypes.html#CodeableConcept">CodeableConcept</a> datatype is the
most common way to represent coded values. It allows for multiple
<a href="datatypes.html#Coding">Coding</a> representations of the same concept,
along with a text description. When using CodeableConcept with a required binding,
at least one Coding must be from the specified ValueSet.</p>

<h2>Validation Considerations</h2>
<p>When validating resources, the binding strength determines behavior:
with required bindings on <a href="patient.html">Patient</a>.gender,
any code not in the bound value set is a validation error.
With extensible bindings on Condition.code, codes outside the value set
are acceptable if no suitable code exists in the set.</p>
</body>
</html>
`;

describe("Spec Page Ingestion Pipeline", () => {
  let registry: TopicRegistry;
  let store: ContentStore;

  beforeAll(() => {
    registry = new TopicRegistry();
    store = new ContentStore(registry);

    // Register sub-topics that the extractor will create
    registry.register({
      path: "exchange/search",
      name: "Search",
      description: "FHIR search mechanism",
      parent: "exchange",
      children: [],
    });
    registry.register({
      path: "terminology/overview",
      name: "Terminology Overview",
      description: "Terminology usage guidance",
      parent: "terminology",
      children: [],
    });

    // Ingest both pages
    const searchChunks = extractPageContent(SEARCH_PAGE_HTML, "search.html", "5.0.0");
    const terminologyChunks = extractPageContent(TERMINOLOGY_PAGE_HTML, "terminologies.html", "5.0.0");
    store.addBatch(searchChunks);
    store.addBatch(terminologyChunks);
  });

  describe("search.html extraction", () => {
    it("extracts multiple sections from the page", () => {
      const chunks = store.getByTopic("exchange/search");
      expect(chunks.length).toBeGreaterThanOrEqual(3);
    });

    it("Introduction section contains REST search description", () => {
      const chunks = store.getByTopic("exchange/search");
      const intro = chunks.find(c => c.title === "Introduction");
      expect(intro).toBeDefined();
      expect(intro!.body).toContain("GET");
      expect(intro!.body).toContain("Bundle");
    });

    it("sections reference Bundle via cross-refs", () => {
      const chunks = store.getByTopic("exchange/search");
      const intro = chunks.find(c => c.title === "Introduction");
      expect(intro).toBeDefined();
      // The intro mentions Bundle, so it should have a ref
      const hasBundleRef = intro!.refs.some(
        r => r.type === "resource" && r.target === "Bundle"
      );
      expect(hasBundleRef).toBe(true);
    });

    it("Chaining section references DiagnosticReport and Patient", () => {
      const allChunks = store.getByTopic("exchange/search", true);
      const chaining = allChunks.find(c => c.title === "Chaining");
      expect(chaining).toBeDefined();
      expect(chaining!.refs.some(r => r.target === "DiagnosticReport")).toBe(true);
      expect(chaining!.refs.some(r => r.target === "Patient")).toBe(true);
    });

    it("all chunks have valid provenance", () => {
      const chunks = store.getByTopic("exchange/search", true);
      for (const chunk of chunks) {
        expect(chunk.source.type).toBe("fhir-spec");
        expect(chunk.source.url).toBe("https://hl7.org/fhir/search.html");
        expect(chunk.source.version).toBe("5.0.0");
      }
    });

    it("all chunks have non-empty summaries", () => {
      const chunks = store.getByTopic("exchange/search", true);
      for (const chunk of chunks) {
        expect(chunk.summary.length).toBeGreaterThan(0);
        expect(chunk.summary.length).toBeLessThanOrEqual(350);
      }
    });

    it("stripped boilerplate: no nav, script, or footer content", () => {
      const allChunks = store.getByTopic("exchange/search", true);
      const allBodies = allChunks.map(c => c.body).join(" ");
      expect(allBodies).not.toContain("Navigation bar content");
      expect(allBodies).not.toContain("console.log");
      expect(allBodies).not.toContain("Copyright HL7");
    });
  });

  describe("terminologies.html extraction", () => {
    it("extracts terminology sections", () => {
      const chunks = store.getByTopic("terminology/overview", true);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it("binding section describes binding strengths", () => {
      const chunks = store.getByTopic("terminology/overview", true);
      const binding = chunks.find(c => c.title.includes("Binding"));
      expect(binding).toBeDefined();
      expect(binding!.body).toContain("Required");
      expect(binding!.body).toContain("Extensible");
    });

    it("CodeableConcept section references the datatype", () => {
      const chunks = store.getByTopic("terminology/overview", true);
      const ccSection = chunks.find(c => c.title.includes("CodeableConcept"));
      expect(ccSection).toBeDefined();
      expect(ccSection!.refs.some(
        r => r.type === "datatype" && r.target === "CodeableConcept"
      )).toBe(true);
    });
  });

  describe("Cross-source artifact lookup", () => {
    it("Patient is referenced from both search and terminology pages", () => {
      const patientRefs = store.getByRef("Patient");
      expect(patientRefs.length).toBeGreaterThanOrEqual(2);

      // Should come from different source pages
      const urls = new Set(patientRefs.map(r => r.source.url));
      expect(urls.size).toBeGreaterThanOrEqual(2);
    });

    it("CodeableConcept is findable via ref index", () => {
      const results = store.getByRef("CodeableConcept");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].body).toContain("CodeableConcept");
    });

    it("DiagnosticReport ref leads to search chaining guidance", () => {
      const results = store.getByRef("DiagnosticReport");
      expect(results.length).toBeGreaterThanOrEqual(1);
      const chaining = results.find(r => r.title === "Chaining");
      expect(chaining).toBeDefined();
      expect(chaining!.body).toContain("chained");
    });
  });

  describe("Search across ingested content", () => {
    it("searching 'modifier' finds the Modifiers section", () => {
      const results = store.search("modifier");
      const modSection = results.find(r => r.title === "Modifiers");
      expect(modSection).toBeDefined();
    });

    it("searching 'binding' finds terminology content", () => {
      const results = store.search("binding");
      expect(results.length).toBeGreaterThanOrEqual(1);
      const binding = results.find(r => r.topicPath.startsWith("terminology"));
      expect(binding).toBeDefined();
    });

    it("searching 'including' finds the includes section", () => {
      const results = store.search("including");
      expect(results.length).toBeGreaterThanOrEqual(1);
      // The section title contains "Including"
      expect(results.some(r => r.title.includes("Including"))).toBe(true);
    });
  });

  describe("Topic mapping correctness", () => {
    it("search.html maps to exchange/search", () => {
      expect(getTopicPath("search.html")).toBe("exchange/search");
    });

    it("terminologies.html maps to terminology/overview", () => {
      expect(getTopicPath("terminologies.html")).toBe("terminology/overview");
    });

    it("security.html maps to security/overview", () => {
      expect(getTopicPath("security.html")).toBe("security/overview");
    });

    it("profiling.html maps to conformance/profiling", () => {
      expect(getTopicPath("profiling.html")).toBe("conformance/profiling");
    });

    it("unknown pages get a sensible default", () => {
      const path = getTopicPath("some-new-page.html");
      expect(path).toBe("foundation/some-new-page");
    });
  });
});

describe("HTML Processing Edge Cases", () => {
  it("handles pages with no h2 headings", () => {
    const html = `
      <html><body>
        <h1>Title</h1>
        <p>Content without any h2 sections.</p>
      </body></html>
    `;
    const result = processHtmlPage(html);
    expect(result.sections.length).toBeGreaterThanOrEqual(1);
    expect(result.sections[0].body).toContain("Content without");
  });

  it("handles deeply nested headings", () => {
    const md = "## Level 2\nA\n### Level 3\nB\n#### Level 4\nC";
    const sections = splitIntoSections(md);
    expect(sections).toHaveLength(3);
    expect(sections[0].headingLevel).toBe(2);
    expect(sections[1].headingLevel).toBe(3);
    expect(sections[2].headingLevel).toBe(4);
  });

  it("handles HTML tables", () => {
    const html = `
      <html><body>
        <h2>Parameters</h2>
        <table>
          <tr><th>Name</th><th>Type</th></tr>
          <tr><td>name</td><td>string</td></tr>
          <tr><td>date</td><td>date</td></tr>
        </table>
      </body></html>
    `;
    const result = processHtmlPage(html);
    expect(result.sections.length).toBeGreaterThanOrEqual(1);
    // Table content should be preserved in some form
    expect(result.sections[0].body).toContain("name");
  });

  it("handles code blocks in HTML", () => {
    const html = `
      <html><body>
        <h2>Examples</h2>
        <pre><code>GET /Patient?name=smith</code></pre>
      </body></html>
    `;
    const result = processHtmlPage(html);
    expect(result.sections[0].body).toContain("GET /Patient");
  });

  it("generateSummary handles text with only long sentences", () => {
    const longSentence = "This is a very long sentence that goes on and on " +
      "without any period or other sentence-ending punctuation " +
      "and continues for quite a while to test the truncation logic " +
      "which should handle this gracefully";
    const summary = generateSummary(longSentence, 100);
    expect(summary.length).toBeLessThanOrEqual(105); // Allow for "..."
  });
});
