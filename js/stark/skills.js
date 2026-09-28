// What Jarvis can do in the Stark edition: protocols, timers, weather, diagnostics.
// Registered as brain skills, so they work from chat, Jarvis Mode and the HUD.

import { registerSkill, localBriefing, briefing } from '../brain.js';
import * as D from '../data.js';
import { settings, firstName } from '../store.js';
import { aiReady } from '../ai.js';
import { pauseAlerts } from '../notify.js';
import { ymd, addDays, fmtTime, greeting } from '../util.js';
import { getWeather, weatherLine, setCity } from './weather.js';
import { runDiagnostics, diagnosticsLine } from './diagnostics.js';
import { startTimer, cancelTimer, activeTimers, parseDuration, fmtRemaining } from './timers.js';

export const hon = () => {
  const h = settings.honorific;
  if (!h) return '';
  return h === 'name' ? firstName() : h;
};
const sfx = () => (hon() ? `, ${hon()}` : '');
const Sfx = () => (hon() ? `, ${hon()}.` : '.');

/* ---------- Protocols ---------- */

let partyHandler = null;
export const onHouseParty = (fn) => { partyHandler = fn; };

export const PROTOCOLS = [
  { key: 'morning', name: 'Morning', blurb: 'Weather, today’s objectives and your briefing.', icon: 'sun' },
  { key: 'focus', name: 'Focus', blurb: '25 minutes of deep work. Alerts held until you’re done.', icon: 'target' },
  { key: 'winddown', name: 'Wind-down', blurb: 'Today’s wins and a preview of tomorrow.', icon: 'moon' },
  { key: 'cleanslate', name: 'Clean Slate', blurb: 'Clears completed reminders.', icon: 'trash' },
  { key: 'houseparty', name: 'House Party', blurb: 'You know the one.', icon: 'sparkles' },
];

export async function runProtocol(key, { minutes } = {}) {
  switch (key) {
    case 'morning': {
      const parts = [`${greeting()}${sfx()}.`];
      try { parts.push(weatherLine(await getWeather(), hon())); } catch { /* no weather */ }
      parts.push(aiReady() ? await briefing() : localBriefing().replace(/^Good \w+(, \w+)?\.\s*/, ''));
      return { text: parts.join('\n\n'), actions: ['Protocol · Morning'] };
    }
    case 'focus': {
      const ms = (minutes || 25) * 60_000;
      activeTimers().filter((t) => t.kind === 'focus').forEach((t) => cancelTimer(t.id));
      const t = startTimer(ms, `Focus · ${minutes || 25} min`, { kind: 'focus', onDone: () => pauseAlerts(0) });
      pauseAlerts(t.endsAt);
      return { text: `Focus protocol engaged${sfx()}. ${minutes || 25} minutes on the clock — I’ll hold your alerts until ${fmtTime(new Date(t.endsAt))}.`, actions: [`Protocol · Focus until ${fmtTime(new Date(t.endsAt))}`] };
    }
    case 'endfocus': {
      const f = activeTimers().filter((t) => t.kind === 'focus');
      f.forEach((t) => cancelTimer(t.id));
      pauseAlerts(0);
      return { text: f.length ? `Focus protocol disengaged${sfx()}. Alerts are back on.` : `No focus session was running${sfx()}.`, actions: [] };
    }
    case 'winddown': {
      const today = ymd(new Date());
      const done = D.all('reminders').filter((r) => r.done && r.doneAt && ymd(new Date(r.doneAt)) === today);
      const tomorrow = D.openReminders().filter((r) => r.date === ymd(addDays(new Date(), 1)));
      const open = D.openReminders().filter((r) => r.date && r.date <= today);
      const lines = [`Winding down${sfx()}.`];
      lines.push(done.length ? `You completed ${done.length} thing${done.length === 1 ? '' : 's'} today — ${done.slice(0, 3).map((r) => r.title).join(', ')}.` : 'A quieter day on the list.');
      if (open.length) lines.push(`Still open: ${open.slice(0, 3).map((r) => r.title).join(', ')}${open.length > 3 ? ` and ${open.length - 3} more` : ''}.`);
      lines.push(tomorrow.length ? `Tomorrow: ${tomorrow.map((r) => `${r.title}${r.time ? ` at ${fmtTime(D.dueAt(r))}` : ''}`).join('; ')}.` : 'Tomorrow is clear.');
      try { const w = await getWeather(); lines.push(`Tomorrow’s forecast: ${w.tomorrow.sky}, ${w.tomorrow.low}–${w.tomorrow.high}${w.deg}.`); } catch { /* ignore */ }
      lines.push(`Rest well${sfx()}.`);
      return { text: lines.join(' '), actions: ['Protocol · Wind-down'] };
    }
    case 'cleanslate': {
      const done = D.all('reminders').filter((r) => r.done);
      if (!done.length) return { text: `Nothing to clear${sfx()} — the slate is already clean.`, actions: [] };
      if (!confirm(`Clean Slate protocol: permanently clear ${done.length} completed reminder${done.length === 1 ? '' : 's'}?`)) {
        return { text: `Clean Slate protocol aborted${sfx()}.`, actions: [] };
      }
      done.forEach((r) => D.remove('reminders', r.id));
      return { text: `Clean Slate protocol complete${sfx()}. ${done.length} completed reminder${done.length === 1 ? '' : 's'} cleared.`, actions: [`Protocol · Cleared ${done.length}`] };
    }
    case 'houseparty':
      partyHandler?.();
      return { text: `House Party protocol initiated${sfx()}. The suits are… metaphorical.`, actions: ['Protocol · House Party'] };
    default:
      return null;
  }
}

