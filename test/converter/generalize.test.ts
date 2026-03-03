import { describe, it, expect, beforeAll } from "vitest";
import { serialize } from "../../src/converter/serializer.js";
import { parse } from "../../src/converter/parser.js";
import { verify } from "../../src/converter/verifier.js";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

describe("Generalized SD→EZF Converter", () => {
  let loader: FPLPackageLoader;

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
  }, 120000);

  // Representative sample across different resource categories
  const sampleResources = [
    // Administration
    "Patient",
    "Practitioner",
    "Organization",
    "Location",
    "HealthcareService",
    // Clinical
    "Condition",
    "Observation",
    "AllergyIntolerance",
    "Procedure",
    "DiagnosticReport",
    "CarePlan",
    "ClinicalImpression",
    // Medication
    "MedicationRequest",
    "MedicationAdministration",
    "MedicationDispense",
    "Medication",
    // Workflow
    "Encounter",
    "Appointment",
    "Task",
    "ServiceRequest",
    // Financial
    "Claim",
    "Coverage",
    "ExplanationOfBenefit",
    // Infrastructure
    "Bundle",
    "OperationOutcome",
    "CapabilityStatement",
    // ContentReference-heavy
    "Questionnaire",
    "QuestionnaireResponse",
    "ImplementationGuide",
    // Complex structures
    "ConceptMap",
    "StructureDefinition",
    "ValueSet",
  ];

  describe("serialization succeeds for all sample resources", () => {
    for (const name of sampleResources) {
      it(`serializes ${name} without errors`, () => {
        const sd = getStructureDefinition(loader, name);
        expect(sd, `${name} SD not found`).toBeDefined();
        const ezf = serialize(sd!);
        expect(ezf).toContain("@format ezf/0.1");
        expect(ezf).toContain(`@resource ${name}`);
        expect(ezf).toContain("@elements");
      });
    }
  });

  describe("round-trip verification passes for all sample resources", () => {
    for (const name of sampleResources) {
      it(`${name} round-trips with 0 mismatches`, () => {
        const sd = getStructureDefinition(loader, name)!;
        const ezf = serialize(sd);
        const doc = parse(ezf);

        expect(doc.elements).toBeDefined();
        const result = verify(doc.elements!, sd);

        if (!result.passed) {
          const issues: string[] = [];
          if (result.mismatches.length > 0) {
            issues.push(
              `Mismatches (first 3): ${JSON.stringify(result.mismatches.slice(0, 3))}`
            );
          }
          if (result.missingInEZF.length > 0) {
            issues.push(
              `Missing (first 3): ${result.missingInEZF.slice(0, 3).join(", ")}`
            );
          }
          if (result.extraInEZF.length > 0) {
            issues.push(
              `Extra (first 3): ${result.extraInEZF.slice(0, 3).join(", ")}`
            );
          }
          expect.fail(
            `${name} verification failed:\n${issues.join("\n")}`
          );
        }

        expect(result.totalElementsChecked).toBeGreaterThan(0);
      });
    }
  });

  describe("EZF output quality", () => {
    it("all sample resources produce EZF under 20000 chars", () => {
      for (const name of sampleResources) {
        const sd = getStructureDefinition(loader, name)!;
        const ezf = serialize(sd);
        expect(
          ezf.length,
          `${name} is ${ezf.length} chars`
        ).toBeLessThan(20000);
      }
    });

    it("all sample resources achieve ≤ 5% compression ratio", () => {
      for (const name of sampleResources) {
        const sd = getStructureDefinition(loader, name)!;
        const jsonLen = JSON.stringify(sd).length;
        const ezfLen = serialize(sd).length;
        const ratio = ezfLen / jsonLen;
        expect(
          ratio,
          `${name} ratio ${(ratio * 100).toFixed(1)}% exceeds 5%`
        ).toBeLessThanOrEqual(0.05);
      }
    });
  });

  describe("bulk validation", () => {
    it("serializes 20 additional R5 resources without crashing", () => {
      // Additional resources beyond the sample set to broaden coverage
      const extraResources = [
        "Account", "ActivityDefinition", "AdverseEvent",
        "AuditEvent", "Basic", "Binary", "BodyStructure",
        "ChargeItem", "Communication", "CommunicationRequest",
        "Composition", "Consent", "Contract",
        "DetectedIssue", "Device", "DeviceRequest",
        "DocumentReference", "Endpoint", "EpisodeOfCare",
        "FamilyMemberHistory",
      ];

      const failures: string[] = [];
      for (const name of extraResources) {
        try {
          const sd = getStructureDefinition(loader, name);
          if (sd) serialize(sd);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push(`${name}: ${msg}`);
        }
      }

      if (failures.length > 0) {
        expect.fail(
          `${failures.length} resources failed serialization:\n${failures.join("\n")}`
        );
      }
    });
  });
});
