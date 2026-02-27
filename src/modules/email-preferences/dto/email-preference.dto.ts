import { IsBoolean, IsOptional } from 'class-validator';

export class EmailPreferenceDto {
  billing: boolean;
  productUpdates: boolean;
  marketing: boolean;
  updatedAt: Date;
}

export class UpdateEmailPreferenceDto {
  @IsBoolean()
  @IsOptional()
  billing?: boolean;

  @IsBoolean()
  @IsOptional()
  productUpdates?: boolean;

  @IsBoolean()
  @IsOptional()
  marketing?: boolean;
}
