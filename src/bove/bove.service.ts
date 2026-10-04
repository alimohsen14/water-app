import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addDays, toGazaWallClock, truncateToUtcDay } from '../common/timezone.util.js';
import { BoveReadingDto } from './dto/bove-webhook.dto.js';

@Injectable()
export class BoveService {
  private readonly logger = new Logger(BoveService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processPayload(payload: unknown) {
    const items = this.normalize(payload);
    const results = [];

    for (const item of items) {
      results.push(await this.saveReading(item, payload));
    }

    return {
      received: items.length,
      saved: results.length,
      readings: results,
    };
  }

  private normalize(payload: unknown): BoveReadingDto[] {
    if (Array.isArray(payload)) {
      return payload as BoveReadingDto[];
    }

    const body = payload as { readings?: BoveReadingDto[] };

    if (body && Array.isArray(body.readings)) {
      return body.readings;
    }

    return [payload as BoveReadingDto];
  }

  private async saveReading(
    item: BoveReadingDto,
    rawPayload: unknown,
  ) {
    if (!item?.devEUI) {
      throw new NotFoundException('Payload is missing devEUI');
    }

    const meter = await this.prisma.meter.findUnique({
      where: { devEUI: item.devEUI },
    });

    if (!meter) {
      throw new NotFoundException(
        `No meter found for devEUI ${item.devEUI}`,
      );
    }

    const reading = new Prisma.Decimal(item.Reading);

    const timestamp = toGazaWallClock(new Date(Number(item.time)));

    const batteryPercentage =
      item.BatteryPercentage != null
        ? Number(item.BatteryPercentage)
        : null;

    const valveStatus = item.ValveStatus ?? null;

    const savedReading = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reading.create({
        data: {
          meterId: meter.id,
          reading,
          timestamp,
          batteryPercentage,
          valveStatus,
          rawPayload: rawPayload as Prisma.InputJsonValue,
        },
      });

      // Only advance the meter's latest-value fields for the newest reading,
      // so an out-of-order (older) reading never overwrites current state.
      const isNewest =
        meter.lastReadingAt == null || timestamp >= meter.lastReadingAt;

      if (isNewest) {
        await tx.meter.update({
          where: { id: meter.id },
          data: {
            currentReading: reading,
            batteryPercentage: batteryPercentage ?? meter.batteryPercentage,
            valveStatus: valveStatus ?? meter.valveStatus,
            lastReadingAt: timestamp,
          },
        });
      }

      // Recompute the day of this reading, plus the following reading's day
      // (its delta now measures against this reading).
      const dayStart = truncateToUtcDay(timestamp);
      await this.recomputeDailyConsumption(tx, meter.id, dayStart);

      const nextReading = await tx.reading.findFirst({
        where: { meterId: meter.id, timestamp: { gt: timestamp } },
        orderBy: { timestamp: 'asc' },
      });

      if (nextReading) {
        const nextDayStart = truncateToUtcDay(nextReading.timestamp);
        if (nextDayStart.getTime() !== dayStart.getTime()) {
          await this.recomputeDailyConsumption(tx, meter.id, nextDayStart);
        }
      }

      return created;
    });

    this.logger.log(
      `Saved reading ${savedReading.id} for meter ${meter.id}`,
    );

    return savedReading;
  }

  // Recomputes a day's consumption as the sum of positive deltas between
  // consecutive readings, using the reading immediately before the day as the
  // starting baseline. Safe for duplicates, out-of-order, and decreasing values.
  private async recomputeDailyConsumption(
    tx: Prisma.TransactionClient,
    meterId: string,
    dayStart: Date,
  ) {
    const dayEnd = addDays(dayStart, 1);

    const dayReadings = await tx.reading.findMany({
      where: { meterId, timestamp: { gte: dayStart, lt: dayEnd } },
      orderBy: { timestamp: 'asc' },
    });

    if (dayReadings.length === 0) {
      await tx.dailyConsumption.deleteMany({
        where: { meterId, date: dayStart },
      });
      return;
    }

    const baseline = await tx.reading.findFirst({
      where: { meterId, timestamp: { lt: dayStart } },
      orderBy: { timestamp: 'desc' },
    });

    let total = new Prisma.Decimal(0);
    // No prior reading means this is the meter's first day: baseline is 0.
    let prevValue: Prisma.Decimal = baseline
      ? baseline.reading
      : new Prisma.Decimal(0);

    for (const r of dayReadings) {
      const delta = r.reading.minus(prevValue);
      if (delta.gt(0)) {
        total = total.plus(delta);
      }
      prevValue = r.reading;
    }

    await tx.dailyConsumption.upsert({
      where: { meterId_date: { meterId, date: dayStart } },
      create: { meterId, date: dayStart, consumption: total },
      update: { consumption: total },
    });
  }
}