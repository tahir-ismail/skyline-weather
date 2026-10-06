// Skyline Weather: find a place -> fetch its weather and air quality -> draw it.
// The pure logic (scores, levels, formatting) lives in logic.js so it can be unit tested.
import {
  describeWeather, formatTemp as formatTempIn, formatWind as formatWindIn, formatWeekday,
  getNext24Hours, getSunPosition, getRunningScore, getRainToday, uvLevel, aqiLevel,
  placeRegion, escapeHtml,
} from './logic.js';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const REVERSE_GEOCODING_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const DEFAULT_CITY = 'Cape Town';

// Everything the screen is drawn from.
const state = {
  unit: loadSetting('unit') || 'celsius',
  place: null,
  weather: null,
  air: null,
};

// Search suggestions: the current list, the highlighted one, and the pending request.
const suggest = { places: [], active: -1, timer: null, controller: null };

const els = {
  form: document.getElementById('search-form'),
  input: document.getElementById('city-input'),
  suggestions: document.getElementById('suggestions'),
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


// ---------- API ----------

// Finds up to `count` places matching a name. `signal` lets an outdated search be cancelled.
async function searchPlaces(name, count = 1, signal) {
  const params = new URLSearchParams({ name, count, language: 'en', format: 'json' });
  const response = await fetch(`${GEOCODING_URL}?${params}`, { signal });
  if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);

  const data = await response.json();
  return (data.results ?? []).map((r) => ({ // no "results" key at all when nothing matches
    name: r.name, region: r.admin1, country: r.country, latitude: r.latitude, longitude: r.longitude,
  }));
}

// Finds the best match for a city name, or null if there isn't one.
async function geocodeCity(name) {
  return (await searchPlaces(name, 1))[0] ?? null;
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
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: 6,
  });
  const response = await fetch(`${FORECAST_URL}?${params}`);
  if (!response.ok) throw new Error(`Forecast failed: ${response.status}`);

  return response.json();
}

// Gets air quality. Returns null on failure so the rest of the page still loads.
async function getAirQuality(latitude, longitude) {
  try {
    const params = new URLSearchParams({ latitude, longitude, current: 'european_aqi', timezone: 'auto' });
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


// ---------- Search and loading ----------

// Handles the search form (button click or Enter).
async function handleSearch(event) {
  event.preventDefault(); // stop the page reloading
  closeSuggestions();
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
    if (!navigator.onLine) showStatus("You're offline. Showing the last saved forecast.");
  } catch (error) {
    showNetworkError(error);
  }
}


// ---------- Search suggestions ----------

// Waits until typing pauses for 250ms before searching, so we don't send a request per key.
function handleInput() {
  clearTimeout(suggest.timer);
  const query = els.input.value.trim();
  if (query.length < 2) {
    closeSuggestions();
    return;
  }
  suggest.timer = setTimeout(() => fetchSuggestions(query), 250);
}

// Fetches up to 5 matching places, cancelling any older request still in flight.
async function fetchSuggestions(query) {
  suggest.controller?.abort();
  suggest.controller = new AbortController();
  try {
    const places = await searchPlaces(query, 5, suggest.controller.signal);
    if (els.input.value.trim() !== query) return; // the user has typed more since
    showSuggestions(places);
  } catch (error) {
    if (error.name !== 'AbortError') closeSuggestions(); // suggestions are optional, so fail quietly
  }
}

// Draws the suggestion list under the search box.
function showSuggestions(places) {
  suggest.places = places;
  suggest.active = -1;
  if (!places.length) {
    closeSuggestions();
    return;
  }
  els.suggestions.innerHTML = places.map((place, i) => `
    <li role="option" id="suggestion-${i}" aria-selected="false" data-index="${i}">
      <span class="suggestion-name">${escapeHtml(place.name)}</span>
      <span class="suggestion-region">${escapeHtml(placeRegion(place))}</span>
    </li>`).join('');
  els.suggestions.hidden = false;
  els.input.setAttribute('aria-expanded', 'true');
}

// Hides the suggestion list and cancels anything pending.
function closeSuggestions() {
  clearTimeout(suggest.timer);
  suggest.controller?.abort();
  suggest.places = [];
  suggest.active = -1;
  els.suggestions.hidden = true;
  els.input.setAttribute('aria-expanded', 'false');
  els.input.removeAttribute('aria-activedescendant');
}

// Arrow keys move through suggestions, Enter picks one, Escape closes the list.
function handleSuggestionKeys(event) {
  if (els.suggestions.hidden) return;
  const count = suggest.places.length;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); // stop the cursor jumping to the start/end of the text
    const move = event.key === 'ArrowDown' ? 1 : -1;
    highlightSuggestion((suggest.active + move + count) % count);
  } else if (event.key === 'Enter' && suggest.active >= 0) {
    event.preventDefault(); // pick the highlighted place instead of submitting the form
    chooseSuggestion(suggest.active);
  } else if (event.key === 'Escape') {
    closeSuggestions();
  }
}

