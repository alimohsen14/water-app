export class HomeSummaryDto {
  devEUI!: string;
  meterId!: string;
  unit!: string;
  totalReading!: number;
  todayConsumption!: number;
  yesterdayConsumption!: number;
  currentMonthDailyAverage!: number;
  lastReadingAt!: Date | null;
}
