import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { ReplySupportTicketDto } from './dto/reply-support-ticket.dto';
import { SupportService } from './support.service';

@ApiTags('support')
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('tickets')
  async createTicket(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateSupportTicketDto,
  ) {
    return this.supportService.createTicket(user.sub, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('tickets')
  async listMyTickets(@CurrentUser() user: AuthUser) {
    return this.supportService.listMyTickets(user.sub);
  }
}

@ApiTags('admin-support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('tickets')
  async listOpenTickets() {
    return this.supportService.listOpenTickets();
  }

  @Patch('tickets/:id/reply')
  async replyToTicket(
    @Param('id') ticketId: string,
    @Body() body: ReplySupportTicketDto,
  ) {
    return this.supportService.replyToTicket(ticketId, body);
  }
}
