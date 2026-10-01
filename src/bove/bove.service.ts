import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toGazaWallClock } from '../common/timezone.util.js';
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

    const [savedReading] = await this.prisma.$transaction([
      this.prisma.reading.create({
        data: {
          meterId: meter.id,
          reading,
          timestamp,
          batteryPercentage,
          valveStatus,
          rawPayload: rawPayload as Prisma.InputJsonValue,
        },
      }),

      this.prisma.meter.update({
        where: { id: meter.id },
        data: {
          currentReading: reading,
          batteryPercentage:
            batteryPercentage ?? meter.batteryPercentage,
          valveStatus: valveStatus ?? meter.valveStatus,
          lastReadingAt: timestamp,
        },
      }),
    ]);

    this.logger.log(
      `Saved reading ${savedReading.id} for meter ${meter.id}`,
    );

    return savedReading;
  }
}