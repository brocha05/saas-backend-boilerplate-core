import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MetricUsageDto {
  @ApiProperty({ description: 'Current usage value' }) current: number;
  @ApiPropertyOptional({ description: 'Plan limit — null means unlimited' })
  limit: number | null;
  @ApiProperty() unlimited: boolean;
}

export class UsageSummaryDto {
  @ApiProperty({ description: 'Current billing period (YYYY-MM)', example: '2026-02' })
  period: string;

  @ApiProperty({ description: 'Company ID' }) companyId: string;

  @ApiPropertyOptional({ description: 'Active plan name' }) planName?: string;

  @ApiProperty({
    description: 'Per-metric usage breakdown',
    example: {
      api_calls: { current: 3421, limit: 10000, unlimited: false },
      team_members: { current: 3, limit: 5, unlimited: false },
      files_uploaded: { current: 47, limit: 100, unlimited: false },
      storage_bytes: { current: 524288000, limit: 1073741824, unlimited: false },
    },
  })
  metrics: Record<string, MetricUsageDto>;
}
