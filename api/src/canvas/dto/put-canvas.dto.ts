export interface CanvasLayoutInput {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CanvasDeliverableInput {
  id: string;
  layout: CanvasLayoutInput;
  phaseKey: string;
}

export interface CanvasMemoInput {
  id?: string;
  phaseKey: string;
  text: string;
  layout: CanvasLayoutInput;
}

export interface CanvasEdgeInput {
  id?: string;
  fromId: string;
  toId: string;
  bidirectional: boolean;
  auto?: boolean;
}

export class PutCanvasDto {
  deliverables: CanvasDeliverableInput[];
  memos: CanvasMemoInput[];
  edges: CanvasEdgeInput[];
}
