(() => {
  'use strict';

  const TZ = 'Australia/Melbourne';
  const DESKTOP_COLS = 120;
  const DESKTOP_ROWS = 22;
  const MOBILE_COLS = 64;
  const MOBILE_ROWS = 24;

  const DIGITS = {
    '0': ['11111','10001','10001','10001','10001','10001','11111'],
    '1': ['00100','01100','00100','00100','00100','00100','01110'],
    '2': ['11111','00001','00001','11111','10000','10000','11111'],
    '3': ['11111','00001','00001','01111','00001','00001','11111'],
    '4': ['10001','10001','10001','11111','00001','00001','00001'],
    '5': ['11111','10000','10000','11111','00001','00001','11111'],
    '6': ['11111','10000','10000','11111','10001','10001','11111'],
    '7': ['11111','00001','00010','00100','01000','01000','01000'],
    '8': ['11111','10001','10001','11111','10001','10001','11111'],
    '9': ['11111','10001','10001','11111','00001','00001','11111']
  };
  const COLON = ['0','0','1','0','1','0','0'];

  const field = document.getElementById('field');
  const timeEl = document.getElementById('time');
  const dateEl = document.getElementById('date');

  let fieldDots = [];
  let glyphs = [];
  let lastMinuteKey = '';
  let lastSecond = -1;
  let currentCols = 0;
  let currentRows = 0;

  function isCompact() {
    return window.innerWidth / Math.max(window.innerHeight, 1) < 2;
  }

  function buildField() {
    const compact = isCompact();
    const cols = compact ? MOBILE_COLS : DESKTOP_COLS;
    const rows = compact ? MOBILE_ROWS : DESKTOP_ROWS;
    if (cols === currentCols && rows === currentRows && fieldDots.length) return;

    currentCols = cols;
    currentRows = rows;
    field.textContent = '';
    fieldDots = new Array(cols * rows);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < fieldDots.length; i++) {
      const dot = document.createElement('i');
      dot.className = 'field-dot';
      fieldDots[i] = dot;
      frag.appendChild(dot);
    }
    field.appendChild(frag);
    lastSecond = -1;
  }

  function buildTime() {
    timeEl.textContent = '';
    glyphs = [];
    const tokens = ['d','d','c','d','d'];
    const frag = document.createDocumentFragment();

    tokens.forEach((type) => {
      const glyph = document.createElement('div');
      glyph.className = type === 'c' ? 'glyph colon' : 'glyph';
      const count = type === 'c' ? 7 : 35;
      const dots = [];
      for (let i = 0; i < count; i++) {
        const dot = document.createElement('i');
        dot.className = 'time-dot';
        glyph.appendChild(dot);
        dots.push(dot);
      }
      glyphs.push({ type, dots, value: null });
      frag.appendChild(glyph);
    });
    timeEl.appendChild(frag);
    setColon();
  }

  function setColon() {
    const g = glyphs[2];
    COLON.forEach((v, i) => g.dots[i].classList.toggle('on', v === '1'));
  }

  function setDigit(glyphIndex, value) {
    const g = glyphs[glyphIndex];
    if (!g || g.value === value) return;
    g.value = value;
    const pattern = DIGITS[value];
    let k = 0;
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        g.dots[k++].classList.toggle('on', pattern[r][c] === '1');
      }
    }
  }

  function melbourneParts(now) {
    const dtf = new Intl.DateTimeFormat('en-AU', {
      timeZone: TZ,
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
    const parts = Object.create(null);
    dtf.formatToParts(now).forEach(p => { if (p.type !== 'literal') parts[p.type] = p.value; });
    return parts;
  }

  function updateField(second) {
    if (second === lastSecond || !fieldDots.length) return;
    lastSecond = second;

    if (second === 0) {
      for (let i = 0; i < fieldDots.length; i++) fieldDots[i].classList.remove('elapsed');
      return;
    }

    const targetCols = Math.min(currentCols, Math.ceil((second / 59) * currentCols));
    const previousCols = Math.max(0, Math.ceil(((second - 1) / 59) * currentCols));

    for (let col = previousCols; col < targetCols; col++) {
      for (let row = 0; row < currentRows; row++) {
        fieldDots[(row * currentCols) + col].classList.add('elapsed');
      }
    }
  }

  function update() {
    const now = new Date();
    const p = melbourneParts(now);
    const hh = p.hour.padStart(2, '0');
    const mm = p.minute.padStart(2, '0');
    const ss = Number(p.second);
    const minuteKey = `${hh}:${mm}`;

    if (minuteKey !== lastMinuteKey) {
      setDigit(0, hh[0]);
      setDigit(1, hh[1]);
      setDigit(3, mm[0]);
      setDigit(4, mm[1]);
      lastMinuteKey = minuteKey;
      dateEl.textContent = `${p.weekday.toUpperCase()} ${p.day} ${p.month.toUpperCase()} ${p.year}`;
    }

    updateField(ss);
    timeEl.setAttribute('aria-label', `${hh}:${mm}`);
  }

  function schedule() {
    update();
    const delay = 1000 - (Date.now() % 1000) + 20;
    window.setTimeout(schedule, delay);
  }

  buildField();
  buildTime();
  update();
  window.addEventListener('resize', buildField, { passive: true });
  schedule();
})();
