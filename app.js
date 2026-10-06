// Skyline Weather: find a place -> fetch its weather and air quality -> draw it.
// Data is always fetched in metric and converted on screen, so the °C/°F switch is instant.

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const REVERSE_GEOCODING_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const DEFAULT_CITY = 'Cape Town';
const POLLEN_TYPES = ['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed'];

// Everything the screen is drawn from.
const state = {
  unit: loadSetting('unit') || 'celsius',
  place: null,
  weather: null,
  air: null,
};

const els = {
  form: document.getElementById('search-form'),
  input: document.getElementById('city-input'),
  locateButton: document.getElementById('locate-button'),
  status: document.getElementById('status'),
  skeleton: document.getElementById('skeleton'),
  current: document.getElementById('current'),
  placeName: document.getElementById('place-name'),
  localTime: document.getElementById('local-time'),
  currentIcon: document.getElementById('current-icon'),
  currentTemp: document.getElementById('current-temp'),
  currentCondition: document.getElementById('current-condition'),
  feelsLike: document.getElementById('feels-like'),
  humidity: document.getElementById('humidity'),
  wind: document.getElementById('wind'),
  hourly: document.getElementById('hourly'),
  hourlyChart: document.getElementById('hourly-chart'),
  forecast: document.getElementById('forecast'),
  forecastList: document.getElementById('forecast-list'),
  today: document.getElementById('today'),
  todayGrid: document.getElementById('today-grid'),
  unitButtons: document.querySelectorAll('.unit-toggle button'),
  themeToggle: document.querySelector('.theme-toggle'),
  themeColor: document.querySelector('meta[name="theme-color"]'),
};

// The result sections, shown and hidden together.
const resultSections = [els.current, els.hourly, els.forecast, els.today];

// WMO weather codes used by Open-Meteo -> label, Tabler icon and colour scheme ("sky").
const WEATHER_CODES = {
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


// ---------- API ----------

// Finds a city's coordinates. Returns null if the city doesn't exist.
async function geocodeCity(name) {
  const params = new URLSearchParams({ name, count: 1, language: 'en', format: 'json' });
  const response = await fetch(`${GEOCODING_URL}?${params}`);
  if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);

  const data = await response.json();
  const match = data.results?.[0]; // no "results" key at all when nothing matches
  return match
    ? { name: match.name, country: match.country, latitude: match.latitude, longitude: match.longitude }
    : null;
}

// Turns coordinates into a place name; falls back to "Your location" if the lookup fails.
async function reverseGeocode(latitude, longitude) {
  const place = { name: 'Your location', country: '', latitude, longitude };
  try {
    const params = new URLSearchParams({ latitude, longitude, localityLanguage: 'en' });
    const response = await fetch(`${REVERSE_GEOCODING_URL}?${params}`);
    if (!response.ok) return place;
    const data = await response.json();
    return { ...place, name: data.city || data.locality || place.name, country: data.countryName || '' };
  } catch (e) {
    return place;
  }
}

// Gets current conditions, 24-hour data and today plus the next 5 days.
async function getForecast(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day,uv_index,precipitation',
    hourly: 'temperature_2m,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: 6,
  });
  const response = await fetch(`${FORECAST_URL}?${params}`);
  if (!response.ok) throw new Error(`Forecast failed: ${response.status}`);

  return response.json();
}

// Gets air quality and pollen. Returns null on failure so the rest of the page still loads.
async function getAirQuality(latitude, longitude) {
  try {
    const params = new URLSearchParams({
      latitude,
      longitude,
      current: ['european_aqi', ...POLLEN_TYPES.map((type) => `${type}_pollen`)].join(','),
      timezone: 'auto',
    });
    const response = await fetch(`${AIR_QUALITY_URL}?${params}`);
    return response.ok ? (await response.json()).current : null;
  } catch (e) {
    return null;
  }
}

// Asks the browser for the visitor's coordinates.
function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 600000 });
  });
}

