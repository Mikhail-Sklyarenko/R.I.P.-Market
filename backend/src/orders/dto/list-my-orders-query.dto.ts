import { OrderStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';

export class ListMyOrdersQueryDto {
  @IsOptional()
  @IsIn(['buyer', 'seller'])
  role?: 'buyer' | 'seller';

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
