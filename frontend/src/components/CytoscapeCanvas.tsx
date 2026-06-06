import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalyzeResponse, GraphNode } from '../types/graph';

cytoscape.use(dagre);

const DAGRE_NODE_LIMIT = 300;

interface Props {
  analysis: AnalyzeResponse;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

export function CytoscapeCanvas({
  analysis,
  selectedNodeId,
  onSelectNode,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const flowRef = useRef<number | null>(null);

  const [pathState, setPathState] = useState<{ nodes: string[]; index: number }>({
    nodes: [],
    index: -1,
  });

  const onSelectRef = useRef(onSelectNode);
  useEffect(() => {
    onSelectRef.current = onSelectNode;
  }, [onSelectNode]);

  const reverseAdj = useMemo(
    () => buildReverseAdjacency(analysis),
    [analysis],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: STYLESHEET,
      wheelSensitivity: 0.2,
      elements: [],
      minZoom: 0.05,
      maxZoom: 3,
    });

    cy.on('tap', 'node', (evt) => {
      onSelectRef.current(evt.target.id());
    });
    cy.on('tap', (evt) => {
      if (evt.target === cy) onSelectRef.current(null);
    });

    cyRef.current = cy;
    return () => {
      if (flowRef.current !== null) {
        clearInterval(flowRef.current);
        flowRef.current = null;
      }
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.stop(true, true);
    cy.elements().remove();
    cy.add(toElements(analysis));

    const n = cy.nodes().length;
    if (n <= 1) {
      cy.layout({ name: 'preset' }).run();
      cy.fit(undefined, 60);
      return;
    }

    const useDagre = n <= DAGRE_NODE_LIMIT;

    const layout = useDagre
      ? cy.layout({
          name: 'dagre',
          rankDir: 'TB',
          nodeSep: 40,
          edgeSep: 16,
          rankSep: 60,
          animate: false,
        } as cytoscape.LayoutOptions)
      : cy.layout({
          name: 'concentric',
          concentric: (node: cytoscape.NodeSingular) => {
            if (node.data('isRoot')) return 9999;
            const d = node.data('depth') as number | undefined;
            if (d === undefined || d < 0) return -9999;
            return -d;
          },
          levelWidth: () => 1,
          minNodeSpacing: 14,
          padding: 30,
          spacingFactor: 0.9,
          animate: false,
        } as cytoscape.LayoutOptions);

    layout.on('layoutstop', () => {
      cy.fit(undefined, 50);

      if (cy.zoom() > 1.8) {
        cy.zoom(1.8);
        const root = cy.nodes().filter((node) => node.data('isRoot'))[0];
        cy.center(root ?? cy.nodes()[0]);
      } else if (!useDagre) {
        const root = cy.nodes().filter((node) => node.data('isRoot'))[0];
        cy.center(root ?? cy.nodes()[0]);
      }
    });
    
    layout.run();
  }, [analysis]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (flowRef.current !== null) {
      clearInterval(flowRef.current);
      flowRef.current = null;
    }

    cy.elements().removeClass('selected exposed dimmed exposed-edge step-focus');
    cy.edges().style('line-dash-offset', 0);

    if (!selectedNodeId) {
      setPathState({ nodes: [], index: -1 });
      return;
    }

    const selected = cy.getElementById(selectedNodeId);
    if (selected.length === 0) return;
    selected.addClass('selected');

    const path = shortestPathToRoot(reverseAdj, selectedNodeId);

    if (path.length <= 1) {
      setPathState({ nodes: path, index: 0 });
      return;
    }

    const pathIndexMap = new Map<string, number>();
    path.forEach((id, i) => pathIndexMap.set(id, i));

    cy.nodes().forEach((node) => {
      if (pathIndexMap.has(node.id()) && node.id() !== selectedNodeId) {
        node.addClass('exposed');
      }
    });

    cy.edges().forEach((edge) => {
      const s = pathIndexMap.get(edge.source().id());
      const t = pathIndexMap.get(edge.target().id());
      if (s !== undefined && t !== undefined && t === s + 1) {
        edge.addClass('exposed-edge');
      }
    });

    cy.elements().forEach((el) => {
      const onPath =
        el.hasClass('selected') ||
        el.hasClass('exposed') ||
        el.hasClass('exposed-edge');
      if (!onPath) el.addClass('dimmed');
    });

    setPathState({ nodes: path, index: path.length - 1 });

    let offset = 0;
    flowRef.current = window.setInterval(() => {
      const cyNow = cyRef.current;
      if (!cyNow) return;
      offset = (offset - 1) % 18;
      cyNow.edges('.exposed-edge').style('line-dash-offset', offset);
    }, 55);
  }, [selectedNodeId, reverseAdj]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || pathState.nodes.length === 0 || pathState.index < 0) return;

    const currentId = pathState.nodes[pathState.index];
    const currentNode = cy.getElementById(currentId);

    if (currentNode.length > 0) {
      cy.nodes().removeClass('step-focus');
      currentNode.addClass('step-focus');

      cy.animate({
        center: { eles: currentNode },
        zoom: 1.8, 
        duration: 350,
        easing: 'ease-out-cubic',
      });
    }
  }, [pathState]);

  const handleZoom = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0 bg-[#ffffff]" />

      {pathState.nodes.length > 1 && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-[#ffffff] border border-[#000000] shadow-sm rounded-full px-2 py-1.5 flex items-center gap-3 z-20 font-mono text-[#000000]">
          <button
            onClick={() => setPathState((s) => ({ ...s, index: Math.max(0, s.index - 1) }))}
            disabled={pathState.index === 0}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f1f5f9] disabled:opacity-20 transition-colors text-lg pb-0.5"
            aria-label="Previous step"
          >
            ←
          </button>
          <span className="font-semibold uppercase tracking-widest text-[10px] min-w-[80px] text-center">
            {pathState.index === 0
              ? 'Root'
              : pathState.index === pathState.nodes.length - 1
              ? 'Target'
              : `Step ${pathState.index}`}
            <span className="font-normal opacity-50 ml-1">
              ({pathState.index + 1}/{pathState.nodes.length})
            </span>
          </span>
          <button
            onClick={() =>
              setPathState((s) => ({
                ...s,
                index: Math.min(s.nodes.length - 1, s.index + 1),
              }))
            }
            disabled={pathState.index === pathState.nodes.length - 1}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f1f5f9] disabled:opacity-20 transition-colors text-lg pb-0.5"
            aria-label="Next step"
          >
            →
          </button>
        </div>
      )}

      <div className="absolute bottom-6 right-6 flex flex-col gap-1.5 z-10">
        <button
          onClick={() => handleZoom(1.25)}
          className="w-8 h-8 flex items-center justify-center bg-[#ffffff] text-[#000000] border border-[#000000] rounded shadow-sm hover:bg-[#f1f5f9] transition-colors font-mono text-lg"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => handleZoom(0.8)}
          className="w-8 h-8 flex items-center justify-center bg-[#ffffff] text-[#000000] border border-[#000000] rounded shadow-sm hover:bg-[#f1f5f9] transition-colors font-mono text-lg"
          aria-label="Zoom out"
        >
          -
        </button>
      </div>
    </div>
  );
}

