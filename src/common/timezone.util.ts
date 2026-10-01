const TIME_ZONE = 'Asia/Gaza';

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZoneName: 'longOffset',
});

// Formats a UTC Date as an ISO-8601 string with the Asia/Gaza offset, e.g. 2026-10-01T12:30:00+03:00.
export function toGazaIso(date: Date): string {
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  if (hour === '24') {
    hour = '00';
  }

  const tzName = get('timeZoneName'); // e.g. "GMT+3" or "GMT+03:00"
  const offset = normalizeOffset(tzName);

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

function normalizeOffset(tzName: string): string {
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return 'Z';
  }
  const sign = match[1];
  const hours = match[2].padStart(2, '0');
  const minutes = match[3] ?? '00';
  return `${sign}${hours}:${minutes}`;
}

// Returns the Asia/Gaza offset (in minutes) that applies at the given instant.
function gazaOffsetMinutes(date: Date): number {
  const tzName =
    formatter
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return 0;
  }
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? '0');
  return sign * (hours * 60 + minutes);
}

// Shifts a UTC instant so its UTC fields equal the Asia/Gaza wall-clock time.
// Use when the database column must store Palestine local time.
export function toGazaWallClock(date: Date): Date {
  return new Date(date.getTime() + gazaOffsetMinutes(date) * 60_000);
}

