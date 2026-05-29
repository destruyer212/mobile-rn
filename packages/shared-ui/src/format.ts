export function formatTimeHms(d: Date): string {
  const local = new Date(d);
  const hh = String(local.getHours()).padStart(2, '0');
  const mm = String(local.getMinutes()).padStart(2, '0');
  const ss = String(local.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
