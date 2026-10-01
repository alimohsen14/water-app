export class BoveReadingDto {
  devEUI!: string;
  appID!: string;
  type!: string;
  time!: string;

  MeterId!: string;
  ControlCode!: string;
  Unit!: string;
  Reading!: string;

  ValveStatus?: string | null;
  BatteryPercentage?: string | null;

  Leakage?: string | null;
  Burst?: string | null;
  Tamper?: string | null;
  BatteryWarning?: string | null;
  EmptyPipe?: string | null;
  ReverserFlow?: string | null;
  OverRange?: string | null;
  Temprature?: string | null;
  EeError?: string | null;
  InletError?: string | null;
  OutletError?: string | null;
  Freezing?: string | null;
  TransducerError?: string | null;

  [key: string]: unknown;
}

export class BoveWebhookDto {
  readings?: BoveReadingDto[];

  [key: string]: unknown;
}