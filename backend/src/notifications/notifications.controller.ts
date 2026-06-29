import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { NotificationsService } from './notifications.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'category', required: false, enum: ['deals', 'money', 'system'] })
  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.listForUser(
      user.sub,
      query.unreadOnly === 'true',
      query.category,
    );
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllRead(user.sub);
  }

  @Patch(':id/read')
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.markRead(user.sub, notificationId);
  }
}
