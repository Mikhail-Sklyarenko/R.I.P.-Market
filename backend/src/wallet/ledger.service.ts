import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LedgerEntryType, Prisma, WalletAccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getAuditContext } from '../common/observability/audit-context';

type TxClient = Prisma.TransactionClient;

export type LedgerOperationResult = {
  referenceGroupId: string;
  entries: Array<{ id: string; type: LedgerEntryType; amountMinor: string }>;
};

const PLATFORM_STEAM_ID = 'steam_platform_system';

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async mockDeposit(
    userId: string,
    amountMinor: bigint,
    idempotencyKey: string,
  ): Promise<LedgerOperationResult> {
    return this.deposit({
      userId,
      amountMinor,
      idempotencyKey,
      metadata: { source: 'mock' },
    });
  }

  async deposit(params: {
    userId: string;
    amountMinor: bigint;
    idempotencyKey: string;
    metadata?: Prisma.InputJsonValue;
    tx?: TxClient;
  }): Promise<LedgerOperationResult> {
    if (params.amountMinor <= 0n) {
      throw new BadRequestException('Deposit amount must be positive');
    }

    const wallet = await this.ensureUserWallet(params.userId);
    const execute = async (client: TxClient) =>
      this.applyDeposit(client, {
        walletId: wallet.id,
        amountMinor: params.amountMinor,
        idempotencyKey: params.idempotencyKey,
        metadata: params.metadata,
      });

    return params.tx ? execute(params.tx) : this.prisma.$transaction(execute);
  }

  async withdraw(params: {
    userId: string;
    amountMinor: bigint;
    feeMinor: bigint;
    netMinor: bigint;
    idempotencyKey: string;
    withdrawalRequestId: string;
    fromFrozen?: boolean;
    metadata?: Prisma.InputJsonValue;
    tx?: TxClient;
  }): Promise<LedgerOperationResult> {
    if (
      params.amountMinor <= 0n ||
      params.feeMinor < 0n ||
      params.netMinor <= 0n
    ) {
      throw new BadRequestException('Withdrawal amounts must be positive');
    }

    if (params.netMinor + params.feeMinor !== params.amountMinor) {
      throw new BadRequestException('Withdrawal amounts are not balanced');
    }

    const wallet = await this.ensureUserWallet(params.userId);
    const accountType = params.fromFrozen
      ? WalletAccountType.FROZEN
      : WalletAccountType.AVAILABLE;

    const execute = async (client: TxClient) => {
      const existing = await this.findExistingOperation(
        client,
        wallet.id,
        params.idempotencyKey,
      );
      if (existing) {
        return existing;
      }

      const balance = await this.getAccountBalance(
        client,
        wallet.id,
        accountType,
      );
      if (balance < params.amountMinor) {
        throw new BadRequestException('Insufficient balance for withdrawal');
      }

      const referenceGroupId = crypto.randomUUID();

      await client.walletAccount.update({
        where: {
          walletId_type: { walletId: wallet.id, type: accountType },
        },
        data: { balanceMinor: { decrement: params.amountMinor } },
      });

      const withdrawEntry = await client.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: LedgerEntryType.WITHDRAW,
          amountMinor: -params.netMinor,
          idempotencyKey: params.idempotencyKey,
          referenceGroupId,
          metadata: {
            withdrawalRequestId: params.withdrawalRequestId,
            netMinor: params.netMinor.toString(),
            ...(params.metadata as object | undefined),
          },
        },
      });

      const feeEntry = await client.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: LedgerEntryType.WITHDRAW_FEE,
          amountMinor: -params.feeMinor,
          idempotencyKey: `${params.idempotencyKey}:fee`,
          referenceGroupId,
          metadata: {
            withdrawalRequestId: params.withdrawalRequestId,
            feeMinor: params.feeMinor.toString(),
          },
        },
      });

      return {
        referenceGroupId,
        entries: [
          {
            id: withdrawEntry.id,
            type: withdrawEntry.type,
            amountMinor: withdrawEntry.amountMinor.toString(),
          },
          {
            id: feeEntry.id,
            type: feeEntry.type,
            amountMinor: feeEntry.amountMinor.toString(),
          },
        ],
      };
    };

    return params.tx ? execute(params.tx) : this.prisma.$transaction(execute);
  }

  async freezeForWithdrawal(params: {
    userId: string;
    amountMinor: bigint;
    tx?: TxClient;
  }): Promise<void> {
    if (params.amountMinor <= 0n) {
      throw new BadRequestException('Freeze amount must be positive');
    }

    const wallet = await this.ensureUserWallet(params.userId);
    const execute = async (client: TxClient) => {
      const available = await this.getAccountBalance(
        client,
        wallet.id,
        WalletAccountType.AVAILABLE,
      );
      if (available < params.amountMinor) {
        throw new BadRequestException('Insufficient available balance');
      }

      await client.walletAccount.update({
        where: {
          walletId_type: {
            walletId: wallet.id,
            type: WalletAccountType.AVAILABLE,
          },
        },
        data: { balanceMinor: { decrement: params.amountMinor } },
      });

      await client.walletAccount.update({
        where: {
          walletId_type: {
            walletId: wallet.id,
            type: WalletAccountType.FROZEN,
          },
        },
        data: { balanceMinor: { increment: params.amountMinor } },
      });
    };

    if (params.tx) {
      await execute(params.tx);
      return;
    }

    await this.prisma.$transaction(execute);
  }

  async releaseWithdrawHold(params: {
    userId: string;
    amountMinor: bigint;
    tx?: TxClient;
  }): Promise<void> {
    if (params.amountMinor <= 0n) {
      throw new BadRequestException('Release amount must be positive');
    }

    const wallet = await this.ensureUserWallet(params.userId);
    const execute = async (client: TxClient) => {
      const frozen = await this.getAccountBalance(
        client,
        wallet.id,
        WalletAccountType.FROZEN,
      );
      if (frozen < params.amountMinor) {
        throw new BadRequestException('Insufficient frozen balance to release');
      }

      await client.walletAccount.update({
        where: {
          walletId_type: {
            walletId: wallet.id,
            type: WalletAccountType.FROZEN,
          },
        },
        data: { balanceMinor: { decrement: params.amountMinor } },
      });

      await client.walletAccount.update({
        where: {
          walletId_type: {
            walletId: wallet.id,
            type: WalletAccountType.AVAILABLE,
          },
        },
        data: { balanceMinor: { increment: params.amountMinor } },
      });
    };

    if (params.tx) {
      await execute(params.tx);
      return;
    }

    await this.prisma.$transaction(execute);
  }

  async refundWithdrawal(params: {
    userId: string;
    amountMinor: bigint;
    idempotencyKey: string;
    reason: string;
    withdrawalRequestId: string;
    tx?: TxClient;
  }): Promise<LedgerOperationResult> {
    if (params.amountMinor <= 0n) {
      throw new BadRequestException('Refund amount must be positive');
    }

    const wallet = await this.ensureUserWallet(params.userId);
    const execute = async (client: TxClient) => {
      const existing = await this.findExistingOperation(
        client,
        wallet.id,
        params.idempotencyKey,
      );
      if (existing) {
        return existing;
      }

      const referenceGroupId = crypto.randomUUID();

      await client.walletAccount.update({
        where: {
          walletId_type: {
            walletId: wallet.id,
            type: WalletAccountType.AVAILABLE,
          },
        },
        data: { balanceMinor: { increment: params.amountMinor } },
      });

      const entry = await client.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: LedgerEntryType.MANUAL_ADJUSTMENT,
          amountMinor: params.amountMinor,
          idempotencyKey: params.idempotencyKey,
          referenceGroupId,
          metadata: {
            reason: params.reason,
            withdrawalRequestId: params.withdrawalRequestId,
            action: 'withdrawal_refund',
          },
        },
      });

      return {
        referenceGroupId,
        entries: [
          {
            id: entry.id,
            type: entry.type,
            amountMinor: entry.amountMinor.toString(),
          },
        ],
      };
    };

    return params.tx ? execute(params.tx) : this.prisma.$transaction(execute);
  }

  async reservePurchaseHold(params: {
    buyerUserId: string;
    orderId: string;
    holdId: string;
    amountMinor: bigint;
    idempotencyKey: string;
    tx?: TxClient;
  }): Promise<LedgerOperationResult> {
    const { buyerUserId, orderId, holdId, amountMinor, idempotencyKey, tx } =
      params;

    if (amountMinor <= 0n) {
      throw new BadRequestException('Hold amount must be positive');
    }

    const wallet = await this.ensureUserWallet(buyerUserId);

    const execute = async (client: TxClient) => {
      const existing = await this.findExistingOperation(
        client,
        wallet.id,
        idempotencyKey,
      );
      if (existing) {
        return existing;
      }

      const available = await this.getAccountBalance(
        client,
        wallet.id,
        WalletAccountType.AVAILABLE,
      );

      if (available < amountMinor) {
        throw new BadRequestException('Insufficient available balance');
      }

      const referenceGroupId = crypto.randomUUID();

      await client.walletAccount.update({
        where: {
          walletId_type: {
            walletId: wallet.id,
            type: WalletAccountType.AVAILABLE,
          },
        },
        data: { balanceMinor: { decrement: amountMinor } },
      });

      await client.walletAccount.update({
        where: {
          walletId_type: { walletId: wallet.id, type: WalletAccountType.HOLD },
        },
        data: { balanceMinor: { increment: amountMinor } },
      });

      const entry = await client.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          orderId,
          holdId,
          type: LedgerEntryType.HOLD_RESERVE,
          amountMinor: -amountMinor,
          idempotencyKey,
          referenceGroupId,
          metadata: {
            direction: 'available_to_hold',
            amountMinor: amountMinor.toString(),
          },
        },
      });

      return {
        referenceGroupId,
        entries: [
          {
            id: entry.id,
            type: entry.type,
            amountMinor: entry.amountMinor.toString(),
          },
        ],
      };
    };

    return tx ? execute(tx) : this.prisma.$transaction(execute);
  }

  async settleSale(params: {
    buyerUserId: string;
    sellerUserId: string;
    orderId: string;
    holdId: string;
    totalAmountMinor: bigint;
    sellerReceiveMinor: bigint;
    commissionMinor: bigint;
    idempotencyKey: string;
    tx?: TxClient;
  }): Promise<LedgerOperationResult> {
    const {
      buyerUserId,
      sellerUserId,
      orderId,
      holdId,
      totalAmountMinor,
      sellerReceiveMinor,
      commissionMinor,
      idempotencyKey,
      tx,
    } = params;

    if (sellerReceiveMinor + commissionMinor !== totalAmountMinor) {
      throw new BadRequestException('Settlement amounts are not balanced');
    }

    const buyerWallet = await this.ensureUserWallet(buyerUserId);
    const sellerWallet = await this.ensureUserWallet(sellerUserId);
    const platformWallet = await this.ensurePlatformWallet();

    const execute = async (client: TxClient) => {
      const existing = await this.findExistingOperation(
        client,
        buyerWallet.id,
        idempotencyKey,
      );
      if (existing) {
        return existing;
      }

      const holdBalance = await this.getAccountBalance(
        client,
        buyerWallet.id,
        WalletAccountType.HOLD,
      );

      if (holdBalance < totalAmountMinor) {
        throw new BadRequestException(
          'Insufficient hold balance for settlement',
        );
      }

      const referenceGroupId = crypto.randomUUID();

      await client.walletAccount.update({
        where: {
          walletId_type: {
            walletId: buyerWallet.id,
            type: WalletAccountType.HOLD,
          },
        },
        data: { balanceMinor: { decrement: totalAmountMinor } },
      });

      await client.walletAccount.update({
        where: {
          walletId_type: {
            walletId: sellerWallet.id,
            type: WalletAccountType.AVAILABLE,
          },
        },
        data: { balanceMinor: { increment: sellerReceiveMinor } },
      });

      await client.walletAccount.update({
        where: {
          walletId_type: {
            walletId: platformWallet.id,
            type: WalletAccountType.AVAILABLE,
          },
        },
        data: { balanceMinor: { increment: commissionMinor } },
      });

      const buyerEntry = await client.ledgerEntry.create({
        data: {
          walletId: buyerWallet.id,
          orderId,
          holdId,
          type: LedgerEntryType.HOLD_RESERVE,
          amountMinor: -totalAmountMinor,
          idempotencyKey,
          referenceGroupId,
          metadata: { action: 'settlement_capture' },
        },
      });

      const sellerEntry = await client.ledgerEntry.create({
        data: {
          walletId: sellerWallet.id,
          orderId,
          holdId,
          type: LedgerEntryType.SETTLEMENT_SELLER,
          amountMinor: sellerReceiveMinor,
          idempotencyKey: `${idempotencyKey}:seller`,
          referenceGroupId,
        },
      });

      const platformEntry = await client.ledgerEntry.create({
        data: {
          walletId: platformWallet.id,
          orderId,
          holdId,
          type: LedgerEntryType.SETTLEMENT_PLATFORM_COMMISSION,
          amountMinor: commissionMinor,
          idempotencyKey: `${idempotencyKey}:platform`,
          referenceGroupId,
        },
      });

      return {
        referenceGroupId,
        entries: [
          {
            id: buyerEntry.id,
            type: buyerEntry.type,
            amountMinor: buyerEntry.amountMinor.toString(),
          },
          {
            id: sellerEntry.id,
            type: sellerEntry.type,
            amountMinor: sellerEntry.amountMinor.toString(),
          },
          {
            id: platformEntry.id,
            type: platformEntry.type,
            amountMinor: platformEntry.amountMinor.toString(),
          },
        ],
      };
    };

    return tx ? execute(tx) : this.prisma.$transaction(execute);
  }

  async refundHold(params: {
    buyerUserId: string;
    orderId: string;
    holdId: string;
    amountMinor: bigint;
    idempotencyKey: string;
    tx?: TxClient;
  }): Promise<LedgerOperationResult> {
    const { buyerUserId, orderId, holdId, amountMinor, idempotencyKey, tx } =
      params;

    if (amountMinor <= 0n) {
      throw new BadRequestException('Refund amount must be positive');
    }

    const wallet = await this.ensureUserWallet(buyerUserId);

    const execute = async (client: TxClient) => {
      const existing = await this.findExistingOperation(
        client,
        wallet.id,
        idempotencyKey,
      );
      if (existing) {
        return existing;
      }

      const holdBalance = await this.getAccountBalance(
        client,
        wallet.id,
        WalletAccountType.HOLD,
      );

      if (holdBalance < amountMinor) {
        throw new BadRequestException('Insufficient hold balance for refund');
      }

      const referenceGroupId = crypto.randomUUID();

      await client.walletAccount.update({
        where: {
          walletId_type: { walletId: wallet.id, type: WalletAccountType.HOLD },
        },
        data: { balanceMinor: { decrement: amountMinor } },
      });

      await client.walletAccount.update({
        where: {
          walletId_type: {
            walletId: wallet.id,
            type: WalletAccountType.AVAILABLE,
          },
        },
        data: { balanceMinor: { increment: amountMinor } },
      });

      const entry = await client.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          orderId,
          holdId,
          type: LedgerEntryType.REFUND,
          amountMinor,
          idempotencyKey,
          referenceGroupId,
          metadata: { direction: 'hold_to_available' },
        },
      });

      return {
        referenceGroupId,
        entries: [
          {
            id: entry.id,
            type: entry.type,
            amountMinor: entry.amountMinor.toString(),
          },
        ],
      };
    };

    return tx ? execute(tx) : this.prisma.$transaction(execute);
  }

  async manualAdjustment(params: {
    targetUserId: string;
    amountMinor: bigint;
    reason: string;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<LedgerOperationResult> {
    if (params.amountMinor === 0n) {
      throw new BadRequestException('Adjustment amount cannot be zero');
    }

    const wallet = await this.ensureUserWallet(params.targetUserId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findExistingOperation(
        tx,
        wallet.id,
        params.idempotencyKey,
      );
      if (existing) {
        return existing;
      }

      if (params.amountMinor < 0n) {
        const available = await this.getAccountBalance(
          tx,
          wallet.id,
          WalletAccountType.AVAILABLE,
        );
        if (available < -params.amountMinor) {
          throw new BadRequestException(
            'Insufficient available balance for negative adjustment',
          );
        }
      }

      const referenceGroupId = crypto.randomUUID();

      await tx.walletAccount.update({
        where: {
          walletId_type: {
            walletId: wallet.id,
            type: WalletAccountType.AVAILABLE,
          },
        },
        data: { balanceMinor: { increment: params.amountMinor } },
      });

      const entry = await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: LedgerEntryType.MANUAL_ADJUSTMENT,
          amountMinor: params.amountMinor,
          idempotencyKey: params.idempotencyKey,
          referenceGroupId,
          metadata: {
            reason: params.reason,
            actorUserId: params.actorUserId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: params.actorUserId,
          entityType: 'wallet',
          entityId: wallet.id,
          action: 'MANUAL_ADJUSTMENT',
          reason: params.reason,
          afterState: {
            amountMinor: params.amountMinor.toString(),
            entryId: entry.id,
          },
          idempotencyKey: params.idempotencyKey,
          ...getAuditContext(),
        },
      });

      return {
        referenceGroupId,
        entries: [
          {
            id: entry.id,
            type: entry.type,
            amountMinor: entry.amountMinor.toString(),
          },
        ],
      };
    });
  }

  async getAvailableBalance(userId: string): Promise<bigint> {
    const wallet = await this.ensureUserWallet(userId);
    return this.getAccountBalance(
      this.prisma,
      wallet.id,
      WalletAccountType.AVAILABLE,
    );
  }

  async ensureUserWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { userId, currency: 'USD' },
      });
    }

    await this.ensureWalletAccounts(wallet.id);
    return wallet;
  }

  async ensurePlatformWallet() {
    const platformUser = await this.prisma.user.upsert({
      where: { steamId: PLATFORM_STEAM_ID },
      create: {
        steamId: PLATFORM_STEAM_ID,
        username: 'platform_system',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      update: {},
    });

    return this.ensureUserWallet(platformUser.id);
  }

  private async applyDeposit(
    tx: TxClient,
    params: {
      walletId: string;
      amountMinor: bigint;
      idempotencyKey: string;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<LedgerOperationResult> {
    const existing = await this.findExistingOperation(
      tx,
      params.walletId,
      params.idempotencyKey,
    );
    if (existing) {
      return existing;
    }

    const referenceGroupId = crypto.randomUUID();

    await tx.walletAccount.update({
      where: {
        walletId_type: {
          walletId: params.walletId,
          type: WalletAccountType.AVAILABLE,
        },
      },
      data: { balanceMinor: { increment: params.amountMinor } },
    });

    const entry = await tx.ledgerEntry.create({
      data: {
        walletId: params.walletId,
        type: LedgerEntryType.DEPOSIT,
        amountMinor: params.amountMinor,
        idempotencyKey: params.idempotencyKey,
        referenceGroupId,
        metadata: params.metadata ?? { source: 'mock' },
      },
    });

    return {
      referenceGroupId,
      entries: [
        {
          id: entry.id,
          type: entry.type,
          amountMinor: entry.amountMinor.toString(),
        },
      ],
    };
  }

  private async ensureWalletAccounts(walletId: string): Promise<void> {
    for (const type of [
      WalletAccountType.AVAILABLE,
      WalletAccountType.HOLD,
      WalletAccountType.FROZEN,
    ]) {
      await this.prisma.walletAccount.upsert({
        where: { walletId_type: { walletId, type } },
        create: { walletId, type, balanceMinor: 0n },
        update: {},
      });
    }
  }

  private async getAccountBalance(
    client: TxClient | PrismaService,
    walletId: string,
    type: WalletAccountType,
  ): Promise<bigint> {
    const account = await client.walletAccount.findUnique({
      where: { walletId_type: { walletId, type } },
    });

    if (!account) {
      throw new NotFoundException(`Wallet account ${type} not found`);
    }

    return account.balanceMinor;
  }

  private async findExistingOperation(
    tx: TxClient,
    walletId: string,
    idempotencyKey: string,
  ): Promise<LedgerOperationResult | null> {
    const entry = await tx.ledgerEntry.findUnique({
      where: { walletId_idempotencyKey: { walletId, idempotencyKey } },
    });

    if (!entry) {
      return null;
    }

    const groupEntries = await tx.ledgerEntry.findMany({
      where: { referenceGroupId: entry.referenceGroupId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      referenceGroupId: entry.referenceGroupId ?? entry.id,
      entries: groupEntries.map((row) => ({
        id: row.id,
        type: row.type,
        amountMinor: row.amountMinor.toString(),
      })),
    };
  }
}
