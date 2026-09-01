import {
  IsIn, IsInt, IsOptional, IsString, Matches, Min, MinLength, MaxLength, IsArray, ArrayUnique,
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

  /** 'received'면 이 workflow가 받기를 기다리는 자리표시자로 만들어진다 — 생성 후 바뀌지 않는다. */
  @IsOptional()
  @IsIn(['own', 'received'])
  intent?: 'own' | 'received';
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

/**
 * recvWorkflowId(시스템 내 다른 workflow를 전달 대상으로 지정)와 sourceDept/sourceContact
 * ("받는 곳" — 외부 출처 메모)는 더 이상 이 엔드포인트로 고칠 수 없다(사용자 요청 — 전달
 * 탭은 전달 받을 부서만 남긴다). 이미 저장된 값은 건드리지 않고 그대로 둔다
 * (DeliverablesService.updateRecv 참고) — 이 DTO는 새로 쓰지 않을 필드를 아예 받지 않는다.
 */
export class UpdateRecvDto {
  @IsOptional()
  @IsString()
  recvDept: string | null;

  /** 수신 담당자의 KnoxID (api에는 users 컬렉션이 없다). */
  @IsOptional()
  @IsString()
  recvContact: string | null;
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
