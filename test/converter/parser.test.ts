import { describe, it, expect, beforeAll } from "vitest";
import { parse } from "../../src/converter/parser.js";
import { serialize } from "../../src/converter/serializer.js";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

describe("EZF Parser", () => {
  describe("parse basic document", () => {
    const sampleEZF = `@format ezf/0.1
@resource Patient : DomainResource
@description Demographics and other administrative information.
@scope Patient Administration
@compartment Patient (subject)

@elements
identifier       : 0..* Identifier        [Σ] # An identifier for this patient
active           : 0..1 boolean           [?!Σ] # Whether record is in active use
gender           : 0..1 code              [Σ] # male | female | other | unknown
  @binding required http://hl7.org/fhir/ValueSet/administrative-gender
deceased[x]      : 0..1 boolean|dateTime  [?!Σ] # Indicates if the patient is deceased
contact          : 0..* BackboneElement   # A contact party for the patient
  relationship   : 0..* CodeableConcept   # The kind of relationship
    @binding extensible http://hl7.org/fhir/ValueSet/patient-contactrelationship
  name           : 0..1 HumanName         # Contact name
generalPractitioner : 0..* Reference(Organization|Practitioner|PractitionerRole)  # GP

@search
name             : string    (HumanName)
identifier       : token     (Identifier)

@operations
$everything      : Returns all patient information
$match           : Find matching records

@invariants
pat-1    : contact SHALL contain details or a reference
`;

    let doc: ReturnType<typeof parse>;

    beforeAll(() => {
      doc = parse(sampleEZF);
    });

    it("parses format version", () => {
      expect(doc.format).toBe("ezf/0.1");
    });

    it("parses document type", () => {
      expect(doc.type).toBe("resource");
    });

    it("parses name and parent", () => {
      expect(doc.name).toBe("Patient");
      expect(doc.parent).toBe("DomainResource");
    });

    it("parses metadata", () => {
      expect(doc.metadata.description).toBe(
        "Demographics and other administrative information."
      );
      expect(doc.metadata.scope).toBe("Patient Administration");
      expect(doc.metadata.compartments).toHaveLength(1);
      expect(doc.metadata.compartments![0]).toEqual({
        compartment: "Patient",
        param: "subject",
      });
    });

    it("parses top-level elements", () => {
      expect(doc.elements).toBeDefined();
      const names = doc.elements!.map((e) => e.path);
      expect(names).toContain("identifier");
      expect(names).toContain("active");
      expect(names).toContain("gender");
      expect(names).toContain("deceased[x]");
      expect(names).toContain("contact");
      expect(names).toContain("generalPractitioner");
    });

    it("parses cardinality", () => {
      const identifier = doc.elements!.find((e) => e.path === "identifier")!;
      expect(identifier.min).toBe(0);
      expect(identifier.max).toBe("*");

      const active = doc.elements!.find((e) => e.path === "active")!;
      expect(active.min).toBe(0);
      expect(active.max).toBe("1");
    });

    it("parses simple types", () => {
      const active = doc.elements!.find((e) => e.path === "active")!;
      expect(active.types).toHaveLength(1);
      expect(active.types[0].code).toBe("boolean");
    });

    it("parses choice types", () => {
      const deceased = doc.elements!.find((e) => e.path === "deceased[x]")!;
      expect(deceased.types).toHaveLength(2);
      expect(deceased.types.map((t) => t.code).sort()).toEqual([
        "boolean",
        "dateTime",
      ]);
    });

    it("parses reference types with targets", () => {
      const gp = doc.elements!.find(
        (e) => e.path === "generalPractitioner"
      )!;
      expect(gp.types).toHaveLength(1);
      expect(gp.types[0].code).toBe("Reference");
      expect(gp.types[0].targetProfile).toEqual([
        "Organization",
        "Practitioner",
        "PractitionerRole",
      ]);
    });

    it("parses flags", () => {
      const active = doc.elements!.find((e) => e.path === "active")!;
      expect(active.flags.modifier).toBe(true);
      expect(active.flags.summary).toBe(true);
      expect(active.flags.mustSupport).toBe(false);

      const identifier = doc.elements!.find((e) => e.path === "identifier")!;
      expect(identifier.flags.summary).toBe(true);
      expect(identifier.flags.modifier).toBe(false);
    });

    it("parses bindings", () => {
      const gender = doc.elements!.find((e) => e.path === "gender")!;
      expect(gender.binding).toBeDefined();
      expect(gender.binding!.strength).toBe("required");
      expect(gender.binding!.valueSet).toBe(
        "http://hl7.org/fhir/ValueSet/administrative-gender"
      );
    });

    it("parses descriptions", () => {
      const identifier = doc.elements!.find((e) => e.path === "identifier")!;
      expect(identifier.short).toBe("An identifier for this patient");
    });

    it("parses backbone element children", () => {
      const contact = doc.elements!.find((e) => e.path === "contact")!;
      expect(contact.children).toBeDefined();
      expect(contact.children).toHaveLength(2);
      expect(contact.children![0].path).toBe("relationship");
      expect(contact.children![1].path).toBe("name");
    });

    it("parses nested bindings on children", () => {
      const contact = doc.elements!.find((e) => e.path === "contact")!;
      const relationship = contact.children![0];
      expect(relationship.binding).toBeDefined();
      expect(relationship.binding!.strength).toBe("extensible");
    });

    it("parses search parameters", () => {
      expect(doc.search).toHaveLength(2);
      expect(doc.search![0]).toEqual({
        name: "name",
        type: "string",
        expression: "HumanName",
      });
    });

    it("parses operations", () => {
      expect(doc.operations).toHaveLength(2);
      expect(doc.operations![0]).toEqual({
        name: "everything",
        description: "Returns all patient information",
      });
    });

    it("parses invariants", () => {
      expect(doc.invariants).toHaveLength(1);
      expect(doc.invariants![0].key).toBe("pat-1");
    });
  });

  describe("parse contentReference", () => {
    it("parses @ref type expression", () => {
      const ezf = `@format ezf/0.1
@resource Questionnaire : DomainResource

@elements
item             : 0..* BackboneElement   # Nested items
  item           : 0..* @ref(Questionnaire.item)  # Recursive items
`;
      const doc = parse(ezf);
      const item = doc.elements![0];
      expect(item.children).toHaveLength(1);
      const nestedItem = item.children![0];
      expect(nestedItem.contentReference).toBe("Questionnaire.item");
    });
  });

  describe("parse profile document", () => {
    it("parses profile type with constraints section", () => {
      const ezf = `@format ezf/0.1
@profile USCorePatient : Patient
@ig hl7.fhir.us.core
@description US Core Patient profile.

@constraints (delta from Patient)
identifier       : 1..* Identifier        [Σ MS] # TIGHTENED from 0..*
name             : 1..* HumanName         [Σ MS] # TIGHTENED from 0..*

@extensions
us-core-race          : 0..1 complex       # US Core Race

@mustsupport
identifier, name, gender, birthDate
`;
      const doc = parse(ezf);
      expect(doc.type).toBe("profile");
      expect(doc.name).toBe("USCorePatient");
      expect(doc.parent).toBe("Patient");
      expect(doc.metadata.ig).toBe("hl7.fhir.us.core");
      expect(doc.constraints).toHaveLength(2);
      expect(doc.extensions).toHaveLength(1);
      expect(doc.extensions![0].name).toBe("us-core-race");
      expect(doc.mustSupport).toEqual([
        "identifier",
        "name",
        "gender",
        "birthDate",
      ]);
    });
  });

  describe("round-trip: serialize then parse", () => {
    let loader: FPLPackageLoader;

    beforeAll(async () => {
      loader = await createPackageLoader();
      await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
    }, 120000);

    it("serialized Patient can be parsed back", () => {
      const patientSD = getStructureDefinition(loader, "Patient")!;
      const ezfText = serialize(patientSD, {
        scope: "Patient Administration",
      });
      const doc = parse(ezfText);

      expect(doc.type).toBe("resource");
      expect(doc.name).toBe("Patient");
      expect(doc.parent).toBe("DomainResource");
      expect(doc.elements).toBeDefined();
      expect(doc.elements!.length).toBeGreaterThan(10);

      // Verify specific elements survived round-trip
      const gender = doc.elements!.find((e) => e.path === "gender");
      expect(gender).toBeDefined();
      expect(gender!.min).toBe(0);
      expect(gender!.max).toBe("1");
      expect(gender!.binding?.strength).toBe("required");

      const deceased = doc.elements!.find((e) => e.path === "deceased[x]");
      expect(deceased).toBeDefined();
      expect(deceased!.types).toHaveLength(2);

      const contact = doc.elements!.find((e) => e.path === "contact");
      expect(contact).toBeDefined();
      expect(contact!.children).toBeDefined();
      expect(contact!.children!.length).toBeGreaterThan(0);
    });
  });

  describe("error handling", () => {
    it("throws on missing type directive", () => {
      expect(() => parse("@format ezf/0.1\n")).toThrow(
        "missing type directive"
      );
    });
  });
});
