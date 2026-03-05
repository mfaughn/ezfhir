import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initLoader, getEZF, lookupElement } from "../../src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Question {
  id: string;
  category: string;
  question: string;
  referenceAnswer: string;
  keyFacts: string[];
  hallucinationRisk: string;
}

describe("AI Evaluation Framework", () => {
  let questions: Question[];

  beforeAll(async () => {
    questions = JSON.parse(
      readFileSync(resolve(__dirname, "questions.json"), "utf-8")
    );
    await initLoader();
  }, 120000);

  it("has 30+ evaluation questions", () => {
    expect(questions.length).toBeGreaterThanOrEqual(30);
  });

  it("all questions have required fields", () => {
    for (const q of questions) {
      expect(q.id).toBeDefined();
      expect(q.question).toBeTruthy();
      expect(q.referenceAnswer).toBeTruthy();
      expect(q.keyFacts.length).toBeGreaterThan(0);
      expect(q.hallucinationRisk).toBeTruthy();
    }
  });

  it("questions cover all 5 categories (A-E)", () => {
    const categories = new Set(questions.map((q) => q.category));
    expect(categories.has("A-resource-selection")).toBe(true);
    expect(categories.has("B-element-detail")).toBe(true);
    expect(categories.has("C-cross-cutting")).toBe(true);
    expect(categories.has("D-profile-ig")).toBe(true);
    expect(categories.has("E-version-differences")).toBe(true);
  });

  it("each category has at least 4 questions", () => {
    const categoryCounts = new Map<string, number>();
    for (const q of questions) {
      categoryCounts.set(q.category, (categoryCounts.get(q.category) ?? 0) + 1);
    }
    for (const [cat, count] of categoryCounts) {
      expect(count, `${cat} has only ${count} questions`).toBeGreaterThanOrEqual(4);
    }
  });

  it("at least 8 questions have high hallucination risk", () => {
    const highRisk = questions.filter((q) => q.hallucinationRisk === "high");
    expect(highRisk.length).toBeGreaterThanOrEqual(8);
  });

  it("question IDs are unique", () => {
    const ids = questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe("reference answers are verifiable via EZF tools", () => {
    it("b1: Patient.identifier cardinality is 0..*", () => {
      const result = lookupElement("Patient", "identifier");
      expect(result).toContain("0..*");
      expect(result).toContain("Identifier");
    });

    it("b2: Patient.gender binding is required", () => {
      const result = lookupElement("Patient", "gender");
      expect(result).toContain("required");
      expect(result).toContain("administrative-gender");
    });

    it("b3: Patient.contact has children", () => {
      const result = lookupElement("Patient", "contact");
      expect(result).toContain("Children:");
      expect(result).toContain("relationship");
      expect(result).toContain("name");
      expect(result).toContain("telecom");
    });

    it("b4: Patient.active is modifier", () => {
      const result = lookupElement("Patient", "active");
      expect(result).toContain("?!");
    });

    it("c1: Patient.generalPractitioner references", () => {
      const result = lookupElement("Patient", "generalPractitioner");
      expect(result).toContain("Organization");
      expect(result).toContain("Practitioner");
      expect(result).toContain("PractitionerRole");
    });

    it("b6: Patient.deceased[x] types", () => {
      const result = lookupElement("Patient", "deceased[x]");
      expect(result).toContain("boolean");
      expect(result).toContain("dateTime");
      expect(result).toContain("0..1");
    });

    it("b5: Observation.value[x] types", () => {
      const result = lookupElement("Observation", "value[x]");
      expect(result).toContain("Quantity");
      expect(result).toContain("CodeableConcept");
      expect(result).toContain("string");
    });

    it("c3: Questionnaire.item has contentReference", () => {
      const ezf = getEZF("Questionnaire");
      expect(ezf).toContain("item");
      expect(ezf).toContain("@ref");
    });

    it("b7: Observation.status has required binding", () => {
      const result = lookupElement("Observation", "status");
      expect(result).toContain("required");
      expect(result).toContain("observation-status");
    });

    it("b8: MedicationRequest.dosageInstruction is 0..* Dosage", () => {
      const result = lookupElement("MedicationRequest", "dosageInstruction");
      expect(result).toContain("0..*");
      expect(result).toContain("Dosage");
    });

    it("c7: Bundle resource includes type element", () => {
      const ezf = getEZF("Bundle");
      expect(ezf).toContain("type");
      expect(ezf).toContain("required");
    });

    it("b9: Identifier datatype has expected elements", () => {
      const ezf = getEZF("Identifier");
      expect(ezf).toContain("use");
      expect(ezf).toContain("system");
      expect(ezf).toContain("value");
    });
  });
});
