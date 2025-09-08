export function humanTimeLeft(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const m: number = Math.floor(seconds / 60);
  const s: number = Math.floor(seconds % 60);
  const mm: string = m < 10 ? `0${m}` : String(m);
  const ss: string = s < 10 ? `0${s}` : String(s);
  return `${mm}:${ss}`;
}
