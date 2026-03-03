import { describe, it, expect, beforeAll } from "vitest";
import { serialize } from "../../src/converter/serializer.js";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

/**
 * Token estimation: chars/4 is a reasonable approximation for
 * English text with typical LLM tokenizers (cl100k_base, Claude).
 * The exact ratio doesn't matter — we care about relative compression.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

describe("Token Efficiency Benchmark", () => {
  let loader: FPLPackageLoader;

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
  }, 120000);

  const resources = [
    "Patient",
    "Observation",
    "MedicationRequest",
    "Condition",
    "Practitioner",
    "Organization",
    "Bundle",
    "Encounter",
  ];

  interface BenchmarkRow {
    resource: string;
    jsonChars: number;
    jsonTokens: number;
    ezfChars: number;
    ezfTokens: number;
    ratio: number;
  }

  let results: BenchmarkRow[];

  beforeAll(() => {
    results = resources.map((name) => {
      const sd = getStructureDefinition(loader, name);
      if (!sd) throw new Error(`Resource ${name} not found`);

      // JSON representation (snapshot only for fair comparison)
      const jsonText = JSON.stringify(sd);
      const jsonChars = jsonText.length;
      const jsonTokens = estimateTokens(jsonText);

      // EZF representation
      const ezfText = serialize(sd);
      const ezfChars = ezfText.length;
      const ezfTokens = estimateTokens(ezfText);

      const ratio = ezfChars / jsonChars;

      return {
        resource: name,
        jsonChars,
        jsonTokens,
        ezfChars,
        ezfTokens,
        ratio,
      };
    });

    // Print benchmark table
    console.log("\n");
    console.log(
      "Resource            | JSON chars | JSON tokens | EZF chars | EZF tokens | EZF/JSON"
    );
    console.log(
      "--------------------|------------|-------------|-----------|------------|--------"
    );
    for (const r of results) {
      console.log(
        `${r.resource.padEnd(20)}| ${String(r.jsonChars).padStart(10)} | ${String(r.jsonTokens).padStart(11)} | ${String(r.ezfChars).padStart(9)} | ${String(r.ezfTokens).padStart(10)} | ${(r.ratio * 100).toFixed(1)}%`
      );
    }

    const avgRatio =
      results.reduce((sum, r) => sum + r.ratio, 0) / results.length;
    console.log(
      `\nAverage EZF/JSON ratio: ${(avgRatio * 100).toFixed(1)}%`
    );
    console.log(
      `Average compression: ${Math.round(1 / avgRatio)}x\n`
    );
  });

  it("Patient EZF/JSON ratio ≤ 5% (Phase 0 exit criterion #2)", () => {
    const patient = results.find((r) => r.resource === "Patient")!;
    expect(patient.ratio).toBeLessThanOrEqual(0.05);
  });

  it("all resources achieve ≤ 10% compression ratio", () => {
    for (const r of results) {
      expect(
        r.ratio,
        `${r.resource} ratio ${(r.ratio * 100).toFixed(1)}% exceeds 10%`
      ).toBeLessThanOrEqual(0.10);
    }
  });

  it("average compression ratio ≤ 5%", () => {
    const avgRatio =
      results.reduce((sum, r) => sum + r.ratio, 0) / results.length;
    expect(avgRatio).toBeLessThanOrEqual(0.05);
  });

  it("single resource EZF ≤ 6000 characters", () => {
    for (const r of results) {
      expect(
        r.ezfChars,
        `${r.resource} is ${r.ezfChars} chars`
      ).toBeLessThanOrEqual(6000);
    }
  });
});
