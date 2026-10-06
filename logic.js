// Pure weather logic: no DOM, no fetch, no state. Same input -> same output,
// which is what makes these functions easy to unit test (see tests/logic.test.js).

// WMO weather codes used by Open-Meteo -> label, Tabler icon and colour scheme ("sky").
export const WEATHER_CODES = {
  0: { label: 'Clear sky', icon: 'ti-sun', sky: 'clear' },
  1: { label: 'Mainly clear', icon: 'ti-sun', sky: 'clear' },
  2: { label: 'Partly cloudy', icon: 'ti-cloud', sky: 'cloudy' },
  3: { label: 'Overcast', icon: 'ti-cloud', sky: 'cloudy' },
  45: { label: 'Fog', icon: 'ti-mist', sky: 'fog' },
  48: { label: 'Freezing fog', icon: 'ti-mist', sky: 'fog' },
  51: { label: 'Light drizzle', icon: 'ti-cloud-rain', sky: 'rain' },
  53: { label: 'Drizzle', icon: 'ti-cloud-rain', sky: 'rain' },
  55: { label: 'Heavy drizzle', icon: 'ti-cloud-rain', sky: 'rain' },
  56: { label: 'Freezing drizzle', icon: 'ti-cloud-rain', sky: 'rain' },
  57: { label: 'Freezing drizzle', icon: 'ti-cloud-rain', sky: 'rain' },
  61: { label: 'Light rain', icon: 'ti-cloud-rain', sky: 'rain' },
  63: { label: 'Rain', icon: 'ti-cloud-rain', sky: 'rain' },
  65: { label: 'Heavy rain', icon: 'ti-cloud-rain', sky: 'rain' },
  66: { label: 'Freezing rain', icon: 'ti-cloud-rain', sky: 'rain' },
  67: { label: 'Freezing rain', icon: 'ti-cloud-rain', sky: 'rain' },
  71: { label: 'Light snow', icon: 'ti-snowflake', sky: 'snow' },
  73: { label: 'Snow', icon: 'ti-snowflake', sky: 'snow' },
  75: { label: 'Heavy snow', icon: 'ti-snowflake', sky: 'snow' },
  77: { label: 'Snow grains', icon: 'ti-snowflake', sky: 'snow' },
  80: { label: 'Light showers', icon: 'ti-cloud-rain', sky: 'rain' },
  81: { label: 'Showers', icon: 'ti-cloud-rain', sky: 'rain' },
  82: { label: 'Heavy showers', icon: 'ti-cloud-rain', sky: 'rain' },
  85: { label: 'Snow showers', icon: 'ti-snowflake', sky: 'snow' },
  86: { label: 'Heavy snow showers', icon: 'ti-snowflake', sky: 'snow' },
  95: { label: 'Thunderstorm', icon: 'ti-cloud-storm', sky: 'storm' },
  96: { label: 'Thunderstorm with hail', icon: 'ti-cloud-storm', sky: 'storm' },
  99: { label: 'Thunderstorm with hail', icon: 'ti-cloud-storm', sky: 'storm' },
};

// Turns a weather code into a label, icon and colour scheme; night gets its own.
export function describeWeather(code, isDay = true) {
  const look = WEATHER_CODES[code] ?? { label: 'Unknown', icon: 'ti-question-mark', sky: 'cloudy' };
  if (isDay) return look;
  return { ...look, icon: look.icon === 'ti-sun' ? 'ti-moon' : look.icon, sky: 'night' };
}

// Shows a Celsius value in the chosen unit, e.g. "20°" or "68°".
export function formatTemp(celsius, unit) {
  const value = unit === 'fahrenheit' ? celsius * 9 / 5 + 32 : celsius;
  return `${Math.round(value)}°`;
}

// Shows wind in km/h, or mph when Fahrenheit is chosen.
export function formatWind(kmh, unit) {
  return unit === 'fahrenheit' ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
}

// Turns "2026-10-07" into "Wed" (noon avoids time zones shifting the day).
export function formatWeekday(isoDate) {
  return new Date(`${isoDate}T12:00`).toLocaleDateString('en-ZA', { weekday: 'short' });
}

