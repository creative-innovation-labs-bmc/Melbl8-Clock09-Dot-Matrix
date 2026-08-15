# Melbl8-Clock09-Dot-Matrix

Aurecon dot-matrix gallery clock for the native 3840×804 Melbourne display, optimised for Enplug on NVIDIA Shield.

## Current production direction
- Variant C promoted to the clean default URL
- HH:MM:SS with equal spacing around both colons
- Larger 5×5 colon blocks
- Colon pulse travels from top to bottom once every second
- Denser matrix and heavier digit strokes
- Five-dot-high bottom information band
- Left: day and date
- Right: Docklands + BOM temperature, humidity and wind
- GitHub Pages workflow generates a same-origin `weather.json` from BOM every 10 minutes
- Browser BOM calls and local cache remain as fallbacks
- 30 fps cap for Shield safety

## Pages
- `index.html` production candidate, based on C
- `variant-a.html` wide bold
- `variant-b.html` dense kinetic
- `variant-c.html` production direction
- `compare.html` review page
