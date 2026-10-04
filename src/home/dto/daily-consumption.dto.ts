export class DailyConsumptionEntryDto {
  date!: string;
  consumption!: number;
}

export class DailyConsumptionDto {
  devEUI!: string;
  meterId!: string;
  unit!: string;
  timezone!: 'Asia/Gaza';
  month!: string;
  days!: DailyConsumptionEntryDto[];
  highestConsumption!: DailyConsumptionEntryDto | null;
  lowestConsumption!: DailyConsumptionEntryDto | null;
}
