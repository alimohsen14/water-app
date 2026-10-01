import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { TimezoneInterceptor } from './common/timezone.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new TimezoneInterceptor());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