// Turns "2026-10-06T18:45" into minutes since midnight.
export function toMinutes(isoTime) {
  return Number(isoTime.slice(11, 13)) * 60 + Number(isoTime.slice(14, 16));
}

// Keeps a number between min and max.
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Picks the 24 hourly readings starting from the current hour.
export function getNext24Hours(weather) {
  const { hourly, current } = weather;
  const start = Math.max(0, hourly.time.indexOf(`${current.time.slice(0, 13)}:00`));
  return hourly.time.slice(start, start + 24).map((time, i) => ({
    time: time.slice(11, 16),
    temp: hourly.temperature_2m[start + i],
    rain: hourly.precipitation_probability[start + i] ?? 0,
  }));
}

// Works out how far the sun is between sunrise (0) and sunset (1).
export function getSunPosition(now, sunrise, sunset) {
  const daylightMinutes = toMinutes(sunset) - toMinutes(sunrise);
  const progress = clamp((toMinutes(now) - toMinutes(sunrise)) / daylightMinutes, 0, 1);
  return { progress, isUp: now >= sunrise && now <= sunset, daylightMinutes };
}

// Scores running conditions out of 100 and names the biggest problem.
export function getRunningScore(weather, air) {
  const now = weather.current;
  const rainSoon = Math.max(...getNext24Hours(weather).slice(0, 3).map((h) => h.rain));
  const feels = now.apparent_temperature;

  const penalties = [
    { reason: feels > 20 ? 'Too hot for a hard run' : 'Cold: wear layers', points: Math.min(60, Math.max(0, feels - 20, 8 - feels) * 4) },
    { reason: 'Rain likely in the next few hours', points: now.precipitation > 0.2 || rainSoon > 60 ? 40 : rainSoon > 30 ? 20 : 0 },
    { reason: 'Strong wind', points: now.wind_speed_10m > 40 ? 30 : now.wind_speed_10m > 25 ? 15 : 0 },
    { reason: 'High UV: go early or late', points: now.uv_index >= 8 ? 20 : now.uv_index >= 6 ? 10 : 0 },
    { reason: "Air quality isn't great", points: air?.european_aqi > 60 ? 30 : air?.european_aqi > 40 ? 15 : 0 },
  ];

  let score = 100 - penalties.reduce((sum, p) => sum + p.points, 0);
  if (now.weather_code >= 95) score = Math.min(score, 10); // never recommend running in a thunderstorm

  const worst = penalties.reduce((a, b) => (b.points > a.points ? b : a));
  const rating = score >= 80 ? 'Great' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor';
  const reason = now.weather_code >= 95 ? 'Thunderstorm: stay inside'
    : rating !== 'Great' ? worst.reason // only explain when something actually lowered the rating
    : now.is_day ? 'Ideal conditions' : "Good conditions, but it's dark: wear lights";
  return { score, rating, reason };
}

// Sums up today's rain: chance, expected amount and whether to take an umbrella.
export function getRainToday(daily) {
  const chance = daily.precipitation_probability_max[0] ?? 0;
  const mm = daily.precipitation_sum[0] ?? 0;
  const note = chance >= 50 || mm >= 1 ? 'Take an umbrella.'
    : chance >= 20 ? 'Small chance of a shower.'
    : 'No umbrella needed.';
  return { value: `${chance}% · ${mm.toFixed(1)} mm`, note };
}

// Converts a UV number into the standard WHO level.
export function uvLevel(uv) {
  return uv < 3 ? 'Low' : uv < 6 ? 'Moderate' : uv < 8 ? 'High' : uv < 11 ? 'Very high' : 'Extreme';
}

// Converts a European AQI number into its official band.
export function aqiLevel(aqi) {
  return aqi <= 20 ? 'Good' : aqi <= 40 ? 'Fair' : aqi <= 60 ? 'Moderate' : aqi <= 80 ? 'Poor' : aqi <= 100 ? 'Very poor' : 'Extremely poor';
}

// Builds the second line of a search suggestion, e.g. "Illinois, United States".
export function placeRegion(place) {
  return [place.region, place.country].filter(Boolean).join(', ');
}

// Makes API text safe to put inside HTML, so a place name can never inject markup.
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
