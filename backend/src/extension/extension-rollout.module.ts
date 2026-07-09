import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExtensionRolloutService } from './extension-rollout.service';

@Module({
  imports: [PrismaModule],
  providers: [ExtensionRolloutService],
  exports: [ExtensionRolloutService],
})
export class ExtensionRolloutModule {}