// Highlights one suggestion and tells screen readers which one it is.
function highlightSuggestion(index) {
  suggest.active = index;
  [...els.suggestions.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === index)));
  els.input.setAttribute('aria-activedescendant', `suggestion-${index}`);
}

// Loads the weather for the chosen suggestion.
function chooseSuggestion(index) {
  const place = suggest.places[index];
  closeSuggestions();
  if (place) loadPlace(place);
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
  els.localTime.textContent = [place.region, formatLocalTime(now.time)].filter(Boolean).join(' · '); // region tells the Springfields apart
  els.currentIcon.className = `current-icon ti ${look.icon}`;
  els.currentTemp.textContent = formatTemp(now.temperature_2m);
  els.currentCondition.textContent = look.label;
  els.feelsLike.textContent = formatTemp(now.apparent_temperature);
  els.humidity.textContent = `${Math.round(now.relative_humidity_2m)}%`;
  els.wind.textContent = formatWind(now.wind_speed_10m);
}

// Draws the next 24 hours as an SVG line chart with rain-chance bars underneath.
function renderHourly() {
  const hours = getNext24Hours(state.weather);
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
      <text class="chart-hour" x="${x(i)}" y="126">${i === 0 ? 'Now' : h.time}</text>
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

// Builds the "Today" cards: sun, running, UV, air quality and rain.
function renderToday() {
  const { weather, air } = state;
  const run = getRunningScore(weather, air);
  const uvNow = Math.round(weather.current.uv_index ?? 0);
  const uvMax = Math.round(weather.daily.uv_index_max[0] ?? 0);
  const aqi = air?.european_aqi;
  const rain = getRainToday(weather.daily);

  els.todayGrid.innerHTML = `
    ${renderSunCard()}
    ${tile('ti-run', 'Running', run.rating, run.reason)}
    ${tile('ti-sun-high', 'UV index', `${uvNow} · ${uvLevel(uvNow)}`, `Peaks at ${uvMax} (${uvLevel(uvMax).toLowerCase()}) today${uvMax >= 3 ? '. Wear sunscreen.' : '.'}`)}
    ${aqi == null
      ? tile('ti-wind', 'Air quality', 'No data', 'Air quality data is unavailable right now.')
      : tile('ti-wind', 'Air quality', `${Math.round(aqi)} · ${aqiLevel(aqi)}`, 'European AQI: lower is better.')}
    ${tile('ti-umbrella', 'Rain today', rain.value, rain.note)}`;
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
  const { progress, isUp, daylightMinutes } = getSunPosition(current.time, sunrise, sunset);

  // The sun moves along a half circle: progress 0 = left end (sunrise), 1 = right end (sunset).
  const angle = Math.PI * (1 - progress);
  const sunX = 100 + 80 * Math.cos(angle);
  const sunY = 90 - 80 * Math.sin(angle);

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
        <span class="tile-note">${Math.floor(daylightMinutes / 60)}h ${daylightMinutes % 60}m of daylight</span>
        <span><small>Sunset</small>${sunset.slice(11, 16)}</span>
      </div>
    </article>`;
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
    : "You're offline and this place hasn't been saved yet. Check your connection and try again.");
  console.error(error);
}

// Hides the status line once results are showing.
function hideStatus() {
  els.status.hidden = true;
}


// ---------- Formatting (uses the chosen unit) ----------

// Shows a Celsius value in the chosen unit.
function formatTemp(celsius) {
  return formatTempIn(celsius, state.unit);
}

// Shows wind in the chosen unit's usual scale.
function formatWind(kmh) {
  return formatWindIn(kmh, state.unit);
}

// Formats the city's local time, e.g. "Tuesday, 06 October at 18:45".
function formatLocalTime(isoTime) {
  return new Date(isoTime).toLocaleString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
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
els.input.addEventListener('input', handleInput);
els.input.addEventListener('keydown', handleSuggestionKeys);
els.input.addEventListener('blur', closeSuggestions);
// pointerdown fires before the input loses focus; cancelling it keeps the list open long enough to click
els.suggestions.addEventListener('pointerdown', (event) => event.preventDefault());
els.suggestions.addEventListener('click', (event) => {
  const option = event.target.closest('[data-index]');
  if (option) chooseSuggestion(Number(option.dataset.index));
});
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

// Register the service worker, which makes the app installable and work offline.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Service worker not registered', error));
}
