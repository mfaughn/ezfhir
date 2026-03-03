/**
 * Search index for FHIR spec artifacts.
 *
 * Builds a lunr.js index over resource names, descriptions, element paths,
 * search params, and operations for fast full-text search.
 */

import lunr from "lunr";
import type { PackageLoader as FPLPackageLoader } from "fhir-package-loader";

export interface SearchResult {
  name: string;
  type: string;
  description: string;
  score: number;
}

interface IndexDoc {
  id: string;
  name: string;
  kind: string;
  description: string;
  elements: string;
  searchParams: string;
}

let index: lunr.Index | null = null;
const docMap = new Map<string, IndexDoc>();

/**
 * Builds the search index from a loaded FHIR package.
 */
export function buildSearchIndex(
  loader: FPLPackageLoader,
  scope: string
): void {
  const docs: IndexDoc[] = [];

  const infos = loader.findResourceInfos("*", {
    type: ["StructureDefinition"],
    scope,
  });

  // Pre-build search param lookup: resourceName -> param names
  const searchParamsByResource = new Map<string, string[]>();
  const spInfos = loader.findResourceInfos("*", {
    type: ["SearchParameter"],
    scope,
  });
  for (const spInfo of spInfos) {
    if (!spInfo.name) continue;
    const sp = loader.findResourceJSON(spInfo.name, {
      type: ["SearchParameter"],
      scope,
    }) as Record<string, unknown> | undefined;
    if (!sp) continue;
    const base = sp.base as string[] | undefined;
    if (base) {
      for (const b of base) {
        const existing = searchParamsByResource.get(b) || [];
        existing.push(sp.name as string);
        searchParamsByResource.set(b, existing);
      }
    }
  }

  for (const info of infos) {
    if (!info.name) continue;
    const sd = loader.findResourceJSON(info.name, {
      type: ["StructureDefinition"],
      scope,
    }) as Record<string, unknown> | undefined;
    if (!sd) continue;

    const kind = sd.kind as string;
    if (sd.abstract) continue;

    // Collect element paths and short descriptions
    const elementTexts: string[] = [];
    const snapshot = sd.snapshot as { element?: Array<Record<string, unknown>> } | undefined;
    if (snapshot?.element) {
      for (const el of snapshot.element.slice(0, 50)) {
        const path = el.path as string;
        if (path) elementTexts.push(path.split(".").pop() || "");
        if (el.short) elementTexts.push(el.short as string);
      }
    }

    const name = sd.name as string;
    const paramNames = searchParamsByResource.get(name) || [];

    const doc: IndexDoc = {
      id: name,
      name,
      kind,
      description: ((sd.description as string) || "").slice(0, 200),
      elements: elementTexts.join(" "),
      searchParams: paramNames.join(" "),
    };

    docs.push(doc);
    docMap.set(doc.id, doc);
  }

  index = lunr(function () {
    this.ref("id");
    this.field("name", { boost: 10 });
    this.field("description", { boost: 3 });
    this.field("elements", { boost: 1 });
    this.field("searchParams", { boost: 2 });

    for (const doc of docs) {
      this.add(doc);
    }
  });
}

/**
 * Searches the spec index.
 * Returns up to `limit` results sorted by relevance.
 */
export function searchSpec(query: string, limit = 10): SearchResult[] {
  if (!index) throw new Error("Search index not built. Call buildSearchIndex first.");

  let results: lunr.Index.Result[];
  try {
    results = index.search(query);
  } catch {
    // lunr throws on some query syntax errors; try as wildcard
    try {
      results = index.search(`${query}*`);
    } catch {
      return [];
    }
  }

  return results.slice(0, limit).map((r) => {
    const doc = docMap.get(r.ref)!;
    return {
      name: doc.name,
      type: doc.kind,
      description: doc.description,
      score: r.score,
    };
  });
}
