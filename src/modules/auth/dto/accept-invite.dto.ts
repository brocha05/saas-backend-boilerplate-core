import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInviteDto {
  @ApiProperty({ description: 'Invitation token from email' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'Jane', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Doe', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  lastName: string;

  @ApiProperty({ description: 'Password (min 8 chars)', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
