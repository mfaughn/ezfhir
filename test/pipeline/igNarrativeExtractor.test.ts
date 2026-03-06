import { describe, it, expect } from "vitest";
import {
  extractIGNarrative,
  stripHtmlTags,
  getTopicPath,
  extractRefs,
} from "../../src/pipeline/igNarrativeExtractor.js";

/**
 * Creates a mock PackageLoader that returns the provided resources.
 */
function createMockLoader(
  resources: Array<{ resourceType: string; name: string; [key: string]: unknown }>
) {
  return {
    findResourceInfos: (_name: string, options: { type?: string[]; scope?: string }) => {
      return resources
        .filter((r) => !options.type || options.type.includes(r.resourceType as string))
        .map((r) => ({ name: r.name, resourceType: r.resourceType }));
    },
    findResourceJSON: (name: string, options: { type?: string[]; scope?: string }) => {
      return resources.find(
        (r) =>
          r.name === name &&
          (!options.type || options.type.includes(r.resourceType as string))
      );
    },
    // Satisfy the FPLPackageLoader interface minimally
    loadPackage: async () => "LOADED" as const,
    loadVirtualPackage: async () => "LOADED" as const,
    getPackageLoadStatus: () => undefined,
    findResourceInfo: () => undefined,
  } as any;
}

