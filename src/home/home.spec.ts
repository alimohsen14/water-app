import {
  BadRequestException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HomeController } from './home.controller.js';
import { HomeService } from './home.service.js';

type DailyRow = { date: Date; consumption: Prisma.Decimal };
type DailyQuery = {
  where: { meterId: string; date: { gte: Date; lt: Date } };
  select: { date: boolean; consumption: boolean };
  orderBy?: { date: 'desc' };
};

describe('Home consumption', () => {
  let app: INestApplication;
  let service: HomeService;
  let rows: DailyRow[];
  const meter = {
    id: 'internal-meter-id',
    devEUI: '0123456789ABCDEF',
    meterId: 'WM-001',
    unit: 'm3',
    currentReading: new Prisma.Decimal('123.45'),
    lastReadingAt: new Date('2026-10-04T10:00:00Z'),
  };
  const prisma = {
    meter: {
      findUnique: vi.fn<() => Promise<typeof meter | null>>(),
    },
    dailyConsumption: {
      findMany: vi.fn<(query: DailyQuery) => Promise<DailyRow[]>>(),
      findUnique:
        vi.fn<() => Promise<{ consumption: Prisma.Decimal } | null>>(),
      aggregate:
        vi.fn<() => Promise<{ _avg: { consumption: Prisma.Decimal } }>>(),
    },
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const daily = (date: string, consumption: string): DailyRow => ({
    date: new Date(`${date}T00:00:00Z`),
    consumption: new Prisma.Decimal(consumption),
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HomeController],
      providers: [HomeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(HomeService);
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T07:00:00Z'));
    vi.clearAllMocks();
    rows = [];
    prisma.meter.findUnique.mockResolvedValue(meter);
    prisma.dailyConsumption.findMany.mockImplementation(
      async ({ where, orderBy }) => {
        const matchingRows = rows.filter(
          (row) => row.date >= where.date.gte && row.date < where.date.lt,
        );
        return orderBy?.date === 'desc'
          ? matchingRows.sort((a, b) => b.date.getTime() - a.date.getTime())
          : matchingRows;
      },
    );
    prisma.dailyConsumption.findUnique.mockResolvedValue(null);
    prisma.dailyConsumption.aggregate.mockResolvedValue({
      _avg: { consumption: new Prisma.Decimal('2.5') },
    });
  });

  afterEach(() => vi.useRealTimers());
  afterAll(async () => app.close());

  it('sums daily values by month and averages monthly totals rather than daily values', async () => {
    rows = [
      daily('2026-01-01', '0.1'),
      daily('2026-01-31', '0.2'),
      daily('2026-02-01', '9'),
      daily('2026-03-01', '14.5'),
      daily('2025-12-31', '500'),
      daily('2027-01-01', '500'),
    ];

    const result = await service.getMonthlyConsumption(meter.devEUI, '2026');

    expect(prisma.meter.findUnique).toHaveBeenCalledWith({
      where: { devEUI: meter.devEUI },
    });
    expect(prisma.dailyConsumption.findMany).toHaveBeenCalledWith({
      where: {
        meterId: meter.id,
        date: {
          gte: new Date('2026-01-01T00:00:00Z'),
          lt: new Date('2026-10-05T00:00:00Z'),
        },
      },
      select: { date: true, consumption: true },
    });
    expect(result).toMatchObject({
      devEUI: meter.devEUI,
      meterId: meter.meterId,
      unit: meter.unit,
      timezone: 'Asia/Gaza',
      year: 2026,
    });
    expect(result.months.map((month) => month.month)).toEqual(
      Array.from(
        { length: 12 },
        (_, i) => `2026-${String(i + 1).padStart(2, '0')}`,
      ),
    );
    expect(result.months[0]).toEqual({
      month: '2026-01',
      consumption: 0.3,
      recordedDays: 2,
      isPartial: false,
    });
    expect(result.summary).toEqual({
      highestMonth: { month: '2026-03', consumption: 14.5 },
      lowestMonth: { month: '2026-01', consumption: 0.3 },
      averageMonthlyConsumption: new Prisma.Decimal('23.8').div(3).toNumber(),
      monthsIncluded: 3,
    });
  });

  it('distinguishes recorded zero from missing data and resolves ties to the earliest month', async () => {
    rows = [
      daily('2026-01-01', '0'),
      daily('2026-02-01', '0'),
      daily('2026-03-01', '10'),
      daily('2026-04-01', '10'),
    ];

    const result = await service.getMonthlyConsumption(meter.devEUI, '2026');

    expect(result.months[0].consumption).toBe(0);
    expect(result.months[4].consumption).toBeNull();
    expect(result.summary).toEqual({
      highestMonth: { month: '2026-03', consumption: 10 },
      lowestMonth: { month: '2026-01', consumption: 0 },
      averageMonthlyConsumption: 5,
      monthsIncluded: 4,
    });
  });

  it('returns 12 empty months and null statistics when there are no records', async () => {
    const result = await service.getMonthlyConsumption(meter.devEUI);

    expect(result.year).toBe(2026);
    expect(result.months).toHaveLength(12);
    expect(
      result.months.every(
        (month) => month.consumption === null && month.recordedDays === 0,
      ),
    ).toBe(true);
    expect(result.summary).toEqual({
      highestMonth: null,
      lowestMonth: null,
      averageMonthlyConsumption: null,
      monthsIncluded: 0,
    });
  });

  it('returns only stored daily records for the selected month in descending date order', async () => {
    rows = [
      daily('2026-09-30', '500'),
      daily('2026-10-01', '2.5'),
      daily('2026-10-04', '0'),
      daily('2026-10-31', '7'),
      daily('2026-11-01', '600'),
    ];

    const result = await service.getDailyConsumption(meter.devEUI, '2026-10');

    expect(prisma.dailyConsumption.findMany).toHaveBeenCalledWith({
      where: {
        meterId: meter.id,
        date: {
          gte: new Date('2026-10-01T00:00:00Z'),
          lt: new Date('2026-11-01T00:00:00Z'),
        },
      },
      select: { date: true, consumption: true },
      orderBy: { date: 'desc' },
    });
    expect(result).toEqual({
      devEUI: meter.devEUI,
      meterId: meter.meterId,
      unit: meter.unit,
      timezone: 'Asia/Gaza',
      month: '2026-10',
      days: [
        { date: '2026-10-31', consumption: 7 },
        { date: '2026-10-04', consumption: 0 },
        { date: '2026-10-01', consumption: 2.5 },
      ],
      highestConsumption: { date: '2026-10-31', consumption: 7 },
      lowestConsumption: { date: '2026-10-04', consumption: 0 },
    });
  });

  it('returns an empty daily list when the selected month has no records', async () => {
    const result = await service.getDailyConsumption(meter.devEUI, '2026-02');

    expect(result.month).toBe('2026-02');
    expect(result.days).toEqual([]);
    expect(result.highestConsumption).toBeNull();
    expect(result.lowestConsumption).toBeNull();
  });

  it('resolves equal daily extrema to the newest recorded date', async () => {
    rows = [
      daily('2026-10-01', '2'),
      daily('2026-10-03', '0'),
      daily('2026-10-04', '2'),
      daily('2026-10-05', '0'),
    ];

    const result = await service.getDailyConsumption(meter.devEUI, '2026-10');

    expect(result.highestConsumption).toEqual({
      date: '2026-10-04',
      consumption: 2,
    });
    expect(result.lowestConsumption).toEqual({
      date: '2026-10-05',
      consumption: 0,
    });
  });

  it('includes today and the current partial month but excludes future dates', async () => {
    rows = [
      daily('2026-09-30', '3'),
      daily('2026-10-04', '7'),
      daily('2026-10-05', '100'),
      daily('2026-11-01', '100'),
    ];

    const result = await service.getMonthlyConsumption(meter.devEUI);

    expect(result.months[9]).toEqual({
      month: '2026-10',
      consumption: 7,
      recordedDays: 1,
      isPartial: true,
    });
    expect(result.months.filter((month) => month.isPartial)).toHaveLength(1);
    expect(result.months[10].consumption).toBeNull();
    expect(result.summary.averageMonthlyConsumption).toBe(5);
    expect(result.summary.monthsIncluded).toBe(2);
  });

  it('uses the Gaza year and day when the UTC date is still in the previous year', async () => {
    vi.setSystemTime(new Date('2025-12-31T22:30:00Z'));
    rows = [daily('2026-01-01', '4'), daily('2026-01-02', '100')];

    const result = await service.getMonthlyConsumption(meter.devEUI);

    expect(result.year).toBe(2026);
    expect(result.months[0]).toEqual({
      month: '2026-01',
      consumption: 4,
      recordedDays: 1,
      isPartial: true,
    });
  });

  it('uses Gaza summer midnight without shifting stored calendar dates', async () => {
    vi.setSystemTime(new Date('2026-06-30T21:30:00Z'));
    rows = [daily('2026-06-30', '2'), daily('2026-07-01', '6')];

    const result = await service.getMonthlyConsumption(meter.devEUI);

    expect(result.months[5].consumption).toBe(2);
    expect(result.months[6]).toEqual({
      month: '2026-07',
      consumption: 6,
      recordedDays: 1,
      isPartial: true,
    });
  });

  it('includes leap day and all of December for a past year', async () => {
    rows = [
      daily('2024-02-28', '2'),
      daily('2024-02-29', '3'),
      daily('2024-12-31', '9'),
      daily('2025-01-01', '100'),
    ];

    const result = await service.getMonthlyConsumption(meter.devEUI, '2024');

    expect(result.months[1].consumption).toBe(5);
    expect(result.months[11].consumption).toBe(9);
    expect(result.months.every((month) => !month.isPartial)).toBe(true);
    expect(result.summary.averageMonthlyConsumption).toBe(7);
    expect(
      prisma.dailyConsumption.findMany.mock.calls[0][0].where.date.lt,
    ).toEqual(new Date('2025-01-01T00:00:00Z'));
  });

  it('returns no data for a future year even if future records exist', async () => {
    rows = [daily('2027-01-01', '100')];

    const result = await service.getMonthlyConsumption(meter.devEUI, '2027');

    expect(result.summary.monthsIncluded).toBe(0);
    expect(
      result.months.every(
        (month) => month.consumption === null && !month.isPartial,
      ),
    ).toBe(true);
  });

  it.each([
    '',
    '26',
    '2026.5',
    '2026x',
    ' 2026',
    '0000',
    '0999',
    '10000',
    '-2026',
  ])('rejects invalid year %j', async (year) => {
    await expect(
      service.getMonthlyConsumption(meter.devEUI, year),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.dailyConsumption.findMany).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    '',
    '2026',
    '2026-1',
    '2026-13',
    '2026-00',
    '0999-12',
    '10000-01',
    '2026-02x',
  ])('rejects invalid selected month %j', async (month) => {
    await expect(
      service.getDailyConsumption(meter.devEUI, month),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.dailyConsumption.findMany).not.toHaveBeenCalled();
  });

  it('serves daily consumption over HTTP with date-only values', async () => {
    rows = [daily('2026-10-04', '0'), daily('2026-10-01', '2.5')];

    const response = await request(app.getHttpServer())
      .get(`/api/home/${meter.devEUI}/daily-consumption?month=2026-10`)
      .expect(200);

    expect(response.body).toEqual({
      devEUI: meter.devEUI,
      meterId: meter.meterId,
      unit: meter.unit,
      timezone: 'Asia/Gaza',
      month: '2026-10',
      days: [
        { date: '2026-10-04', consumption: 0 },
        { date: '2026-10-01', consumption: 2.5 },
      ],
      highestConsumption: { date: '2026-10-01', consumption: 2.5 },
      lowestConsumption: { date: '2026-10-04', consumption: 0 },
    });
  });

  it.each(['month=invalid', 'month=', 'month=2026-10&month=2026-09'])(
    'returns HTTP 400 for malformed daily-consumption query %s',
    async (query) => {
      await request(app.getHttpServer())
        .get(`/api/home/${meter.devEUI}/daily-consumption?${query}`)
        .expect(400);
    },
  );

  it('returns HTTP 404 for daily consumption on an unknown meter', async () => {
    prisma.meter.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/api/home/unknown/daily-consumption?month=2026-10')
      .expect(404);
    expect(prisma.dailyConsumption.findMany).not.toHaveBeenCalled();
  });

  it('reports an unknown meter as not found', async () => {
    prisma.meter.findUnique.mockResolvedValue(null);

    await expect(
      service.getMonthlyConsumption('unknown', '2026'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.dailyConsumption.findMany).not.toHaveBeenCalled();
  });

  it('propagates database failures instead of returning empty data', async () => {
    prisma.dailyConsumption.findMany.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(service.getMonthlyConsumption(meter.devEUI)).rejects.toThrow(
      'database unavailable',
    );
  });

  it('serves the specified HTTP endpoint and JSON response', async () => {
    rows = [daily('2026-01-01', '12.5')];

    const response = await request(app.getHttpServer())
      .get(`/api/home/${meter.devEUI}/monthly-consumption?year=2026`)
      .expect(200);

    expect(response.body.months).toHaveLength(12);
    expect(response.body.summary).toEqual({
      highestMonth: { month: '2026-01', consumption: 12.5 },
      lowestMonth: { month: '2026-01', consumption: 12.5 },
      averageMonthlyConsumption: 12.5,
      monthsIncluded: 1,
    });
  });

  it.each(['year=invalid', 'year=', 'year=2026&year=2025'])(
    'returns HTTP 400 for malformed query %s',
    async (query) => {
      await request(app.getHttpServer())
        .get(`/api/home/${meter.devEUI}/monthly-consumption?${query}`)
        .expect(400);
    },
  );

  it('returns HTTP 404 for an unknown meter', async () => {
    prisma.meter.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/api/home/unknown/monthly-consumption?year=2026')
      .expect(404);
  });

  it('preserves the existing Home summary route and response', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/home/${meter.devEUI}?date=2026-10-04`)
      .expect(200);

    expect(response.body).toEqual({
      devEUI: meter.devEUI,
      meterId: meter.meterId,
      unit: meter.unit,
      totalReading: 123.45,
      todayConsumption: 0,
      yesterdayConsumption: 0,
      currentMonthDailyAverage: 2.5,
      lastReadingAt: meter.lastReadingAt.toISOString(),
    });
    expect(prisma.dailyConsumption.findMany).not.toHaveBeenCalled();
  });
});
