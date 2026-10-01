import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { BoveService } from './bove.service.js';

@Controller('api/bove')
export class BoveController {
  constructor(private readonly boveService: BoveService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() payload: unknown) {
    return this.boveService.processPayload(payload);
  }
}
