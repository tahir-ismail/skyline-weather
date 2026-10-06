// Unit tests for logic.js, run with: npm test
// Uses Node's built-in test runner, so there's nothing to install.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeWeather, formatTemp, formatWind, getNext24Hours, getSunPosition,
  getRunningScore, getRainToday, uvLevel, aqiLevel, placeRegion, escapeHtml,
} from '../logic.js';

// Builds a fake Open-Meteo response with ideal running weather; tests override what they need.
function makeWeather(current = {}, rain = 0) {
  const hours = Array.from({ length: 48 }, (_, i) => `2026-10-0${6 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`);
  return {
    current: {
      time: '2026-10-06T08:30', apparent_temperature: 15, precipitation: 0, wind_speed_10m: 10,
      uv_index: 2, weather_code: 0, is_day: 1, ...current,
    },
    hourly: {
      time: hours,
      temperature_2m: hours.map((_, i) => i),
      precipitation_probability: hours.map(() => rain),
    },
  };
}

describe('formatTemp', () => {
  test('keeps Celsius and rounds', () => assert.equal(formatTemp(20.4, 'celsius'), '20°'));
  test('converts freezing point to Fahrenheit', () => assert.equal(formatTemp(0, 'fahrenheit'), '32°'));
  test('-40 is the same in both units', () => assert.equal(formatTemp(-40, 'fahrenheit'), '-40°'));
});

describe('formatWind', () => {
  test('km/h for Celsius', () => assert.equal(formatWind(24.6, 'celsius'), '25 km/h'));
  test('mph for Fahrenheit', () => assert.equal(formatWind(100, 'fahrenheit'), '62 mph'));
});

describe('describeWeather', () => {
  test('clear day is a sun with the clear scheme', () => {
    assert.deepEqual(describeWeather(0, true), { label: 'Clear sky', icon: 'ti-sun', sky: 'clear' });
  });
  test('clear night swaps the sun for a moon', () => {
    const look = describeWeather(0, false);
    assert.equal(look.icon, 'ti-moon');
    assert.equal(look.sky, 'night');
  });
  test('rain at night keeps the rain icon but uses the night scheme', () => {
    const look = describeWeather(61, false);
    assert.equal(look.icon, 'ti-cloud-rain');
    assert.equal(look.sky, 'night');
  });
  test('unknown codes fall back safely', () => assert.equal(describeWeather(1234).label, 'Unknown'));
});

describe('uvLevel', () => {
  test('uses the WHO bands at each boundary', () => {
    assert.equal(uvLevel(2), 'Low');
    assert.equal(uvLevel(3), 'Moderate');
    assert.equal(uvLevel(6), 'High');
    assert.equal(uvLevel(8), 'Very high');
    assert.equal(uvLevel(11), 'Extreme');
  });
});

describe('aqiLevel', () => {
  test('uses the European AQI bands at each boundary', () => {
    assert.equal(aqiLevel(20), 'Good');
    assert.equal(aqiLevel(21), 'Fair');
    assert.equal(aqiLevel(60), 'Moderate');
    assert.equal(aqiLevel(100), 'Very poor');
    assert.equal(aqiLevel(101), 'Extremely poor');
  });
});

describe('getRainToday', () => {
  const day = (chance, mm) => ({ precipitation_probability_max: [chance], precipitation_sum: [mm] });

  test('high chance means take an umbrella', () => assert.equal(getRainToday(day(60, 0.4)).note, 'Take an umbrella.'));
  test('lots of rain means an umbrella even at low chance', () => assert.equal(getRainToday(day(10, 1.2)).note, 'Take an umbrella.'));
  test('small chance gets a gentle warning', () => assert.equal(getRainToday(day(25, 0)).note, 'Small chance of a shower.'));
  test('dry day needs no umbrella', () => assert.equal(getRainToday(day(0, 0)).note, 'No umbrella needed.'));
  test('formats the value with one decimal', () => assert.equal(getRainToday(day(5, 0)).value, '5% · 0.0 mm'));
});

describe('getNext24Hours', () => {
  test('starts at the current hour and returns 24 readings', () => {
    const hours = getNext24Hours(makeWeather({ time: '2026-10-06T08:30' }));
    assert.equal(hours.length, 24);
    assert.equal(hours[0].time, '08:00');
    assert.equal(hours[0].temp, 8);
  });
});

describe('getSunPosition', () => {
  const sunrise = '2026-10-06T06:00';
  const sunset = '2026-10-06T18:00';

  test('is at the start at sunrise', () => assert.equal(getSunPosition(sunrise, sunrise, sunset).progress, 0));
  test('is halfway at midday', () => assert.equal(getSunPosition('2026-10-06T12:00', sunrise, sunset).progress, 0.5));
  test('stays at the end after sunset and reports the sun is down', () => {
    const sun = getSunPosition('2026-10-06T21:00', sunrise, sunset);
    assert.equal(sun.progress, 1);
    assert.equal(sun.isUp, false);
  });
  test('counts daylight in minutes', () => assert.equal(getSunPosition(sunrise, sunrise, sunset).daylightMinutes, 720));
});

describe('getRunningScore', () => {
  test('ideal daytime weather is Great', () => {
    const run = getRunningScore(makeWeather(), { european_aqi: 15 });
    assert.equal(run.rating, 'Great');
    assert.equal(run.reason, 'Ideal conditions');
  });
  test('ideal weather at night reminds you to wear lights', () => {
    assert.match(getRunningScore(makeWeather({ is_day: 0 }), null).reason, /wear lights/);
  });
  test('extreme heat is not Great and says why', () => {
    const run = getRunningScore(makeWeather({ apparent_temperature: 38 }), null);
    assert.notEqual(run.rating, 'Great');
    assert.equal(run.reason, 'Too hot for a hard run');
  });
  test('cold weather suggests layers', () => {
    assert.equal(getRunningScore(makeWeather({ apparent_temperature: 0 }), null).reason, 'Cold: wear layers');
  });
  test('rain in the next few hours lowers the rating', () => {
    const run = getRunningScore(makeWeather({}, 70), null);
    assert.equal(run.rating, 'Good');
    assert.equal(run.reason, 'Rain likely in the next few hours');
  });
  test('a thunderstorm is always Poor, whatever else is true', () => {
    const run = getRunningScore(makeWeather({ weather_code: 95 }), { european_aqi: 10 });
    assert.equal(run.rating, 'Poor');
    assert.equal(run.reason, 'Thunderstorm: stay inside');
  });
  test('missing air quality data does not crash the score', () => {
    assert.doesNotThrow(() => getRunningScore(makeWeather(), null));
  });
});

describe('placeRegion', () => {
  test('joins region and country', () => {
    assert.equal(placeRegion({ region: 'Illinois', country: 'United States' }), 'Illinois, United States');
  });
  test('skips a missing region', () => assert.equal(placeRegion({ country: 'Singapore' }), 'Singapore'));
});

describe('escapeHtml', () => {
  test('neutralises HTML in place names', () => {
    assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });
});
