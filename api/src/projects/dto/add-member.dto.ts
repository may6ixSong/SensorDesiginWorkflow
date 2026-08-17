import { IsMongoId, IsString } from 'class-validator';

export class AddMemberDto {
  @IsMongoId()
  userId: string;

  @IsString()
  department: string;
}
