import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrderStateService } from './order-state.service';

describe('OrderStateService', () => {
  const service = new OrderStateService();

  it('allows CREATED -> PAYMENT_RESERVED', () => {
    expect(() =>
      service.ensureTransition(
        OrderStatus.CREATED,
        OrderStatus.PAYMENT_RESERVED,
      ),
    ).not.toThrow();
  });

  it('blocks COMPLETED -> CANCELED', () => {
    expect(() =>
      service.ensureTransition(OrderStatus.COMPLETED, OrderStatus.CANCELED),
    ).toThrow(BadRequestException);
  });

  it('treats WAITING_TRADE as open status', () => {
    expect(service.isOpenStatus(OrderStatus.WAITING_TRADE)).toBe(true);
    expect(service.isOpenStatus(OrderStatus.COMPLETED)).toBe(false);
  });

  it('records order transitions in transaction', async () => {
    const orderStatusEvent = { create: jest.fn() };
    const order = { update: jest.fn() };
    const tx = { orderStatusEvent, order } as never;

    await service.transition(tx, {
      orderId: 'order-1',
      from: OrderStatus.CREATED,
      to: OrderStatus.PAYMENT_RESERVED,
      actorUserId: 'buyer-1',
    });

    expect(order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: OrderStatus.PAYMENT_RESERVED },
    });
    expect(orderStatusEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        fromStatus: OrderStatus.CREATED,
        toStatus: OrderStatus.PAYMENT_RESERVED,
        actorUserId: 'buyer-1',
      }),
    });
  });
});
