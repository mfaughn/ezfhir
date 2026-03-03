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

  it("has 8 evaluation questions", () => {
    expect(questions).toHaveLength(8);
  });

  it("all questions have required fields", () => {
    for (const q of questions) {
      expect(q.id).toBeDefined();
      expect(q.question).toBeTruthy();
      expect(q.referenceAnswer).toBeTruthy();
      expect(q.keyFacts.length).toBeGreaterThan(0);
    }
  });

  it("questions cover diverse categories", () => {
    const categories = new Set(questions.map((q) => q.category));
    expect(categories.size).toBeGreaterThanOrEqual(5);
  });

  it("at least 2 questions have high hallucination risk", () => {
    const highRisk = questions.filter((q) => q.hallucinationRisk === "high");
    expect(highRisk.length).toBeGreaterThanOrEqual(2);
  });

  describe("reference answers are verifiable via EZF", () => {
    it("q1: Patient.identifier cardinality is 0..*", () => {
      const result = lookupElement("Patient", "identifier");
      expect(result).toContain("0..*");
      expect(result).toContain("Identifier");
    });

    it("q2: Patient.gender binding is required", () => {
      const result = lookupElement("Patient", "gender");
      expect(result).toContain("required");
      expect(result).toContain("administrative-gender");
    });

    it("q3: Patient.contact has children", () => {
      const result = lookupElement("Patient", "contact");
      expect(result).toContain("Children:");
      expect(result).toContain("relationship");
      expect(result).toContain("name");
      expect(result).toContain("telecom");
    });

    it("q4: Patient.active is modifier", () => {
      const result = lookupElement("Patient", "active");
      expect(result).toContain("?!");
    });

    it("q5: Patient.generalPractitioner references", () => {
      const result = lookupElement("Patient", "generalPractitioner");
      expect(result).toContain("Organization");
      expect(result).toContain("Practitioner");
      expect(result).toContain("PractitionerRole");
    });

    it("q6: Patient.deceased[x] types", () => {
      const result = lookupElement("Patient", "deceased[x]");
      expect(result).toContain("boolean");
      expect(result).toContain("dateTime");
      expect(result).toContain("0..1");
    });

    it("q7: Observation.value[x] types", () => {
      const result = lookupElement("Observation", "value[x]");
      expect(result).toContain("Quantity");
      expect(result).toContain("CodeableConcept");
      expect(result).toContain("string");
    });

    it("q8: Questionnaire.item has EZF representation", () => {
      const ezf = getEZF("Questionnaire");
      expect(ezf).toContain("item");
      expect(ezf).toContain("@ref");
    });
  });
});
