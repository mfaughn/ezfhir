import type { Topic } from "./types.js";

/** Default root topics covering the major areas of the FHIR specification. */
const DEFAULT_TOPICS: Topic[] = [
  {
    path: "foundation",
    name: "Foundation",
    description:
      "Datatypes, references, extensions, and the core element model",
    children: [],
  },
  {
    path: "exchange",
    name: "Exchange",
    description: "REST API, search, operations, bundles, and messaging",
    children: [],
  },
  {
    path: "terminology",
    name: "Terminology",
    description: "Code systems, value sets, concept maps, and bindings",
    children: [],
  },
  {
    path: "conformance",
    name: "Conformance",
    description: "Profiling, validation, and implementation guides",
    children: [],
  },
  {
    path: "security",
    name: "Security",
    description: "Authorization, consent, audit, and provenance",
    children: [],
  },
  {
    path: "clinical",
    name: "Clinical",
    description: "Resource-specific clinical guidance",
    children: [],
  },
  {
    path: "workflow",
    name: "Workflow",
    description: "State management, task patterns, and scheduling",
    children: [],
  },
];

/**
 * Manages a hierarchical topic tree.
 *
 * Topics are identified by slash-separated paths (e.g. "exchange/search").
 * The registry is pre-populated with a set of root topics covering the major
 * areas of the FHIR specification.
 */
export class TopicRegistry {
  private topics: Map<string, Topic> = new Map();

  constructor() {
    for (const topic of DEFAULT_TOPICS) {
      this.topics.set(topic.path, { ...topic, children: [...topic.children] });
    }
  }

  /**
   * Register a new topic in the hierarchy.
   *
   * If the topic specifies a parent, the parent must already exist in the
   * registry. The parent's children array is updated automatically.
   *
   * @throws Error if the parent topic does not exist.
   */
  register(topic: Topic): void {
    if (topic.parent !== undefined) {
      const parent = this.topics.get(topic.parent);
      if (!parent) {
        throw new Error(
          `Parent topic "${topic.parent}" not found when registering "${topic.path}"`
        );
      }
      if (!parent.children.includes(topic.path)) {
        parent.children.push(topic.path);
      }
    }
    this.topics.set(topic.path, {
      ...topic,
      children: [...topic.children],
    });
  }

  /** Retrieve a topic by its path, or undefined if not found. */
  get(path: string): Topic | undefined {
    return this.topics.get(path);
  }

  /** Return the direct children of a topic. */
  getChildren(path: string): Topic[] {
    const topic = this.topics.get(path);
    if (!topic) {
      return [];
    }
    return topic.children
      .map((childPath) => this.topics.get(childPath))
      .filter((t): t is Topic => t !== undefined);
  }

  /**
   * Return the topic at `path` and all of its descendants (depth-first).
   *
   * Returns an empty array if the path does not exist.
   */
  getSubtree(path: string): Topic[] {
    const root = this.topics.get(path);
    if (!root) {
      return [];
    }
    const result: Topic[] = [root];
    const stack = [...root.children];
    while (stack.length > 0) {
      const childPath = stack.pop()!;
      const child = this.topics.get(childPath);
      if (child) {
        result.push(child);
        stack.push(...child.children);
      }
    }
    return result;
  }

  /** Return all root-level topics (those with no parent). */
  getRoots(): Topic[] {
    return Array.from(this.topics.values()).filter((t) => t.parent === undefined);
  }

  /**
   * Produce a human-readable text rendering of the topic hierarchy.
   *
   * Example output:
   * ```
   * foundation/ — Datatypes, references, extensions, and the core element model
   *   foundation/datatypes — ...
   * ```
   */
  renderIndex(): string {
    const lines: string[] = [];

    const render = (topic: Topic, depth: number): void => {
      const indent = "  ".repeat(depth);
      const suffix = topic.children.length > 0 ? "/" : "";
      lines.push(`${indent}${topic.path}${suffix} — ${topic.description}`);
      for (const childPath of topic.children) {
        const child = this.topics.get(childPath);
        if (child) {
          render(child, depth + 1);
        }
      }
    };

    for (const root of this.getRoots()) {
      render(root, 0);
    }

    return lines.join("\n");
  }
}
