import { describe, it, expect, beforeEach } from "vitest";
import { TopicRegistry } from "../../src/content/topicRegistry.js";
import type { Topic } from "../../src/content/types.js";

describe("TopicRegistry", () => {
  let registry: TopicRegistry;

  beforeEach(() => {
    registry = new TopicRegistry();
  });

  describe("default topics", () => {
    it("initializes with 7 root topics", () => {
      const roots = registry.getRoots();
      expect(roots).toHaveLength(7);
    });

    it("includes all expected root topic paths", () => {
      const paths = registry.getRoots().map((t) => t.path);
      expect(paths).toContain("foundation");
      expect(paths).toContain("exchange");
      expect(paths).toContain("terminology");
      expect(paths).toContain("conformance");
      expect(paths).toContain("security");
      expect(paths).toContain("clinical");
      expect(paths).toContain("workflow");
    });
  });

  describe("register", () => {
    it("registers a new root topic", () => {
      registry.register({
        path: "custom",
        name: "Custom",
        description: "A custom topic",
        children: [],
      });
      expect(registry.get("custom")).toBeDefined();
      expect(registry.get("custom")!.name).toBe("Custom");
    });

    it("registers a child topic and updates parent", () => {
      registry.register({
        path: "exchange/search",
        name: "Search",
        description: "FHIR search mechanism",
        parent: "exchange",
        children: [],
      });

      const child = registry.get("exchange/search");
      expect(child).toBeDefined();
      expect(child!.parent).toBe("exchange");

      const parent = registry.get("exchange");
      expect(parent!.children).toContain("exchange/search");
    });

    it("throws when parent does not exist", () => {
      expect(() =>
        registry.register({
          path: "nonexistent/child",
          name: "Child",
          description: "Orphan",
          parent: "nonexistent",
          children: [],
        })
      ).toThrow('Parent topic "nonexistent" not found');
    });

    it("does not duplicate child path if registered twice", () => {
      const topic: Topic = {
        path: "exchange/search",
        name: "Search",
        description: "FHIR search",
        parent: "exchange",
        children: [],
      };
      registry.register(topic);
      registry.register(topic);

      const parent = registry.get("exchange")!;
      const occurrences = parent.children.filter(
        (c) => c === "exchange/search"
      );
      expect(occurrences).toHaveLength(1);
    });
  });

  describe("get", () => {
    it("returns undefined for non-existent path", () => {
      expect(registry.get("does/not/exist")).toBeUndefined();
    });

    it("returns the topic for a valid path", () => {
      const topic = registry.get("foundation");
      expect(topic).toBeDefined();
      expect(topic!.name).toBe("Foundation");
    });
  });

  describe("getChildren", () => {
    it("returns empty array for topic with no children", () => {
      expect(registry.getChildren("foundation")).toEqual([]);
    });

    it("returns empty array for non-existent topic", () => {
      expect(registry.getChildren("nope")).toEqual([]);
    });

    it("returns direct children", () => {
      registry.register({
        path: "exchange/search",
        name: "Search",
        description: "Search",
        parent: "exchange",
        children: [],
      });
      registry.register({
        path: "exchange/rest",
        name: "REST",
        description: "REST",
        parent: "exchange",
        children: [],
      });

      const children = registry.getChildren("exchange");
      expect(children).toHaveLength(2);
      expect(children.map((c) => c.path)).toContain("exchange/search");
      expect(children.map((c) => c.path)).toContain("exchange/rest");
    });
  });

  describe("getSubtree", () => {
    it("returns empty array for non-existent path", () => {
      expect(registry.getSubtree("nope")).toEqual([]);
    });

    it("returns just the root when it has no children", () => {
      const subtree = registry.getSubtree("foundation");
      expect(subtree).toHaveLength(1);
      expect(subtree[0].path).toBe("foundation");
    });

    it("returns the full subtree including grandchildren", () => {
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
        description: "Search modifiers",
        parent: "exchange/search",
        children: [],
      });

      const subtree = registry.getSubtree("exchange");
      const paths = subtree.map((t) => t.path);
      expect(paths).toContain("exchange");
      expect(paths).toContain("exchange/search");
      expect(paths).toContain("exchange/search/modifiers");
    });
  });

  describe("getRoots", () => {
    it("does not include registered child topics", () => {
      registry.register({
        path: "exchange/search",
        name: "Search",
        description: "Search",
        parent: "exchange",
        children: [],
      });

      const roots = registry.getRoots();
      const paths = roots.map((r) => r.path);
      expect(paths).not.toContain("exchange/search");
    });
  });

  describe("renderIndex", () => {
    it("produces readable output with all root topics", () => {
      const index = registry.renderIndex();
      expect(index).toContain("foundation");
      expect(index).toContain("exchange");
      expect(index).toContain("terminology");
      // Each line includes the description
      expect(index).toContain("Datatypes, references, extensions");
    });

    it("indents child topics", () => {
      registry.register({
        path: "exchange/search",
        name: "Search",
        description: "FHIR search",
        parent: "exchange",
        children: [],
      });

      const index = registry.renderIndex();
      // Child should be indented with 2 spaces
      expect(index).toContain("  exchange/search");
    });
  });
});
