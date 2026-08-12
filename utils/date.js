const HOME_TIME_ZONE = 'America/Montevideo';

/** Calendar date in Uruguay. Avoids UTC rolling over at 21:00 local time. */
export function localISODate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: HOME_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

