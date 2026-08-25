import { IsString, MinLength } from 'class-validator';

/**
 * 사용자는 KnoxID로 지정한다. api는 사용자의 실제 소속을 조회할 수 없으므로
 * department도 요청이 함께 보내며, 서버는 그 값으로 검증하고 그대로 저장한다.
 */
export class AddOwnerDto {
  @IsString()
  @MinLength(1)
  knoxId: string;

  @IsString()
  @MinLength(1)
  department: string;
}

export class AddViewGrantDto {
  @IsString()
  @MinLength(1)
  knoxId: string;

  @IsString()
  @MinLength(1)
  department: string;
}
