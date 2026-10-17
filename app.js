(() => {
  'use strict';

  // Regulation dartboard geometry in millimetres. The board centre is (0, 0)
  // and, as in SVG, y grows downwards.
  const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const RADIUS = {
    bull: 6.35,
    outerBull: 15.9,
    tripleInner: 99,
    tripleOuter: 107,
    doubleInner: 162,
    doubleOuter: 170,
    numbers: 192,
  };

  // The aim travels between -SWEEP and +SWEEP on each axis, so stopping near
  // either end can miss the board altogether.
  const SWEEP = 200;
  const SWEEP_PERIOD = { x: 1300, y: 1150 }; // ms for one full there-and-back
  const FLIGHT_MS = 340;
  const REST_MS = 1100; // pause after a hit before the next dart is ready
  const DARTS_ON_BOARD = 3;
  const START_VOLUME = 30;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);

  const els = {
    segments: $('board-segments'),
    numbers: $('board-numbers'),
    hitLayer: $('hit-layer'),
    dartLayer: $('dart-layer'),
    aimX: $('aim-x'),
    aimY: $('aim-y'),
    aimDot: $('aim-dot'),
    stepX: $('step-x'),
    stepY: $('step-y'),
    hint: $('hint-text'),
    volumeValue: $('volume-value'),
    volumeFill: $('volume-bar-fill'),
    volumeSource: $('volume-source'),
    speaker: $('speaker'),
    announcer: $('announcer'),
    audio: $('audio'),
    playButton: $('play-button'),
    trackTitle: $('track-title'),
    trackArtist: $('track-artist'),
    trackLicense: $('track-license'),
    progressFill: $('track-progress-fill'),
    openFile: $('open-file-button'),
    fileInput: $('file-input'),
    dropOverlay: $('drop-overlay'),
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');

  const round = (n) => Math.round(n * 100) / 100;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /* ---------- Board ---------- */

  // Angles are in degrees, clockwise from 12 o'clock.
  function polar(r, deg) {
    const rad = (deg * Math.PI) / 180;
    return [round(r * Math.sin(rad)), round(-r * Math.cos(rad))];
  }

  function wedgePath(r1, r2, a1, a2) {
    const [x1, y1] = polar(r2, a1);
    const [x2, y2] = polar(r2, a2);
    const [x3, y3] = polar(r1, a2);
    const [x4, y4] = polar(r1, a1);
    return `M${x1} ${y1}A${r2} ${r2} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 0 0 ${x4} ${y4}Z`;
  }

  function circlePath(r) {
    return `M${-r} 0A${r} ${r} 0 1 1 ${r} 0A${r} ${r} 0 1 1 ${-r} 0Z`;
  }

  // Use with fill-rule="evenodd" to punch out the middle.
  function ringPath(r1, r2) {
    return circlePath(r2) + circlePath(r1);
  }

  function svg(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    if (parent) parent.appendChild(node);
    return node;
  }

  const numberLabels = {};

  function drawBoard() {
    const bands = [
      [RADIUS.outerBull, RADIUS.tripleInner, 'single'],
      [RADIUS.tripleInner, RADIUS.tripleOuter, 'ring'],
      [RADIUS.tripleOuter, RADIUS.doubleInner, 'single'],
      [RADIUS.doubleInner, RADIUS.doubleOuter, 'ring'],
    ];

    SECTORS.forEach((number, i) => {
      const from = i * 18 - 9;
      const tone = i % 2 === 0 ? 'a' : 'b';
      for (const [r1, r2, kind] of bands) {
        svg('path', { d: wedgePath(r1, r2, from, from + 18), class: `seg seg-${kind}-${tone}` }, els.segments);
      }
      const [x, y] = polar(RADIUS.numbers, i * 18);
      numberLabels[number] = svg('text', { x, y, class: 'number' }, els.numbers);
      numberLabels[number].textContent = number;
    });

    svg('path', {
      d: ringPath(RADIUS.bull, RADIUS.outerBull),
      'fill-rule': 'evenodd',
      class: 'seg seg-outer-bull',
    }, els.segments);
    svg('circle', { r: RADIUS.bull, class: 'seg seg-bull' }, els.segments);
  }

  function scoreAt(x, y) {
    const r = Math.hypot(x, y);
    if (r <= RADIUS.bull) return { kind: 'bull', code: 'BULL', name: '불스아이', score: 50 };
    if (r <= RADIUS.outerBull) return { kind: 'outer-bull', code: '25', name: '아우터 불', score: 25 };
    if (r > RADIUS.doubleOuter) return { kind: 'miss', code: 'MISS', name: '빗나감', score: 0 };

    const angle = (Math.atan2(x, -y) * 180) / Math.PI;
    const index = Math.floor((((angle + 9) % 360) + 360) % 360 / 18);
    const number = SECTORS[index];
    const sector = { index, number };

    if (r >= RADIUS.tripleInner && r <= RADIUS.tripleOuter) {
      return { ...sector, kind: 'triple', code: `T${number}`, name: `트리플 ${number}`, score: number * 3 };
    }
    if (r >= RADIUS.doubleInner) {
      return { ...sector, kind: 'double', code: `D${number}`, name: `더블 ${number}`, score: number * 2 };
    }
    const kind = r < RADIUS.tripleInner ? 'inner-single' : 'outer-single';
    return { ...sector, kind, code: `S${number}`, name: `싱글 ${number}`, score: number };
  }

  function hitShape(hit) {
    const from = hit.index * 18 - 9;
    switch (hit.kind) {
      case 'bull': return circlePath(RADIUS.bull);
      case 'outer-bull': return ringPath(RADIUS.bull, RADIUS.outerBull);
      case 'inner-single': return wedgePath(RADIUS.outerBull, RADIUS.tripleInner, from, from + 18);
      case 'triple': return wedgePath(RADIUS.tripleInner, RADIUS.tripleOuter, from, from + 18);
      case 'outer-single': return wedgePath(RADIUS.tripleOuter, RADIUS.doubleInner, from, from + 18);
      case 'double': return wedgePath(RADIUS.doubleInner, RADIUS.doubleOuter, from, from + 18);
      default: return null;
    }
  }

  /* ---------- Animation helpers ---------- */

  const effects = new Set();

  function animate(duration, step, done) {
    const effect = { start: performance.now(), duration, step, done };
    effects.add(effect);
    return effect;
  }

  function runEffects(now) {
    for (const effect of effects) {
      const p = Math.min(1, Math.max(0, (now - effect.start) / effect.duration));
      effect.step(p);
      if (p >= 1) {
        effects.delete(effect);
        if (effect.done) effect.done(now);
      }
    }
  }

  /* ---------- Throwing ---------- */

  // Constant-speed back-and-forth between -SWEEP and +SWEEP.
  function sweep(elapsed, period, offset) {
    const t = (((elapsed / period + offset) % 1) + 1) % 1;
    return SWEEP * (t < 0.5 ? 4 * t - 1 : 3 - 4 * t);
  }

  const state = {
    phase: 'aim-x', // aim-x → aim-y → flight → rest → aim-x …
    since: 0, // when the current phase started, on the performance.now() clock
    offset: 0, // where in its cycle the current sweep started
    x: 0,
    y: 0,
  };

  function placeAimX(x) {
    els.aimX.setAttribute('x1', x);
    els.aimX.setAttribute('x2', x);
    els.aimDot.setAttribute('cx', x);
  }

  function placeAimY(y) {
    els.aimY.setAttribute('y1', y);
    els.aimY.setAttribute('y2', y);
    els.aimDot.setAttribute('cy', y);
  }

  function startAim(now) {
    state.phase = 'aim-x';
    state.since = now;
    state.offset = Math.random();
    placeAimX(sweep(0, SWEEP_PERIOD.x, state.offset));
    els.aimX.classList.remove('is-hidden', 'is-locked');
    els.aimY.classList.add('is-hidden');
    els.aimDot.classList.add('is-hidden');
    showStep();
  }

  function lockX(now) {
    state.x = sweep(now - state.since, SWEEP_PERIOD.x, state.offset);
    state.phase = 'aim-y';
    state.since = now;
    state.offset = Math.random();
    placeAimX(state.x);
    placeAimY(sweep(0, SWEEP_PERIOD.y, state.offset));
    els.aimX.classList.add('is-locked');
    els.aimY.classList.remove('is-hidden');
    els.aimDot.classList.remove('is-hidden');
    showStep();
  }

  function throwDart(now) {
    state.y = sweep(now - state.since, SWEEP_PERIOD.y, state.offset);
    state.phase = 'flight';
    state.since = now;
    els.aimX.classList.add('is-hidden');
    els.aimY.classList.add('is-hidden');
    els.aimDot.classList.add('is-hidden');
    showStep();

    const dart = spawnDart();
    const { x, y } = state;
    if (reducedMotion.matches) {
      land(dart, now);
      return;
    }
    // The dart comes up from below the board and shrinks as it travels away.
    const start = { x: x * 0.5 + 70, y: 330 };
    const bend = { x: x * 0.7 + 30, y: y - 90 };
    animate(FLIGHT_MS, (p) => {
      const e = easeOut(p);
      const px = (1 - e) * (1 - e) * start.x + 2 * (1 - e) * e * bend.x + e * e * x;
      const py = (1 - e) * (1 - e) * start.y + 2 * (1 - e) * e * bend.y + e * e * y;
      dart.setAttribute('transform', `translate(${round(px)} ${round(py)}) scale(${round(lerp(3.4, 1, e))})`);
      dart.style.opacity = Math.min(1, p * 5);
    }, (end) => land(dart, end));
  }

  function spawnDart() {
    for (const old of els.dartLayer.children) old.classList.add('is-old');
    while (els.dartLayer.children.length >= DARTS_ON_BOARD) els.dartLayer.firstElementChild.remove();

    // Drawn with the tip at the origin, so transforms pivot on the tip. The
    // dart leans down and to the right: axis(t, side) is t mm down its length
    // and side mm across it.
    const axis = (t, side = 0) => [round(0.643 * t + 0.766 * side), round(0.766 * t - 0.643 * side)];
    const flight = (side) => `M${axis(33)}L${axis(39, side)}L${axis(50, side * 1.1)}L${axis(50)}Z`;

    const dart = svg('g', { class: 'dart', transform: 'translate(0 400)' }, els.dartLayer);
    svg('path', { class: 'dart-flight dart-flight-back', d: flight(-10) }, dart);
    for (const [part, from, to] of [['point', 0, 9], ['barrel', 9, 22], ['shaft', 22, 50]]) {
      const [x1, y1] = axis(from);
      const [x2, y2] = axis(to);
      svg('line', { class: `dart-${part}`, x1, y1, x2, y2 }, dart);
    }
    svg('path', { class: 'dart-flight', d: flight(11) }, dart);
    return dart;
  }

  function land(dart, now) {
    const { x, y } = state;
    const hit = scoreAt(x, y);
    const at = `translate(${round(x)} ${round(y)})`;
    dart.setAttribute('transform', at);
    dart.style.opacity = ''; // hand opacity back to the stylesheet so it can fade once it's old

    if (!reducedMotion.matches) {
      animate(420, (p) => {
        const wobble = 7 * Math.exp(-5 * p) * Math.sin(p * Math.PI * 6);
        dart.setAttribute('transform', `${at} rotate(${round(wobble)})`);
      });
      const ripple = svg('circle', { class: 'ripple', cx: round(x), cy: round(y), r: 3 }, els.hitLayer);
      animate(480, (p) => {
        ripple.setAttribute('r', round(3 + 22 * easeOut(p)));
        ripple.style.opacity = 0.6 * (1 - p);
      }, () => ripple.remove());
    }

    flashHit(hit);
    thud();
    showResult(hit);
    setVolume(hit.score);

    state.phase = 'rest';
    state.since = now;
    showStep();
  }

  function flashHit(hit) {
    for (const label of Object.values(numberLabels)) label.classList.remove('is-hit');
    if (hit.number) numberLabels[hit.number].classList.add('is-hit');

    const shape = hitShape(hit);
    if (!shape) return;
    const flash = svg('path', {
      d: shape,
      'fill-rule': 'evenodd',
      class: hit.kind === 'bull' ? 'hit-flash on-bull' : 'hit-flash',
    }, els.hitLayer);
    if (reducedMotion.matches) {
      flash.style.opacity = 0.75;
      setTimeout(() => flash.remove(), 900);
      return;
    }
    animate(1200, (p) => {
      flash.style.opacity = 0.75 * (1 - p * p);
    }, () => flash.remove());
  }

  function showResult(hit) {
    const code = document.createElement('b');
    code.textContent = hit.code;
    const text = hit.kind === 'miss' ? '빗나가서 음소거됐어요' : `${hit.name} · ${hit.score}점`;
    els.volumeSource.replaceChildren(code, text);
    els.announcer.textContent = hit.kind === 'miss'
      ? '빗나갔어요. 볼륨 0, 음소거.'
      : `${hit.name}, ${hit.score}점. 볼륨 ${hit.score}.`;
  }

  function showStep() {
    const { phase } = state;
    const tap = coarsePointer.matches;
    els.stepX.className = phase === 'aim-x' ? 'is-active' : 'is-done';
    els.stepY.className = phase === 'aim-y' ? 'is-active' : phase === 'aim-x' ? '' : 'is-done';
    els.stepX.toggleAttribute('aria-current', phase === 'aim-x');
    els.stepY.toggleAttribute('aria-current', phase === 'aim-y');

    if (phase === 'aim-x') {
      els.hint.innerHTML = tap
        ? '다트판을 탭해 가로 위치를 멈추세요'
        : '클릭하거나 <kbd>Space</kbd>를 눌러 가로 위치를 멈추세요';
    } else if (phase === 'aim-y') {
      els.hint.innerHTML = tap
        ? '이번엔 세로예요. 한 번 더 탭하면 던져요'
        : '이번엔 세로예요. 한 번 더 누르면 던져요';
    } else {
      els.hint.textContent = '다음 다트를 준비하고 있어요';
    }
  }

  function onAction(now) {
    startMusic();
    if (state.phase === 'aim-x') lockX(now);
    else if (state.phase === 'aim-y') throwDart(now);
    else if (state.phase === 'rest') startAim(now);
    // While a dart is in the air, presses are ignored.
  }

  // Stop the sweep where it was when the button went down, not where it is
  // by the time the handler runs.
  function eventTime(event) {
    const now = performance.now();
    return event.timeStamp > now - 1000 && event.timeStamp <= now ? event.timeStamp : now;
  }

  // Mouse clicks count anywhere on the page. Fingers and pens play on the
  // board itself, so the rest of the page can still be scrolled.
  function isThrowInput(event) {
    if (!event.isPrimary || event.target.closest('button, a, input, label')) return false;
    return event.pointerType === 'mouse' || Boolean(event.target.closest('.stage'));
  }

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !isThrowInput(event)) return;
    onAction(eventTime(event));
  });

  // Touch screens only allow sound once the finger lifts, so the music gets
  // a second chance to start on pointerup.
  document.addEventListener('pointerup', (event) => {
    if (isThrowInput(event)) startMusic();
  });

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.key !== ' ') return;
    event.preventDefault(); // no page scroll, no pressing a focused button
    if (event.repeat) return;
    onAction(eventTime(event));
  });

  document.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.key === ' ') event.preventDefault();
  });

  /* ---------- Volume and music ---------- */

  const audio = els.audio;
  let audioCtx = null;
  let musicGain = null;
  let userPaused = false;
  let fileUrl = null;
  let volume = START_VOLUME;
  let shownVolume = START_VOLUME;
  let volumeEffect = null;

  audio.volume = START_VOLUME / 100;

  // Route the song through a GainNode where possible: iOS ignores
  // audio.volume, so a gain node is the only way to change loudness there.
  // Pages opened straight from file:// can't do this (the browser treats the
  // song as cross-origin and the node would only output silence), so those
  // fall back to easing audio.volume in the frame loop.
  function wakeAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx && AudioContextClass) {
      audioCtx = new AudioContextClass();
      if (location.protocol === 'http:' || location.protocol === 'https:') {
        try {
          const gain = audioCtx.createGain();
          gain.gain.value = volume / 100;
          audioCtx.createMediaElementSource(audio).connect(gain).connect(audioCtx.destination);
          audio.volume = 1;
          musicGain = gain;
        } catch {
          musicGain = null;
        }
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      const resumed = audioCtx.resume();
      if (resumed) resumed.catch(() => {}); // still locked; the next press tries again
    }
  }

  function setVolume(next) {
    const from = shownVolume;
    volume = next;
    if (musicGain) musicGain.gain.setTargetAtTime(next / 100, audioCtx.currentTime, 0.12);

    if (volumeEffect) effects.delete(volumeEffect);
    if (reducedMotion.matches) {
      renderVolume(next);
      return;
    }
    volumeEffect = animate(520, (p) => renderVolume(Math.round(lerp(from, next, easeOut(p)))));
  }

  function renderVolume(value) {
    shownVolume = value;
    els.volumeValue.textContent = value;
    els.volumeFill.style.transform = `scaleX(${value / 100})`;
    els.speaker.dataset.level = value === 0 ? 0 : value <= 20 ? 1 : value <= 40 ? 2 : 3;
  }

  // Without a gain node, glide audio.volume toward the target each frame.
  function easeElementVolume(dt) {
    if (musicGain) return;
    const target = volume / 100;
    const diff = target - audio.volume;
    if (Math.abs(diff) < 0.002) {
      if (diff !== 0) audio.volume = target;
      return;
    }
    audio.volume = Math.min(1, Math.max(0, audio.volume + diff * Math.min(1, dt / 120)));
  }

  // A short low thump with a click on top: the dart hitting sisal.
  let clickNoise = null;
  function thud() {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const t = audioCtx.currentTime;

    const body = audioCtx.createOscillator();
    const bodyGain = audioCtx.createGain();
    body.frequency.setValueAtTime(150, t);
    body.frequency.exponentialRampToValueAtTime(55, t + 0.1);
    bodyGain.gain.setValueAtTime(0.0001, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.35, t + 0.005);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    body.connect(bodyGain).connect(audioCtx.destination);
    body.start(t);
    body.stop(t + 0.15);

    if (!clickNoise) {
      const length = Math.round(audioCtx.sampleRate * 0.03);
      clickNoise = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
      const data = clickNoise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
    const click = audioCtx.createBufferSource();
    const band = audioCtx.createBiquadFilter();
    const clickGain = audioCtx.createGain();
    click.buffer = clickNoise;
    band.type = 'bandpass';
    band.frequency.value = 2400;
    band.Q.value = 0.8;
    clickGain.gain.value = 0.25;
    click.connect(band).connect(clickGain).connect(audioCtx.destination);
    click.start(t);
  }

  function play() {
    wakeAudio();
    userPaused = false;
    const attempt = audio.play();
    if (attempt) attempt.catch(() => {}); // blocked until the next press; the button still works
  }

  // The first throw starts the song unless the listener paused it on purpose.
  function startMusic() {
    wakeAudio();
    if (audio.paused && !userPaused) play();
  }

  function syncPlayButton() {
    const playing = !audio.paused;
    els.playButton.classList.toggle('is-playing', playing);
    els.playButton.setAttribute('aria-label', playing ? '일시정지' : '재생');
  }

  els.playButton.addEventListener('click', () => {
    if (audio.paused) {
      play();
    } else {
      userPaused = true;
      audio.pause();
    }
  });
  audio.addEventListener('play', syncPlayButton);
  audio.addEventListener('pause', syncPlayButton);
  audio.addEventListener('error', () => {
    els.trackArtist.textContent = fileUrl ? '이 파일은 재생할 수 없어요' : '곡을 불러오지 못했어요';
    els.trackLicense.hidden = true;
  });

  function playFile(file) {
    if (!file) return;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = URL.createObjectURL(file);
    audio.src = fileUrl;
    els.trackTitle.textContent = file.name.replace(/\.[^.]+$/, '') || file.name;
    els.trackArtist.textContent = '내 파일';
    els.trackLicense.hidden = true;
    play();
  }

  els.openFile.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => {
    playFile(els.fileInput.files[0]);
    els.fileInput.value = '';
  });

  const carriesFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
  let dragDepth = 0;

  window.addEventListener('dragenter', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    els.dropOverlay.hidden = false;
  });
  window.addEventListener('dragover', (event) => {
    if (carriesFiles(event)) event.preventDefault();
  });
  window.addEventListener('dragleave', (event) => {
    if (!carriesFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) els.dropOverlay.hidden = true;
  });
  window.addEventListener('drop', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    els.dropOverlay.hidden = true;
    playFile(event.dataTransfer.files[0]);
  });

  /* ---------- Frame loop ---------- */

  let lastFrame = performance.now();

  function frame(now) {
    const dt = Math.min(100, Math.max(0, now - lastFrame));
    lastFrame = now;

    if (state.phase === 'aim-x') {
      placeAimX(sweep(now - state.since, SWEEP_PERIOD.x, state.offset));
    } else if (state.phase === 'aim-y') {
      placeAimY(sweep(now - state.since, SWEEP_PERIOD.y, state.offset));
    } else if (state.phase === 'rest' && now - state.since >= REST_MS) {
      startAim(now);
    }

    runEffects(now);
    easeElementVolume(dt);
    const progress = audio.duration ? audio.currentTime / audio.duration : 0;
    els.progressFill.style.transform = `scaleX(${round(progress)})`;

    requestAnimationFrame(frame);
  }

  drawBoard();
  renderVolume(START_VOLUME);
  syncPlayButton();
  startAim(performance.now());
  coarsePointer.addEventListener?.('change', showStep);
  requestAnimationFrame(frame);
})();
