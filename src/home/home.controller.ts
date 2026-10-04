import { Controller, Get, Param, Query } from '@nestjs/common';
import { HomeService } from './home.service.js';

@Controller('api/home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get(':devEUI')
  async summary(
    @Param('devEUI') devEUI: string,
    @Query('date') date?: string,
  ) {
    return this.homeService.getSummary(devEUI, date);
  }
}
