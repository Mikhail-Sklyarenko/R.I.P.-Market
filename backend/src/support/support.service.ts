import { Injectable } from '@nestjs/common';
import { SupportTicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toJsonSafe } from '../common/json-safe.util';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { ReplySupportTicketDto } from './dto/reply-support-ticket.dto';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async createTicket(userId: string, dto: CreateSupportTicketDto) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        subject: dto.subject.trim(),
        body: dto.body.trim(),
      },
    });
    return toJsonSafe(ticket);
  }

  async listMyTickets(userId: string) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return toJsonSafe(tickets);
  }

  async listOpenTickets() {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { status: SupportTicketStatus.OPEN },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        user: {
          select: { id: true, username: true, steamId: true },
        },
      },
    });
    return toJsonSafe(tickets);
  }

  async replyToTicket(ticketId: string, dto: ReplySupportTicketDto) {
    const ticket = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        adminReply: dto.adminReply.trim(),
        status: SupportTicketStatus.RESOLVED,
      },
    });
    return toJsonSafe(ticket);
  }
}