// Turns a weather code into a label, icon and colour scheme; night gets its own.
function describeWeather(code, isDay = true) {
  const look = WEATHER_CODES[code] ?? { label: 'Unknown', icon: 'ti-question-mark', sky: 'cloudy' };
  if (isDay) return look;
  return { ...look, icon: look.icon === 'ti-sun' ? 'ti-moon' : look.icon, sky: 'night' };
}


// ---------- Search and loading ----------

// Handles the search form (button click or Enter).
async function handleSearch(event) {
  event.preventDefault(); // stop the page reloading
  const city = els.input.value.trim();
  if (city) await searchCity(city);
}

// Looks up a city by name, then loads its weather.
async function searchCity(city) {
  showLoading(city);
  try {
    const place = await geocodeCity(city);
    if (!place) {
      showError(`We couldn't find "${city}". Check the spelling and try again.`);
      replayAnimation(els.form, 'is-shaking');
      return;
    }
    await loadPlace(place);
  } catch (error) {
    showNetworkError(error);
  }
}

// Finds the visitor's location, then loads its weather.
async function useMyLocation() {
  if (!navigator.geolocation) {
    showError("Your browser can't share your location. Search for a city instead.");
    return;
  }
  showLoading('your location');
  try {
    const position = await getBrowserPosition();
    const { latitude, longitude } = position.coords;
    await loadPlace(await reverseGeocode(latitude, longitude));
  } catch (error) {
    if (error.code === 1) showError('Location access is blocked. Allow it in your browser, or search for a city instead.');
    else if (error.code) showError("We couldn't find your location. Search for a city instead.");
    else showNetworkError(error);
  }
}

// Fetches weather and air quality at the same time, then draws everything.
async function loadPlace(place) {
  showLoading(place.name);
  try {
    const [weather, air] = await Promise.all([
      getForecast(place.latitude, place.longitude),
      getAirQuality(place.latitude, place.longitude),
    ]);
    Object.assign(state, { place, weather, air });
    els.input.value = place.name;
    saveSetting('lastPlace', JSON.stringify(place));
    render(true);
  } catch (error) {
    showNetworkError(error);
  }
}


// ---------- Rendering ----------

// Redraws the results from state; animates them in only after a new search.
function render(animate = false) {
  if (!state.place || !state.weather) return;
  hideStatus();
  els.skeleton.hidden = true;
  resultSections.forEach((el) => { el.hidden = false; }); // visible first, so the chart can measure its width
  renderCurrent();
  renderHourly();
  renderForecast();
  renderToday();

  resultSections.forEach((el) => {
    if (animate) replayAnimation(el, 'is-entering');
    else el.classList.remove('is-entering'); // unit changes swap numbers instantly
  });
}

// Restarts a CSS animation by removing and re-adding its class.
function replayAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth; // forces the browser to notice the removal before re-adding
  el.classList.add(className);
}

// Fills in the big "right now" card and sets the page colours to match the weather.
function renderCurrent() {
  const { place, weather } = state;
  const now = weather.current;
  const look = describeWeather(now.weather_code, now.is_day === 1);

  document.documentElement.dataset.sky = look.sky;
  els.placeName.textContent = [place.name, place.country].filter(Boolean).join(', ');
  els.localTime.textContent = formatLocalTime(now.time);
  els.currentIcon.className = `current-icon ti ${look.icon}`;
  els.currentTemp.textContent = formatTemp(now.temperature_2m);
  els.currentCondition.textContent = look.label;
  els.feelsLike.textContent = formatTemp(now.apparent_temperature);
  els.humidity.textContent = `${Math.round(now.relative_humidity_2m)}%`;
  els.wind.textContent = formatWind(now.wind_speed_10m);
}

