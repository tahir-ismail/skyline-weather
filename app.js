/*
  Skyline Weather
  Flow: search form -> geocodeCity() -> getForecast() -> render. Everything is fetched in metric
  and converted on screen, so switching °C/°F is instant and needs no new request.
*/

// ---------- State ----------
// One object holds everything the screen is drawn from. Re-rendering = reading this object again.
const state = {
  unit: loadSetting('unit') || 'celsius', // 'celsius' | 'fahrenheit'
  place: null,                            // result of geocodeCity()
  weather: null,                          // result of getForecast()
};

// ---------- DOM references ----------
// Looked up once at start-up instead of on every render.
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


// =====================================================================
//  YOUR PART: the three functions below are the core of the app.
//  Each one has its "contract": what goes in and what must come out.
// =====================================================================

/**
 * Turns a city name into coordinates using the Open-Meteo Geocoding API.
 * Endpoint: https://geocoding-api.open-meteo.com/v1/search?name=<city>&count=1
 *
 * @param {string} name  What the user typed, e.g. "Cape Town"
 * @returns {Promise<{name: string, country: string, latitude: number, longitude: number} | null>}
 *          The best match, or null if the city wasn't found.
 */
async function geocodeCity(name) {
  // TODO: build the URL (remember encodeURIComponent), fetch it, check response.ok,
  //       read the JSON, and return the first item in `results` (or null if there isn't one).
  throw new Error('geocodeCity() is not written yet');
}

/**
 * Gets current conditions and the daily forecast for a location from the Open-Meteo Forecast API.
 * Endpoint: https://api.open-meteo.com/v1/forecast
 * Query parameters you'll need:
 *   latitude, longitude
 *   current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code
 *   daily=weather_code,temperature_2m_max,temperature_2m_min
 *   timezone=auto      (times come back in the city's own time zone)
 *   forecast_days=6    (today + the next 5 days)
 *
 * @returns {Promise<object>} The parsed JSON. It has `current` and `daily` objects.
 */
async function getForecast(latitude, longitude) {
  // TODO: build the URL (URLSearchParams keeps this tidy), fetch it, check response.ok, return the JSON.
  throw new Error('getForecast() is not written yet');
}

/**
 * Translates an Open-Meteo weather code into a label and a Tabler icon class.
 * Code list: https://open-meteo.com/en/docs (scroll to "WMO Weather interpretation codes")
 * Icons: https://tabler.io/icons (e.g. 'ti-sun', 'ti-cloud', 'ti-cloud-rain', 'ti-snowflake', 'ti-cloud-storm')
 *
 * @param {number} code  e.g. 0, 2, 61
 * @returns {{label: string, icon: string}}  e.g. { label: 'Clear sky', icon: 'ti-sun' }
 */
function describeWeather(code) {
  // TODO: map the codes (a lookup object or a switch both work), with a fallback for unknown codes.
  return { label: 'Unknown', icon: 'ti-question-mark' };
}


// =====================================================================
//  Search flow
// =====================================================================

// Runs when the form is submitted (button click or Enter).
async function handleSearch(event) {
  event.preventDefault(); // stop the browser reloading the page, which is what forms do by default
  const city = els.input.value.trim();
  if (!city) return;
  await searchCity(city);
}

// Looks up a city and shows its weather, or shows an error explaining what went wrong.
async function searchCity(city) {
  showStatus(`Loading weather for ${city}…`);

  try {
    const place = await geocodeCity(city);
    if (!place) {
      showError(`We couldn't find "${city}". Check the spelling and try again.`);
      return;
    }

    const weather = await getForecast(place.latitude, place.longitude);

    state.place = place;
    state.weather = weather;
    saveSetting('lastCity', place.name); // remembered for the next visit
    render();
  } catch (error) {
    // fetch() only throws when the request couldn't be made at all, which usually means no connection
    const message = navigator.onLine
      ? "Something went wrong getting the weather. Try again in a moment."
      : "You're offline. Check your connection and try again.";
    showError(message);
    console.error(error);
  }
}


