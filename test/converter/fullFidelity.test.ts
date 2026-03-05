import { describe, it, expect, beforeAll } from "vitest";
import { verify } from "../../src/converter/verifier.js";
import { serialize } from "../../src/converter/serializer.js";
import { parse } from "../../src/converter/parser.js";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

/**
 * Full round-trip fidelity tests for ALL R5 core resources, complex types,
 * and profiles. Tests per TESTING-STRATEGY.md §2.1 and §2.4.
 */

const ALL_RESOURCES = [
  "Account", "ActivityDefinition", "ActorDefinition", "AdministrableProductDefinition",
  "AdverseEvent", "AllergyIntolerance", "Appointment", "AppointmentResponse",
  "ArtifactAssessment", "AuditEvent", "Basic", "Binary", "BiologicallyDerivedProduct",
  "BiologicallyDerivedProductDispense", "BodyStructure", "Bundle",
  "CapabilityStatement", "CarePlan", "CareTeam", "ChargeItem", "ChargeItemDefinition",
  "Citation", "Claim", "ClaimResponse", "ClinicalImpression", "ClinicalUseDefinition",
  "CodeSystem", "Communication", "CommunicationRequest", "CompartmentDefinition",
  "Composition", "ConceptMap", "Condition", "ConditionDefinition", "Consent",
  "Contract", "Coverage", "CoverageEligibilityRequest", "CoverageEligibilityResponse",
  "DetectedIssue", "Device", "DeviceAssociation", "DeviceDefinition",
  "DeviceDispense", "DeviceMetric", "DeviceRequest", "DeviceUsage",
  "DiagnosticReport", "DocumentReference",
  "Encounter", "EncounterHistory", "Endpoint", "EnrollmentRequest", "EnrollmentResponse",
  "EpisodeOfCare", "EventDefinition", "Evidence", "EvidenceReport", "EvidenceVariable",
  "ExampleScenario", "ExplanationOfBenefit",
  "FamilyMemberHistory", "Flag", "FormularyItem",
  "GenomicStudy", "Goal", "GraphDefinition", "Group", "GuidanceResponse",
  "HealthcareService",
  "ImagingSelection", "ImagingStudy", "Immunization", "ImmunizationEvaluation",
  "ImmunizationRecommendation", "ImplementationGuide", "Ingredient", "InsurancePlan",
  "InventoryItem", "InventoryReport", "Invoice",
  "Library", "Linkage", "List", "Location",
  "ManufacturedItemDefinition", "Measure", "MeasureReport", "Medication",
  "MedicationAdministration", "MedicationDispense", "MedicationKnowledge",
  "MedicationRequest", "MedicationStatement", "MedicinalProductDefinition",
  "MessageDefinition", "MessageHeader", "MolecularSequence",
  "NamingSystem", "NutritionIntake", "NutritionOrder", "NutritionProduct",
  "Observation", "ObservationDefinition", "OperationDefinition", "OperationOutcome",
  "Organization", "OrganizationAffiliation",
  "PackagedProductDefinition", "Parameters", "Patient", "PaymentNotice",
  "PaymentReconciliation", "Permission", "Person", "PlanDefinition", "Practitioner",
  "PractitionerRole", "Procedure", "Provenance",
  "Questionnaire", "QuestionnaireResponse",
  "RegulatedAuthorization", "RelatedPerson", "RequestOrchestration",
  "Requirements", "ResearchStudy", "ResearchSubject", "RiskAssessment",
  "Schedule", "SearchParameter", "ServiceRequest", "Slot", "Specimen",
  "SpecimenDefinition", "StructureDefinition", "StructureMap", "Subscription",
  "SubscriptionStatus", "SubscriptionTopic", "Substance", "SubstanceDefinition",
  "SubstanceNucleicAcid", "SubstancePolymer", "SubstanceProtein",
  "SubstanceReferenceInformation", "SubstanceSourceMaterial",
  "SupplyDelivery", "SupplyRequest",
  "Task", "TerminologyCapabilities", "TestPlan", "TestReport", "TestScript",
  "Transport",
  "ValueSet", "VerificationResult", "VisionPrescription",
];

const COMPLEX_TYPES = [
  "Address", "Age", "Annotation", "Attachment", "Availability",
  "CodeableConcept", "CodeableReference", "Coding", "ContactDetail",
  "ContactPoint", "Contributor", "Count",
  "DataRequirement", "Distance", "Dosage", "Duration",
  "ElementDefinition", "Expression", "ExtendedContactDetail", "Extension",
  "HumanName", "Identifier",
  "MarketingStatus", "Meta", "MonetaryComponent", "Money", "Narrative",
  "ParameterDefinition", "Period", "ProductShelfLife", "Quantity",
  "Range", "Ratio", "RatioRange", "Reference", "RelatedArtifact",
  "SampledData", "Signature",
  "Timing", "TriggerDefinition", "UsageContext", "VirtualServiceDetail",
];

const PROFILES = [
  "ActualGroup", "bodyheight", "bodyweight", "bodytemp",
  "bp", "heartrate", "headcircum",
  "oxygensat", "resprate", "vitalsigns", "BMI",
];

