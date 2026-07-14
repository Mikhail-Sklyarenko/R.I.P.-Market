import { IsIn } from 'class-validator';

const ACK_TYPES = [
  'SELLER_ACK_SENT',
  'BUYER_ACK_PRE_ACCEPT',
  'BUYER_ACK_RECEIVED',
] as const;

export class AcknowledgeTradeDto {
  @IsIn(ACK_TYPES)
  type!: (typeof ACK_TYPES)[number];
}
