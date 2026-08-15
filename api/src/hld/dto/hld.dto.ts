import { IsOptional, IsString } from 'class-validator';

export class CreateHldReleaseDto {
  @IsOptional()
  @IsString()
  note?: string;
}
