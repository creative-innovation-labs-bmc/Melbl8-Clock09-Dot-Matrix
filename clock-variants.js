(() => {
  const TZ = 'Australia/Melbourne';
  const CHAR_PATTERNS = {
    '0': ['01110','10001','10011','10101','11001','10001','01110'],
    '1': ['00100','01100','00100','00100','00100','00100','01110'],
    '2': ['01110','10001','00001','00010','00100','01000','11111'],
    '3': ['11110','00001','00001','01110','00001','00001','11110'],
    '4': ['00010','00110','01010','10010','11111','00010','00010'],
    '5': ['11111','10000','11110','00001','00001','10001','01110'],
    '6': ['00110','01000','10000','11110','10001','10001','01110'],
    '7': ['11111','00001','00010','00100','01000','01000','01000'],
    '8': ['01110','10001','10001','01110','10001','10001','01110'],
    '9': ['01110','10001','10001','01111','00001','00010','11100'],
    ':': ['00000','00100','00100','00000','00100','00100','00000']
  };

  function createClock(options = {}) {
    const {
      canvasId = 'clock-canvas',
      cols = 96,
      rows = 24,
      pulseColon = true,
      twinkle = true,
      scan = false,
      wave = false,
      digitGlow = 0.24,
      idleAlpha = 0.10,
      progressAlpha = 0.20,
      activeAlpha = 1,
      sweepStrength = 0.18,
      title = 'Dot Matrix'
    } = options;

    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d', { alpha: true });
    const wrap = canvas.parentElement;
    const footerLeft = document.querySelector('[data-footer-left]');
    const footerRight = document.querySelector('[data-footer-right]');
    const versionTag = document.querySelector('[data-version-tag]');
    if (versionTag) versionTag.textContent = title;

    let width = 3840;
    let height = 804;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cellX = width / cols;
    let cellY = height / rows;
    let radius = Math.min(cellX, cellY) * 0.24;

    let charMeta = [];
    let activeMap = new Set();
    let previousMap = new Set();
    let transitionStart = 0;
    let lastSecond = -1;
    let lastFrame = 0;
    const FRAME_MS = 1000 / 30;

    function resize() {
      const rect = wrap.getBoundingClientRect();
      width = rect.width || 3840;
      height = rect.height || 804;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cellX = width / cols;
      cellY = height / rows;
      radius = Math.min(cellX, cellY) * 0.24;
    }

    function getNow() {
      const parts = new Intl.DateTimeFormat('en-AU', {
        timeZone: TZ,
        hour12: false,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).formatToParts(new Date());
      const out = {};
      for (const part of parts) {
        if (part.type !== 'literal') out[part.type] = part.value;
      }
      return out;
    }

    function buildMap(chars) {
      const map = new Set();
      const meta = [];
      const charWidth = 5;
      const charHeight = 7;
      const gap = 2;
      const totalCols = chars.length * charWidth + (chars.length - 1) * gap;
      const startCol = Math.floor((cols - totalCols) / 2);
      const startRow = Math.floor((rows - charHeight) / 2) - 2;

      chars.forEach((char, index) => {
        const pattern = CHAR_PATTERNS[char] || CHAR_PATTERNS['0'];
        const colOffset = startCol + index * (charWidth + gap);
        meta.push({ char, startCol: colOffset, endCol: colOffset + charWidth - 1, isColon: char === ':' });
        for (let r = 0; r < pattern.length; r++) {
          for (let c = 0; c < pattern[r].length; c++) {
            if (pattern[r][c] === '1') map.add(`${colOffset + c},${startRow + r}`);
          }
        }
      });
      charMeta = meta;
      return map;
    }

    function updateTime() {
      const now = getNow();
      const timeString = `${now.hour}:${now.minute}:${now.second}`;
      const chars = timeString.split('');
      const sec = Number(now.second);
      if (sec !== lastSecond) {
        previousMap = new Set(activeMap);
        activeMap = buildMap(chars);
        transitionStart = performance.now();
        lastSecond = sec;
        if (footerLeft) footerLeft.textContent = 'MELBOURNE, AUSTRALIA';
        if (footerRight) footerRight.textContent = `${String(now.weekday).toUpperCase()} ${now.day} ${String(now.month).toUpperCase()} ${now.year}`;
      }
    }

    function findCharMeta(col) {
      for (const meta of charMeta) {
        if (col >= meta.startCol && col <= meta.endCol) return meta;
      }
      return null;
    }

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function ease(t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    function draw(ts) {
      ctx.clearRect(0, 0, width, height);
      const progress = Math.min(1, (ts - transitionStart) / 360);
      const eased = ease(progress);
      const secondValue = lastSecond >= 0 ? lastSecond : 0;
      const minuteProgress = secondValue / 59;
      const scanPos = ((ts * 0.0001) % 1) * cols;
      const wavePhase = ts * 0.0022;
      const twinklePhase = ts * 0.0011;
      const colonPulse = pulseColon ? (0.55 + (Math.sin(ts * 0.008) + 1) * 0.225) : 1;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = (col + 0.5) * cellX;
          const y = (row + 0.5) * cellY;
          const key = `${col},${row}`;
          const isActiveNow = activeMap.has(key);
          const wasActive = previousMap.has(key);
          const meta = findCharMeta(col);

          let alpha = idleAlpha;
          let scale = 1;
          let useGreen = false;

          if (col / (cols - 1) <= minuteProgress) alpha = Math.max(alpha, progressAlpha);
          if (twinkle) alpha += ((Math.sin((col * 0.33) + (row * 0.51) + twinklePhase) + 1) * 0.5) * 0.03;

          if (isActiveNow && wasActive) {
            alpha = activeAlpha;
            useGreen = true;
            scale = 1 + digitGlow * (1 - eased) * 0.3;
          } else if (isActiveNow && !wasActive) {
            alpha = lerp(0.20, activeAlpha, eased);
            useGreen = true;
            scale = lerp(0.72, 1.08, eased);
          } else if (!isActiveNow && wasActive) {
            alpha = lerp(activeAlpha, idleAlpha, eased);
            useGreen = progress < 1;
            scale = lerp(1.06, 0.92, eased);
          }

          if (meta?.isColon && isActiveNow) {
            alpha *= colonPulse;
          }

          if (scan) {
            const dist = Math.abs(col - scanPos);
            if (dist < 10) alpha += (1 - dist / 10) * sweepStrength;
          }

          if (wave && isActiveNow) {
            const w = Math.sin((col * 0.28) + (row * 0.18) + wavePhase);
            alpha += Math.max(0, w) * 0.08;
            scale += Math.max(0, w) * 0.12;
          }

          alpha = Math.max(0, Math.min(1, alpha));
          const r = radius * scale;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = useGreen || isActiveNow ? `rgba(137,201,37,${alpha})` : `rgba(255,255,255,${alpha})`;
          ctx.fill();
        }
      }

      requestAnimationFrame(loop);
    }

    function loop(ts) {
      updateTime();
      if (ts - lastFrame >= FRAME_MS) {
        lastFrame = ts;
        draw(ts);
      } else {
        requestAnimationFrame(loop);
      }
    }

    window.addEventListener('resize', resize);
    resize();
    updateTime();
    requestAnimationFrame(loop);
  }

  window.DotMatrixClock = { createClock };
})();
