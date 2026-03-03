/**
 * Index file generator for EZF output.
 *
 * Generates categorized resource, datatype, and package indices
 * per COMPACT-FORMAT-SPEC.md §5.
 */

import type { PackageLoader as FPLPackageLoader } from "fhir-package-loader";

/** Known FHIR resource categories (R5 Maturity Model groupings). */
const RESOURCE_CATEGORIES: Record<string, string[]> = {
  "Administration": [
    "Patient", "Practitioner", "PractitionerRole", "Organization",
    "Location", "HealthcareService", "Endpoint", "RelatedPerson",
    "Group", "Person", "Device",
  ],
  "Clinical": [
    "Condition", "Observation", "AllergyIntolerance", "Procedure",
    "DiagnosticReport", "ClinicalImpression", "FamilyMemberHistory",
    "DetectedIssue", "RiskAssessment", "CarePlan", "CareTeam",
    "Goal", "NutritionOrder", "NutritionIntake",
  ],
  "Medication": [
    "MedicationRequest", "MedicationAdministration", "MedicationDispense",
    "MedicationStatement", "Medication", "Immunization",
    "ImmunizationRecommendation", "ImmunizationEvaluation",
  ],
  "Diagnostics": [
    "DiagnosticReport", "Observation", "ImagingStudy", "ImagingSelection",
    "Specimen", "BodyStructure", "MolecularSequence",
    "GenomicStudy",
  ],
  "Workflow": [
    "Encounter", "Appointment", "AppointmentResponse", "Task",
    "ServiceRequest", "Communication", "CommunicationRequest",
    "Schedule", "Slot", "EpisodeOfCare",
  ],
  "Financial": [
    "Claim", "ClaimResponse", "Coverage", "CoverageEligibilityRequest",
    "CoverageEligibilityResponse", "ExplanationOfBenefit",
    "PaymentNotice", "PaymentReconciliation", "Account",
    "ChargeItem", "Invoice",
  ],
  "Infrastructure": [
    "Bundle", "OperationOutcome", "Parameters", "Binary",
    "Subscription", "SubscriptionStatus", "SubscriptionTopic",
    "MessageHeader", "MessageDefinition",
  ],
  "Conformance": [
    "CapabilityStatement", "StructureDefinition", "ValueSet",
    "CodeSystem", "ConceptMap", "OperationDefinition",
    "SearchParameter", "CompartmentDefinition", "NamingSystem",
    "ImplementationGuide",
  ],
};

interface SDInfo {
  name: string;
  kind: string;
  description?: string;
  abstract?: boolean;
}

/**
 * Generates a resource index for a FHIR package.
 * Groups resources by category per §5 index format.
 */
export function generateResourceIndex(
  loader: FPLPackageLoader,
  scope: string,
  packageVersion?: string
): string {
  const sds = getAllSDInfos(loader, scope);
  const resources = sds.filter(
    (sd) => sd.kind === "resource" && !sd.abstract
  );

  const lines: string[] = [];
  lines.push("# FHIR Resource Index");
  lines.push(`@package ${scope}`);
  if (packageVersion) lines.push(`@version ${packageVersion}`);

  // Categorize resources
  const categorized = new Set<string>();
  for (const [category, members] of Object.entries(RESOURCE_CATEGORIES)) {
    const matched = resources.filter((r) => members.includes(r.name));
    if (matched.length === 0) continue;

    lines.push("");
    lines.push(`## ${category}`);
    for (const r of matched) {
      const desc = r.description
        ? r.description.length > 80
          ? r.description.slice(0, 77) + "..."
          : r.description
        : "";
      lines.push(`${r.name} : ${desc}`);
      categorized.add(r.name);
    }
  }

  // Uncategorized resources
  const uncategorized = resources.filter((r) => !categorized.has(r.name));
  if (uncategorized.length > 0) {
    lines.push("");
    lines.push("## Other");
    for (const r of uncategorized) {
      const desc = r.description
        ? r.description.length > 80
          ? r.description.slice(0, 77) + "..."
          : r.description
        : "";
      lines.push(`${r.name} : ${desc}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Generates a datatype index for a FHIR package.
 */
export function generateDatatypeIndex(
  loader: FPLPackageLoader,
  scope: string
): string {
  const sds = getAllSDInfos(loader, scope);

  const complexTypes = sds
    .filter((sd) => sd.kind === "complex-type" && !sd.abstract)
    .sort((a, b) => a.name.localeCompare(b.name));

  const primitiveTypes = sds
    .filter((sd) => sd.kind === "primitive-type")
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines: string[] = [];
  lines.push("# FHIR Datatype Index");
  lines.push(`@package ${scope}`);

  lines.push("");
  lines.push("## Complex Types");
  for (const dt of complexTypes) {
    const desc = dt.description
      ? dt.description.length > 80
        ? dt.description.slice(0, 77) + "..."
        : dt.description
      : "";
    lines.push(`${dt.name} : ${desc}`);
  }

  lines.push("");
  lines.push("## Primitive Types");
  for (const dt of primitiveTypes) {
    const desc = dt.description
      ? dt.description.length > 80
        ? dt.description.slice(0, 77) + "..."
        : dt.description
      : "";
    lines.push(`${dt.name} : ${desc}`);
  }

  lines.push("");
  return lines.join("\n");
}

// ─── Internal helpers ──────────────────────────────────────────────

function getAllSDInfos(
  loader: FPLPackageLoader,
  scope: string
): SDInfo[] {
  const infos = loader.findResourceInfos("*", {
    type: ["StructureDefinition"],
    scope,
  });

  const results: SDInfo[] = [];
  for (const info of infos) {
    if (!info.name) continue;
    const sd = loader.findResourceJSON(info.name, {
      type: ["StructureDefinition"],
      scope,
    }) as Record<string, unknown> | undefined;

    if (!sd) continue;

    results.push({
      name: sd.name as string,
      kind: sd.kind as string,
      description: sd.description as string | undefined,
      abstract: sd.abstract as boolean | undefined,
    });
  }

  return results;
}
