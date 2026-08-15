(() => {
  'use strict';

  const STAGE_W = 3840;
  const STAGE_H = 804;
  const TZ = 'Australia/Melbourne';
  const WEATHER_REFRESH_MS = 10 * 60 * 1000;
  const WEATHER_FILE_MAX_AGE_MS = 90 * 60 * 1000;
  const WEATHER_CACHE_KEY = 'clock09-bom-docklands-v2';
  const FPS = 30;
  const FRAME_MS = 1000 / FPS;

  const DIGITS = {
    '0':['0111110','1100011','1100011','1100111','1101011','1110011','1100011','1100011','1100011','1100011','0111110'],
    '1':['0011000','0111000','0011000','0011000','0011000','0011000','0011000','0011000','0011000','0011000','1111111'],
    '2':['0111110','1100011','0000011','0000011','0000110','0001100','0011000','0110000','1100000','1100000','1111111'],
    '3':['0111110','1100011','0000011','0000011','0011110','0000011','0000011','0000011','0000011','1100011','0111110'],
    '4':['0001110','0011110','0110110','1100110','1100110','1111111','0000110','0000110','0000110','0000110','0001111'],
    '5':['1111111','1100000','1100000','1100000','1111110','0000011','0000011','0000011','0000011','1100011','0111110'],
    '6':['0011110','0110000','1100000','1100000','1111110','1100011','1100011','1100011','1100011','1100011','0111110'],
    '7':['1111111','0000011','0000110','0000110','0001100','0001100','0011000','0011000','0110000','0110000','0110000'],
    '8':['0111110','1100011','1100011','1100011','0111110','1100011','1100011','1100011','1100011','1100011','0111110'],
    '9':['0111110','1100011','1100011','1100011','1100011','0111111','0000011','0000011','0000011','0000110','0111100']
  };

  const MINI = {
    'A':['010','101','111','101','101'],'B':['110','101','110','101','110'],'C':['011','100','100','100','011'],
    'D':['110','101','101','101','110'],'E':['111','100','110','100','111'],'F':['111','100','110','100','100'],
    'G':['011','100','101','101','011'],'H':['101','101','111','101','101'],'I':['111','010','010','010','111'],
    'J':['001','001','001','101','010'],'K':['101','101','110','101','101'],'L':['100','100','100','100','111'],
    'M':['10001','11011','10101','10101','10101'],'N':['1001','1101','1011','1001','1001'],'O':['010','101','101','101','010'],
    'P':['110','101','110','100','100'],'Q':['010','101','101','111','011'],'R':['110','101','110','101','101'],
    'S':['011','100','010','001','110'],'T':['111','010','010','010','010'],'U':['101','101','101','101','111'],
    'V':['101','101','101','101','010'],'W':['10101','10101','10101','11011','10001'],'X':['101','101','010','101','101'],
    'Y':['101','101','010','010','010'],'Z':['111','001','010','100','111'],
    '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['110','001','010','100','111'],
    '3':['110','001','010','001','110'],'4':['101','101','111','001','001'],'5':['111','100','110','001','110'],
    '6':['011','100','110','101','010'],'7':['111','001','010','010','010'],'8':['010','101','010','101','010'],
    '9':['010','101','011','001','110'],'%':['101','001','010','100','101'],'.':['0','0','0','0','1'],
    '-':['0','0','111','0','0'],':':['0','1','0','1','0'],'/':['001','001','010','100','100'],' ':['0','0','0','0','0']
  };

  const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b, v));

  function fitStage(stage) {
    const s = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
    stage.style.transform = `translate(-50%,-50%) scale(${s})`;
  }

  function nowParts() {
    const p = new Intl.DateTimeFormat('en-AU', {
      timeZone: TZ, hour12: false,
      weekday:'long', day:'2-digit', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit', second:'2-digit'
    }).formatToParts(new Date());
    const out = {};
    p.forEach(x => { if (x.type !== 'literal') out[x.type] = x.value; });
    return out;
  }

  function miniWidth(text) {
    let w = 0;
    for (const ch of text) {
      const glyph = MINI[ch] || MINI[' '];
      w += glyph[0].length + 1;
    }
    return Math.max(0, w - 1);
  }

  function putMini(map, text, startCol, startRow, kind) {
    let x = startCol;
    for (const ch of text) {
      const glyph = MINI[ch] || MINI[' '];
      for (let r=0; r<5; r++) {
        for (let c=0; c<glyph[r].length; c++) {
          if (glyph[r][c] === '1') map.set(`${x+c},${startRow+r}`, kind);
        }
      }
      x += glyph[0].length + 1;
    }
  }

  function parseObservation(json) {
    const d = Array.isArray(json?.data) ? json.data[0] : (json?.data || json?.observations?.data?.[0] || json);
    if (!d) return null;
    const wind = d.wind || {};
    const temp = d.temp ?? d.air_temp ?? d.temperature;
    const humidity = d.relative_humidity ?? d.rel_hum ?? d.humidity;
    const direction = wind.direction ?? d.wind_dir ?? d.wind_direction;
    const speed = wind.speed_kilometre ?? d.wind_spd_kmh ?? d.wind_speed_kilometre ?? d.wind_speed;
    const rain = d.rain_since_9am ?? d.rain_trace ?? d.rainfall;
    if (temp == null && humidity == null && speed == null) return null;
    return { temp, humidity, direction, speed, rain, source:'BOM' };
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const r = await fetch(url, {cache:'no-store', signal:controller.signal, headers:{'Accept':'application/json'}});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  async function fetchBomWeather() {
    const q = new URLSearchParams(location.search);
    if (q.get('weather') === 'mock') return {temp:14.2, humidity:68, direction:'WNW', speed:12, rain:0, source:'BOM'};

    try {
      const local = await fetchJson(`./weather.json?t=${Date.now()}`);
      const parsed = parseObservation(local);
      const generated = Date.parse(local?.generated_at || local?.generatedAt || '');
      const fresh = !Number.isFinite(generated) || Date.now() - generated < WEATHER_FILE_MAX_AGE_MS;
      if (parsed && fresh && local?.status !== 'unavailable') return parsed;
    } catch (_) {}

    try {
      const locations = await fetchJson('https://api.weather.bom.gov.au/v1/locations?search=Docklands%20VIC');
      const list = locations?.data || [];
      const loc = list.find(x => String(x.name || '').toLowerCase() === 'docklands') || list[0];
      if (loc?.geohash) {
        const candidates = [loc.geohash, String(loc.geohash).slice(0,6)];
        for (const gh of [...new Set(candidates)]) {
          try {
            const obs = await fetchJson(`https://api.weather.bom.gov.au/v1/locations/${gh}/observations`);
            const parsed = parseObservation(obs);
            if (parsed) return parsed;
          } catch (_) {}
        }
      }
    } catch (_) {}

    try {
      const legacy = await fetchJson('https://www.bom.gov.au/fwo/IDV60901/IDV60901.95936.json');
      const parsed = parseObservation(legacy);
      if (parsed) return parsed;
    } catch (_) {}

    try {
      const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000) return cached.data;
    } catch (_) {}
    return null;
  }

  function createClock(options={}) {
    const cfg = Object.assign({
      cols:184, rows:35, footerRows:5,
      digitScaleX:3, digitScaleY:2,
      pairGap:4, separatorGap:7, colonWidth:5, colonBlockHeight:5,
      idleAlpha:0.07, progressAlpha:0.10, activeAlpha:0.96,
      idleMotion:0.006, activeMotion:0.025, scan:0.025,
      activeRadius:1.22, footerWeatherGreen:true, title:''
    }, options);

    const stage = document.getElementById('stage');
    const canvas = document.getElementById('clock-canvas');
    const ctx = canvas.getContext('2d', {alpha:true});
    canvas.width = STAGE_W; canvas.height = STAGE_H;
    const cellX = STAGE_W / cfg.cols;
    const cellY = STAGE_H / cfg.rows;
    const baseRadius = Math.min(cellX,cellY) * 0.15;

    let active = new Set();
    let previous = new Set();
    let colonCells = new Map();
    let footer = new Map();
    let lastSecond = -1;
    let transitionStart = 0;
    let lastFrame = 0;
    let weather = null;
    let weatherState = 'LOADING';

    function digitLayout(chars) {
      const digitW = 7 * cfg.digitScaleX;
      const digitH = 11 * cfg.digitScaleY;
      const pairW = digitW * 2 + cfg.pairGap;
      const totalW = pairW * 3 + cfg.colonWidth * 2 + cfg.separatorGap * 4;
      const left = Math.floor((cfg.cols - totalW) / 2);
      const top = 3;
      const positions = [];
      let x = left;
      for (let group=0; group<3; group++) {
        positions.push({type:'digit', ch:chars[group*2], x}); x += digitW + cfg.pairGap;
        positions.push({type:'digit', ch:chars[group*2+1], x}); x += digitW;
        if (group < 2) {
          x += cfg.separatorGap;
          positions.push({type:'colon', x});
          x += cfg.colonWidth + cfg.separatorGap;
        }
      }
      return {positions, top, digitW, digitH};
    }

    function buildTime(timeText) {
      const digitsOnly = timeText.replace(/:/g,'').split('');
      const map = new Set();
      const colons = new Map();
      const {positions,top} = digitLayout(digitsOnly);
      positions.forEach(pos => {
        if (pos.type === 'colon') {
          const h = cfg.colonBlockHeight;
          const y1 = top + 4;
          const y2 = top + 13;
          const minY = y1;
          const maxY = y2 + h - 1;
          for (let dx=0; dx<cfg.colonWidth; dx++) {
            for (let dy=0; dy<h; dy++) {
              const topKey = `${pos.x+dx},${y1+dy}`;
              const bottomKey = `${pos.x+dx},${y2+dy}`;
              map.add(topKey);
              map.add(bottomKey);
              colons.set(topKey, (y1 + dy - minY) / Math.max(1, maxY - minY));
              colons.set(bottomKey, (y2 + dy - minY) / Math.max(1, maxY - minY));
            }
          }
          return;
        }
        const glyph = DIGITS[pos.ch] || DIGITS['0'];
        for (let r=0; r<11; r++) {
          for (let c=0; c<7; c++) {
            if (glyph[r][c] !== '1') continue;
            for (let sy=0; sy<cfg.digitScaleY; sy++) {
              for (let sx=0; sx<cfg.digitScaleX; sx++) {
                map.add(`${pos.x + c*cfg.digitScaleX + sx},${top + r*cfg.digitScaleY + sy}`);
              }
            }
          }
        }
      });
      colonCells = colons;
      return map;
    }

    function weatherTokens(includeHumidity=true) {
      if (!weather) return ['DOCKLANDS', weatherState];
      const tempValue = Number(weather.temp);
      const humidityValue = Number(weather.humidity);
      const speedValue = Number(weather.speed);
      const dir = String(weather.direction || '').replace(/[^A-Z]/gi,'').toUpperCase();
      const temp = Number.isFinite(tempValue) ? `${Math.round(tempValue)}C` : '';
      const humid = includeHumidity && Number.isFinite(humidityValue) ? `${Math.round(humidityValue)}%` : '';
      let wind = '';
      if (dir && Number.isFinite(speedValue)) wind = `${dir} ${Math.round(speedValue)}K`;
      else if (dir) wind = dir;
      else if (Number.isFinite(speedValue)) wind = `${Math.round(speedValue)}K`;
      return ['DOCKLANDS', temp, humid, wind].filter(Boolean);
    }

    function weatherText() {
      return weatherTokens(true).join(' ');
    }

    function rebuildFooter(parts) {
      const row = cfg.rows - cfg.footerRows - 1;
      const leftText = `${String(parts.weekday).toUpperCase()} ${parts.day} ${String(parts.month).toUpperCase()} ${parts.year}`;
      const rightText = weatherText();
      const leftMargin = 4, rightMargin = 4;
      const lW = miniWidth(leftText), rW = miniWidth(rightText);
      const maxRightStart = cfg.cols - rightMargin - rW;
      footer = new Map();
      putMini(footer, leftText, leftMargin, row, 'meta');
      if (maxRightStart > leftMargin + lW + 4) {
        putMini(footer, rightText, maxRightStart, row, 'weather');
      } else {
        const compact = weatherTokens(false).join(' ');
        putMini(footer, compact, cfg.cols-rightMargin-miniWidth(compact), row, 'weather');
      }
    }

    function updateTime() {
      const p = nowParts();
      const sec = Number(p.second);
      if (sec === lastSecond) return;
      previous = new Set(active);
      active = buildTime(`${p.hour}:${p.minute}:${p.second}`);
      transitionStart = performance.now();
      lastSecond = sec;
      rebuildFooter(p);
    }

    async function updateWeather() {
      weatherState = 'LOADING';
      const data = await fetchBomWeather();
      weather = data;
      weatherState = data ? 'LIVE' : 'UNAVAILABLE';
      if (data) {
        try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({savedAt:Date.now(),data})); } catch (_) {}
      }
      rebuildFooter(nowParts());
    }

    function draw(ts) {
      if (ts-lastFrame < FRAME_MS) { requestAnimationFrame(loop); return; }
      lastFrame = ts;
      ctx.clearRect(0,0,STAGE_W,STAGE_H);
      const transitionAge = ts - transitionStart;
      const minuteProgress = Math.max(0,lastSecond)/59;
      const scanPos = ((ts*0.000055)%1)*cfg.cols;
      const secondPhase = (Date.now() % 1000) / 1000;
      const footerStart = cfg.rows - cfg.footerRows - 1;

      for (let row=0; row<cfg.rows; row++) {
        for (let col=0; col<cfg.cols; col++) {
          const key = `${col},${row}`;
          const isMain = active.has(key);
          const wasMain = previous.has(key);
          const footerKind = footer.get(key);
          let alpha = cfg.idleAlpha;
          let radius = baseRadius;
          let green = false;

          if (row < footerStart && col/(cfg.cols-1) <= minuteProgress) alpha = Math.max(alpha,cfg.progressAlpha);
          alpha += ((Math.sin(col*0.21 + row*0.43 + ts*0.0011)+1)*0.5)*cfg.idleMotion;

          if (isMain || wasMain) {
            const delay = ((col*3 + row*5) % 9) * 14;
            const t = clamp((transitionAge-delay)/250);
            if (isMain && wasMain) alpha = cfg.activeAlpha;
            else if (isMain) alpha = 0.10 + (cfg.activeAlpha-0.10)*t;
            else alpha = cfg.idleAlpha + (cfg.activeAlpha-cfg.idleAlpha)*(1-t);
            if (isMain) {
              green = true;
              radius *= cfg.activeRadius;
              const live = Math.max(0,Math.sin(col*0.29 + row*0.11 - ts*0.0017));
              alpha += live*cfg.activeMotion;
              radius *= 1 + live*0.035;
            }
          }

          const colonRank = colonCells.get(key);
          if (colonRank != null && isMain) {
            const distance = Math.abs(colonRank - secondPhase);
            const head = Math.exp(-Math.pow(distance / 0.16, 2));
            const trailDistance = secondPhase - colonRank;
            const trail = trailDistance >= 0 ? Math.exp(-trailDistance / 0.30) * 0.20 : 0;
            alpha = clamp(0.28 + head * 0.72 + trail);
            radius = baseRadius * cfg.activeRadius * (1.02 + head * 0.22);
            green = true;
          }

          const dist = Math.abs(col-scanPos);
          if (cfg.scan > 0 && row < footerStart && dist < 8) alpha += (1-dist/8)*cfg.scan;

          if (footerKind) {
            alpha = footerKind === 'weather' ? 0.92 : 0.78;
            green = footerKind === 'weather' && cfg.footerWeatherGreen;
            radius = baseRadius * 1.08;
          }

          alpha = clamp(alpha);
          ctx.beginPath();
          ctx.arc((col+0.5)*cellX,(row+0.5)*cellY,radius,0,Math.PI*2);
          ctx.fillStyle = green ? `rgba(137,201,37,${alpha})` : `rgba(255,255,255,${alpha})`;
          ctx.fill();
        }
      }
      requestAnimationFrame(loop);
    }

    function loop(ts) { updateTime(); draw(ts); }
    addEventListener('resize', () => fitStage(stage));
    fitStage(stage);
    updateTime();
    updateWeather();
    setInterval(updateWeather, WEATHER_REFRESH_MS);
    requestAnimationFrame(loop);
  }

  window.DotMatrixClock = {createClock};
})();
