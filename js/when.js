// Natural-language dates and times, parsed on-device.
// parseWhen("call mom tomorrow at 6pm") → { date: '2026-09-25', time: '18:00', rest: 'call mom' }

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WD = '(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(?:day|nesday|urday|sday)?';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const PARTS = { morning: '09:00', afternoon: '15:00', evening: '18:00', night: '20:00', tonight: '20:00', noon: '12:00', lunch: '12:30', midnight: '23:59' };

function weekdayIndex(word) {
  const w = word.toLowerCase().slice(0, 3);
  return WEEKDAYS.findIndex((d) => d.startsWith(w));
}

/** Mutable text cursor: each matcher removes what it understood. */
function take(state, re, fn) {
  const m = state.text.match(re);
  if (!m) return false;
  const res = fn(m);
  if (res === false) return false;
  state.text = (state.text.slice(0, m.index) + ' ' + state.text.slice(m.index + m[0].length)).replace(/\s+/g, ' ');
  return true;
}

function to24(h, min, ampm, hint) {
  h = Number(h); min = Number(min || 0);
  if (h > 23 || min > 59) return null;
  if (ampm) {
    ampm = ampm.toLowerCase();
    if (ampm.startsWith('p') && h < 12) h += 12;
    if (ampm.startsWith('a') && h === 12) h = 0;
  } else if (hint === 'pm' && h < 12) {
    h += 12;
  } else if (!hint && h >= 1 && h <= 6) {
    h += 12; // "at 6" almost always means the evening
  }
  return `${pad(h)}:${pad(min)}`;
}

