/**
 * HTML-to-markdown processor for FHIR specification pages.
 *
 * Converts FHIR spec HTML pages to clean markdown, strips boilerplate
 * (navigation, headers, footers, sidebars), and splits content into
 * sections based on heading hierarchy.
 */

import TurndownService from "turndown";

/** A section of content extracted from an HTML page. */
export interface HtmlSection {
  /** Section title (from the heading) */
  title: string;
  /** Heading level (2 = h2, 3 = h3, etc.) */
  headingLevel: number;
  /** Markdown content of the section (excluding the heading itself) */
  body: string;
  /** Anchor/fragment ID if available */
  anchor?: string;
}

/** Result of processing an HTML page. */
export interface ProcessedPage {
  /** Page title from <title> or first <h1> */
  title: string;
  /** Sections extracted from the page */
  sections: HtmlSection[];
  /** Links found in the page (href -> display text) */
  links: Map<string, string>;
}

/**
 * Selectors for elements to strip from FHIR spec HTML before processing.
 * These cover navigation, toolbars, footers, and other non-content elements.
 */
const BOILERPLATE_PATTERNS = [
  // Navigation and header elements
  /<nav[\s\S]*?<\/nav>/gi,
  /<header[\s\S]*?<\/header>/gi,
  /<footer[\s\S]*?<\/footer>/gi,
  // Elements by class name common in FHIR spec pages
  /<div[^>]*class="[^"]*\b(navbar|nav-list|breadcrumb|container-fluid|ig-status|page-header)\b[^"]*"[\s\S]*?<\/div>/gi,
  // Sidebar / table of contents
  /<div[^>]*id="(segment-header|segment-footer|segment-navbar|segment-breadcrumb|segment-post-footer)"[\s\S]*?<\/div>/gi,
  // Scripts and styles
  /<script[\s\S]*?<\/script>/gi,
  /<style[\s\S]*?<\/style>/gi,
  // Comments
  /<!--[\s\S]*?-->/g,
  // FHIR-specific: "This page is part of the FHIR specification" banners
  /<p[^>]*class="[^"]*\b(copyright|publish-box|trial-use|draft)\b[^"]*"[\s\S]*?<\/p>/gi,
];

/**
 * Creates a configured TurndownService instance for FHIR spec HTML.
 */
function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  // Remove images (spec diagrams are not useful as text)
  td.remove("img");
  // Remove SVGs
  td.remove("svg");

  return td;
}

/**
 * Strips boilerplate HTML elements from a FHIR spec page.
 */
export function stripBoilerplate(html: string): string {
  let cleaned = html;
  for (const pattern of BOILERPLATE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned;
}

/**
 * Extracts the page title from HTML.
 */
export function extractTitle(html: string): string {
  // Try <title> tag first
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].trim()
      // Remove common FHIR spec title suffixes
      .replace(/\s*[-–—]\s*FHIR\s*(v[\d.]+)?$/i, "")
      .replace(/\s*[-–—]\s*HL7.*$/i, "");
    if (title) return title;
  }

  // Fall back to first <h1>
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    return h1Match[1].replace(/<[^>]+>/g, "").trim();
  }

  return "Untitled";
}

/**
 * Extracts all links from HTML content.
 * Returns a map of href -> display text.
 */
export function extractLinks(html: string): Map<string, string> {
  const links = new Map<string, string>();
  const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1].trim();
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (href && text && !href.startsWith("#") && !href.startsWith("javascript:")) {
      links.set(href, text);
    }
  }
  return links;
}

/**
 * Extracts the main content area from a FHIR spec HTML page.
 * Tries to find the primary content div, falling back to the full body.
 */
function extractContentArea(html: string): string {
  // Try to find the main content div used in FHIR spec pages
  const contentPatterns = [
    /<div[^>]*id="segment-content"[^>]*>([\s\S]*?)(?=<div[^>]*id="segment-(?:footer|post-footer)")/i,
    /<div[^>]*class="[^"]*\bcol-(?:12|md-\d+)\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i,
    /<body[^>]*>([\s\S]*?)<\/body>/i,
  ];

  for (const pattern of contentPatterns) {
    const match = html.match(pattern);
    if (match && match[1].trim().length > 200) {
      return match[1];
    }
  }

  return html;
}

/**
 * Splits markdown content into sections based on heading hierarchy.
 * Each section includes everything from one heading to the next heading
 * of equal or higher level.
 */
export function splitIntoSections(markdown: string): HtmlSection[] {
  const lines = markdown.split("\n");
  const sections: HtmlSection[] = [];
  let currentSection: HtmlSection | null = null;
  let bodyLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,4})\s+(.+)/);
    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.body = bodyLines.join("\n").trim();
        if (currentSection.body.length > 0 || currentSection.title.length > 0) {
          sections.push(currentSection);
        }
      }

      const level = headingMatch[1].length;
      const titleText = headingMatch[2].trim();

      // Extract anchor if the heading contains an anchor tag
      const anchorMatch = titleText.match(/\{#([^}]+)\}/);
      const anchor = anchorMatch ? anchorMatch[1] : undefined;
      const cleanTitle = titleText.replace(/\{#[^}]+\}/, "").trim();

      currentSection = {
        title: cleanTitle,
        headingLevel: level,
        body: "",
        anchor,
      };
      bodyLines = [];
    } else {
      bodyLines.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.body = bodyLines.join("\n").trim();
    if (currentSection.body.length > 0 || currentSection.title.length > 0) {
      sections.push(currentSection);
    }
  }

  // If no sections found, treat entire content as one section
  if (sections.length === 0 && markdown.trim().length > 0) {
    sections.push({
      title: "Content",
      headingLevel: 2,
      body: markdown.trim(),
    });
  }

  return sections;
}

/**
 * Generates a short summary from the beginning of a text body.
 * Takes the first 1-2 sentences, up to ~300 characters.
 */
export function generateSummary(body: string, maxLength = 300): string {
  if (!body) return "";

  // Remove markdown formatting for the summary
  const plain = body
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // [text](url) -> text
    .replace(/[*_`#]/g, "")                     // Remove markdown formatting
    .replace(/\n+/g, " ")                       // Collapse newlines
    .replace(/\s+/g, " ")                       // Collapse whitespace
    .trim();

  if (plain.length <= maxLength) return plain;

  // Find sentence boundaries within the limit
  const sentenceEnd = /[.!?]\s/g;
  let lastEnd = 0;
  let match;
  while ((match = sentenceEnd.exec(plain)) !== null) {
    if (match.index + 1 > maxLength) break;
    lastEnd = match.index + 1;
  }

  if (lastEnd > 50) {
    return plain.slice(0, lastEnd).trim();
  }

  // Fall back to truncation at word boundary
  const truncated = plain.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 50 ? truncated.slice(0, lastSpace) : truncated).trim() + "...";
}

/**
 * Processes a FHIR specification HTML page into structured sections.
 */
export function processHtmlPage(html: string): ProcessedPage {
  const title = extractTitle(html);
  const links = extractLinks(html);

  // Strip boilerplate
  const cleaned = stripBoilerplate(html);

  // Extract main content area
  const content = extractContentArea(cleaned);

  // Convert to markdown
  const td = createTurndown();
  const markdown = td.turndown(content);

  // Split into sections
  const sections = splitIntoSections(markdown);

  return { title, sections, links };
}
