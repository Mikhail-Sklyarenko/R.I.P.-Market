import { IsIn, IsOptional } from 'class-validator';
import type { NotificationCategory } from '../notification-category.util';

export class ListNotificationsQueryDto {
  @IsOptional()
  unreadOnly?: string;

  @IsOptional()
  @IsIn(['deals', 'money', 'system'])
  category?: NotificationCategory;
}
