import { describe, it, expect, beforeEach } from "vitest";
import { ContentStore } from "../../src/content/contentStore.js";
import { TopicRegistry } from "../../src/content/topicRegistry.js";
import type { ContentChunk } from "../../src/content/types.js";

function makeChunk(overrides: Partial<ContentChunk> = {}): ContentChunk {
  return {
    id: "test-chunk-1",
    topicPath: "exchange",
    title: "Test Chunk",
    summary: "A test chunk for unit testing",
    body: "Full body content here.",
    source: { type: "fhir-spec", name: "FHIR R5" },
    refs: [],
    keywords: ["test", "search"],
    ...overrides,
  };
}

describe("ContentStore", () => {
  let registry: TopicRegistry;
  let store: ContentStore;

  beforeEach(() => {
    registry = new TopicRegistry();
    store = new ContentStore(registry);
  });

  describe("add and getById", () => {
    it("stores and retrieves a chunk by ID", () => {
      const chunk = makeChunk();
      store.add(chunk);
      expect(store.getById("test-chunk-1")).toEqual(chunk);
    });

    it("returns undefined for unknown ID", () => {
      expect(store.getById("nonexistent")).toBeUndefined();
    });
  });

  describe("addBatch", () => {
    it("adds multiple chunks at once", () => {
      const chunks = [
        makeChunk({ id: "a" }),
        makeChunk({ id: "b" }),
        makeChunk({ id: "c" }),
      ];
      store.addBatch(chunks);
      expect(store.getById("a")).toBeDefined();
      expect(store.getById("b")).toBeDefined();
      expect(store.getById("c")).toBeDefined();
    });
  });

  describe("topic index", () => {
    it("indexes chunks by topic path", () => {
      store.add(makeChunk({ id: "ch1", topicPath: "exchange" }));
      store.add(makeChunk({ id: "ch2", topicPath: "exchange" }));
      store.add(makeChunk({ id: "ch3", topicPath: "foundation" }));

      const exchangeChunks = store.getByTopic("exchange");
      expect(exchangeChunks).toHaveLength(2);
      expect(exchangeChunks.map((c) => c.id)).toContain("ch1");
      expect(exchangeChunks.map((c) => c.id)).toContain("ch2");

      const foundationChunks = store.getByTopic("foundation");
      expect(foundationChunks).toHaveLength(1);
    });

    it("returns empty array for topic with no chunks", () => {
      expect(store.getByTopic("security")).toEqual([]);
    });
  });

  describe("ref index", () => {
    it("indexes chunks by artifact reference target", () => {
      store.add(
        makeChunk({
          id: "ref-chunk",
          refs: [
            { type: "resource", target: "Patient" },
            { type: "element", target: "Patient.gender" },
          ],
        })
      );

      const patientChunks = store.getByRef("Patient");
      expect(patientChunks).toHaveLength(1);
      expect(patientChunks[0].id).toBe("ref-chunk");

      const genderChunks = store.getByRef("Patient.gender");
      expect(genderChunks).toHaveLength(1);
      expect(genderChunks[0].id).toBe("ref-chunk");
    });

    it("returns empty array for unknown ref target", () => {
      expect(store.getByRef("Unknown")).toEqual([]);
    });

    it("finds multiple chunks referencing same target", () => {
      store.add(
        makeChunk({
          id: "ch1",
          refs: [{ type: "resource", target: "Patient" }],
        })
      );
      store.add(
        makeChunk({
          id: "ch2",
          refs: [{ type: "resource", target: "Patient" }],
        })
      );

      expect(store.getByRef("Patient")).toHaveLength(2);
    });
  });

  describe("getByTopic with includeSubtopics", () => {
    it("includes chunks from child topics", () => {
      registry.register({
        path: "exchange/search",
        name: "Search",
        description: "Search",
        parent: "exchange",
        children: [],
      });
      registry.register({
        path: "exchange/search/modifiers",
        name: "Modifiers",
        description: "Modifiers",
        parent: "exchange/search",
        children: [],
      });

      store.add(makeChunk({ id: "root", topicPath: "exchange" }));
      store.add(makeChunk({ id: "child", topicPath: "exchange/search" }));
      store.add(
        makeChunk({ id: "grandchild", topicPath: "exchange/search/modifiers" })
      );

      const all = store.getByTopic("exchange", true);
      expect(all).toHaveLength(3);
      expect(all.map((c) => c.id)).toContain("root");
      expect(all.map((c) => c.id)).toContain("child");
      expect(all.map((c) => c.id)).toContain("grandchild");
    });

    it("without includeSubtopics only returns direct topic chunks", () => {
      registry.register({
        path: "exchange/search",
        name: "Search",
        description: "Search",
        parent: "exchange",
        children: [],
      });

      store.add(makeChunk({ id: "root", topicPath: "exchange" }));
      store.add(makeChunk({ id: "child", topicPath: "exchange/search" }));

      const direct = store.getByTopic("exchange");
      expect(direct).toHaveLength(1);
      expect(direct[0].id).toBe("root");
    });
  });

  describe("search", () => {
    beforeEach(() => {
      store.add(
        makeChunk({
          id: "s1",
          title: "Search Parameters",
          summary: "How to use search parameters in FHIR",
          keywords: ["search", "parameters"],
        })
      );
      store.add(
        makeChunk({
          id: "s2",
          title: "Patient Resource",
          summary: "The Patient resource for demographics",
          keywords: ["patient", "demographics"],
        })
      );
    });

    it("finds chunks by keyword match in title", () => {
      const results = store.search("Patient");
      expect(results.map((c) => c.id)).toContain("s2");
    });

    it("finds chunks by keyword match in summary", () => {
      const results = store.search("demographics");
      expect(results.map((c) => c.id)).toContain("s2");
    });

    it("finds chunks by keyword match in keywords array", () => {
      const results = store.search("parameters");
      expect(results.map((c) => c.id)).toContain("s1");
    });

    it("is case-insensitive", () => {
      const results = store.search("PATIENT");
      expect(results.map((c) => c.id)).toContain("s2");
    });

    it("returns empty array for no matches", () => {
      expect(store.search("nonexistent")).toEqual([]);
    });

    it("returns empty array for empty query", () => {
      expect(store.search("")).toEqual([]);
    });
  });

  describe("getStats", () => {
    it("returns correct counts", () => {
      store.add(
        makeChunk({
          id: "ch1",
          topicPath: "exchange",
          refs: [{ type: "resource", target: "Patient" }],
        })
      );
      store.add(
        makeChunk({
          id: "ch2",
          topicPath: "foundation",
          refs: [{ type: "datatype", target: "string" }],
        })
      );

      const stats = store.getStats();
      expect(stats.chunkCount).toBe(2);
      expect(stats.topicCount).toBe(2);
      expect(stats.refCount).toBe(2);
    });

    it("returns zeros when empty", () => {
      const stats = store.getStats();
      expect(stats).toEqual({ chunkCount: 0, topicCount: 0, refCount: 0 });
    });
  });

  describe("clear", () => {
    it("removes all data and resets indexes", () => {
      store.add(
        makeChunk({
          refs: [{ type: "resource", target: "Patient" }],
        })
      );

      store.clear();

      expect(store.getById("test-chunk-1")).toBeUndefined();
      expect(store.getByTopic("exchange")).toEqual([]);
      expect(store.getByRef("Patient")).toEqual([]);
      expect(store.getStats()).toEqual({
        chunkCount: 0,
        topicCount: 0,
        refCount: 0,
      });
    });
  });
});
