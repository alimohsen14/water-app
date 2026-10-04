import { Controller, Get, Param, Query } from '@nestjs/common';
import { HomeService } from './home.service.js';

@Controller('api/home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get(':devEUI/monthly-consumption')
  async monthlyConsumption(
    @Param('devEUI') devEUI: string,
    @Query('year') year?: string,
  ) {
    return this.homeService.getMonthlyConsumption(devEUI, year);
  }

  @Get(':devEUI/daily-consumption')
  async dailyConsumption(
    @Param('devEUI') devEUI: string,
    @Query('month') month?: string,
  ) {
    return this.homeService.getDailyConsumption(devEUI, month);
  }

  @Get(':devEUI/meter-details')
  async meterDetails(@Param('devEUI') devEUI: string) {
    return this.homeService.getMeterDetails(devEUI);
  }

  @Get(':devEUI')
  async summary(@Param('devEUI') devEUI: string, @Query('date') date?: string) {
    return this.homeService.getSummary(devEUI, date);
  }
}
