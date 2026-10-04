import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { BoveModule } from './bove/bove.module.js';
import { HomeModule } from './home/home.module.js';

@Module({
  imports: [PrismaModule, BoveModule, HomeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
