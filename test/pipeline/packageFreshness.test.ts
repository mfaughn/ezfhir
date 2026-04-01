import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isPrereleaseVersion,
  isPrereleaseStale,
  invalidatePackageCache,
} from "../../src/pipeline/packageFreshness.js";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";

describe("isPrereleaseVersion", () => {
  it("detects -ballot suffix", () => {
    expect(isPrereleaseVersion("6.0.0-ballot4")).toBe(true);
  });

  it("detects -draft suffix", () => {
    expect(isPrereleaseVersion("5.1.0-draft2")).toBe(true);
  });

  it("detects -snapshot suffix", () => {
    expect(isPrereleaseVersion("6.0.0-snapshot1")).toBe(true);
  });

  it("detects -cibuild suffix", () => {
    expect(isPrereleaseVersion("6.0.0-cibuild")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isPrereleaseVersion("6.0.0-BALLOT4")).toBe(true);
    expect(isPrereleaseVersion("6.0.0-Draft")).toBe(true);
  });

  it("returns false for stable versions", () => {
    expect(isPrereleaseVersion("5.0.0")).toBe(false);
    expect(isPrereleaseVersion("4.0.1")).toBe(false);
  });

  it("returns false for 'latest'", () => {
    expect(isPrereleaseVersion("latest")).toBe(false);
  });
});

describe("isPrereleaseStale", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false for stable versions", async () => {
    expect(await isPrereleaseStale("hl7.fhir.r5.core", "5.0.0")).toBe(false);
  });

  it("returns false when local cache does not exist", async () => {
    // No cache dir means nothing to be stale
    expect(
      await isPrereleaseStale("hl7.fhir.r6.core", "6.0.0-ballot99")
    ).toBe(false);
  });

  it("returns false when registry is unreachable", async () => {
    // Mock fetch to fail
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));

    // Create a fake cache
    const cachePath = join(
      homedir(),
      ".fhir",
      "packages",
      "test.freshness.pkg#1.0.0-ballot1",
      "package"
    );
    mkdirSync(cachePath, { recursive: true });
    writeFileSync(
      join(cachePath, "package.json"),
      JSON.stringify({ date: "2024-01-01" })
    );

    try {
      expect(
        await isPrereleaseStale("test.freshness.pkg", "1.0.0-ballot1")
      ).toBe(false);
    } finally {
      rmSync(
        join(
          homedir(),
          ".fhir",
          "packages",
          "test.freshness.pkg#1.0.0-ballot1"
        ),
        { recursive: true, force: true }
      );
    }
  });

  it("returns true when registry has newer date", async () => {
    // Mock fetch to return newer date
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ date: "2025-06-01" }),
    } as Response);

    // Create a fake cache with older date
    const cachePath = join(
      homedir(),
      ".fhir",
      "packages",
      "test.freshness.pkg2#1.0.0-draft1",
      "package"
    );
    mkdirSync(cachePath, { recursive: true });
    writeFileSync(
      join(cachePath, "package.json"),
      JSON.stringify({ date: "2024-01-01" })
    );

    try {
      expect(
        await isPrereleaseStale("test.freshness.pkg2", "1.0.0-draft1")
      ).toBe(true);
    } finally {
      rmSync(
        join(
          homedir(),
          ".fhir",
          "packages",
          "test.freshness.pkg2#1.0.0-draft1"
        ),
        { recursive: true, force: true }
      );
    }
  });

  it("returns false when registry has same or older date", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ date: "2024-01-01" }),
    } as Response);

    const cachePath = join(
      homedir(),
      ".fhir",
      "packages",
      "test.freshness.pkg3#1.0.0-snapshot1",
      "package"
    );
    mkdirSync(cachePath, { recursive: true });
    writeFileSync(
      join(cachePath, "package.json"),
      JSON.stringify({ date: "2024-01-01" })
    );

    try {
      expect(
        await isPrereleaseStale("test.freshness.pkg3", "1.0.0-snapshot1")
      ).toBe(false);
    } finally {
      rmSync(
        join(
          homedir(),
          ".fhir",
          "packages",
          "test.freshness.pkg3#1.0.0-snapshot1"
        ),
        { recursive: true, force: true }
      );
    }
  });
});

describe("invalidatePackageCache", () => {
  it("removes cache directory when it exists", () => {
    const cachePath = join(
      homedir(),
      ".fhir",
      "packages",
      "test.invalidate.pkg#1.0.0-ballot1"
    );
    mkdirSync(join(cachePath, "package"), { recursive: true });
    writeFileSync(
      join(cachePath, "package", "package.json"),
      JSON.stringify({})
    );

    expect(existsSync(cachePath)).toBe(true);
    invalidatePackageCache("test.invalidate.pkg", "1.0.0-ballot1");
    expect(existsSync(cachePath)).toBe(false);
  });

  it("does not throw when cache does not exist", () => {
    expect(() =>
      invalidatePackageCache("nonexistent.pkg", "1.0.0-ballot1")
    ).not.toThrow();
  });
});
