const destinationZone = "America/Sao_Paulo";

// Outlook publishes Windows zone names in TZID rather than IANA names.
const outlookZones: Record<string, string> = {
  "Pacific Standard Time": "America/Los_Angeles",
  "E. South America Standard Time": "America/Sao_Paulo",
  "Eastern Standard Time": "America/New_York",
  "Central European Standard Time": "Europe/Warsaw",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "GMT Standard Time": "Europe/London",
};

export function icsDate(raw: string) {
  const match = raw.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:\d{2})?Z?)?$/,
  );
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00"] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ),
  );
}

export function wallDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`,
  };
}

function zoneParts(date: Date, zone: string) {
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const number = (type: string) =>
    Number(fields.find((field) => field.type === type)?.value);
  return {
    year: number("year"),
    month: number("month"),
    day: number("day"),
    hour: number("hour"),
    minute: number("minute"),
  };
}

function sourceInstant(wall: Date, zone: string) {
  const target = wall.getTime();
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zoneParts(new Date(guess), zone);
    const seen = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    );
    const delta = target - seen;
    guess += delta;
    if (!delta) break;
  }
  return new Date(guess);
}

export function calendarDate(
  wall: Date,
  property: { value: string; tzid?: string },
) {
  const zone = property.tzid
    ? outlookZones[property.tzid] || property.tzid
    : null;
  if (!zone && !property.value.endsWith("Z")) return wallDate(wall);
  let instant = wall;
  if (zone) {
    try {
      instant = sourceInstant(wall, zone);
    } catch (error) {
      if (error instanceof RangeError) return wallDate(wall);
      throw error;
    }
  }
  const parts = zoneParts(instant, destinationZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

export function icsProperty(block: string, key: string) {
  const match = block.match(new RegExp(`^${key}((?:;[^:]*)?):(.*)$`, "m"));
  if (!match) return null;
  const tzid = match[1]
    .match(/(?:^|;)TZID=([^;]+)/i)?.[1]
    ?.replace(/^"|"$/g, "");
  return { value: match[2].trim(), tzid };
}
