import {
  IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf,
} from 'class-validator';

/**
 * SIREN BE가 대신 호출하는 Calypso(File Artifacts, Tier B) 프록시의 요청 몸체들
 * (설계서 07장 §2). 전부 calypso/src/artifacts/dto/artifact-crud.dto.ts의 몸체를
 * 그대로 거울처럼 옮긴 것이다 — FE가 더 이상 Calypso를 직접 호출하지 않고 이 프록시를
 * 거치므로, 검증은 SIREN BE가 한 번 더 한다.
 */
export class CreateCalypsoArtifactDto {
  @IsString()
  @MinLength(1)
  projectId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  department: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CalypsoAddVersionDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class CalypsoReleaseDto {
  @IsOptional()
  @IsString()
  note?: string;
}

/** editors/view-grants에 한 건 추가·삭제할 때 쓰는 몸체 — user 또는 department 중 하나. */
export class CalypsoGrantDto {
  @IsIn(['user', 'department'])
  type: 'user' | 'department';

  @ValidateIf((o: CalypsoGrantDto) => o.type === 'user')
  @IsString()
  @MinLength(1)
  knoxId?: string;

  @ValidateIf((o: CalypsoGrantDto) => o.type === 'department')
  @IsString()
  @MinLength(1)
  department?: string;
}