describe("stripHtmlTags", () => {
  it("strips simple HTML tags", () => {
    expect(stripHtmlTags("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("converts <br> to newline", () => {
    expect(stripHtmlTags("Line one<br/>Line two")).toBe("Line one\nLine two");
  });

  it("decodes HTML entities", () => {
    const result = stripHtmlTags("&amp; &lt; &gt; &quot; &#39; &nbsp;");
    expect(result).toContain("&");
    expect(result).toContain("<");
    expect(result).toContain(">");
    expect(result).toContain('"');
    expect(result).toContain("'");
  });

  it("handles complex FHIR narrative div", () => {
    const div = `<div xmlns="http://www.w3.org/1999/xhtml">
      <p>This is a patient resource profile.</p>
      <ul><li>Item one</li><li>Item two</li></ul>
    </div>`;
    const result = stripHtmlTags(div);
    expect(result).toContain("This is a patient resource profile.");
    expect(result).toContain("Item one");
    expect(result).toContain("Item two");
    expect(result).not.toContain("<");
  });

  it("returns empty string for empty input", () => {
    expect(stripHtmlTags("")).toBe("");
  });
});

describe("getTopicPath", () => {
  it("maps SD of kind 'resource' to clinical/{type}", () => {
    expect(
      getTopicPath({
        resourceType: "StructureDefinition",
        kind: "resource",
        type: "Patient",
      })
    ).toBe("clinical/patient");
  });

  it("maps SD with derivation 'constraint' to conformance/profiling", () => {
    expect(
      getTopicPath({
        resourceType: "StructureDefinition",
        kind: "resource",
        type: "Patient",
        derivation: "constraint",
      })
    ).toBe("conformance/profiling");
  });

  it("maps SD of kind 'complex-type' to foundation/datatypes", () => {
    expect(
      getTopicPath({
        resourceType: "StructureDefinition",
        kind: "complex-type",
        type: "Address",
      })
    ).toBe("foundation/datatypes");
  });

  it("maps SD of kind 'primitive-type' to foundation/datatypes", () => {
    expect(
      getTopicPath({
        resourceType: "StructureDefinition",
        kind: "primitive-type",
        type: "string",
      })
    ).toBe("foundation/datatypes");
  });

  it("maps ValueSet to terminology/overview", () => {
    expect(getTopicPath({ resourceType: "ValueSet" })).toBe("terminology/overview");
  });

  it("maps CodeSystem to terminology/overview", () => {
    expect(getTopicPath({ resourceType: "CodeSystem" })).toBe("terminology/overview");
  });

  it("maps SearchParameter to exchange/search", () => {
    expect(getTopicPath({ resourceType: "SearchParameter" })).toBe("exchange/search");
  });

  it("maps CapabilityStatement to conformance/capability", () => {
    expect(getTopicPath({ resourceType: "CapabilityStatement" })).toBe(
      "conformance/capability"
    );
  });

  it("maps OperationDefinition to exchange/operations", () => {
    expect(getTopicPath({ resourceType: "OperationDefinition" })).toBe(
      "exchange/operations"
    );
  });

  it("maps unknown types to conformance/implementation-guides", () => {
    expect(getTopicPath({ resourceType: "Questionnaire" })).toBe(
      "conformance/implementation-guides"
    );
  });
});

describe("extractRefs", () => {
  it("extracts resource type references", () => {
    const refs = extractRefs("This profile constrains Patient and Observation resources.");
    expect(refs).toContainEqual({
      type: "resource",
      target: "Patient",
      display: "Patient",
    });
    expect(refs).toContainEqual({
      type: "resource",
      target: "Observation",
      display: "Observation",
    });
  });

  it("extracts element references", () => {
    const refs = extractRefs("The Patient.name element must be present.");
    expect(refs).toContainEqual({
      type: "element",
      target: "Patient.name",
      display: "Patient.name",
    });
  });

  it("does not duplicate references", () => {
    const refs = extractRefs("Patient and Patient and Patient");
    const patientRefs = refs.filter((r) => r.target === "Patient");
    expect(patientRefs).toHaveLength(1);
  });

  it("returns empty array for text with no references", () => {
    const refs = extractRefs("This is a plain description with no FHIR resources.");
    expect(refs).toEqual([]);
  });
});

describe("extractIGNarrative", () => {
  it("extracts chunks from StructureDefinitions", () => {
    const loader = createMockLoader([
      {
        resourceType: "StructureDefinition",
        name: "USCorePatient",
        kind: "resource",
        type: "Patient",
        derivation: "constraint",
        description:
          "The US Core Patient Profile is based upon the core FHIR Patient Resource and meets the requirements for searching and fetching patient demographics.",
      },
    ]);

    const chunks = extractIGNarrative(loader, "hl7.fhir.us.core", "6.1.0");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].id).toBe(
      "ig:hl7.fhir.us.core:StructureDefinition:USCorePatient"
    );
    expect(chunks[0].topicPath).toBe("conformance/profiling");
    expect(chunks[0].title).toBe("USCorePatient");
    expect(chunks[0].source.type).toBe("ig");
    expect(chunks[0].source.packageName).toBe("hl7.fhir.us.core");
    expect(chunks[0].source.version).toBe("6.1.0");
    expect(chunks[0].refs.some((r) => r.target === "Patient")).toBe(true);
  });

  it("extracts chunks from ValueSets", () => {
    const loader = createMockLoader([
      {
        resourceType: "ValueSet",
        name: "USCoreBirthSex",
        description:
          "Concepts limited to Male, Female, and Unknown used in the Birth Sex field.",
      },
    ]);

    const chunks = extractIGNarrative(loader, "hl7.fhir.us.core", "6.1.0");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].topicPath).toBe("terminology/overview");
  });

  it("extracts chunks from SearchParameters", () => {
    const loader = createMockLoader([
      {
        resourceType: "SearchParameter",
        name: "us-core-race",
        description:
          "Returns patients with a race extension matching the specified code.",
      },
    ]);

    const chunks = extractIGNarrative(loader, "hl7.fhir.us.core", "6.1.0");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].topicPath).toBe("exchange/search");
  });

  it("extracts chunks from CapabilityStatements", () => {
    const loader = createMockLoader([
      {
        resourceType: "CapabilityStatement",
        name: "USCoreServer",
        description:
          "This section describes the expected capabilities of the US Core Server actor.",
      },
    ]);

    const chunks = extractIGNarrative(loader, "hl7.fhir.us.core", "6.1.0");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].topicPath).toBe("conformance/capability");
  });

  it("skips resources with short descriptions", () => {
    const loader = createMockLoader([
      {
        resourceType: "StructureDefinition",
        name: "ShortDesc",
        kind: "resource",
        type: "Patient",
        description: "Too short.",
      },
    ]);

    const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
    expect(chunks).toHaveLength(0);
  });

  it("includes narrative text from text.div in the body", () => {
    const loader = createMockLoader([
      {
        resourceType: "StructureDefinition",
        name: "NarrativeTest",
        kind: "resource",
        type: "Observation",
        description:
          "A test profile with narrative content that is long enough to be extracted.",
        text: {
          status: "generated",
          div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Additional narrative guidance for implementers.</p></div>',
        },
      },
    ]);

    const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].body).toContain(
      "Additional narrative guidance for implementers."
    );
  });

  it("includes purpose in the body", () => {
    const loader = createMockLoader([
      {
        resourceType: "ValueSet",
        name: "TestValueSet",
        description:
          "A value set with both description and purpose fields populated.",
        purpose:
          "This value set ensures interoperability across systems.",
      },
    ]);

    const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].body).toContain("Purpose:");
    expect(chunks[0].body).toContain("interoperability across systems");
  });

  it("extracts keywords from name and description", () => {
    const loader = createMockLoader([
      {
        resourceType: "StructureDefinition",
        name: "USCorePatientProfile",
        kind: "resource",
        type: "Patient",
        derivation: "constraint",
        description:
          "The US Core Patient Profile defines minimum expectations for patient demographics.",
      },
    ]);

    const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].keywords.length).toBeGreaterThan(0);
    expect(chunks[0].keywords).toContain("core");
    expect(chunks[0].keywords).toContain("patient");
  });

  it("handles multiple resources of different types", () => {
    const loader = createMockLoader([
      {
        resourceType: "StructureDefinition",
        name: "TestProfile",
        kind: "resource",
        type: "Patient",
        derivation: "constraint",
        description:
          "A test profile for patient resources with sufficient length.",
      },
      {
        resourceType: "ValueSet",
        name: "TestVS",
        description:
          "A test value set for coding concepts with adequate description.",
      },
      {
        resourceType: "SearchParameter",
        name: "TestSP",
        description:
          "A test search parameter for finding resources in the system.",
      },
    ]);

    const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
    expect(chunks).toHaveLength(3);
    const types = chunks.map((c) => c.topicPath);
    expect(types).toContain("conformance/profiling");
    expect(types).toContain("terminology/overview");
    expect(types).toContain("exchange/search");
  });

  it("returns empty array for package with no extractable resources", () => {
    const loader = createMockLoader([]);
    const chunks = extractIGNarrative(loader, "empty-ig", "1.0.0");
    expect(chunks).toEqual([]);
  });

  it("truncates long summaries", () => {
    const longDesc = "A ".repeat(200) + "end of description.";
    const loader = createMockLoader([
      {
        resourceType: "ValueSet",
        name: "LongDescVS",
        description: longDesc,
      },
    ]);

    const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].summary.length).toBeLessThanOrEqual(303); // 300 + "..."
  });
});
