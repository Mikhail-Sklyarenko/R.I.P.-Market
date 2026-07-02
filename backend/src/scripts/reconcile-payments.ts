import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PaymentReconciliationService } from '../payments/payment-reconciliation.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const reconciliation = app.get(PaymentReconciliationService);
    const report = await reconciliation.reconcile();

    console.log(JSON.stringify(report, null, 2));

    if (!report.ok) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
