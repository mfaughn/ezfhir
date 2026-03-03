import { describe, it, expect, beforeAll } from "vitest";
import {
  computeDelta,
  computeDeltaFromLoader,
  renderDelta,
} from "../../src/pipeline/profileDelta.js";
import {
  createPackageLoader,
  loadPackage,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

describe("Profile Delta Processing", () => {
  describe("computeDelta with synthetic data", () => {
    const baseSD = {
      name: "Patient",
      type: "Patient",
      snapshot: {
        element: [
          { path: "Patient", min: 0, max: "*" },
          { path: "Patient.identifier", min: 0, max: "*", type: [{ code: "Identifier" }] },
          { path: "Patient.name", min: 0, max: "*", type: [{ code: "HumanName" }] },
          { path: "Patient.gender", min: 0, max: "1", type: [{ code: "code" }],
            binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender" }
          },
          { path: "Patient.birthDate", min: 0, max: "1", type: [{ code: "date" }] },
          { path: "Patient.deceased[x]", min: 0, max: "1", type: [{ code: "boolean" }, { code: "dateTime" }] },
          { path: "Patient.address", min: 0, max: "*", type: [{ code: "Address" }] },
        ],
      },
    };

    it("detects cardinality tightening", () => {
      const profileSD = {
        name: "USCorePatient",
        type: "Patient",
        baseDefinition: "http://hl7.org/fhir/StructureDefinition/Patient",
        derivation: "constraint",
        differential: {
          element: [
            { path: "Patient" },
            { path: "Patient.identifier", min: 1, max: "*" },
            { path: "Patient.name", min: 1 },
          ],
        },
      };

      const delta = computeDelta(profileSD as any, baseSD as any);
      expect(delta.profileName).toBe("USCorePatient");
      expect(delta.baseResourceName).toBe("Patient");

      const cardChanges = delta.changes.filter((c) => c.changeType === "cardinality");
      expect(cardChanges.length).toBeGreaterThanOrEqual(2);
      expect(cardChanges.find((c) => c.path === "Patient.identifier")).toBeDefined();
    });

    it("detects must-support additions", () => {
      const profileSD = {
        name: "MSProfile",
        type: "Patient",
        baseDefinition: "http://hl7.org/fhir/StructureDefinition/Patient",
        differential: {
          element: [
            { path: "Patient" },
            { path: "Patient.identifier", mustSupport: true },
            { path: "Patient.name", mustSupport: true },
            { path: "Patient.gender", mustSupport: true },
          ],
        },
      };

      const delta = computeDelta(profileSD as any, baseSD as any);
      expect(delta.mustSupportPaths).toContain("Patient.identifier");
      expect(delta.mustSupportPaths).toContain("Patient.name");
      expect(delta.mustSupportPaths).toContain("Patient.gender");

      const msChanges = delta.changes.filter((c) => c.changeType === "must-support");
      expect(msChanges.length).toBe(3);
    });

    it("detects binding changes", () => {
      const profileSD = {
        name: "BindingProfile",
        type: "Patient",
        baseDefinition: "http://hl7.org/fhir/StructureDefinition/Patient",
        differential: {
          element: [
            { path: "Patient" },
            {
              path: "Patient.gender",
              binding: { strength: "required", valueSet: "http://custom/ValueSet/gender" },
            },
          ],
        },
      };

      const delta = computeDelta(profileSD as any, baseSD as any);
      const bindingChanges = delta.changes.filter((c) => c.changeType === "binding");
      expect(bindingChanges).toHaveLength(1);
      expect(bindingChanges[0].profile).toContain("custom");
    });

    it("detects type narrowing", () => {
      const profileSD = {
        name: "NarrowProfile",
        type: "Patient",
        baseDefinition: "http://hl7.org/fhir/StructureDefinition/Patient",
        differential: {
          element: [
            { path: "Patient" },
            { path: "Patient.deceased[x]", type: [{ code: "boolean" }] },
          ],
        },
      };

      const delta = computeDelta(profileSD as any, baseSD as any);
      const typeChanges = delta.changes.filter((c) => c.changeType === "type-narrowing");
      expect(typeChanges).toHaveLength(1);
      expect(typeChanges[0].profile).toBe("boolean");
      expect(typeChanges[0].base).toContain("dateTime");
    });

    it("detects slicing", () => {
      const profileSD = {
        name: "SlicedProfile",
        type: "Patient",
        baseDefinition: "http://hl7.org/fhir/StructureDefinition/Patient",
        differential: {
          element: [
            { path: "Patient" },
            {
              path: "Patient.identifier",
              slicing: {
                discriminator: [{ type: "value", path: "system" }],
                rules: "open",
              },
            },
          ],
        },
      };

      const delta = computeDelta(profileSD as any, baseSD as any);
      const sliceChanges = delta.changes.filter((c) => c.changeType === "slicing");
      expect(sliceChanges).toHaveLength(1);
      expect(sliceChanges[0].description).toContain("value(system)");
    });

    it("detects fixed values", () => {
      const profileSD = {
        name: "FixedProfile",
        type: "Patient",
        baseDefinition: "http://hl7.org/fhir/StructureDefinition/Patient",
        differential: {
          element: [
            { path: "Patient" },
            { path: "Patient.gender", fixedCode: "female" },
          ],
        },
      };

      const delta = computeDelta(profileSD as any, baseSD as any);
      const fixedChanges = delta.changes.filter((c) => c.changeType === "fixed-value");
      expect(fixedChanges).toHaveLength(1);
      expect(fixedChanges[0].profile).toBe("female");
    });

    it("handles empty differential", () => {
      const profileSD = {
        name: "EmptyProfile",
        type: "Patient",
        baseDefinition: "http://hl7.org/fhir/StructureDefinition/Patient",
      };

      const delta = computeDelta(profileSD as any, baseSD as any);
      expect(delta.changes).toHaveLength(0);
      expect(delta.mustSupportPaths).toHaveLength(0);
    });
  });

  describe("renderDelta", () => {
    it("renders cardinality and must-support changes", () => {
      const delta = {
        profileName: "USCorePatient",
        baseResourceName: "Patient",
        changes: [
          { path: "Patient.identifier", changeType: "cardinality" as const, base: "0..*", profile: "1..*" },
          { path: "Patient.name", changeType: "must-support" as const, base: "false", profile: "true" },
        ],
        addedExtensions: ["us-core-race"],
        mustSupportPaths: ["Patient.identifier", "Patient.name"],
      };

      const text = renderDelta(delta);
      expect(text).toContain("@constraints (delta from Patient)");
      expect(text).toContain("identifier : 1..* # TIGHTENED from 0..*");
      expect(text).toContain("@extensions");
      expect(text).toContain("us-core-race");
      expect(text).toContain("@mustsupport");
      expect(text).toContain("identifier, name");
    });
  });

  describe("computeDeltaFromLoader (R5 core profiles)", () => {
    let loader: FPLPackageLoader;
    const scope = "hl7.fhir.r5.core";

    beforeAll(async () => {
      loader = await createPackageLoader();
      await loadPackage(loader, scope, "5.0.0");
    }, 120000);

    it("computes delta for ActualGroup profile", () => {
      const delta = computeDeltaFromLoader(loader, "ActualGroup", scope);
      expect(delta).toBeDefined();
      expect(delta!.profileName).toBe("ActualGroup");
      expect(delta!.baseResourceName).toBe("Group");
      // ActualGroup tightens Group.membership to "definitional"
      expect(delta!.changes.length).toBeGreaterThan(0);
    });

    it("computes delta for vitalsigns profile", () => {
      const delta = computeDeltaFromLoader(loader, "vitalsigns", scope);
      expect(delta).toBeDefined();
      expect(delta!.baseResourceName).toBe("Observation");
      // Vital signs adds cardinality constraints and must-support
      expect(delta!.changes.length).toBeGreaterThan(0);
    });

    it("returns undefined for nonexistent profile", () => {
      const delta = computeDeltaFromLoader(loader, "FakeProfile", scope);
      expect(delta).toBeUndefined();
    });
  });
});
