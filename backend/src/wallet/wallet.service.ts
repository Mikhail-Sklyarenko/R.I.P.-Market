import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  async getWallet(userId: string) {
    await this.ledgerService.ensureUserWallet(userId);

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: { accounts: true },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const availableMinor =
      wallet.accounts.find((a) => a.type === 'AVAILABLE')?.balanceMinor ?? 0n;
    const holdMinor =
      wallet.accounts.find((a) => a.type === 'HOLD')?.balanceMinor ?? 0n;
    const frozenMinor =
      wallet.accounts.find((a) => a.type === 'FROZEN')?.balanceMinor ?? 0n;

    return toJsonSafe({
      ...wallet,
      summary: {
        availableMinor,
        holdMinor,
        frozenMinor,
        totalMinor: availableMinor + holdMinor + frozenMinor,
      },
    });
  }

  async getTransactions(userId: string) {
    const wallet = await this.ledgerService.ensureUserWallet(userId);

    const transactions = await this.prisma.ledgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return toJsonSafe(transactions);
  }

  async mockDeposit(
    userId: string,
    amountMinor: number,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const result = await this.ledgerService.mockDeposit(
      userId,
      BigInt(amountMinor),
      idempotencyKey,
    );

    const wallet = await this.getWallet(userId);

    return toJsonSafe({
      operation: result,
      wallet,
    });
  }

  async manualAdjustment(params: {
    targetUserId: string;
    amountMinor: number;
    reason: string;
    actorUserId: string;
    idempotencyKey: string;
  }) {
    if (!params.idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const result = await this.ledgerService.manualAdjustment({
      targetUserId: params.targetUserId,
      amountMinor: BigInt(params.amountMinor),
      reason: params.reason,
      actorUserId: params.actorUserId,
      idempotencyKey: params.idempotencyKey,
    });

    const wallet = await this.getWallet(params.targetUserId);

    return toJsonSafe({
      operation: result,
      wallet,
    });
  }
}
