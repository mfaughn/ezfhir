import type { ContentChunk } from "./types.js";
import type { TopicRegistry } from "./topicRegistry.js";

export interface ContentStoreStats {
  chunkCount: number;
  topicCount: number;
  refCount: number;
}

/**
 * In-memory store for documentation content chunks.
 *
 * Maintains secondary indexes by topic path and artifact reference so that
 * chunks can be looked up efficiently for contextual retrieval.
 */
export class ContentStore {
  private chunks: Map<string, ContentChunk> = new Map();
  /** topic path → chunk IDs */
  private topicIndex: Map<string, string[]> = new Map();
  /** artifact target → chunk IDs */
  private refIndex: Map<string, string[]> = new Map();

  constructor(private registry: TopicRegistry) {}

  /** Add a single content chunk and update all indexes. */
  add(chunk: ContentChunk): void {
    this.chunks.set(chunk.id, chunk);

    // Update topic index
    let topicChunks = this.topicIndex.get(chunk.topicPath);
    if (!topicChunks) {
      topicChunks = [];
      this.topicIndex.set(chunk.topicPath, topicChunks);
    }
    topicChunks.push(chunk.id);

    // Update ref index
    for (const ref of chunk.refs) {
      let refChunks = this.refIndex.get(ref.target);
      if (!refChunks) {
        refChunks = [];
        this.refIndex.set(ref.target, refChunks);
      }
      refChunks.push(chunk.id);
    }
  }

  /** Add multiple content chunks at once. */
  addBatch(chunks: ContentChunk[]): void {
    for (const chunk of chunks) {
      this.add(chunk);
    }
  }

  /** Retrieve a single chunk by its unique ID. */
  getById(id: string): ContentChunk | undefined {
    return this.chunks.get(id);
  }

  /**
   * Retrieve all chunks belonging to a topic.
   *
   * When `includeSubtopics` is true, also returns chunks from all
   * descendant topics. Uses both the TopicRegistry subtree and prefix
   * matching on the topic index to catch dynamically-created subtopics
   * that aren't explicitly registered.
   */
  getByTopic(topicPath: string, includeSubtopics?: boolean): ContentChunk[] {
    if (!includeSubtopics) {
      const ids = this.topicIndex.get(topicPath) ?? [];
      return ids
        .map((id) => this.chunks.get(id))
        .filter((c): c is ContentChunk => c !== undefined);
    }

    // Collect from registered subtree
    const subtree = this.registry.getSubtree(topicPath);
    const registeredPaths = new Set(subtree.map((t) => t.path));

    // Also collect from topic index via prefix matching
    const prefix = topicPath + "/";
    const result: ContentChunk[] = [];
    const seen = new Set<string>();

    for (const [path, ids] of this.topicIndex) {
      if (path === topicPath || registeredPaths.has(path) || path.startsWith(prefix)) {
        for (const id of ids) {
          if (!seen.has(id)) {
            const chunk = this.chunks.get(id);
            if (chunk) {
              result.push(chunk);
              seen.add(id);
            }
          }
        }
      }
    }

    return result;
  }

  /** Retrieve all chunks that reference a given artifact target. */
  getByRef(target: string): ContentChunk[] {
    const ids = this.refIndex.get(target) ?? [];
    return ids
      .map((id) => this.chunks.get(id))
      .filter((c): c is ContentChunk => c !== undefined);
  }

  /**
   * Simple keyword search across chunk titles, summaries, and keywords.
   *
   * Returns chunks where any search term appears (case-insensitive) in
   * the title, summary, or keywords list.
   */
  search(query: string): ContentChunk[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return [];
    }

    const results: ContentChunk[] = [];
    for (const chunk of this.chunks.values()) {
      const titleLower = chunk.title.toLowerCase();
      const summaryLower = chunk.summary.toLowerCase();
      const keywordsLower = chunk.keywords.map((k) => k.toLowerCase());

      const matches = terms.some(
        (term) =>
          titleLower.includes(term) ||
          summaryLower.includes(term) ||
          keywordsLower.some((k) => k.includes(term))
      );

      if (matches) {
        results.push(chunk);
      }
    }
    return results;
  }

  /** Return aggregate statistics about the store's contents. */
  getStats(): ContentStoreStats {
    return {
      chunkCount: this.chunks.size,
      topicCount: this.topicIndex.size,
      refCount: this.refIndex.size,
    };
  }

  /** Remove all chunks and reset all indexes. */
  clear(): void {
    this.chunks.clear();
    this.topicIndex.clear();
    this.refIndex.clear();
  }
}