export function parseWhen(input, now = new Date()) {
  const state = { text: ` ${input} ` };
  let date = null;
  let time = null;
  let hint = null;

  // "in 20 minutes", "in 2 hours", "in 3 days", "in a week"
  take(state, /\s(?:in|after)\s+(an?|\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|h|days?|weeks?)\b/i, (m) => {
    const n = /^an?$/i.test(m[1]) ? 1 : Number(m[1]);
    const unit = m[2].toLowerCase();
    if (/^(minute|min)/.test(unit) || /^(hour|hr|h$)/.test(unit)) {
      const t = new Date(now.getTime() + n * (unit.startsWith('h') ? 60 : 1) * 60000);
      date = ymd(t); time = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
    } else {
      date = ymd(addDays(now, n * (unit.startsWith('w') ? 7 : 1)));
    }
  });

  // Explicit times: "at 6:30pm", "6pm", "18:30", "at 7", "noon"
  take(state, /\s(?:at\s+|@\s*|by\s+)?(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?(?=\s|[,.!?]|$)/i, (m) => {
    time = to24(m[1], m[2], m[3], null);
    return time ? undefined : false;
  }) ||
  take(state, /\s(?:at\s+|@\s*|by\s+)?(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)(?=\s|[,.!?]|$)/i, (m) => {
    time = to24(m[1], 0, m[3] || m[2]);
    return time ? undefined : false;
  }) ||
  take(state, /\s(?:at|@|by)\s+(\d{1,2})(?=\s|[,.!?]|$)(?!\s*(?:st|nd|rd|th|minutes?|mins?|hours?|days?))/i, (m) => {
    time = to24(m[1], 0, null, null);
    return time ? undefined : false;
  }) ||
  take(state, /\s(?:at\s+)?(noon|midday|midnight)\b/i, (m) => { time = m[1].toLowerCase() === 'midnight' ? '23:59' : '12:00'; });

  // Relative days
  take(state, /\s(?:on\s+)?(?:the\s+)?day\s+after\s+tomorrow\b/i, () => { date = ymd(addDays(now, 2)); }) ||
  take(state, /\s(?:tomorrow|tmrw|tmr|tomorow)(?:\s+(morning|afternoon|evening|night))?\b/i, (m) => {
    date = ymd(addDays(now, 1));
    if (m[1]) hint = m[1].toLowerCase();
  }) ||
  take(state, /\s(tonight)\b/i, () => { date = ymd(now); hint = 'tonight'; }) ||
  take(state, /\s(?:this\s+)(morning|afternoon|evening)\b/i, (m) => { date = ymd(now); hint = m[1].toLowerCase(); }) ||
  take(state, /\s(today)\b/i, () => { date = ymd(now); });

  // Weekdays: "friday", "on fri", "this friday", "next tuesday", optionally + part of day
  take(state, new RegExp(`\\s(?:on\\s+)?(this\\s+|next\\s+)?${WD}(?:\\s+(morning|afternoon|evening|night))?\\b`, 'i'), (m) => {
    const idx = weekdayIndex(m[2]);
    if (idx < 0) return false;
    let diff = (idx - now.getDay() + 7) % 7;
    if (diff === 0 && /next/i.test(m[1] || '')) diff = 7;
    date = ymd(addDays(now, diff));
    if (m[3]) hint = m[3].toLowerCase();
  });

  // Calendar dates: "sept 30", "30 september", "oct 5th", "2026-10-05", "the 5th"
  const monthDate = (monIdx, day, year) => {
    let y = year ? Number(year) : now.getFullYear();
    let d = new Date(y, monIdx, Number(day));
    if (!year && d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(y + 1, monIdx, Number(day));
    return d.getMonth() === monIdx ? ymd(d) : null;
  };
  take(state, /\s(\d{4})-(\d{2})-(\d{2})\b/, (m) => { date = `${m[1]}-${m[2]}-${m[3]}`; }) ||
  take(state, new RegExp(`\\s(?:on\\s+)?${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'), (m) => {
    date = monthDate(MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)), m[2], m[3]);
    return date ? undefined : false;
  }) ||
  take(state, new RegExp(`\\s(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}(?:,?\\s+(\\d{4}))?\\b`, 'i'), (m) => {
    date = monthDate(MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)), m[1], m[3]);
    return date ? undefined : false;
  }) ||
  take(state, /\s(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i, (m) => {
    let d = new Date(now.getFullYear(), now.getMonth(), Number(m[1]));
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(now.getFullYear(), now.getMonth() + 1, Number(m[1]));
    date = ymd(d);
  });

  // Loose parts of day: "in the morning", "at night", "evening"
  if (!hint) take(state, /\s(?:in\s+the\s+|at\s+|this\s+)?(morning|afternoon|evening|night)\b/i, (m) => { hint = m[1].toLowerCase(); });

  // Apply part-of-day hints
  if (hint) {
    if (time && ['afternoon', 'evening', 'night', 'tonight'].includes(hint)) {
      const [hh, mm] = time.split(':').map(Number);
      if (hh < 12) time = `${pad(hh + 12)}:${pad(mm)}`;
    } else if (time && hint === 'morning') {
      const [hh, mm] = time.split(':').map(Number);
      if (hh >= 12 && hh < 19) time = `${pad(hh - 12)}:${pad(mm)}`;
    } else if (!time) {
      time = PARTS[hint] || null;
    }
    if (!date) date = ymd(now);
  }

  // Only a time → today if still ahead, otherwise tomorrow
  if (time && !date) {
    const [hh, mm] = time.split(':').map(Number);
    const t = new Date(now); t.setHours(hh, mm, 0, 0);
    date = ymd(t > now ? now : addDays(now, 1));
  }

  const rest = state.text
    .replace(/\s+(?:on|at|by|for|this|next|in|the)\s*$/i, '')
    .replace(/^\s*(?:on|at|by|for)\s+/i, '')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/[\s,;:–—-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { date, time, rest };
}

/** "Today · 6:00 PM" style label for a date/time pair. */
export function whenLabel(date, time, now = new Date()) {
  if (!date) return time ? '' : 'No date';
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const diff = Math.round((day - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  let label;
  if (diff === 0) label = 'Today';
  else if (diff === 1) label = 'Tomorrow';
  else if (diff === -1) label = 'Yesterday';
  else if (diff > 1 && diff < 7) label = day.toLocaleDateString([], { weekday: 'long' });
  else label = day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: y !== now.getFullYear() ? 'numeric' : undefined });
  if (time) {
    const [hh, mm] = time.split(':').map(Number);
    const t = new Date(y, m - 1, d, hh, mm);
    label += ` · ${t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return label;
}
