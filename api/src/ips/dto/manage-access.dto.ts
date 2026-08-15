import { IsMongoId, IsString } from 'class-validator';

export class AddOwnerDto {
  @IsMongoId()
  userId: string;
}

export class AddViewGrantDto {
  @IsMongoId()
  userId: string;

  @IsString()
  department: string;
}
