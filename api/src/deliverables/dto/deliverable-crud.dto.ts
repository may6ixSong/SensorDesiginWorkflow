import { IsIn, IsInt, IsMongoId, IsOptional, IsString, Min, MinLength, IsArray, ArrayUnique } from 'class-validator';
import { Type } from 'class-transformer';

/** GET /deliverables/:id/download?major=1&minor=0 */
export class DownloadVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  major: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  minor: number;
}

export class CreateDeliverableDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  phaseId: string;

  @IsString()
  docType: string;

  @IsIn(['OA', 'HPC'])
  network: 'OA' | 'HPC';
}

export class UpdateDeliverableDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  docType?: string;

  @IsOptional()
  @IsIn(['OA', 'HPC'])
  network?: 'OA' | 'HPC';
}

export class UpdateRecvDto {
  @IsOptional()
  @IsString()
  recvDept: string | null;

  /** 수신 담당자의 KnoxID (api에는 users 컬렉션이 없다). */
  @IsOptional()
  @IsString()
  recvContact: string | null;

  /** 이 산출물을 받아야 하는 다른 Analog Workflow. recvDept(부서)와 별개 필드. */
  @IsOptional()
  @IsMongoId()
  recvWorkflowId: string | null;

  /** 이 시스템에 없는 외부 부서로부터 받았음을 나타내는 자유 텍스트 (예: "Foundry"). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  sourceDept: string | null;
}

export class UpdateScheduleDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  phaseIds: string[];
}

export class AddVersionDto {
  @IsOptional()
  @IsString()
  storageKey?: string;

  @IsOptional()
  @IsString()
  hpcPath?: string;

  @IsString()
  fileName: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ReleaseDto {
  @IsOptional()
  @IsString()
  note?: string;
}
