import { IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class ListAdminOrdersQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
