import type { IndicatorMetadata } from "../api/indicators";

export type IndicatorTree = {
  childrenByParent: Map<string, string[]>;
  parentByChild: Map<string, string>;
  rootAncestorUri: (uri: string) => string;
  ancestorsOf: (uri: string) => string[];
};

export function buildIndicatorTree(metadata: IndicatorMetadata[]): IndicatorTree {
  const known = new Set(metadata.map((m) => m.uri));
  const childrenByParent = new Map<string, string[]>();
  const parentByChild = new Map<string, string>();

  const addEdge = (parent: string, child: string) => {
    if (parent === child) return;
    if (!known.has(parent) || !known.has(child)) return;
    if (parentByChild.has(child)) return;
    if (wouldCycle(parent, child, parentByChild)) return;

    parentByChild.set(child, parent);
    const list = childrenByParent.get(parent);
    if (list) list.push(child);
    else childrenByParent.set(parent, [child]);
  };

  for (const ind of metadata) {
    for (const childUri of ind.detailedIndicators) addEdge(ind.uri, childUri);
    for (const parentUri of ind.generalIndicators) addEdge(parentUri, ind.uri);
  }

  const ancestorsOf = (uri: string): string[] => {
    const out: string[] = [];
    const seen = new Set<string>([uri]);
    let cur = parentByChild.get(uri);
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      out.push(cur);
      cur = parentByChild.get(cur);
    }
    return out;
  };

  const rootAncestorUri = (uri: string): string => {
    const chain = ancestorsOf(uri);
    return chain.length > 0 ? chain[chain.length - 1] : uri;
  };

  return { childrenByParent, parentByChild, rootAncestorUri, ancestorsOf };
}

function wouldCycle(parent: string, child: string, parentByChild: Map<string, string>): boolean {
  const seen = new Set<string>();
  let cur: string | undefined = parent;
  while (cur && !seen.has(cur)) {
    if (cur === child) return true;
    seen.add(cur);
    cur = parentByChild.get(cur);
  }
  return false;
}
