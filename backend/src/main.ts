import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';

async function bootstrap() {
  // rawBody required for NORTH / crypto gateway HMAC (X-Gateway-Signature).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1');

  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  app.enableCors({
    origin: frontendOrigin.split(',').map((value) => value.trim()),
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('CS2 P2P MVP API')
    .setDescription('Backend-core for lot/order/trade MVP flow')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  // Behind nginx the API only needs loopback; HOST=127.0.0.1 keeps it off the public IP.
  const host = process.env.HOST?.trim() || '0.0.0.0';
  await app.listen(port, host);
}
void bootstrap();
