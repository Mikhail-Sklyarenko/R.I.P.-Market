import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { SUPPORT_TICKET_TOPIC_LABELS } from '../support-ticket-topics';

export class CreateSupportTicketDto {
  @IsString()
  @IsIn([...SUPPORT_TICKET_TOPIC_LABELS])
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  body!: string;
}
