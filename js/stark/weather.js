// Weather via Open-Meteo — free, open data, no API key, no account.
// Uses your approximate location (rounded to ~1 km) or a city you choose.

import { local } from '../store.js';

const WMO = {
  0: 'clear skies', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'freezing fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light showers', 81: 'showers', 82: 'violent showers', 85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorms', 96: 'thunderstorms with hail', 99: 'severe thunderstorms with hail',
};
export const describe = (code) => WMO[code] || 'unsettled conditions';
const fahrenheit = () => /^en-US|^en-LR|^my/.test(navigator.language || '');

function deviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location isn’t available here.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100, name: '' }),
      () => reject(new Error('Location permission was declined.')),
      { maximumAge: 30 * 60_000, timeout: 10_000, enableHighAccuracy: false });
  });
}

export async function setCity(name) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(name)}`);
  const hit = (await res.json()).results?.[0];
  if (!hit) throw new Error(`I couldn’t find “${name}”.`);
  const place = { lat: hit.latitude, lon: hit.longitude, name: [hit.name, hit.country_code].filter(Boolean).join(', ') };
  local.set('weatherPlace', place);
  return place;
}

async function place() {
  const saved = local.get('weatherPlace');
  if (saved) return saved;
  try {
    const here = await deviceLocation();
    local.set('weatherPlace', here);
    return here;
  } catch (e) {
    const city = prompt('Which city should I report the weather for?');
    if (!city) throw e;
    return setCity(city.trim());
  }
}

let cache = null;

export async function getWeather({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < 15 * 60_000) return cache.data;
  const p = await place();
  const unit = fahrenheit() ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}`
    + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunset'
    + `&timezone=auto&forecast_days=2${unit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('The weather service didn’t respond.');
  const d = await res.json();
  const deg = fahrenheit() ? '°F' : '°C';
  const data = {
    place: p.name,
    temp: Math.round(d.current.temperature_2m),
    feels: Math.round(d.current.apparent_temperature),
    humidity: d.current.relative_humidity_2m,
    wind: Math.round(d.current.wind_speed_10m),
    windUnit: fahrenheit() ? 'mph' : 'km/h',
    code: d.current.weather_code,
    sky: describe(d.current.weather_code),
    high: Math.round(d.daily.temperature_2m_max[0]),
    low: Math.round(d.daily.temperature_2m_min[0]),
    rain: d.daily.precipitation_probability_max[0],
    tomorrow: { high: Math.round(d.daily.temperature_2m_max[1]), low: Math.round(d.daily.temperature_2m_min[1]), sky: describe(d.daily.weather_code[1]), rain: d.daily.precipitation_probability_max[1] },
    deg,
  };
  cache = { at: Date.now(), data };
  return data;
}

/** One spoken-style sentence, Jarvis style. */
export function weatherLine(w, hon = '') {
  const s = hon ? `, ${hon}` : '';
  const rain = w.rain >= 60 ? ` I’d take an umbrella${s} — ${w.rain}% chance of rain.` : w.rain >= 30 ? ` There’s a ${w.rain}% chance of rain.` : '';
  return `It’s ${w.temp}${w.deg} with ${w.sky}${w.place ? ` in ${w.place}` : ''}, feeling like ${w.feels}${w.deg}. Today’s high is ${w.high}${w.deg}, low ${w.low}${w.deg}.${rain}`;
}
