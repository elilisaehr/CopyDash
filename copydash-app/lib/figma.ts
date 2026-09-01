// Server-only Figma REST API client. Never import this from a "use client"
// file — the Personal Access Token this talks with must stay server-side.
// Called from app/api/figma/* Route Handlers (Node.js runtime by default,
// so no edge-runtime bundling risk).

export interface FigmaTextBlock {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: "left" | "center" | "right" | "justify";
  lineHeight: number | null;
}

export interface FigmaImportResult {
  fileKey: string;
  nodeId: string;
  fileName: string;
  frameName: string;
  imageUrl: string;
  width: number;
  height: number;
  blocks: FigmaTextBlock[];
}

const FIGMA_API = "https://api.figma.com/v1";

/** Accepts a figma.com/design/... or figma.com/file/... URL with a node-id query param. */
export function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("figma.com")) return null;
    const match = u.pathname.match(/\/(file|design)\/([a-zA-Z0-9]+)/);
    const nodeIdParam = u.searchParams.get("node-id");
    if (!match || !nodeIdParam) return null;
    return { fileKey: match[2], nodeId: nodeIdParam.replace(/-/g, ":") };
  } catch {
    return null;
  }
}

export async function verifyFigmaToken(token: string): Promise<{ name: string; email: string } | null> {
  const res = await fetch(`${FIGMA_API}/me`, { headers: { "X-Figma-Token": token } });
  if (!res.ok) return null;
  const data = await res.json();
  return { name: data.handle || data.email || "Figma", email: data.email || "" };
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  characters?: string;
  style?: {
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: number;
    textAlignHorizontal?: string;
    lineHeightPx?: number;
  };
  fills?: { type: string; color?: { r: number; g: number; b: number; a: number } }[];
  children?: FigmaNode[];
}

function collectTextNodes(node: FigmaNode, out: FigmaNode[]) {
  if (node.type === "TEXT" && node.characters && node.characters.trim()) out.push(node);
  (node.children || []).forEach((c) => collectTextNodes(c, out));
}

function colorToCss(fills?: FigmaNode["fills"]): string {
  const fill = fills?.find((f) => f.type === "SOLID" && f.color);
  if (!fill?.color) return "#0b0b0c";
  const { r, g, b } = fill.color;
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

const ALIGN_MAP: Record<string, FigmaTextBlock["textAlign"]> = {
  LEFT: "left",
  CENTER: "center",
  RIGHT: "right",
  JUSTIFIED: "justify",
};

/**
 * Fetches one Figma frame's text nodes (exact content/position/style — no
 * geometry-detection heuristics needed, unlike the PDF import path) and a
 * rendered PNG of the frame to use as the background image.
 */
export async function importFigmaFrame(
  token: string,
  fileKey: string,
  nodeId: string,
  scale = 2,
): Promise<FigmaImportResult | { error: string }> {
  const headers = { "X-Figma-Token": token };

  const nodesRes = await fetch(`${FIGMA_API}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`, { headers });
  if (!nodesRes.ok) {
    return {
      error:
        nodesRes.status === 403 || nodesRes.status === 404
          ? "Impossible d'accéder à ce fichier Figma — vérifiez le lien et que votre jeton y a accès."
          : `Erreur Figma (${nodesRes.status}).`,
    };
  }
  const nodesData = await nodesRes.json();
  const fileName = (nodesData.name as string) || "Figma file";
  const entry = nodesData.nodes?.[nodeId];
  if (!entry?.document) return { error: "Ce lien Figma ne pointe vers aucun cadre valide." };
  const frame: FigmaNode = entry.document;
  const box = frame.absoluteBoundingBox;
  if (!box) return { error: "Ce nœud Figma n'a pas de dimensions — sélectionnez un cadre (frame)." };

  const imagesRes = await fetch(
    `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${scale}`,
    { headers },
  );
  if (!imagesRes.ok) return { error: `Erreur lors du rendu de l'image Figma (${imagesRes.status}).` };
  const imagesData = await imagesRes.json();
  const imageUrl = imagesData.images?.[nodeId];
  if (!imageUrl) return { error: "Figma n'a pas pu générer d'image pour ce cadre." };

  const textNodes: FigmaNode[] = [];
  collectTextNodes(frame, textNodes);

  const blocks: FigmaTextBlock[] = textNodes
    .filter((n) => n.absoluteBoundingBox)
    .map((n) => {
      const b = n.absoluteBoundingBox!;
      return {
        id: n.id,
        x: (b.x - box.x) * scale,
        y: (b.y - box.y) * scale,
        w: b.width * scale,
        h: b.height * scale,
        text: n.characters || "",
        fontSize: (n.style?.fontSize || 14) * scale,
        fontWeight: n.style?.fontWeight || 400,
        color: colorToCss(n.fills),
        textAlign: ALIGN_MAP[n.style?.textAlignHorizontal || "LEFT"] || "left",
        lineHeight: n.style?.lineHeightPx ? n.style.lineHeightPx * scale : null,
      };
    });

  return {
    fileKey,
    nodeId,
    fileName,
    frameName: frame.name,
    imageUrl,
    width: Math.round(box.width * scale),
    height: Math.round(box.height * scale),
    blocks,
  };
}
