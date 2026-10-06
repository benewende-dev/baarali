import type { backgroundTask } from '@x/shared';

// A routine's timing in plain words (Baarali, 06/10/2026), as the desktop
// says it (renderer lib/schedule-words.ts): « Every day at 07:00 GMT »
// instead of « 0 7 * * * ». Kept in the phone's own sources: its French is
// put in at build time from these very sentences.

const two = (n: number) => String(n).padStart(2, '0');
const isNum = (s: string) => /^\d+$/.test(s);

export function cronWords(expr: string): string | null {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [min, hour, dom, mon, dow] = f;
  if (dom !== '*' || mon !== '*') return null;
  if (min === '*' && hour === '*' && dow === '*') return 'Every minute';
  const everyMin = /^\*\/(\d+)$/.exec(min);
  if (everyMin && hour === '*' && dow === '*') return `Every ${everyMin[1]} minutes`;
  if (min === '0' && hour === '*' && dow === '*') return 'Every hour';
  const everyHour = /^\*\/(\d+)$/.exec(hour);
  if (min === '0' && everyHour && dow === '*') return `Every ${everyHour[1]} hours`;
  if (!isNum(min) || !isNum(hour)) return null;
  const at = `${two(Number(hour))}:${two(Number(min))}`;
  if (dow === '*') return `Every day at ${at} GMT`;
  if (dow === '1-5') return `Weekdays at ${at} GMT`;
  if (isNum(dow) && Number(dow) <= 7) return weekly(Number(dow) % 7, at);
  return null;
}

function weekly(day: number, at: string): string {
  switch (day) {
    case 1: return `Every Monday at ${at} GMT`;
    case 2: return `Every Tuesday at ${at} GMT`;
    case 3: return `Every Wednesday at ${at} GMT`;
    case 4: return `Every Thursday at ${at} GMT`;
    case 5: return `Every Friday at ${at} GMT`;
    case 6: return `Every Saturday at ${at} GMT`;
    default: return `Every Sunday at ${at} GMT`;
  }
}

export function scheduleWords(triggers: backgroundTask.Triggers | undefined): string {
  const out: string[] = [];
  if (triggers?.cronExpr) out.push(cronWords(triggers.cronExpr) ?? triggers.cronExpr);
  const windows = triggers?.windows ?? [];
  if (windows.length === 1) out.push(`Every day between ${windows[0].startTime} and ${windows[0].endTime} GMT`);
  else if (windows.length > 1) out.push(`${windows.length} times a day`);
  if (triggers?.eventMatchCriteria) out.push('When something it watches for happens');
  if (out.length === 0) out.push('Only when you run it');
  return out.join(' · ');
}