// =====================================================================
//  Rendering
// =====================================================================

// Draws the whole result area from `state`. Called after a search and after a unit change.
function render() {
  if (!state.place || !state.weather) return;
  hideStatus();
  renderCurrent();
  renderForecast();
}

function renderCurrent() {
  const { place, weather } = state;
  const now = weather.current;
  const look = describeWeather(now.weather_code);

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

function renderForecast() {
  const daily = state.weather.daily;

  // Index 0 is today (already shown in the big card), so the forecast starts at 1.
  const items = daily.time.slice(1, 6).map((date, i) => {
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
  });

  els.forecastList.innerHTML = items.join('');
  els.forecast.hidden = false;
}

// Shows a neutral message (e.g. loading).
function showStatus(message) {
  els.status.textContent = message;
  els.status.classList.remove('is-error');
  els.status.hidden = false;
}

// Shows an error and hides old results, so the user never sees one city's weather under another's error.
function showError(message) {
  els.status.textContent = message;
  els.status.classList.add('is-error');
  els.status.hidden = false;
  els.current.hidden = true;
  els.forecast.hidden = true;
}

function hideStatus() {
  els.status.hidden = true;
}


// =====================================================================
//  Formatting and unit conversion
// =====================================================================

// API data is always Celsius; convert only for display.
function formatTemp(celsius) {
  const value = state.unit === 'fahrenheit' ? celsius * 9 / 5 + 32 : celsius;
  return `${Math.round(value)}°`;
}

// km/h for Celsius users, mph for Fahrenheit users (the usual pairing).
function formatWind(kmh) {
  return state.unit === 'fahrenheit'
    ? `${Math.round(kmh * 0.621371)} mph`
    : `${Math.round(kmh)} km/h`;
}

// "2026-10-06T18:45" is already the city's local time (timezone=auto), so it's formatted as-is.
function formatLocalTime(isoTime) {
  return new Date(isoTime).toLocaleString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

// "2026-10-07" -> "Wed". Noon is added so time-zone offsets can't push the date into the day before.
function formatWeekday(isoDate) {
  return new Date(`${isoDate}T12:00`).toLocaleDateString('en-ZA', { weekday: 'short' });
}


// =====================================================================
//  Unit toggle
// =====================================================================

function setUnit(unit) {
  state.unit = unit;
  saveSetting('unit', unit);
  els.unitButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.unit === unit));
  });
  render(); // redraw from the data we already have; no new request needed
}


// =====================================================================
//  Theme toggle (same behaviour and storage key as the portfolio)
// =====================================================================

function applyTheme(theme) {
  const isDark = theme === 'dark';
  if (isDark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  els.themeToggle.textContent = isDark ? 'Light' : 'Dark';
  els.themeToggle.setAttribute('aria-pressed', String(isDark));
  els.themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  els.themeColor.setAttribute('content', isDark ? '#121212' : '#f3f3f1');
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveSetting('theme', next);
}


// =====================================================================
//  localStorage helpers
// =====================================================================

// Wrapped in try/catch because storage can be blocked (private mode, strict privacy settings).
// If it is, the app still works; it just won't remember anything between visits.
function loadSetting(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function saveSetting(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage blocked: setting lasts for this visit only */ }
}


// =====================================================================
//  Start-up
// =====================================================================

els.form.addEventListener('submit', handleSearch);
els.unitButtons.forEach((button) => button.addEventListener('click', () => setUnit(button.dataset.unit)));
els.themeToggle.addEventListener('click', toggleTheme);

applyTheme(document.documentElement.dataset.theme);
setUnit(state.unit);

// Show the last searched city straight away, if there is one.
const lastCity = loadSetting('lastCity');
if (lastCity) {
  els.input.value = lastCity;
  searchCity(lastCity);
}
