import { IsString, MinLength } from 'class-validator';

/** 사용자는 KnoxID로 지정한다 (api에는 users 컬렉션이 없다 - src/common/actor.ts). */
export class AddMemberDto {
  @IsString()
  @MinLength(1)
  knoxId: string;

  @IsString()
  @MinLength(1)
  department: string;
}
