import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  addDays,
  startOfGazaDay,
} from '../common/timezone.util.js';
import { HomeSummaryDto } from './dto/home-summary.dto.js';

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(devEUI: string, date?: string): Promise<HomeSummaryDto> {
    const meter = await this.prisma.meter.findUnique({
      where: { devEUI },
    });

    if (!meter) {
      throw new NotFoundException(`No meter found for devEUI ${devEUI}`);
    }

    const today = date ? this.parseGazaDate(date) : startOfGazaDay();
    const yesterday = addDays(today, -1);
    const monthStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    );
    const nextMonthStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1),
    );

    const [todayRow, yesterdayRow, monthAggregate] = await this.prisma.$transaction([
      this.prisma.dailyConsumption.findUnique({
        where: { meterId_date: { meterId: meter.id, date: today } },
      }),
      this.prisma.dailyConsumption.findUnique({
        where: { meterId_date: { meterId: meter.id, date: yesterday } },
      }),
      this.prisma.dailyConsumption.aggregate({
        where: {
          meterId: meter.id,
          date: { gte: monthStart, lt: nextMonthStart },
        },
        _avg: { consumption: true },
      }),
    ]);

    return {
      devEUI: meter.devEUI,
      meterId: meter.meterId,
      unit: meter.unit,
      totalReading: this.toNumber(meter.currentReading),
      todayConsumption: this.toNumber(todayRow?.consumption),
      yesterdayConsumption: this.toNumber(yesterdayRow?.consumption),
      currentMonthDailyAverage: this.toNumber(monthAggregate._avg.consumption),
      lastReadingAt: meter.lastReadingAt,
    };
  }

  private toNumber(value: Prisma.Decimal | null | undefined): number {
    return value != null ? value.toNumber() : 0;
  }

  // Parses a YYYY-MM-DD test override into the matching wall-clock day start.
  private parseGazaDate(date: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }

    const [, year, month, day] = match;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

    if (
      parsed.getUTCFullYear() !== Number(year) ||
      parsed.getUTCMonth() !== Number(month) - 1 ||
      parsed.getUTCDate() !== Number(day)
    ) {
      throw new BadRequestException(`Invalid date: ${date}`);
    }

    return parsed;
  }
}
