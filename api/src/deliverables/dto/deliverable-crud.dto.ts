import { IsIn, IsMongoId, IsOptional, IsString, MinLength, IsArray, ArrayUnique } from 'class-validator';

export class CreateDeliverableDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  phaseKey: string;

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

  @IsOptional()
  @IsMongoId()
  recvContact: string | null;
}

export class UpdateScheduleDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  phaseKeys: string[];
}

export class CreateUploadUrlDto {
  @IsString()
  fileName: string;

  @IsString()
  contentType: string;
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
