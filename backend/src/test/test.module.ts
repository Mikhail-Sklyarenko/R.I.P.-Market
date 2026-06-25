import { Module } from '@nestjs/common';
import { TestResetController } from './test-reset.controller';

@Module({
  controllers: [TestResetController],
})
export class TestModule {}
