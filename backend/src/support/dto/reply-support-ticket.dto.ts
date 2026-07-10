import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReplySupportTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  adminReply!: string;
}
