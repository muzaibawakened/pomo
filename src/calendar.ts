const two = (n: number) => String(n).padStart(2, "0");

export function dayKey(time: number | Date) {
  const date = new Date(time);
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}
export function clockTime(time: number) {
  const date = new Date(time);
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}
// Calendar arithmetic at local noon avoids midnight/DST offsets and UTC date parsing.
export function dayDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}
export function validDay(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    dayKey(dayDate(value)) === value
  );
}
export function offsetDay(key: string, offset: number) {
  const date = dayDate(key);
  date.setDate(date.getDate() + offset);
  return dayKey(date);
}
export function monday(key: string) {
  return offsetDay(key, -(dayDate(key).getDay() + 6) % 7);
}
export function weekDays(key: string) {
  const first = monday(key);
  return Array.from({ length: 7 }, (_, i) => offsetDay(first, i));
}
