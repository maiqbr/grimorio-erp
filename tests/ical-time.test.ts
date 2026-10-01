import { describe, expect, it } from "vitest";
import { calendarDate, icsDate, icsProperty } from "../worker/ical-time";

describe("Outlook ICS time zones", () => {
  it("shows a recurring Eastern meeting at 14h in Brazil during US daylight saving time", () => {
    const field = icsProperty(
      "DTSTART;TZID=Eastern Standard Time:20261001T130000",
      "DTSTART",
    );
    expect(field).toEqual({
      value: "20261001T130000",
      tzid: "Eastern Standard Time",
    });
    expect(calendarDate(icsDate(field!.value)!, field!)).toEqual({
      date: "2026-10-01",
      time: "14:00",
    });
  });

  it("applies the source zone's daylight saving change to later occurrences", () => {
    const field = { value: "20261105T130000", tzid: "Eastern Standard Time" };
    expect(calendarDate(icsDate(field.value)!, field)).toEqual({
      date: "2026-11-05",
      time: "15:00",
    });
  });

  it("converts UTC and preserves floating local times", () => {
    expect(
      calendarDate(icsDate("20261001T170000Z")!, { value: "20261001T170000Z" }),
    ).toEqual({
      date: "2026-10-01",
      time: "14:00",
    });
    expect(
      calendarDate(icsDate("20261001T140000")!, { value: "20261001T140000" }),
    ).toEqual({
      date: "2026-10-01",
      time: "14:00",
    });
  });
});
