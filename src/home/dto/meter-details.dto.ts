export class MeterDetailsDto {
  meterNumber!: string;
  lastUpdate!: Date | null;
  batteryPercentage!: number | null;
  valveStatus!: string | null;
}