// Draws the next 24 hours as an SVG line chart with rain-chance bars underneath.
function renderHourly() {
  const hours = getNext24Hours();
  const width = els.hourlyChart.clientWidth || 600;
  const height = 190;
  const pad = 20;
  const step = width < 480 ? 4 : 3; // fewer labels on narrow screens so they don't overlap

  const temps = hours.map((h) => h.temp);
  const min = Math.min(...temps);
  const range = Math.max(...temps) - min || 1;
  const x = (i) => pad + (i * (width - pad * 2)) / (hours.length - 1);
  const y = (temp) => 96 - ((temp - min) / range) * 58; // line sits between y=38 and y=96

  const line = hours.map((h, i) => `${x(i)},${y(h.temp)}`).join(' ');
  const area = `${x(0)},104 ${line} ${x(hours.length - 1)},104`;

  const bars = hours.map((h, i) => {
    const barHeight = (h.rain / 100) * 26;
    return `<rect class="chart-bar" x="${x(i) - 3}" y="${162 - barHeight}" width="6" height="${barHeight}"></rect>`;
  }).join('');

  const labels = hours.map((h, i) => {
    if (i % step !== 0) return '';
    return `
      <circle class="chart-dot" cx="${x(i)}" cy="${y(h.temp)}" r="3.5"></circle>
      <text class="chart-temp" x="${x(i)}" y="${y(h.temp) - 12}">${formatTemp(h.temp)}</text>
      <text class="chart-hour" x="${x(i)}" y="${126}">${i === 0 ? 'Now' : h.time}</text>
      ${h.rain >= 10 ? `<text class="chart-rain" x="${x(i)}" y="180">${h.rain}%</text>` : ''}`;
  }).join('');
  const dry = hours.every((h) => h.rain < 10)
    ? `<text class="chart-rain" x="${width / 2}" y="170">No rain expected</text>` : '';

  els.hourlyChart.innerHTML = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"
         aria-label="Temperature and chance of rain for the next 24 hours">
      <polygon class="chart-area" points="${area}"></polygon>
      <polyline class="chart-line" points="${line}"></polyline>
      ${bars}${labels}${dry}
    </svg>`;
}

// Picks the 24 hourly readings starting from the current hour.
function getNext24Hours() {
  const { hourly, current } = state.weather;
  const start = Math.max(0, hourly.time.indexOf(`${current.time.slice(0, 13)}:00`));
  return hourly.time.slice(start, start + 24).map((time, i) => ({
    time: time.slice(11, 16),
    temp: hourly.temperature_2m[start + i],
    rain: hourly.precipitation_probability[start + i] ?? 0,
  }));
}

// Builds the 5-day row (index 0 is today, so it starts at 1).
function renderForecast() {
  const daily = state.weather.daily;

  els.forecastList.innerHTML = daily.time.slice(1, 6).map((date, i) => {
    const day = i + 1;
    const look = describeWeather(daily.weather_code[day]);
    return `
      <li>
        <span class="day">${formatWeekday(date)}</span>
        <i class="ti ${look.icon}" aria-hidden="true"></i>
        <span class="sr-only">${look.label}</span>
        <span><span class="high">${formatTemp(daily.temperature_2m_max[day])}</span>
              <span class="low">${formatTemp(daily.temperature_2m_min[day])}</span></span>
        <span class="rain-chance"><i class="ti ti-droplet" aria-hidden="true"></i>${daily.precipitation_probability_max[day] ?? 0}%<span class="sr-only"> chance of rain</span></span>
      </li>`;
  }).join('');
}

// Builds the "Today" cards: sun, running, UV, air quality and pollen.
function renderToday() {
  const { weather, air } = state;
  const run = getRunningScore(weather, air);
  const uvNow = Math.round(weather.current.uv_index ?? 0);
  const uvMax = Math.round(weather.daily.uv_index_max[0] ?? 0);
  const aqi = air?.european_aqi;
  const pollen = getPollen(air);

  els.todayGrid.innerHTML = `
    ${renderSunCard()}
    ${tile('ti-run', 'Running', run.rating, run.reason)}
    ${tile('ti-sun-high', 'UV index', `${uvNow} · ${uvLevel(uvNow)}`, `Peaks at ${uvMax} (${uvLevel(uvMax).toLowerCase()}) today${uvMax >= 3 ? '. Wear sunscreen.' : '.'}`)}
    ${aqi == null
      ? tile('ti-wind', 'Air quality', 'No data', 'Air quality data is unavailable right now.')
      : tile('ti-wind', 'Air quality', `${Math.round(aqi)} · ${aqiLevel(aqi)}`, 'European AQI: lower is better.')}
    ${pollen
      ? tile('ti-plant', 'Pollen', pollen.level, pollen.note)
      : tile('ti-plant', 'Pollen', 'No data', 'Pollen data is only available in Europe.')}`;
}

// Returns the HTML for one small "Today" card.
function tile(icon, title, value, note) {
  return `
    <article class="tile">
      <h3 class="label"><i class="ti ${icon}" aria-hidden="true"></i>${title}</h3>
      <p class="tile-value">${value}</p>
      <p class="tile-note">${note}</p>
    </article>`;
}

// Draws the sunrise-to-sunset arc with the sun at its current position.
function renderSunCard() {
  const { current, daily } = state.weather;
  const sunrise = daily.sunrise[0];
  const sunset = daily.sunset[0];
  const progress = clamp((toMinutes(current.time) - toMinutes(sunrise)) / (toMinutes(sunset) - toMinutes(sunrise)), 0, 1);
  const isUp = current.time >= sunrise && current.time <= sunset;

  // The sun moves along a half circle: progress 0 = left end (sunrise), 1 = right end (sunset).
  const angle = Math.PI * (1 - progress);
  const sunX = 100 + 80 * Math.cos(angle);
  const sunY = 90 - 80 * Math.sin(angle);
  const daylight = toMinutes(sunset) - toMinutes(sunrise);

  return `
    <article class="tile tile-sun">
      <h3 class="label"><i class="ti ti-sunrise" aria-hidden="true"></i>Sunrise and sunset</h3>
      <svg viewBox="0 0 200 100" class="sun-arc" role="img" aria-label="Sun position between sunrise and sunset">
        <path class="arc-track" d="M20 90 A80 80 0 0 1 180 90"></path>
        <line class="arc-horizon" x1="8" y1="90" x2="192" y2="90"></line>
        <circle class="arc-sun${isUp ? '' : ' is-down'}" cx="${sunX}" cy="${sunY}" r="7"></circle>
      </svg>
      <div class="sun-times">
        <span><small>Sunrise</small>${sunrise.slice(11, 16)}</span>
        <span class="tile-note">${Math.floor(daylight / 60)}h ${daylight % 60}m of daylight</span>
        <span><small>Sunset</small>${sunset.slice(11, 16)}</span>
      </div>
    </article>`;
}

// Scores running conditions out of 100 and names the biggest problem.
function getRunningScore(weather, air) {
  const now = weather.current;
  const nextHours = getNext24Hours().slice(0, 3);
  const rainSoon = Math.max(...nextHours.map((h) => h.rain));
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

// Finds the strongest pollen type, or null where there's no pollen data.
function getPollen(air) {
  if (!air) return null;
  const readings = POLLEN_TYPES
    .map((type) => ({ type, value: air[`${type}_pollen`] }))
    .filter((r) => r.value != null);
  if (!readings.length) return null;

  const top = readings.reduce((a, b) => (b.value > a.value ? b : a));
  // Rough grains/m³ bands; real thresholds vary by pollen type.
  const level = top.value < 10 ? 'Low' : top.value < 50 ? 'Moderate' : top.value < 200 ? 'High' : 'Very high';
  return top.value < 1 ? { level: 'None', note: 'No pollen in the air right now.' }
    : { level, note: `Mostly ${top.type} pollen right now.` };
}

// Converts a UV number into the standard WHO level.
function uvLevel(uv) {
  return uv < 3 ? 'Low' : uv < 6 ? 'Moderate' : uv < 8 ? 'High' : uv < 11 ? 'Very high' : 'Extreme';
}

// Converts a European AQI number into its official band.
function aqiLevel(aqi) {
  return aqi <= 20 ? 'Good' : aqi <= 40 ? 'Fair' : aqi <= 60 ? 'Moderate' : aqi <= 80 ? 'Poor' : aqi <= 100 ? 'Very poor' : 'Extremely poor';
}

// Shows a neutral message.
function showStatus(message) {
  els.status.textContent = message;
  els.status.classList.remove('is-error', 'sr-only');
  els.status.hidden = false;
}

// Swaps the results for the skeleton; the loading text stays for screen readers only.
function showLoading(name) {
  showStatus(`Loading weather for ${name}…`);
  els.status.classList.add('sr-only');
  resultSections.forEach((el) => { el.hidden = true; });
  els.skeleton.hidden = false;
}

// Shows an error and hides old results so they can't be mistaken for the new city.
function showError(message) {
  showStatus(message);
  els.status.classList.add('is-error');
  els.skeleton.hidden = true;
  resultSections.forEach((el) => { el.hidden = true; });
}

// Shows the right message when a request fails.
function showNetworkError(error) {
  showError(navigator.onLine
    ? 'Something went wrong getting the weather. Try again in a moment.'
    : "You're offline. Check your connection and try again.");
  console.error(error);
}

// Hides the status line once results are showing.
function hideStatus() {
  els.status.hidden = true;
}


// ---------- Formatting ----------

// Shows a Celsius value in the chosen unit.
function formatTemp(celsius) {
  const value = state.unit === 'fahrenheit' ? celsius * 9 / 5 + 32 : celsius;
  return `${Math.round(value)}°`;
}

// Shows wind in km/h, or mph when Fahrenheit is chosen.
function formatWind(kmh) {
  return state.unit === 'fahrenheit'
    ? `${Math.round(kmh * 0.621371)} mph`
    : `${Math.round(kmh)} km/h`;
}

// Formats the city's local time, e.g. "Tuesday, 06 October at 18:45".
function formatLocalTime(isoTime) {
  return new Date(isoTime).toLocaleString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

// Turns "2026-10-07" into "Wed" (noon avoids time zones shifting the day).
function formatWeekday(isoDate) {
  return new Date(`${isoDate}T12:00`).toLocaleDateString('en-ZA', { weekday: 'short' });
}

// Turns "2026-10-06T18:45" into minutes since midnight.
function toMinutes(isoTime) {
  return Number(isoTime.slice(11, 13)) * 60 + Number(isoTime.slice(14, 16));
}

// Keeps a number between min and max.
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


// ---------- Settings ----------

// Switches °C/°F, saves the choice and redraws without refetching.
function setUnit(unit) {
  state.unit = unit;
  saveSetting('unit', unit);
  els.unitButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.unit === unit));
  });
  render();
}

// Applies light or dark mode and updates the toggle button.
function applyTheme(theme) {
  const isDark = theme === 'dark';
  if (isDark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  els.themeToggle.textContent = isDark ? 'Light' : 'Dark';
  els.themeToggle.setAttribute('aria-pressed', String(isDark));
  els.themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  els.themeColor.setAttribute('content', isDark ? '#0d141b' : '#f2f5f8');
}

// Flips the theme and remembers it (same key as the portfolio).
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveSetting('theme', next);
}

// Reads a saved setting; returns null if storage is blocked.
function loadSetting(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

// Saves a setting; silently skips if storage is blocked.
function saveSetting(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ }
}

// Reads the last place shown, or null if there isn't a valid one.
function loadLastPlace() {
  try { return JSON.parse(loadSetting('lastPlace')); } catch (e) { return null; }
}


// ---------- Start-up ----------

els.form.addEventListener('submit', handleSearch);
els.locateButton.addEventListener('click', useMyLocation);
els.unitButtons.forEach((button) => button.addEventListener('click', () => setUnit(button.dataset.unit)));
els.themeToggle.addEventListener('click', toggleTheme);

// Redraw the chart when the window size changes, since it's drawn to fit its width.
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.weather) renderHourly(); }, 150);
});

applyTheme(document.documentElement.dataset.theme);
setUnit(state.unit);

// Show the last place straight away, or a default city on a first visit.
const lastPlace = loadLastPlace();
if (lastPlace?.latitude != null) loadPlace(lastPlace);
else searchCity(DEFAULT_CITY);
