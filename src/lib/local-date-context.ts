export type LocalDateContext = {
  date: string;
  time: string;
  timezone: string;
};

export function getLocalDateContext(timezone: string, now = new Date()): LocalDateContext {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");

  if (!year || !month || !day) throw new Error("Unable to determine the local date.");

  return {
    date: `${year}-${month}-${day}`,
    time: new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(now),
    timezone,
  };
}
