import { Edge, Node, Position } from "@xyflow/react";
import dagre from "dagre";
import { useCallback } from "react";

export const FLOW_CONFIG = {
    nodeWidth: 420,
    nodeHeight: 360,
    nodeSpacingX: 70,
    nodeSpacingY: 90,
    rankSeparation: 90,
    edgeCurvature: 0.75,
} as const;

interface LayoutResult {
    nodes: Node[];
    edges: Edge[];
}

export function useSpaceLayout() {
    const getLayoutedElements = useCallback(
        (
            nodes: Node[],
            edges: Edge[],
            direction = "TB",
        ): LayoutResult => {
            const dagreGraph = new dagre.graphlib.Graph();
            dagreGraph.setDefaultEdgeLabel(() => ({}));

            const isHorizontal = direction === "LR";
            dagreGraph.setGraph({
                rankdir: direction,
                nodesep: FLOW_CONFIG.nodeSpacingX,
                ranksep: FLOW_CONFIG.rankSeparation,
                edgesep: 80,
                marginx: 100,
                marginy: 100,
                acyclicer: "greedy",
                ranker: "tight-tree",
            });

            nodes.forEach((node) => {
                dagreGraph.setNode(node.id, {
                    width: FLOW_CONFIG.nodeWidth,
                    height: FLOW_CONFIG.nodeHeight,
                });
            });

            edges.forEach((edge) => {
                dagreGraph.setEdge(edge.source, edge.target);
            });

            dagre.layout(dagreGraph);

            return {
                nodes: nodes.map((node) => {
                    const nodeWithPosition = dagreGraph.node(node.id);
                    return {
                        ...node,
                        targetPosition: isHorizontal
                            ? Position.Left
                            : Position.Top,
                        sourcePosition: isHorizontal
                            ? Position.Right
                            : Position.Bottom,
                        position: {
                            x: nodeWithPosition.x -
                                FLOW_CONFIG.nodeWidth / 2,
                            y: nodeWithPosition.y -
                                FLOW_CONFIG.nodeHeight / 2,
                        },
                    };
                }),
                edges: edges.map((edge) => ({
                    ...edge,
                    type: "smoothstep",
                    animated: false,
                    style: {
                        stroke: "#555",
                        strokeWidth: 2,
                        curvature: FLOW_CONFIG.edgeCurvature,
                    },
                })),
            };
        },
        [],
    );

    return { getLayoutedElements };
}
