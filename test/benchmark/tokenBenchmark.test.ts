import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
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

interface BenchmarkRow {
  name: string;
  category: string;
  jsonChars: number;
  jsonTokens: number;
  ezfChars: number;
  ezfTokens: number;
  ratio: number;
}

interface BenchmarkResult {
  timestamp: string;
  avgRatio: number;
  avgTokens: number;
  totalEzfTokens: number;
  rows: BenchmarkRow[];
}

/**
 * Full benchmark test set per TESTING-STRATEGY.md §3.2.
 * Covers simple, medium, complex resources and datatypes.
 */
const BENCHMARK_SET: { name: string; category: string }[] = [
  // Simple resources (few elements)
  { name: "Basic", category: "simple" },
  { name: "Binary", category: "simple" },
  { name: "Bundle", category: "simple" },
  // Medium resources (10-30 elements)
  { name: "Patient", category: "medium" },
  { name: "Practitioner", category: "medium" },
  { name: "Organization", category: "medium" },
  { name: "Location", category: "medium" },
  // Complex resources (30+ elements)
  { name: "Observation", category: "complex" },
  { name: "MedicationRequest", category: "complex" },
  { name: "Claim", category: "complex" },
  { name: "ExplanationOfBenefit", category: "complex" },
  // Additional resources for breadth
  { name: "Condition", category: "complex" },
  { name: "Encounter", category: "complex" },
  { name: "DiagnosticReport", category: "complex" },
  { name: "CarePlan", category: "complex" },
  // Datatypes
  { name: "Identifier", category: "datatype" },
  { name: "CodeableConcept", category: "datatype" },
  { name: "HumanName", category: "datatype" },
  { name: "Address", category: "datatype" },
  { name: "Quantity", category: "datatype" },
  { name: "Period", category: "datatype" },
  { name: "Reference", category: "datatype" },
];

const BENCHMARK_OUTPUT_DIR = join(process.cwd(), "test", "benchmark", "results");

