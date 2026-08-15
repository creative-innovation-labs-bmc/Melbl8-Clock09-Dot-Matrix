(() => {
  const TZ = 'Australia/Melbourne';
  const FPS = 30;
  const FRAME_MS = 1000 / FPS;

  const GLYPHS = {
    '0': ['0111110','1100011','1100011','1100111','1101011','1110011','1100011','1100011','1100011','1100011','0111110'],
    '1': ['0011000','0111000','0011000','0011000','0011000','0011000','0011000','0011000','0011000','0011000','1111111'],
    '2': ['0111110','1100011','0000011','0000011','0000110','0001100','0011000','0110000','1100000','1100000','1111111'],
    '3': ['0111110','1100011','0000011','0000011','0011110','0000011','0000011','0000011','0000011','1100011','0111110'],
    '4': ['0001110','0011110','0110110','1100110','1100110','1111111','0000110','0000110','0000110','0000110','0001111'],
    '5': ['1111111','1100000','1100000','1100000','1111110','0000011','0000011','0000011','0000011','1100011','0111110'],
    '6': ['0011110','0110000','1100000','1100000','1111110','1100011','1100011','1100011','1100011','1100011','0111110'],
    '7': ['1111111','0000011','0000110','0000110','0001100','0001100','0011000','0011000','0110000','0110000','0110000'],
    '8': ['0111110','1100011','1100011','1100011','0111110','1100011','1100011','1100011','1100011','1100011','0111110'],
    '9': ['0111110','1100011','1100011','1100011','1100011','0111111','0000011','0000011','0000011','0000110','0111100'],
    ':': ['0000000','0000000','0001100','0001100','0001100','0000000','0000000','0001100','0001100','0001100','0000000']
  };

  function createClock(opts = {}) {
    const settings = Object.assign({
      canvasId: 'clock-canvas',
      cols: 156,
      rows: 30,
      glyphScale: 2,
      idleAlpha: 0.07,
      progressAlpha: 0.11,
      activeAlpha: 0.95,
      rippleAlpha: 0.10,
      rippleSpeed: 0.0016,
      rippleScale: 0.08,
      scan: 0,
      twinkle: 0.015,
      title: ''
    }, opts);

    const canvas = document.getElementById(settings.canvasId);
    const ctx = canvas.getContext('2d', {alpha:true});
    const wrap = canvas.parentElement;
    const footerLeft = document.querySelector('[data-footer-left]');
    const footerRight = document.querySelector('[data-footer-right]');
    const versionTag = document.querySelector('[data-version-tag]');
    if (versionTag) versionTag.textContent = settings.title;

    let width = 3840, height = 804, dpr = 1;
    let cellX = 1, cellY = 1, radius = 1;
    let active = new Set(), previous = new Set();
    let meta = [];
    let lastSecond = -1;
    let transitionStart = 0;
    let lastFrame = 0;

    function resize() {
      const rect = wrap.getBoundingClientRect();
      width = rect.width || 3840;
      height = rect.height || 804;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      cellX = width / settings.cols;
      cellY = height / settings.rows;
      radius = Math.min(cellX, cellY) * 0.16;
    }

    function getNow() {
      const parts = new Intl.DateTimeFormat('en-AU', {
        timeZone: TZ, hour12:false,
        weekday:'long', day:'numeric', month:'long', year:'numeric',
        hour:'2-digit', minute:'2-digit', second:'2-digit'
      }).formatToParts(new Date());
      const out = {};
      for (const p of parts) if (p.type !== 'literal') out[p.type] = p.value;
      return out;
    }

    function build(chars) {
      const map = new Set();
      meta = [];
      const gw = 7, gh = 11, scale = settings.glyphScale, gap = 2;
      const glyphWidth = gw * scale;
      const glyphHeight = gh * scale;
      const total = chars.length * glyphWidth + (chars.length - 1) * gap;
      const startCol = Math.floor((settings.cols - total) / 2);
      const startRow = Math.max(1, Math.floor((settings.rows - glyphHeight) / 2) - 1);

      chars.forEach((ch, i) => {
        const pattern = GLYPHS[ch] || GLYPHS['0'];
        const left = startCol + i * (glyphWidth + gap);
        meta.push({left, right:left+glyphWidth-1, colon: ch === ':'});
        for (let r=0; r<gh; r++) {
          for (let c=0; c<gw; c++) {
            if (pattern[r][c] !== '1') continue;
            for (let sy=0; sy<scale; sy++) {
              for (let sx=0; sx<scale; sx++) {
                map.add(`${left + c*scale + sx},${startRow + r*scale + sy}`);
              }
            }
          }
        }
      });
      return map;
    }

    function updateTime() {
      const now = getNow();
      const s = Number(now.second);
      if (s === lastSecond) return;
      previous = new Set(active);
      active = build(`${now.hour}:${now.minute}:${now.second}`.split(''));
      transitionStart = performance.now();
      lastSecond = s;
      if (footerLeft) footerLeft.textContent = 'MELBOURNE, AUSTRALIA';
      if (footerRight) footerRight.textContent = `${String(now.weekday).toUpperCase()} ${now.day} ${String(now.month).toUpperCase()} ${now.year}`;
    }

    function charInfo(col) {
      for (const m of meta) if (col >= m.left && col <= m.right) return m;
      return null;
    }

    function draw(ts) {
      if (ts - lastFrame < FRAME_MS) {
        requestAnimationFrame(loop);
        return;
      }
      lastFrame = ts;
      ctx.clearRect(0,0,width,height);
      const sec = Math.max(0, lastSecond);
      const minuteProgress = sec / 59;
      const trans = Math.min(1, (ts - transitionStart) / 280);
      const colonPulse = 0.72 + ((Math.sin(ts * 0.010) + 1) * 0.14);
      const scanPos = ((ts * 0.0001) % 1) * settings.cols;

      for (let row=0; row<settings.rows; row++) {
        for (let col=0; col<settings.cols; col++) {
          const key = `${col},${row}`;
          const isActive = active.has(key);
          const wasActive = previous.has(key);
          const info = charInfo(col);
          let alpha = settings.idleAlpha;
          let scale = 1;
          let green = false;

          if ((col / (settings.cols - 1)) <= minuteProgress) alpha = Math.max(alpha, settings.progressAlpha);
          alpha += ((Math.sin(col * 0.37 + row * 0.21 + ts * 0.001) + 1) * 0.5) * settings.twinkle;

          if (isActive && wasActive) {
            alpha = settings.activeAlpha;
            green = true;
          } else if (isActive && !wasActive) {
            alpha = 0.2 + (settings.activeAlpha - 0.2) * trans;
            green = true;
            scale = 0.84 + 0.16 * trans;
          } else if (!isActive && wasActive) {
            alpha = settings.idleAlpha + (settings.activeAlpha - settings.idleAlpha) * (1 - trans);
            green = trans < 1;
            scale = 1 - 0.12 * trans;
          }

          if (isActive) {
            const ripple = Math.max(0, Math.sin((col * 0.55) + (row * 0.18) - ts * settings.rippleSpeed));
            alpha += ripple * settings.rippleAlpha;
            scale += ripple * settings.rippleScale;
          }

          if (settings.scan > 0) {
            const dist = Math.abs(col - scanPos);
            if (dist < 8) alpha += (1 - dist / 8) * settings.scan;
          }

          if (info?.colon && isActive) alpha *= colonPulse;

          alpha = Math.max(0, Math.min(1, alpha));
          const x = (col + 0.5) * cellX;
          const y = (row + 0.5) * cellY;
          ctx.beginPath();
          ctx.arc(x, y, radius * scale, 0, Math.PI * 2);
          ctx.fillStyle = green || isActive ? `rgba(137,201,37,${alpha})` : `rgba(255,255,255,${alpha})`;
          ctx.fill();
        }
      }
      requestAnimationFrame(loop);
    }

    function loop(ts) {
      updateTime();
      draw(ts);
    }

    window.addEventListener('resize', resize);
    resize();
    updateTime();
    requestAnimationFrame(loop);
  }

  window.DotMatrixClock = { createClock };
})();
