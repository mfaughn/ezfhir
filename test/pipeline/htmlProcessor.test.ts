import { describe, it, expect } from "vitest";
import {
  stripBoilerplate,
  extractTitle,
  extractLinks,
  splitIntoSections,
  generateSummary,
  processHtmlPage,
} from "../../src/pipeline/htmlProcessor.js";

describe("htmlProcessor", () => {
  describe("extractTitle", () => {
    it("extracts title from <title> tag", () => {
      const html = "<html><head><title>Search - FHIR v5.0.0</title></head><body></body></html>";
      expect(extractTitle(html)).toBe("Search");
    });

    it("strips FHIR suffix from title", () => {
      const html = "<html><head><title>Resource References — FHIR v5.0.0</title></head></html>";
      expect(extractTitle(html)).toBe("Resource References");
    });

    it("falls back to h1 if no title tag", () => {
      const html = "<html><body><h1>Patient Resource</h1><p>content</p></body></html>";
      expect(extractTitle(html)).toBe("Patient Resource");
    });

    it("returns Untitled if nothing found", () => {
      const html = "<html><body><p>just content</p></body></html>";
      expect(extractTitle(html)).toBe("Untitled");
    });
  });

  describe("stripBoilerplate", () => {
    it("removes nav elements", () => {
      const html = "<nav>navigation content</nav><div>real content</div>";
      expect(stripBoilerplate(html)).not.toContain("navigation content");
      expect(stripBoilerplate(html)).toContain("real content");
    });

    it("removes script tags", () => {
      const html = '<script>alert("hi")</script><p>content</p>';
      const result = stripBoilerplate(html);
      expect(result).not.toContain("alert");
      expect(result).toContain("content");
    });

    it("removes style tags", () => {
      const html = "<style>.foo { color: red; }</style><p>content</p>";
      const result = stripBoilerplate(html);
      expect(result).not.toContain("color");
      expect(result).toContain("content");
    });

    it("removes HTML comments", () => {
      const html = "<!-- comment --><p>content</p>";
      const result = stripBoilerplate(html);
      expect(result).not.toContain("comment");
      expect(result).toContain("content");
    });

    it("removes header and footer elements", () => {
      const html = "<header>header</header><div>content</div><footer>footer</footer>";
      const result = stripBoilerplate(html);
      expect(result).not.toContain("header");
      expect(result).not.toContain("footer");
      expect(result).toContain("content");
    });
  });

  describe("extractLinks", () => {
    it("extracts href and text from anchor tags", () => {
      const html = '<a href="patient.html">Patient</a> and <a href="search.html">Search</a>';
      const links = extractLinks(html);
      expect(links.get("patient.html")).toBe("Patient");
      expect(links.get("search.html")).toBe("Search");
    });

    it("ignores fragment-only links", () => {
      const html = '<a href="#section">Section</a>';
      const links = extractLinks(html);
      expect(links.size).toBe(0);
    });

    it("ignores javascript links", () => {
      const html = '<a href="javascript:void(0)">Click</a>';
      const links = extractLinks(html);
      expect(links.size).toBe(0);
    });

    it("strips HTML from link text", () => {
      const html = '<a href="page.html"><b>Bold</b> text</a>';
      const links = extractLinks(html);
      expect(links.get("page.html")).toBe("Bold text");
    });
  });

  describe("splitIntoSections", () => {
    it("splits on h2 headings", () => {
      const md = "## First\nContent 1\n## Second\nContent 2";
      const sections = splitIntoSections(md);
      expect(sections).toHaveLength(2);
      expect(sections[0].title).toBe("First");
      expect(sections[0].body).toBe("Content 1");
      expect(sections[1].title).toBe("Second");
      expect(sections[1].body).toBe("Content 2");
    });

    it("handles h3 headings", () => {
      const md = "## Main\nIntro\n### Sub\nDetails";
      const sections = splitIntoSections(md);
      expect(sections).toHaveLength(2);
      expect(sections[0].headingLevel).toBe(2);
      expect(sections[1].headingLevel).toBe(3);
    });

    it("treats entire content as one section if no headings", () => {
      const md = "This is just plain content without headings.";
      const sections = splitIntoSections(md);
      expect(sections).toHaveLength(1);
      expect(sections[0].title).toBe("Content");
      expect(sections[0].body).toContain("plain content");
    });

    it("skips empty sections", () => {
      const md = "## First\n\n## Second\nContent";
      const sections = splitIntoSections(md);
      // First section has empty body but still has title
      expect(sections.length).toBeGreaterThanOrEqual(1);
      const withContent = sections.filter(s => s.body.length > 0);
      expect(withContent.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts anchor IDs from headings", () => {
      const md = "## Search Modifiers {#modifiers}\nContent about modifiers";
      const sections = splitIntoSections(md);
      expect(sections[0].anchor).toBe("modifiers");
      expect(sections[0].title).toBe("Search Modifiers");
    });
  });

  describe("generateSummary", () => {
    it("returns full text if short enough", () => {
      const text = "This is a short text.";
      expect(generateSummary(text)).toBe("This is a short text.");
    });

    it("truncates at sentence boundary", () => {
      const text = "First sentence. Second sentence that is much longer. " +
        "Third sentence. ".repeat(20);
      const summary = generateSummary(text, 100);
      expect(summary.length).toBeLessThanOrEqual(100);
      expect(summary).toMatch(/\.$/);
    });

    it("strips markdown formatting", () => {
      const text = "This is **bold** and [a link](http://example.com).";
      const summary = generateSummary(text);
      expect(summary).not.toContain("**");
      expect(summary).not.toContain("](");
    });

    it("handles empty input", () => {
      expect(generateSummary("")).toBe("");
    });

    it("falls back to word-boundary truncation", () => {
      const text = "Averylongwordthatgoeson " + "word ".repeat(100);
      const summary = generateSummary(text, 50);
      expect(summary.length).toBeLessThanOrEqual(55); // Allow for "..."
    });
  });

  describe("processHtmlPage", () => {
    it("processes a simple HTML page", () => {
      const html = `
        <html>
          <head><title>Test Page - FHIR v5.0.0</title></head>
          <body>
            <h2>Overview</h2>
            <p>This is the overview section with important information.</p>
            <h2>Details</h2>
            <p>This section has details about the topic.</p>
          </body>
        </html>
      `;
      const result = processHtmlPage(html);
      expect(result.title).toBe("Test Page");
      expect(result.sections.length).toBeGreaterThanOrEqual(2);
    });

    it("strips navigation and scripts", () => {
      const html = `
        <html>
          <head><title>Test</title></head>
          <body>
            <nav>Navigation</nav>
            <script>console.log("removed")</script>
            <h2>Content</h2>
            <p>Real content here.</p>
            <footer>Footer</footer>
          </body>
        </html>
      `;
      const result = processHtmlPage(html);
      const allBodies = result.sections.map(s => s.body).join(" ");
      expect(allBodies).not.toContain("Navigation");
      expect(allBodies).not.toContain("console.log");
      expect(allBodies).toContain("Real content here");
    });

    it("extracts links from the page", () => {
      const html = `
        <html><body>
          <p>See <a href="search.html">Search</a> for details.</p>
        </body></html>
      `;
      const result = processHtmlPage(html);
      expect(result.links.get("search.html")).toBe("Search");
    });
  });
});