describe("Full Round-trip Fidelity — All R5 Core", () => {
  let loader: FPLPackageLoader;

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
  }, 120000);

  it("all concrete resources pass round-trip (158+ resources)", () => {
    let tested = 0;
    const failures: string[] = [];
    for (const name of ALL_RESOURCES) {
      const sd = getStructureDefinition(loader, name);
      if (!sd || sd.abstract === true) continue;
      tested++;
      try {
        const ezfText = serialize(sd);
        const doc = parse(ezfText);
        if (!doc.elements) { failures.push(`${name}: no elements`); continue; }
        const result = verify(doc.elements, sd);
        if (!result.passed) {
          const info = result.mismatches.slice(0, 2)
            .map(m => `${m.path}.${m.field}: ${m.expected} vs ${m.actual}`).join("; ");
          failures.push(`${name}: ${result.mismatches.length} mismatches. ${info}`);
        }
      } catch (err) {
        failures.push(`${name}: ${(err as Error).message}`);
      }
    }
    console.log(`Resources: ${tested} tested, ${failures.length} failures`);
    if (failures.length > 0) console.log(failures.join("\n"));
    expect(tested).toBeGreaterThan(150);
    expect(failures).toHaveLength(0);
  }, 120000);

  it("all complex types pass round-trip", () => {
    let tested = 0;
    const failures: string[] = [];
    for (const name of COMPLEX_TYPES) {
      const sd = getStructureDefinition(loader, name);
      if (!sd || sd.abstract === true) continue;
      tested++;
      try {
        const ezfText = serialize(sd);
        const doc = parse(ezfText);
        if (!doc.elements) { failures.push(`${name}: no elements`); continue; }
        const result = verify(doc.elements, sd);
        if (!result.passed) failures.push(`${name}: ${result.mismatches.length} mismatches`);
      } catch (err) {
        failures.push(`${name}: ${(err as Error).message}`);
      }
    }
    console.log(`Complex types: ${tested} tested, ${failures.length} failures`);
    if (failures.length > 0) console.log(failures.join("\n"));
    expect(tested).toBeGreaterThan(30);
    expect(failures).toHaveLength(0);
  }, 60000);

  it("R5 core profiles pass round-trip", () => {
    let tested = 0;
    const failures: string[] = [];
    for (const name of PROFILES) {
      const sd = getStructureDefinition(loader, name);
      if (!sd) continue;
      tested++;
      try {
        const ezfText = serialize(sd);
        const doc = parse(ezfText);
        // Profiles may have no elements (rendered as delta instead)
        if (doc.elements) {
          const result = verify(doc.elements, sd);
          if (!result.passed) failures.push(`${name}: ${result.mismatches.length} mismatches`);
        }
      } catch (err) {
        failures.push(`${name}: ${(err as Error).message}`);
      }
    }
    console.log(`Profiles: ${tested} tested, ${failures.length} failures`);
    if (failures.length > 0) console.log(failures.join("\n"));
    expect(tested).toBeGreaterThan(0);
    expect(failures).toHaveLength(0);
  }, 60000);

  it("edge cases: contentReference, deep nesting, choice types", () => {
    // ContentReference resources
    for (const name of ["Questionnaire", "Bundle", "Parameters"]) {
      const sd = getStructureDefinition(loader, name)!;
      expect(sd, `${name} not found`).toBeDefined();
      const ezfText = serialize(sd);
      const doc = parse(ezfText);
      expect(doc.elements, `${name} parse failed`).toBeDefined();
      const result = verify(doc.elements!, sd);
      expect(result.passed, `${name} verification failed`).toBe(true);
    }

    // Deep nesting with @ref
    const qEZF = serialize(getStructureDefinition(loader, "Questionnaire")!);
    expect(qEZF).toContain("item");
    expect(qEZF).toContain("@ref");

    // Choice types
    const oEZF = serialize(getStructureDefinition(loader, "Observation")!);
    expect(oEZF).toContain("value[x]");
    expect(oEZF).toContain("Quantity");

    // Deep backbone nesting
    const cEZF = serialize(getStructureDefinition(loader, "Claim")!);
    expect(cEZF).toContain("item");
    expect(cEZF).toContain("detail");
    expect(cEZF).toContain("subDetail");

    // Reference targets
    const pEZF = serialize(getStructureDefinition(loader, "Patient")!);
    expect(pEZF).toContain("generalPractitioner");
    expect(pEZF).toContain("Reference");
  });

  it("element coverage >= 99% (§2.4)", () => {
    let totalElements = 0;
    let verifiedElements = 0;
    for (const name of ALL_RESOURCES) {
      const sd = getStructureDefinition(loader, name);
      if (!sd || sd.abstract === true) continue;
      try {
        const ezfText = serialize(sd);
        const doc = parse(ezfText);
        if (!doc.elements) continue;
        const result = verify(doc.elements, sd);
        totalElements += result.totalElementsChecked;
        verifiedElements += result.totalElementsChecked - result.missingInEZF.length;
      } catch { /* skip */ }
    }
    const coverage = totalElements > 0 ? verifiedElements / totalElements : 0;
    console.log(`Coverage: ${verifiedElements}/${totalElements} (${(coverage * 100).toFixed(1)}%)`);
    expect(coverage).toBeGreaterThanOrEqual(0.99);
  }, 120000);
});
