import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanInterval } from '@prisma/client';

export class CreatePlanDto {
  @ApiProperty({ example: 'Pro' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'pro' })
  @IsString()
  slug: string;

  @ApiProperty({ example: 'price_xxx' })
  @IsString()
  stripePriceId: string;

  @ApiProperty({ example: 'prod_xxx' })
  @IsString()
  stripeProductId: string;

  @ApiProperty({ enum: PlanInterval })
  @IsEnum(PlanInterval)
  interval: PlanInterval;

  @ApiProperty({ example: 7900, description: 'Price in cents' })
  @IsInt()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'usd' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: ['5 users', 'Email support'] })
  @IsOptional()
  features?: string[];

  @ApiPropertyOptional({ example: { users: 5, storage_gb: 10 } })
  @IsOptional()
  limits?: Record<string, unknown>;
}
