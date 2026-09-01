import {
  IsIn, IsInt, IsMongoId, IsOptional, IsString, Matches, Min, MinLength, MaxLength, IsArray, ArrayUnique,
} from 'class-validator';
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

  /**
   * 표시 이름(name)과 분리된 안정적 식별자 — 향후 외부 시스템 연동 시 이름 변경에
   * 영향받지 않는 매핑 키로 쓰기 위한 필드다(설계서 §8.1). 같은 workflow 안에서
   * 유일해야 한다(BE 검증, DeliverablesService.update) — series 인스턴스끼리는 같은
   * key를 공유할 수 있다(같은 실물 산출물의 회차이므로). 빈 문자열을 보내면 지운다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9_.-]*$/, {
    message: 'Artifact key may only contain letters, numbers, dot, underscore and hyphen.',
  })
  artifactKey?: string;
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

  /** 받을 때의 개별 연락처 (KnoxID 계정이 없을 수 있어 자유 텍스트). */
  @IsOptional()
  @IsString()
  sourceContact: string | null;
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
