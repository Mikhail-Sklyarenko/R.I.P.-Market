import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { OrderStatus, UserRole, WithdrawalRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getPaymentConfig } from '../providers/payment/payment.config';

export type WithdrawalGuardResult = {
  needsManualReview: boolean;
  priorWithdrawalCount: number;
};

@Injectable()
export class WithdrawalGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async validateAndResolveReview(userId: string, amountMinor: bigint) {
    const config = getPaymentConfig();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, steamId: true, role: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (config.withdrawRequireSteamLinked && !user.steamId) {
      throw new ForbiddenException(
        'Steam account must be linked before withdrawal',
      );
    }

    if (
      user.role === UserRole.SELLER &&
      config.withdrawMinCompletedSales > 0
    ) {
      const completedSales = await this.prisma.order.count({
        where: {
          sellerId: userId,
          status: OrderStatus.COMPLETED,
        },
      });

      if (completedSales < config.withdrawMinCompletedSales) {
        throw new ForbiddenException(
          `Minimum ${config.withdrawMinCompletedSales} completed sales required for withdrawal`,
        );
      }
    }

    if (config.withdrawDailyCapMinor > 0) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);

      const dailyTotal = await this.prisma.withdrawalRequest.aggregate({
        where: {
          userId,
          createdAt: { gte: dayStart },
          status: {
            in: [
              WithdrawalRequestStatus.PENDING_REVIEW,
              WithdrawalRequestStatus.APPROVED,
              WithdrawalRequestStatus.PROCESSING,
              WithdrawalRequestStatus.PAID,
            ],
          },
        },
        _sum: { amountMinor: true },
      });

      const usedToday = dailyTotal._sum.amountMinor ?? 0n;
      if (usedToday + amountMinor > BigInt(config.withdrawDailyCapMinor)) {
        throw new BadRequestException('Daily withdrawal limit exceeded');
      }
    }

    const priorWithdrawalCount = await this.prisma.withdrawalRequest.count({
      where: {
        userId,
        status: { not: WithdrawalRequestStatus.REJECTED },
      },
    });

    const needsManualReview =
      config.withdrawManualReview &&
      priorWithdrawalCount < config.withdrawManualReviewCount;

    return {
      needsManualReview,
      priorWithdrawalCount,
    } satisfies WithdrawalGuardResult;
  }
}
