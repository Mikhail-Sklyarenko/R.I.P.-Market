import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { cleanupOrphanItemDefinitions } from '../item-definitions/cleanup-orphan-item-definitions.util';
import { PrismaService } from '../prisma/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const report = await cleanupOrphanItemDefinitions(prisma);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