function matchProtocol(t) {
  if (/\b(end|stop|disengage|cancel)\b.*\bfocus\b/.test(t)) return { key: 'endfocus' };
  const m = t.match(/\b(engage|initiate|activate|start|run|begin|execute)?\s*(?:the\s+)?(morning|focus|wind[\s-]?down|good\s?night|clean[\s-]?slate|house[\s-]?party)\s+protocol\b(?:.*?(\d+)\s*min)?/);
  if (!m) return null;
  const word = m[2].replace(/[\s-]/g, '');
  const key = { morning: 'morning', focus: 'focus', winddown: 'winddown', goodnight: 'winddown', cleanslate: 'cleanslate', houseparty: 'houseparty' }[word];
  return { key, minutes: m[3] ? Number(m[3]) : undefined };
}

/* ---------- Skill ---------- */

registerSkill(async (text) => {
  const t = text.toLowerCase().replace(/[’']/g, "'").trim();

  // Protocols
  if (/\b(list|what|which|show)\b.*\bprotocols?\b/.test(t)) {
    return { text: `Available protocols${sfx()}:\n${PROTOCOLS.map((p) => `- **${p.name}** — ${p.blurb}`).join('\n')}\n\nSay “Engage focus protocol”, for example.` };
  }
  const proto = matchProtocol(t);
  if (proto) return runProtocol(proto.key, proto);

  // Timers
  if (/\b(set|start)\b.*\btimer\b|^timer\b/.test(t)) {
    const ms = parseDuration(t);
    if (!ms) return { text: `How long should the timer run${sfx()}? Try “set a timer for 10 minutes”.` };
    const label = (t.match(/\b(?:for|called|named|labelled)\s+(?:the\s+)?([a-z][a-z\s]{2,30})$/)?.[1] || '').replace(/\b(\d+|minutes?|hours?|seconds?)\b/g, '').trim();
    const mins = Math.round(ms / 60000);
    const name = label ? `${label.charAt(0).toUpperCase()}${label.slice(1)} timer` : `${mins >= 1 ? `${mins} minute` : `${Math.round(ms / 1000)} second`} timer`;
    const timer = startTimer(ms, name);
    return { text: `Timer set${sfx()} — ${fmtRemaining(ms)}. I’ll let you know at ${fmtTime(new Date(timer.endsAt))}.`, actions: [`Timer · ${name}`] };
  }
  if (/\b(cancel|stop|clear)\b.*\btimers?\b/.test(t)) {
    const list = activeTimers().filter((x) => x.kind === 'timer');
    list.forEach((x) => cancelTimer(x.id));
    return { text: list.length ? `Cancelled ${list.length} timer${list.length === 1 ? '' : 's'}${sfx()}.` : `No timers running${sfx()}.` };
  }
  if (/\b(how long|time left)\b.*\btimer\b/.test(t)) {
    const list = activeTimers();
    return { text: list.length ? list.map((x) => `- ${x.label}: ${fmtRemaining(x.endsAt - Date.now())} left`).join('\n') : `No timers running${sfx()}.` };
  }

  // Weather
  const city = t.match(/\b(?:set|change)\s+(?:my\s+)?(?:weather\s+)?(?:city|location)\s+to\s+(.+)$/);
  if (city) {
    const p = await setCity(city[1]);
    return { text: `Weather location set to ${p.name}${sfx()}.` };
  }
  if (/\b(weather|temperature|forecast|rain|umbrella|how (hot|cold|warm)|outside)\b/.test(t) && !/^(remind|note|update)/.test(t)) {
    try {
      const w = await getWeather();
      const tomorrow = /\btomorrow\b/.test(t);
      return {
        text: tomorrow
          ? `Tomorrow${w.place ? ` in ${w.place}` : ''}: ${w.tomorrow.sky}, ${w.tomorrow.low}–${w.tomorrow.high}${w.deg}${w.tomorrow.rain >= 30 ? `, ${w.tomorrow.rain}% chance of rain` : ''}.`
          : weatherLine(w, hon()),
      };
    } catch (e) {
      return { text: `I couldn’t get the weather${sfx()}: ${e.message}` };
    }
  }

  // Diagnostics
  if (/\b(diagnostics?|system(s)? (status|check|report)|status report|how are you( doing)?|are you (ok|okay|working))\b/.test(t)) {
    const results = await runDiagnostics();
    return {
      text: `${diagnosticsLine(results, hon())}\n${results.map((r) => `- **${r.label}**: ${r.value}`).join('\n')}`,
      actions: ['Diagnostics run'],
    };
  }

  // A little personality
  if (/^(hey |hi |hello |ok |okay )?jarvis[.!?]*$/.test(t) || /^(hi|hello|hey)[.!]?$/.test(t)) {
    return { text: `At your service${sfx()}.` };
  }
  if (/\b(thank you|thanks|cheers)\b/.test(t) && t.length < 30) {
    return { text: `Always a pleasure${sfx()}.` };
  }
  if (/\bwho are you\b|\bwhat are you\b/.test(t)) {
    return { text: `Just A Rather Very Intelligent System${sfx()}. I keep track of your reminders, notes and updates, run protocols, and — within reason — keep you on schedule.` };
  }
  if (/\b(what time is it|what'?s the time)\b/.test(t)) {
    return { text: `It’s ${fmtTime(new Date())}${sfx()}.` };
  }
  return null;
});

