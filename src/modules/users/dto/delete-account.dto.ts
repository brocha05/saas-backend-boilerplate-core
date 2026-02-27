import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAccountDto {
  @ApiProperty({ description: 'Current password to confirm account deletion' })
  @IsString()
  password: string;
}