function buildReverseAdjacency(analysis: AnalyzeResponse): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of analysis.graph.edges) {
    let parents = m.get(e.target);
    if (!parents) {
      parents = [];
      m.set(e.target, parents);
    }
    parents.push(e.source);
  }
  return m;
}

function shortestPathToRoot(
  reverseAdj: Map<string, string[]>,
  startId: string,
): string[] {
  const from = new Map<string, string>();
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];
  let root: string | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const parents = reverseAdj.get(current);
    if (!parents || parents.length === 0) {
      root = current;
      break;
    }
    for (const p of parents) {
      if (!visited.has(p)) {
        visited.add(p);
        from.set(p, current);
        queue.push(p);
      }
    }
  }

  if (root === null) return [startId];

  const path: string[] = [];
  let curr: string | undefined = root;
  while (curr !== undefined) {
    path.push(curr);
    curr = from.get(curr);
  }
  return path;
}

function toElements(analysis: AnalyzeResponse): ElementDefinition[] {
  const elements: ElementDefinition[] = [];

  for (const node of analysis.graph.nodes) {
    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label: shortLabel(node),
        size: nodeSize(node),
        vulnerable: node.vulnerabilities.length > 0,
        isRoot: node.isRoot,
        isDirect: node.isDirect,
        depth: node.depth,
        cveCount: node.vulnerabilities.length,
      },
    });
  }

  for (const edge of analysis.graph.edges) {
    elements.push({
      group: 'edges',
      data: {
        id: `${edge.source}|${edge.target}`,
        source: edge.source,
        target: edge.target,
      },
    });
  }

  return elements;
}

