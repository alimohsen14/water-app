export class MonthlyConsumptionEntryDto {
  month!: string;
  consumption!: number | null;
  recordedDays!: number;
  isPartial!: boolean;
}

export class MonthlyConsumptionExtremeDto {
  month!: string;
  consumption!: number;
}

export class MonthlyConsumptionSummaryDto {
  highestMonth!: MonthlyConsumptionExtremeDto | null;
  lowestMonth!: MonthlyConsumptionExtremeDto | null;
  averageMonthlyConsumption!: number | null;
  monthsIncluded!: number;
}

export class MonthlyConsumptionDto {
  devEUI!: string;
  meterId!: string;
  unit!: string;
  timezone!: 'Asia/Gaza';
  year!: number;
  months!: MonthlyConsumptionEntryDto[];
  summary!: MonthlyConsumptionSummaryDto;
}
