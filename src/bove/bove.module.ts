import { Module } from '@nestjs/common';
import { BoveController } from './bove.controller.js';
import { BoveService } from './bove.service.js';

@Module({
  controllers: [BoveController],
  providers: [BoveService],
})
export class BoveModule {}
