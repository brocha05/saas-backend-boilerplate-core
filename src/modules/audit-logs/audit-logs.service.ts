import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';
import type { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

export interface PaginatedAuditLogs {
  data: AuditLogResponseDto[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    query: QueryAuditLogsDto,
  ): Promise<PaginatedAuditLogs> {
    const {
      page = 1,
      limit = 20,
      skip,
      userId,
      resource,
      action,
      method,
      statusCode,
      startDate,
      endDate,
    } = query;

    const where: Prisma.AuditLogWhereInput = {
      companyId,
      ...(userId && { userId }),
      ...(resource && { resource }),
      // action supports prefix-matching: "users" matches "users.create", "users.list", etc.
      ...(action && {
        action: { startsWith: action, mode: Prisma.QueryMode.insensitive },
      }),
      ...(method && { method }),
      ...(statusCode && { statusCode }),
      ...((startDate ?? endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs.map(AuditLogResponseDto.fromEntity),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, companyId: string): Promise<AuditLogResponseDto> {
    const log = await this.prisma.auditLog.findFirst({
      where: { id, companyId },
    });
    if (!log) throw new NotFoundException('Audit log entry not found');
    return AuditLogResponseDto.fromEntity(log);
  }
}
