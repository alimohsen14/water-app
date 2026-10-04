import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addDays, startOfGazaDay } from '../common/timezone.util.js';
import { HomeSummaryDto } from './dto/home-summary.dto.js';
import {
  MonthlyConsumptionDto,
  MonthlyConsumptionExtremeDto,
} from './dto/monthly-consumption.dto.js';
import { DailyConsumptionDto } from './dto/daily-consumption.dto.js';

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonthlyConsumption(
    devEUI: string,
    year?: string,
  ): Promise<MonthlyConsumptionDto> {
    const today = startOfGazaDay();
    const selectedYear =
      year === undefined ? today.getUTCFullYear() : this.parseYear(year);
    const meter = await this.prisma.meter.findUnique({
      where: { devEUI },
    });

    if (!meter) {
      throw new NotFoundException(`No meter found for devEUI ${devEUI}`);
    }

    const yearStart = new Date(Date.UTC(selectedYear, 0, 1));
    const nextYearStart = new Date(Date.UTC(selectedYear + 1, 0, 1));
    const tomorrow = addDays(today, 1);
    const rows = await this.prisma.dailyConsumption.findMany({
      where: {
        meterId: meter.id,
        date: {
          gte: yearStart,
          lt: nextYearStart < tomorrow ? nextYearStart : tomorrow,
        },
      },
      select: { date: true, consumption: true },
    });

    const buckets = Array.from({ length: 12 }, () => ({
      total: new Prisma.Decimal(0),
      recordedDays: 0,
    }));
    for (const row of rows) {
      // @db.Date already represents a Gaza calendar day; do not shift it again.
      const bucket = buckets[row.date.getUTCMonth()];
      bucket.total = bucket.total.plus(row.consumption);
      bucket.recordedDays++;
    }

    let highestIndex: number | null = null;
    let lowestIndex: number | null = null;
    let total = new Prisma.Decimal(0);
    let monthsIncluded = 0;
    const months = buckets.map((bucket, index) => {
      if (bucket.recordedDays > 0) {
        total = total.plus(bucket.total);
        monthsIncluded++;
        if (
          highestIndex === null ||
          bucket.total.gt(buckets[highestIndex].total)
        ) {
          highestIndex = index;
        }
        if (
          lowestIndex === null ||
          bucket.total.lt(buckets[lowestIndex].total)
        ) {
          lowestIndex = index;
        }
      }

      return {
        month: `${selectedYear}-${String(index + 1).padStart(2, '0')}`,
        consumption:
          bucket.recordedDays > 0 ? this.toNumber(bucket.total) : null,
        recordedDays: bucket.recordedDays,
        isPartial:
          selectedYear === today.getUTCFullYear() &&
          index === today.getUTCMonth(),
      };
    });
    const extreme = (
      index: number | null,
    ): MonthlyConsumptionExtremeDto | null =>
      index === null
        ? null
        : {
            month: months[index].month,
            consumption: this.toNumber(buckets[index].total),
          };

    return {
      devEUI: meter.devEUI,
      meterId: meter.meterId,
      unit: meter.unit,
      timezone: 'Asia/Gaza',
      year: selectedYear,
      months,
      summary: {
        highestMonth: extreme(highestIndex),
        lowestMonth: extreme(lowestIndex),
        averageMonthlyConsumption:
          monthsIncluded > 0 ? this.toNumber(total.div(monthsIncluded)) : null,
        monthsIncluded,
      },
    };
  }

  async getDailyConsumption(
    devEUI: string,
    month: string | undefined,
  ): Promise<DailyConsumptionDto> {
    const selectedMonth = this.parseMonth(month);
    const meter = await this.prisma.meter.findUnique({
      where: { devEUI },
    });

    if (!meter) {
      throw new NotFoundException(`No meter found for devEUI ${devEUI}`);
    }

    const monthStart = new Date(
      Date.UTC(selectedMonth.year, selectedMonth.month - 1, 1),
    );
    const nextMonthStart = new Date(
      Date.UTC(selectedMonth.year, selectedMonth.month, 1),
    );
    const rows = await this.prisma.dailyConsumption.findMany({
      where: {
        meterId: meter.id,
        date: { gte: monthStart, lt: nextMonthStart },
      },
      select: { date: true, consumption: true },
      orderBy: { date: 'desc' },
    });
    let highestIndex: number | null = null;
    let lowestIndex: number | null = null;
    for (const [index, row] of rows.entries()) {
      if (
        highestIndex === null ||
        row.consumption.gt(rows[highestIndex].consumption)
      ) {
        highestIndex = index;
      }
      if (
        lowestIndex === null ||
        row.consumption.lt(rows[lowestIndex].consumption)
      ) {
        lowestIndex = index;
      }
    }
    const toEntry = (row: (typeof rows)[number]) => ({
      date: row.date.toISOString().slice(0, 10),
      consumption: this.toNumber(row.consumption),
    });

    return {
      devEUI: meter.devEUI,
      meterId: meter.meterId,
      unit: meter.unit,
      timezone: 'Asia/Gaza',
      month: `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, '0')}`,
      days: rows.map(toEntry),
      highestConsumption:
        highestIndex === null ? null : toEntry(rows[highestIndex]),
      lowestConsumption:
        lowestIndex === null ? null : toEntry(rows[lowestIndex]),
    };
  }

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

    const [todayRow, yesterdayRow, monthAggregate] =
      await this.prisma.$transaction([
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

  private parseYear(year: string): number {
    if (typeof year !== 'string' || !/^[1-9]\d{3}$/.test(year)) {
      throw new BadRequestException(
        'year must be a four-digit year between 1000 and 9999',
      );
    }
    return Number(year);
  }

  private parseMonth(month: string | undefined): {
    year: number;
    month: number;
  } {
    const match =
      typeof month === 'string' && /^([1-9]\d{3})-(\d{2})$/.exec(month);
    if (!match) {
      throw new BadRequestException(
        'month must be in YYYY-MM format with a year between 1000 and 9999',
      );
    }

    const year = Number(match[1]);
    const monthNumber = Number(match[2]);
    if (monthNumber < 1 || monthNumber > 12) {
      throw new BadRequestException(`Invalid month: ${month}`);
    }

    return { year, month: monthNumber };
  }

  // Parses a YYYY-MM-DD test override into the matching wall-clock day start.
  private parseGazaDate(date: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }

    const [, year, month, day] = match;
    const parsed = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );

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
