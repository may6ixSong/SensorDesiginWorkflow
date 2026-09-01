import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * class-validator 데코레이터가 전혀 없으면 전역 ValidationPipe({ whitelist: true })가
 * 모든 필드를 걷어내 dto가 사실상 빈 객체가 된다(실측 확인된 버그) - 그래서 평범한
 * interface가 아니라 데코레이터를 가진 class로 정의한다.
 */
export class CanvasLayoutInput {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  @IsNumber()
  w: number;

  @IsNumber()
  h: number;
}

export class CanvasDeliverableInput {
  @IsString()
  id: string;

  @ValidateNested()
  @Type(() => CanvasLayoutInput)
  layout: CanvasLayoutInput;

  @IsString()
  phaseId: string;
}

export class CanvasMemoInput {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  phaseId: string;

  @IsString()
  text: string;

  @ValidateNested()
  @Type(() => CanvasLayoutInput)
  layout: CanvasLayoutInput;
}

export class CanvasEdgeInput {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  fromId: string;

  @IsString()
  toId: string;

  @IsBoolean()
  bidirectional: boolean;

  @IsOptional()
  @IsBoolean()
  auto?: boolean;
}

export class PutCanvasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanvasDeliverableInput)
  deliverables: CanvasDeliverableInput[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanvasMemoInput)
  memos: CanvasMemoInput[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanvasEdgeInput)
  edges: CanvasEdgeInput[];

  /** Phase 레인 폭(phase.id → px). 조절한 적 없으면 생략 — 기존 저장값을 그대로 둔다. */
  @IsOptional()
  @IsObject()
  phaseWidths?: Record<string, number>;
}