function shortLabel(node: GraphNode): string {
  return node.name;
}

function nodeSize(node: GraphNode): number {
  const base = 14;
  const k = 5.5;
  const scale = Math.log2(node.reachableFromCount + 1) * k;
  return Math.min(base + scale, 52);
}

const SIGNAL = '#e84a3b';
const SIGNAL_DEEP = '#991b1b';

const STYLESHEET: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': '#ffffff',
      'border-color': '#000000',
      'border-width': 1,
      width: 'data(size)' as unknown as number,
      height: 'data(size)' as unknown as number,
      shape: 'ellipse',
      label: 'data(label)',
      'font-family': '"Geist Mono", monospace',
      'font-size': 9,
      'font-weight': 400,
      color: '#000000',
      'text-margin-y': -6,
      'text-valign': 'top',
      'text-halign': 'center',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.8,
      'text-background-padding': '2px',
      'text-background-shape': 'roundrectangle',
      'transition-property': 'background-color, border-color, border-width, opacity',
      'transition-duration': 180,
    },
  },
  {
    selector: 'node[?isDirect]',
    style: {
      'background-color': '#f1f5f9',
      'border-color': '#000000',
    },
  },
  {
    selector: 'node[?isRoot]',
    style: {
      'background-color': '#000000',
      'border-color': '#000000',
      'border-width': 2,
      color: '#ffffff',
      'font-weight': 500,
      'font-size': 11,
      'text-background-color': '#000000',
    },
  },
  {
    selector: 'node[?vulnerable]',
    style: {
      'background-color': SIGNAL,
      'border-color': SIGNAL_DEEP,
      color: SIGNAL,
      'border-width': 1.5,
    },
  },
  {
    selector: 'node.selected',
    style: {
      'border-color': '#000000',
      'border-width': 4,
      'font-size': 12,
      'font-weight': 600,
      'z-index': 30,
    },
  },
  {
    selector: 'node.exposed',
    style: {
      'border-color': SIGNAL,
      'border-width': 2.5,
      color: SIGNAL,
      opacity: 1,
      'z-index': 20,
    },
  },
  {
    selector: 'node.dimmed',
    style: {
      opacity: 0.15,
    },
  },
  {
    selector: 'node.step-focus',
    style: {
      'underlay-color': '#000000',
      'underlay-padding': 6,
      'underlay-opacity': 0.15,
      'border-width': 3,
      'transition-property': 'underlay-opacity, border-width',
      'transition-duration': 250,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1,
      'line-color': '#000000',
      'target-arrow-color': '#000000',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.7,
      'curve-style': 'bezier',
      opacity: 0.35,
      'transition-property': 'line-color, opacity, width',
      'transition-duration': 180,
    },
  },
  {
    selector: 'edge.exposed-edge',
    style: {
      'line-color': SIGNAL,
      'target-arrow-color': SIGNAL,
      width: 3,
      opacity: 1,
      'z-index': 25,
      'line-style': 'dashed',
      'line-dash-pattern': [10, 6],
    },
  },
  {
    selector: 'edge.dimmed',
    style: {
      opacity: 0.05,
    },
  },
];