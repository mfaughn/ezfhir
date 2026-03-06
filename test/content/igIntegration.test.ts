/**
 * Integration tests for IG narrative extraction flowing into the content store.
 *
 * Verifies that when extractIGNarrative() processes a FHIR package's resources,
 * the resulting ContentChunks are well-formed, correctly categorized, and
 * grounded to the right artifacts.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { TopicRegistry } from "../../src/content/topicRegistry.js";
import { ContentStore } from "../../src/content/contentStore.js";
import {
  extractIGNarrative,
  stripHtmlTags,
  getTopicPath,
  extractRefs,
} from "../../src/pipeline/igNarrativeExtractor.js";

/** Simple mock that implements the loader interface for testing. */
function createMockLoader(resources: Record<string, unknown>[]) {
  const byType = new Map<string, Record<string, unknown>[]>();
  for (const r of resources) {
    const type = r.resourceType as string;
    const list = byType.get(type) ?? [];
    list.push(r);
    byType.set(type, list);
  }

  return {
    findResourceInfos: (_name: string, options: { type?: string[]; scope?: string }) => {
      const types = options.type ?? [];
      const results: Array<{ name: string; resourceType: string }> = [];
      for (const type of types) {
        const list = byType.get(type) ?? [];
        for (const r of list) {
          results.push({
            name: r.name as string ?? r.id as string,
            resourceType: type,
          });
        }
      }
      return results;
    },
    findResourceJSON: (name: string, options: { type?: string[]; scope?: string }) => {
      const types = options.type ?? [];
      for (const type of types) {
        const list = byType.get(type) ?? [];
        const found = list.find(r => (r.name as string ?? r.id as string) === name);
        if (found) return found;
      }
      return undefined;
    },
  } as any;
}

