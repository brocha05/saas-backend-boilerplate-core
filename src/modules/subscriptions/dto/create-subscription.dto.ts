import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty({
    description: 'Stripe price ID of the plan to subscribe to',
    example: 'price_1234abcd',
  })
  @IsString()
  @IsNotEmpty()
  priceId: string;
}
