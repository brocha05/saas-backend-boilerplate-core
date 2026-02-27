import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../../../common/interfaces';

export const SUBSCRIPTION_FEATURE_KEY = 'requiredFeature';
export const RequiresFeature = (feature: string) =>
  SetMetadata(SUBSCRIPTION_FEATURE_KEY, feature);

@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(ActiveSubscriptionGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    if (!user?.companyId) {
      throw new ForbiddenException('Company context required');
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        companyId: user.companyId,
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
      include: { plan: true },
    });

    if (!subscription) {
      throw new ForbiddenException(
        'Active subscription required. Please subscribe to access this feature.',
      );
    }

    // Check specific feature flag if required
    const requiredFeature = this.reflector.getAllAndOverride<string>(
      SUBSCRIPTION_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredFeature) {
      const features = (subscription.plan.features as string[]) ?? [];
      if (!features.includes(requiredFeature)) {
        throw new ForbiddenException(
          `Feature "${requiredFeature}" is not available on your current plan. Please upgrade.`,
        );
      }
    }

    // Attach subscription to request for downstream use
    request.subscription = subscription;

    return true;
  }
}
