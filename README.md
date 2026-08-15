# Melbl8 Clock09 Dot Matrix

Aurecon gallery clock for the 3840×804 Melbourne display, designed for Enplug on NVIDIA Shield.

## Design

- Aurecon grey `#373A36` background
- Aurecon green `#89C925` time
- HH:MM built entirely from a 5×7 dot matrix
- A full-screen matrix visualises elapsed seconds as a left-to-right sweep across each minute
- Melbourne time via `Intl.DateTimeFormat` with `Australia/Melbourne`
- Open Sans only for supporting text, with a safe sans-serif fallback
- No continuous animation loop. The display updates once per second and only changes the dots that need to change

## Deployment

Static GitHub Pages site for Enplug on NVIDIA Shield.

Robots directives are set to `noindex`, `nofollow`, `noarchive`, `nosnippet` and `noimageindex`.