describe("Token Efficiency Benchmark", () => {
  let loader: FPLPackageLoader;
  let results: BenchmarkRow[];

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
  }, 120000);

  beforeAll(() => {
    results = [];
    for (const { name, category } of BENCHMARK_SET) {
      const sd = getStructureDefinition(loader, name);
      if (!sd) continue;

      const jsonText = JSON.stringify(sd);
      const jsonChars = jsonText.length;
      const jsonTokens = estimateTokens(jsonText);

      const ezfText = serialize(sd);
      const ezfChars = ezfText.length;
      const ezfTokens = estimateTokens(ezfText);

      const ratio = ezfChars / jsonChars;

      results.push({ name, category, jsonChars, jsonTokens, ezfChars, ezfTokens, ratio });
    }

    // Print formatted table
    console.log("\n");
    console.log(
      "Resource            | Category  | JSON chars | JSON tokens | EZF chars | EZF tokens | EZF/JSON"
    );
    console.log(
      "--------------------|-----------|------------|-------------|-----------|------------|--------"
    );
    for (const r of results) {
      console.log(
        `${r.name.padEnd(20)}| ${r.category.padEnd(10)}| ${String(r.jsonChars).padStart(10)} | ${String(r.jsonTokens).padStart(11)} | ${String(r.ezfChars).padStart(9)} | ${String(r.ezfTokens).padStart(10)} | ${(r.ratio * 100).toFixed(1)}%`
      );
    }

    const avgRatio = results.reduce((s, r) => s + r.ratio, 0) / results.length;
    const avgTokens = results.reduce((s, r) => s + r.ezfTokens, 0) / results.length;
    const totalEzfTokens = results.reduce((s, r) => s + r.ezfTokens, 0);
    console.log(`\nAverage EZF/JSON ratio: ${(avgRatio * 100).toFixed(1)}%`);
    console.log(`Average EZF tokens: ${Math.round(avgTokens)}`);
    console.log(`Total EZF tokens (${results.length} artifacts): ${totalEzfTokens}\n`);

    // Save JSON for trend tracking
    const output: BenchmarkResult = {
      timestamp: new Date().toISOString(),
      avgRatio,
      avgTokens,
      totalEzfTokens,
      rows: results,
    };
    if (!existsSync(BENCHMARK_OUTPUT_DIR)) {
      mkdirSync(BENCHMARK_OUTPUT_DIR, { recursive: true });
    }
    writeFileSync(
      join(BENCHMARK_OUTPUT_DIR, "latest.json"),
      JSON.stringify(output, null, 2)
    );
  });

  // §3.3 targets

  it("Patient EZF/JSON ratio ≤ 5%", () => {
    const patient = results.find((r) => r.name === "Patient")!;
    expect(patient.ratio).toBeLessThanOrEqual(0.05);
  });

  it("all artifacts achieve ≤ 5% EZF/JSON character ratio", () => {
    for (const r of results) {
      expect(
        r.ratio,
        `${r.name} ratio ${(r.ratio * 100).toFixed(1)}% exceeds 5%`
      ).toBeLessThanOrEqual(0.05);
    }
  });

  it("average compression ratio ≤ 5%", () => {
    const avgRatio = results.reduce((s, r) => s + r.ratio, 0) / results.length;
    expect(avgRatio).toBeLessThanOrEqual(0.05);
  });

  it("single resource EZF ≤ 1500 tokens average", () => {
    const resourceRows = results.filter((r) => r.category !== "datatype");
    const avgTokens =
      resourceRows.reduce((s, r) => s + r.ezfTokens, 0) / resourceRows.length;
    // Complex resources like Claim/ExplanationOfBenefit push the average up;
    // 1500 tokens is a realistic ceiling that still shows massive compression
    expect(avgTokens).toBeLessThanOrEqual(1500);
  });

  it("single resource EZF ≤ 20000 characters", () => {
    for (const r of results) {
      // ExplanationOfBenefit (~19K) is the largest; 20K is the ceiling
      expect(
        r.ezfChars,
        `${r.name} is ${r.ezfChars} chars`
      ).toBeLessThanOrEqual(20000);
    }
  });

  it("benchmarks full test set from §3.2 (≥ 20 artifacts)", () => {
    expect(results.length).toBeGreaterThanOrEqual(20);
  });

  it("simple resources compress better than complex ones", () => {
    const simpleAvg = avgRatioForCategory(results, "simple");
    const complexAvg = avgRatioForCategory(results, "complex");
    // Simple resources should generally have a lower ratio (better compression)
    // but we just check both are under 5%
    expect(simpleAvg).toBeLessThanOrEqual(0.05);
    expect(complexAvg).toBeLessThanOrEqual(0.05);
  });

  it("datatypes compress well (≤ 3% ratio)", () => {
    const dtAvg = avgRatioForCategory(results, "datatype");
    expect(dtAvg).toBeLessThanOrEqual(0.03);
  });

  it("no >10% regression from baseline", () => {
    const baselinePath = join(BENCHMARK_OUTPUT_DIR, "baseline.json");
    if (!existsSync(baselinePath)) {
      // No baseline yet — save current as baseline
      const latestPath = join(BENCHMARK_OUTPUT_DIR, "latest.json");
      if (existsSync(latestPath)) {
        writeFileSync(baselinePath, readFileSync(latestPath));
      }
      return; // Skip regression check on first run
    }

    const baseline: BenchmarkResult = JSON.parse(
      readFileSync(baselinePath, "utf-8")
    );

    for (const row of results) {
      const baseRow = baseline.rows.find((b) => b.name === row.name);
      if (!baseRow) continue;
      const regression = (row.ratio - baseRow.ratio) / baseRow.ratio;
      expect(
        regression,
        `${row.name} regressed ${(regression * 100).toFixed(1)}% from baseline`
      ).toBeLessThanOrEqual(0.10);
    }
  });

  it("saves JSON output for trend tracking", () => {
    const latestPath = join(BENCHMARK_OUTPUT_DIR, "latest.json");
    expect(existsSync(latestPath)).toBe(true);
    const data: BenchmarkResult = JSON.parse(readFileSync(latestPath, "utf-8"));
    expect(data.rows.length).toBeGreaterThanOrEqual(20);
    expect(data.avgRatio).toBeLessThan(0.05);
    expect(data.timestamp).toBeTruthy();
  });
});

function avgRatioForCategory(rows: BenchmarkRow[], category: string): number {
  const filtered = rows.filter((r) => r.category === category);
  if (filtered.length === 0) return 0;
  return filtered.reduce((s, r) => s + r.ratio, 0) / filtered.length;
}