describe("IG Narrative Extraction Integration", () => {
  describe("StructureDefinition extraction", () => {
    it("extracts SD description into ContentChunk", () => {
      const loader = createMockLoader([
        {
          resourceType: "StructureDefinition",
          name: "USCorePatientProfile",
          kind: "resource",
          type: "Patient",
          derivation: "constraint",
          description: "The US Core Patient Profile sets minimum expectations for the Patient resource " +
            "to record, search, and fetch basic demographics and other administrative information.",
          purpose: "Defines constraints for US Core implementations.",
        },
      ]);

      const chunks = extractIGNarrative(loader, "hl7.fhir.us.core", "8.0.1");
      expect(chunks).toHaveLength(1);

      const chunk = chunks[0];
      expect(chunk.id).toBe("ig:hl7.fhir.us.core:StructureDefinition:USCorePatientProfile");
      expect(chunk.title).toBe("USCorePatientProfile");
      expect(chunk.body).toContain("minimum expectations");
      expect(chunk.body).toContain("Purpose");
      expect(chunk.source.type).toBe("ig");
      expect(chunk.source.packageName).toBe("hl7.fhir.us.core");
      expect(chunk.source.version).toBe("8.0.1");
    });

    it("profile SDs are categorized under conformance/profiling", () => {
      const loader = createMockLoader([
        {
          resourceType: "StructureDefinition",
          name: "SomeProfile",
          kind: "resource",
          type: "Observation",
          derivation: "constraint",
          description: "A profile on Observation for vital signs measurement.",
        },
      ]);

      const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
      expect(chunks[0].topicPath).toBe("conformance/profiling");
    });

    it("base resource SDs are categorized under clinical/{type}", () => {
      const loader = createMockLoader([
        {
          resourceType: "StructureDefinition",
          name: "MyObservation",
          kind: "resource",
          type: "Observation",
          description: "A custom Observation definition with extra documentation.",
        },
      ]);

      const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
      expect(chunks[0].topicPath).toBe("clinical/observation");
    });

    it("datatype SDs are categorized under foundation/datatypes", () => {
      const loader = createMockLoader([
        {
          resourceType: "StructureDefinition",
          name: "MyQuantity",
          kind: "complex-type",
          type: "Quantity",
          description: "A constrained Quantity type for specific measurements.",
        },
      ]);

      const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
      expect(chunks[0].topicPath).toBe("foundation/datatypes");
    });
  });

  describe("ValueSet and CodeSystem extraction", () => {
    it("ValueSets are categorized under terminology", () => {
      const loader = createMockLoader([
        {
          resourceType: "ValueSet",
          name: "USCoreSmokingStatus",
          description: "This value set defines smoking status codes for use in US Core profiles. " +
            "It includes SNOMED CT and LOINC answer codes.",
        },
      ]);

      const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
      expect(chunks).toHaveLength(1);
      expect(chunks[0].topicPath).toBe("terminology/overview");
      expect(chunks[0].body).toContain("smoking status");
    });

    it("CodeSystems are categorized under terminology", () => {
      const loader = createMockLoader([
        {
          resourceType: "CodeSystem",
          name: "USCoreConditionCategory",
          description: "Categories for conditions in US Core, extending the base FHIR categories.",
        },
      ]);

      const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
      expect(chunks[0].topicPath).toBe("terminology/overview");
    });
  });

  describe("Narrative HTML handling", () => {
    it("extracts and strips HTML from narrative divs", () => {
      const loader = createMockLoader([
        {
          resourceType: "StructureDefinition",
          name: "TestProfile",
          kind: "resource",
          type: "Patient",
          derivation: "constraint",
          description: "A test profile for Patient.",
          text: {
            status: "generated",
            div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>This is <b>important</b> guidance about the profile.</p><p>Use it wisely.</p></div>',
          },
        },
      ]);

      const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
      expect(chunks).toHaveLength(1);
      expect(chunks[0].body).toContain("important guidance");
      expect(chunks[0].body).not.toContain("<b>");
      expect(chunks[0].body).not.toContain("</p>");
    });
  });

  describe("Cross-reference extraction", () => {
    it("detects resource references in description text", () => {
      const loader = createMockLoader([
        {
          resourceType: "StructureDefinition",
          name: "VitalsPanel",
          kind: "resource",
          type: "Observation",
          derivation: "constraint",
          description: "A panel of vital signs recorded as Observation resources " +
            "with references to the Patient and Encounter.",
        },
      ]);

      const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
      const refs = chunks[0].refs;
      expect(refs.some(r => r.type === "resource" && r.target === "Observation")).toBe(true);
      expect(refs.some(r => r.type === "resource" && r.target === "Patient")).toBe(true);
      expect(refs.some(r => r.type === "resource" && r.target === "Encounter")).toBe(true);
    });

    it("detects element path references", () => {
      const loader = createMockLoader([
        {
          resourceType: "StructureDefinition",
          name: "LabResult",
          kind: "resource",
          type: "Observation",
          derivation: "constraint",
          description: "Lab results must populate Observation.value[x] with a Quantity. " +
            "The Observation.code should use LOINC.",
        },
      ]);

      const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
      const refs = chunks[0].refs;
      const elementRefs = refs.filter(r => r.type === "element");
      expect(elementRefs.some(r => r.target.startsWith("Observation."))).toBe(true);
    });
  });

  describe("Filtering", () => {
    it("skips resources with very short descriptions", () => {
      const loader = createMockLoader([
        {
          resourceType: "StructureDefinition",
          name: "TinyProfile",
          kind: "resource",
          type: "Patient",
          derivation: "constraint",
          description: "Short.",
        },
      ]);

      const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
      expect(chunks).toHaveLength(0);
    });

    it("includes resources with long enough description", () => {
      const loader = createMockLoader([
        {
          resourceType: "StructureDefinition",
          name: "GoodProfile",
          kind: "resource",
          type: "Patient",
          derivation: "constraint",
          description: "This profile has enough text to be worth extracting and indexing.",
        },
      ]);

      const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
      expect(chunks).toHaveLength(1);
    });

    it("includes resources with short description but long narrative", () => {
      const loader = createMockLoader([
        {
          resourceType: "StructureDefinition",
          name: "NarrativeProfile",
          kind: "resource",
          type: "Patient",
          derivation: "constraint",
          description: "Brief.",
          text: {
            status: "generated",
            div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>This has plenty of narrative content that provides useful guidance about how to use this profile in practice.</p></div>',
          },
        },
      ]);

      const chunks = extractIGNarrative(loader, "test-ig", "1.0.0");
      expect(chunks).toHaveLength(1);
    });
  });

  describe("End-to-end: extraction into content store", () => {
    it("extracted chunks are retrievable by artifact reference", () => {
      const registry = new TopicRegistry();
      const store = new ContentStore(registry);

      const loader = createMockLoader([
        {
          resourceType: "StructureDefinition",
          name: "BloodPressure",
          kind: "resource",
          type: "Observation",
          derivation: "constraint",
          description: "A profile for recording blood pressure measurements using Observation. " +
            "Requires systolic and diastolic components with proper LOINC coding.",
        },
        {
          resourceType: "ValueSet",
          name: "BloodPressureCodes",
          description: "Value set containing LOINC codes for blood pressure measurements " +
            "including systolic, diastolic, and mean arterial pressure.",
        },
      ]);

      const chunks = extractIGNarrative(loader, "my-ig", "1.0.0");
      store.addBatch(chunks);

      // The profile should be findable via Observation ref
      const obsResults = store.getByRef("Observation");
      expect(obsResults.length).toBeGreaterThanOrEqual(1);
      expect(obsResults.some(r => r.title === "BloodPressure")).toBe(true);

      // The value set should be findable by keyword
      const searchResults = store.search("blood pressure");
      expect(searchResults.length).toBeGreaterThanOrEqual(1);

      // Both should be in the store
      const stats = store.getStats();
      expect(stats.chunkCount).toBe(2);
    });

    it("multiple resource types are extracted from same package", () => {
      const registry = new TopicRegistry();
      const store = new ContentStore(registry);

      const loader = createMockLoader([
        {
          resourceType: "StructureDefinition",
          name: "MyPatient",
          kind: "resource",
          type: "Patient",
          derivation: "constraint",
          description: "A patient profile with important constraints for demographics.",
        },
        {
          resourceType: "ValueSet",
          name: "GenderIdentity",
          description: "Value set for gender identity codes used in the patient profile.",
        },
        {
          resourceType: "SearchParameter",
          name: "patient-race",
          description: "Search parameter to find patients by race extension value.",
        },
        {
          resourceType: "CapabilityStatement",
          name: "MyServer",
          description: "Capability statement for the conformant server implementation.",
        },
      ]);

      const chunks = extractIGNarrative(loader, "multi-ig", "2.0.0");
      store.addBatch(chunks);

      expect(store.getStats().chunkCount).toBe(4);

      // Each should be in the right topic category
      const topics = chunks.map(c => c.topicPath);
      expect(topics).toContain("conformance/profiling");      // SD profile
      expect(topics).toContain("terminology/overview");        // ValueSet
      expect(topics).toContain("exchange/search");             // SearchParameter
      expect(topics).toContain("conformance/capability");      // CapabilityStatement
    });
  });
});
