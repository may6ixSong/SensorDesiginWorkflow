import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { LayoutDto } from '../../blocks/dto/block-crud.dto';

export class CanvasBlockDto {
  @IsString()
  id: string;

  @IsString()
  phaseId: string;

  @ValidateNested()
  @Type(() => LayoutDto)
  layout: LayoutDto;
}

export class CanvasMemoDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  phaseId: string;

  @IsString()
  text: string;

  @ValidateNested()
  @Type(() => LayoutDto)
  layout: LayoutDto;
}

export class CanvasEdgeDto {
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

/**
 * 캔버스 일괄 저장. 배치 계산은 전부 FE 메모리에서 이뤄지고, BE는 좌표의 최소 유효성과
 * phaseId 실재 여부만 검사한 뒤 신뢰하고 저장한다.
 *
 * ★ **이 PUT만이 canvasLock을 요구한다**(설계서 03장 §3.3).
 */
export class PutCanvasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanvasBlockDto)
  blocks: CanvasBlockDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanvasMemoDto)
  memos: CanvasMemoDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanvasEdgeDto)
  edges: CanvasEdgeDto[];

  @IsOptional()
  @IsObject()
  phaseWidths?: Record<string, number>;
}
