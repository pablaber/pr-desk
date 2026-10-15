import { addDays } from './activity';

// "6 min", "3 h 20 min" or "2 d 4 h": the two largest units that apply.
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return minutes % 60 > 0 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  return `${minutes} min`;
}

const short = (time: number, options: Intl.DateTimeFormatOptions) =>
  new Date(time).toLocaleDateString([], options);

// "Oct 5 – 11", or "Sep 28 – Oct 4" when the week straddles two months.
export function weekRange(monday: number): string {
  const sunday = addDays(monday, 6);
  const sameMonth = new Date(monday).getMonth() === new Date(sunday).getMonth();
  return `${short(monday, { month: 'short', day: 'numeric' })} – ${short(
    sunday,
    sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' },
  )}`;
}
