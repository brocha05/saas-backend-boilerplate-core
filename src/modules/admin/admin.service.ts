import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Companies ─────────────────────────────────────────────────────────────

  async getCompanies(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          deletedAt: true,
          createdAt: true,
          _count: { select: { users: { where: { deletedAt: null } } } },
          subscriptions: {
            where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
              plan: { select: { name: true, price: true, currency: true } },
            },
          },
        },
      }),
      this.prisma.company.count(),
    ]);

    return {
      data: companies.map((c) => ({
        ...c,
        userCount: c._count.users,
        activeSubscription: c.subscriptions[0] ?? null,
        _count: undefined,
        subscriptions: undefined,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getCompany(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        stripeCustomerId: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        users: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            emailVerified: true,
            createdAt: true,
          },
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            canceledAt: true,
            createdAt: true,
            plan: {
              select: { name: true, slug: true, price: true, currency: true },
            },
          },
        },
      },
    });

    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async deactivateCompany(id: string): Promise<{ message: string }> {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');
    if (company.deletedAt) return { message: 'Company is already deactivated' };

    await this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Company deactivated' };
  }

  async reactivateCompany(id: string): Promise<{ message: string }> {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');
    if (!company.deletedAt) return { message: 'Company is already active' };

    await this.prisma.company.update({
      where: { id },
      data: { deletedAt: null },
    });

    return { message: 'Company reactivated' };
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  async getSubscriptions(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [subscriptions, total] = await Promise.all([
      this.prisma.subscription.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          createdAt: true,
          plan: { select: { name: true, slug: true, price: true, currency: true } },
          company: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.subscription.count(),
    ]);

    return {
      data: subscriptions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
