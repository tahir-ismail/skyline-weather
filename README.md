# Skyline Weather

Search any city for its current weather and a five-day forecast.

**Live demo:** https://tahir-ismail.github.io/skyline-weather/

![Skyline Weather showing current conditions and a five-day forecast for London](screenshot.jpg)

## Features

- City search with live conditions: temperature, feels like, humidity and wind
- Five-day forecast with daily highs and lows
- °C/°F switch (wind changes between km/h and mph with it)
- Light and dark mode
- Remembers your last city, unit and theme between visits
- Clear messages when a city isn't found or you're offline
- Works on phones: the forecast row scrolls sideways instead of squashing

## Built with

- HTML, CSS and plain JavaScript (no frameworks or build step)
- [Open-Meteo](https://open-meteo.com/) Geocoding and Forecast APIs
- [Tabler Icons](https://tabler.io/icons)
- Hosted on GitHub Pages

## How it works

1. The search form sends the city name to the **Geocoding API**, which returns its coordinates.
2. Those coordinates go to the **Forecast API**, which returns current conditions and daily data in the city's own time zone.
3. The response is stored in one `state` object, and `render()` draws the page from it.

## Design decisions

- **Plain JavaScript:** no framework, so every part of the fetch-and-render flow is visible and easy to explain.
- **Open-Meteo:** free with no API key, so there's no secret to protect in a public repo.
- **Convert units on screen:** data is always fetched in Celsius and converted for display. Switching °C/°F is instant and doesn't need another request.
- **One source of truth:** the screen is always drawn from `state`, so a unit change just calls `render()` again and nothing gets out of sync.
- **Errors replace old results:** a failed search hides the previous city's weather so it can't be mistaken for the new one.
- **Safe storage:** `localStorage` calls are wrapped in `try/catch`, so the app still works if the browser blocks storage (for example in private mode).
- **Accessible by default:** a real `<form>` (Enter works), `aria-live` status messages, `aria-pressed` toggle buttons and screen-reader labels for weather icons.

## Run it locally

No install needed. Clone the repo and open `index.html` in a browser, or serve the folder with any static server, for example:

```bash
npx serve .
```

## Author

Tahir Ismail, [portfolio](https://tahir-ismail.github.io/) · [GitHub](https://github.com/tahir-ismail)
