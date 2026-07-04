interface EdgeLike {
  id: string;
  source: string;
  target: string;
}

// BFS forward from the clicked node over the live edge list. Cycle-guarded via
// visited-ids so a cyclic diagram (e.g. a retry loop) can't infinite-loop.
// Returns the ids of every node/edge reachable downstream, including the
// start node itself.
export function computeDownstream(startNodeId: string, edges: EdgeLike[]): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>([startNodeId]);
  const edgeIds = new Set<string>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.source !== current) continue;
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.target)) {
        nodeIds.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return { nodeIds, edgeIds };
}
