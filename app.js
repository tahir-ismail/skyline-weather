// Skyline Weather: search a city -> find its coordinates -> fetch its weather -> draw it.
// Data is always fetched in metric and converted on screen, so the °C/°F switch is instant.

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

// Everything the screen is drawn from.
const state = {
  unit: loadSetting('unit') || 'celsius',
  place: null,
  weather: null,
};

const els = {
  form: document.getElementById('search-form'),
  input: document.getElementById('city-input'),
  status: document.getElementById('status'),
  current: document.getElementById('current'),
  placeName: document.getElementById('place-name'),
  localTime: document.getElementById('local-time'),
  currentIcon: document.getElementById('current-icon'),
  currentTemp: document.getElementById('current-temp'),
  currentCondition: document.getElementById('current-condition'),
  feelsLike: document.getElementById('feels-like'),
  humidity: document.getElementById('humidity'),
  wind: document.getElementById('wind'),
  forecast: document.getElementById('forecast'),
  forecastList: document.getElementById('forecast-list'),
  unitButtons: document.querySelectorAll('.unit-toggle button'),
  themeToggle: document.querySelector('.theme-toggle'),
  themeColor: document.querySelector('meta[name="theme-color"]'),
};

// WMO weather codes used by Open-Meteo -> label and Tabler icon.
const WEATHER_CODES = {
  0: { label: 'Clear sky', icon: 'ti-sun' },
  1: { label: 'Mainly clear', icon: 'ti-sun' },
  2: { label: 'Partly cloudy', icon: 'ti-cloud' },
  3: { label: 'Overcast', icon: 'ti-cloud' },
  45: { label: 'Fog', icon: 'ti-mist' },
  48: { label: 'Freezing fog', icon: 'ti-mist' },
  51: { label: 'Light drizzle', icon: 'ti-cloud-rain' },
  53: { label: 'Drizzle', icon: 'ti-cloud-rain' },
  55: { label: 'Heavy drizzle', icon: 'ti-cloud-rain' },
  56: { label: 'Freezing drizzle', icon: 'ti-cloud-rain' },
  57: { label: 'Freezing drizzle', icon: 'ti-cloud-rain' },
  61: { label: 'Light rain', icon: 'ti-cloud-rain' },
  63: { label: 'Rain', icon: 'ti-cloud-rain' },
  65: { label: 'Heavy rain', icon: 'ti-cloud-rain' },
  66: { label: 'Freezing rain', icon: 'ti-cloud-rain' },
  67: { label: 'Freezing rain', icon: 'ti-cloud-rain' },
  71: { label: 'Light snow', icon: 'ti-snowflake' },
  73: { label: 'Snow', icon: 'ti-snowflake' },
  75: { label: 'Heavy snow', icon: 'ti-snowflake' },
  77: { label: 'Snow grains', icon: 'ti-snowflake' },
  80: { label: 'Light showers', icon: 'ti-cloud-rain' },
  81: { label: 'Showers', icon: 'ti-cloud-rain' },
  82: { label: 'Heavy showers', icon: 'ti-cloud-rain' },
  85: { label: 'Snow showers', icon: 'ti-snowflake' },
  86: { label: 'Heavy snow showers', icon: 'ti-snowflake' },
  95: { label: 'Thunderstorm', icon: 'ti-cloud-storm' },
  96: { label: 'Thunderstorm with hail', icon: 'ti-cloud-storm' },
  99: { label: 'Thunderstorm with hail', icon: 'ti-cloud-storm' },
};


// ---------- API ----------

// Finds a city's coordinates. Returns null if the city doesn't exist.
async function geocodeCity(name) {
  const params = new URLSearchParams({ name, count: 1, language: 'en', format: 'json' });
  const response = await fetch(`${GEOCODING_URL}?${params}`);
  if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);

  const data = await response.json();
  return data.results?.[0] ?? null; // no "results" key at all when nothing matches
}

// Gets current conditions plus today and the next 5 days for a location.
async function getForecast(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: 6,
  });
  const response = await fetch(`${FORECAST_URL}?${params}`);
  if (!response.ok) throw new Error(`Forecast failed: ${response.status}`);

  return response.json();
}

// Turns a weather code into a label and icon; clear skies at night get a moon.
function describeWeather(code, isDay = true) {
  const look = WEATHER_CODES[code] ?? { label: 'Unknown', icon: 'ti-question-mark' };
  if (!isDay && look.icon === 'ti-sun') return { ...look, icon: 'ti-moon' };
  return look;
}


// ---------- Search ----------

// Handles the search form (button click or Enter).
async function handleSearch(event) {
  event.preventDefault(); // stop the page reloading
  const city = els.input.value.trim();
  if (city) await searchCity(city);
}

// Looks up a city and shows its weather, or an error.
async function searchCity(city) {
  showStatus(`Loading weather for ${city}…`);

  try {
    const place = await geocodeCity(city);
    if (!place) {
      showError(`We couldn't find "${city}". Check the spelling and try again.`);
      return;
    }

    state.place = place;
    state.weather = await getForecast(place.latitude, place.longitude);
    saveSetting('lastCity', place.name);
    render();
  } catch (error) {
    showError(navigator.onLine
      ? 'Something went wrong getting the weather. Try again in a moment.'
      : "You're offline. Check your connection and try again.");
    console.error(error);
  }
}


// ---------- Rendering ----------

// Redraws the results from state.
function render() {
  if (!state.place || !state.weather) return;
  hideStatus();
  renderCurrent();
  renderForecast();
}

// Fills in the big "right now" card.
function renderCurrent() {
  const { place, weather } = state;
  const now = weather.current;
  const look = describeWeather(now.weather_code, now.is_day === 1);

  els.placeName.textContent = [place.name, place.country].filter(Boolean).join(', ');
  els.localTime.textContent = formatLocalTime(now.time);
  els.currentIcon.className = `current-icon ti ${look.icon}`;
  els.currentTemp.textContent = formatTemp(now.temperature_2m);
  els.currentCondition.textContent = look.label;
  els.feelsLike.textContent = formatTemp(now.apparent_temperature);
  els.humidity.textContent = `${Math.round(now.relative_humidity_2m)}%`;
  els.wind.textContent = formatWind(now.wind_speed_10m);
  els.current.hidden = false;
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
      </li>`;
  }).join('');
  els.forecast.hidden = false;
}

// Shows a neutral message, e.g. while loading.
function showStatus(message) {
  els.status.textContent = message;
  els.status.classList.remove('is-error');
  els.status.hidden = false;
}

// Shows an error and hides old results so they can't be mistaken for the new city.
function showError(message) {
  showStatus(message);
  els.status.classList.add('is-error');
  els.current.hidden = true;
  els.forecast.hidden = true;
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
  els.themeColor.setAttribute('content', isDark ? '#121212' : '#f3f3f1');
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


// ---------- Start-up ----------

els.form.addEventListener('submit', handleSearch);
els.unitButtons.forEach((button) => button.addEventListener('click', () => setUnit(button.dataset.unit)));
els.themeToggle.addEventListener('click', toggleTheme);

applyTheme(document.documentElement.dataset.theme);
setUnit(state.unit);

// Reopen the last searched city.
const lastCity = loadSetting('lastCity');
if (lastCity) {
  els.input.value = lastCity;
  searchCity(lastCity);
}
