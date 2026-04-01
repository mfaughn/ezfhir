import { describe, it, expect, afterEach, vi } from "vitest";
import { parsePackageList, loadConfig } from "../src/config.js";

describe("parsePackageList", () => {
  it("parses a single package", () => {
    const refs = parsePackageList("hl7.fhir.r5.core@5.0.0");
    expect(refs).toEqual([{ name: "hl7.fhir.r5.core", version: "5.0.0" }]);
  });

  it("parses multiple comma-separated packages", () => {
    const refs = parsePackageList(
      "hl7.fhir.r5.core@5.0.0,hl7.fhir.r4.core@4.0.1"
    );
    expect(refs).toEqual([
      { name: "hl7.fhir.r5.core", version: "5.0.0" },
      { name: "hl7.fhir.r4.core", version: "4.0.1" },
    ]);
  });

  it("handles whitespace around entries", () => {
    const refs = parsePackageList(
      " hl7.fhir.r5.core@5.0.0 , hl7.fhir.r4.core@4.0.1 "
    );
    expect(refs).toEqual([
      { name: "hl7.fhir.r5.core", version: "5.0.0" },
      { name: "hl7.fhir.r4.core", version: "4.0.1" },
    ]);
  });

  it("handles pre-release versions with hyphens", () => {
    const refs = parsePackageList(
      "hl7.fhir.r6.core@6.0.0-ballot4"
    );
    expect(refs).toEqual([
      { name: "hl7.fhir.r6.core", version: "6.0.0-ballot4" },
    ]);
  });

  it("handles 'latest' as version", () => {
    const refs = parsePackageList("hl7.fhir.r6.core@latest");
    expect(refs).toEqual([{ name: "hl7.fhir.r6.core", version: "latest" }]);
  });

  it("throws on empty string", () => {
    expect(() => parsePackageList("")).toThrow("empty");
  });

  it("throws on whitespace-only string", () => {
    expect(() => parsePackageList("   ")).toThrow("empty");
  });

  it("throws on missing version (no @)", () => {
    expect(() => parsePackageList("hl7.fhir.r5.core")).toThrow(
      'Invalid package reference'
    );
  });

  it("throws on missing name (starts with @)", () => {
    expect(() => parsePackageList("@5.0.0")).toThrow(
      'Invalid package reference'
    );
  });

  it("throws on trailing @ with no version", () => {
    expect(() => parsePackageList("hl7.fhir.r5.core@")).toThrow(
      'Invalid package reference'
    );
  });

  it("skips empty entries from trailing comma", () => {
    const refs = parsePackageList("hl7.fhir.r5.core@5.0.0,");
    expect(refs).toEqual([{ name: "hl7.fhir.r5.core", version: "5.0.0" }]);
  });

  it("uses lastIndexOf for @ so scoped names work", () => {
    // Edge case: package name containing @ (unlikely but defensive)
    const refs = parsePackageList("org@scope/pkg@1.0.0");
    expect(refs).toEqual([{ name: "org@scope/pkg", version: "1.0.0" }]);
  });
});

describe("loadConfig", () => {
  afterEach(() => {
    delete process.env.EZFHIR_STARTUP_PACKAGES;
  });

  it("returns default config when env var is unset", () => {
    delete process.env.EZFHIR_STARTUP_PACKAGES;
    const config = loadConfig();
    expect(config.startupPackages).toEqual([
      { name: "hl7.fhir.r5.core", version: "5.0.0" },
      { name: "hl7.fhir.r4.core", version: "4.0.1" },
    ]);
    expect(config.primaryScope).toBe("hl7.fhir.r5.core");
    expect(config.primaryVersion).toBe("5.0.0");
  });

  it("uses env var when set", () => {
    process.env.EZFHIR_STARTUP_PACKAGES = "hl7.fhir.r4.core@4.0.1";
    const config = loadConfig();
    expect(config.startupPackages).toEqual([
      { name: "hl7.fhir.r4.core", version: "4.0.1" },
    ]);
    expect(config.primaryScope).toBe("hl7.fhir.r4.core");
    expect(config.primaryVersion).toBe("4.0.1");
  });

  it("primary is always the first entry", () => {
    process.env.EZFHIR_STARTUP_PACKAGES =
      "hl7.fhir.r4.core@4.0.1,hl7.fhir.r5.core@5.0.0";
    const config = loadConfig();
    expect(config.primaryScope).toBe("hl7.fhir.r4.core");
    expect(config.primaryVersion).toBe("4.0.1");
  });
});
