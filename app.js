(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const fmtTime = (seconds) => {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  };

  const initialVoiceSettings = (() => {
    try { return JSON.parse(localStorage.getItem('evdrive-v12-voice') || '{}'); }
    catch { return {}; }
  })();

  const state = {
    speed: 0,
    prevSpeed: 0,
    accelG: 0,
    maxG: 0,
    topSpeed: 0,
    distanceKm: 0,
    lastGps: null,
    driveStart: null,
    demo: false,
    demoPhase: 0,
    sensorEnabled: false,
    watchId: null,
    lastSpeedTs: performance.now(),
    selectedMode: 'cyber',
    lastNonSportMode: 'cyber',
    sportActive: false,
    audioOn: false,
    tripRecording: false,
    tripStart: null,
    tripSamples: [],
    lastReactionTs: 0,
    reactionStage: 0,
    lastSportResult: null,
    best0100: Number(localStorage.getItem('evdrive-best-0100') || 0) || null,
    run: {
      armed: false,
      active: false,
      startTs: 0,
      t050: null,
      t0100: null,
      t100Start: null,
      t100200: null,
      sportRun: false
    },
    voice: {
      language: initialVoiceSettings.language || 'en',
      character: initialVoiceSettings.character || 'devil',
      intensity: initialVoiceSettings.intensity || 'medium',
      enabled: initialVoiceSettings.enabled !== false,
      autoArm: initialVoiceSettings.autoArm !== false,
      announceTime: initialVoiceSettings.announceTime !== false
    }
  };

  // ---------- UI ----------
  const speedValue = $('speedValue');
  const accelValue = $('accelValue');
  const topSpeedValue = $('topSpeedValue');
  const distanceValue = $('distanceValue');
  const driveTimeValue = $('driveTimeValue');
  const needle = $('needle');
  const sensorStatus = $('sensorStatus');
  const gpsAccuracy = $('gpsAccuracy');
  const statusDot = $('statusDot');

  function saveVoiceSettings() {
    localStorage.setItem('evdrive-v12-voice', JSON.stringify(state.voice));
  }

  function updateBestLabel(isNewBest = false) {
    const el = $('sportResult');
    el.classList.toggle('new-best', isNewBest);
    if (state.lastSportResult !== null) {
      const bestPart = state.best0100 ? ` · BEST ${state.best0100.toFixed(2)} s` : '';
      el.textContent = `${isNewBest ? 'NEW BEST' : 'LAST'} ${state.lastSportResult.toFixed(2)} s${bestPart}`;
    } else {
      el.textContent = state.best0100 ? `BEST ${state.best0100.toFixed(2)} s` : 'BEST —';
    }
  }
  updateBestLabel();

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      $(`view-${btn.dataset.view}`).classList.add('active');
      if (btn.dataset.view === 'trips') drawTrip();
    });
  });

  $('themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem('evdrive-theme', document.body.classList.contains('light') ? 'light' : 'dark');
    drawTrip();
  });
  if (localStorage.getItem('evdrive-theme') === 'light') document.body.classList.add('light');

  $('demoToggle').addEventListener('click', () => {
    state.demo = !state.demo;
    state.demoPhase = 0;
    $('demoToggle').textContent = state.demo ? 'DEMO ON' : 'DEMO OFF';
    $('demoToggle').classList.toggle('on', state.demo);
    if (state.demo) {
      sensorStatus.textContent = 'Demo signal active';
      statusDot.classList.add('live');
      if (!state.driveStart) state.driveStart = performance.now();
    } else {
      sensorStatus.textContent = state.sensorEnabled ? 'Sensors active' : 'Sensors idle';
    }
  });

  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      document.querySelectorAll('.mode-card').forEach(x => x.classList.remove('selected'));
      card.classList.add('selected');
      if (mode === 'sport') {
        activateSport();
      } else {
        state.lastNonSportMode = mode;
        state.selectedMode = mode;
        deactivateSport();
      }
      audioEngine.update(true);
    });
  });

  [['volume','volumeOut'], ['response','responseOut'], ['character','characterOut']].forEach(([input, output]) => {
    $(input).addEventListener('input', () => {
      $(output).value = `${$(input).value}%`;
      audioEngine.update(true);
    });
  });

  // ---------- SPORT EXPERIENCE ----------
  function flashSport() {
    const flash = $('sportFlash');
    flash.classList.remove('fire');
    void flash.offsetWidth;
    flash.classList.add('fire');
  }

  function activateSport() {
    const firstActivation = !state.sportActive;
    state.sportActive = true;
    state.selectedMode = 'sport';
    state.lastReactionTs = 0;
    state.reactionStage = 0;
    document.body.classList.add('sport-active');
    $('sportRunKicker').textContent = state.speed < 2 ? 'READY' : 'SPORT ACTIVE';
    flashSport();

    if (state.voice.autoArm) armPerformance(true);
    if (firstActivation) {
      unlockAudio();
      speakKey('activated', { interrupt: true });
    }
  }

  function deactivateSport() {
    if (!state.sportActive) return;
    state.sportActive = false;
    document.body.classList.remove('sport-active');
    $('sportRunKicker').textContent = 'READY';
    $('sportTimer').textContent = '0.00';
    speechSynthesis?.cancel?.();
  }

  function unlockAudio() {
    try {
      if (!audioEngine.ctx) audioEngine.build();
      audioEngine.ctx?.resume?.();
    } catch {}
  }

  const phrases = {
    en: {
      activated: 'Sport mode activated.',
      ready: 'Ready.',
      go: 'Go!',
      reaction1: ['Come on!', 'Push!', 'Yes!'],
      reaction2: ['Full power!', 'That is it!', 'Keep pushing!'],
      reaction3: ['Maximum attack!', 'Yes! Full power!', 'Unleash it!'],
      completed: (spokenTime) => `One hundred. ${spokenTime} seconds.`,
      newBest: 'New personal best.'
    },
    de: {
      activated: 'Sportmodus aktiviert.',
      ready: 'Bereit.',
      go: 'Los!',
      reaction1: ['Komm!', 'Weiter!', 'Ja!'],
      reaction2: ['Volle Leistung!', 'Genau so!', 'Weiter drücken!'],
      reaction3: ['Maximale Attacke!', 'Ja! Volle Leistung!', 'Alles raus!'],
      completed: (spokenTime) => `Hundert. ${spokenTime} Sekunden.`,
      newBest: 'Neue Bestzeit.'
    }
  };

  function chooseVoice(lang, character) {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    if (!voices.length) return null;
    const langPrefix = lang === 'de' ? 'de' : 'en';
    const matching = voices.filter(v => (v.lang || '').toLowerCase().startsWith(langPrefix));
    const pool = matching.length ? matching : voices;

    const femaleHints = /female|samantha|victoria|karen|moira|ava|allison|siri|anna|petra|katja|marlene|helena/i;
    const maleHints = /male|daniel|alex|fred|thomas|markus|yannick|martin/i;

    if (character === 'female') return pool.find(v => femaleHints.test(v.name)) || pool[0];
    if (character === 'devil') return pool.find(v => maleHints.test(v.name)) || pool[pool.length - 1] || pool[0];
    return pool.find(v => femaleHints.test(v.name)) || pool[0];
  }

  function voiceParams(character) {
    if (character === 'devil') return { pitch: 0.55, rate: 0.84, volume: 1.0 };
    if (character === 'female') return { pitch: 1.18, rate: 1.03, volume: 1.0 };
    return { pitch: 1.03, rate: 0.96, volume: 0.96 };
  }

  function speak(text, options = {}) {
    if (!state.voice.enabled || !('speechSynthesis' in window) || !text) return;
    if (options.interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const p = voiceParams(state.voice.character);
    u.lang = state.voice.language === 'de' ? 'de-DE' : 'en-US';
    u.pitch = p.pitch;
    u.rate = p.rate;
    u.volume = p.volume;
    const v = chooseVoice(state.voice.language, state.voice.character);
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  function speakKey(key, options = {}) {
    const dict = phrases[state.voice.language];
    const val = dict[key];
    if (typeof val === 'string') speak(val, options);
  }

  function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function maybeReactToAcceleration(now) {
    if (!state.sportActive || !state.voice.enabled || state.speed < 7) return;
    if (state.run.active && state.speed > 92) return; // leave room for result announcement

    const intensity = state.voice.intensity;
    const thresholds = intensity === 'high'
      ? { mild:.20, strong:.33, extreme:.50, cooldown:1600 }
      : intensity === 'low'
        ? { mild:.34, strong:.48, extreme:.66, cooldown:3600 }
        : { mild:.27, strong:.40, extreme:.58, cooldown:2500 };

    if ((now - state.lastReactionTs) < thresholds.cooldown) return;

    let bucket = null;
    if (state.accelG >= thresholds.extreme) bucket = 'reaction3';
    else if (state.accelG >= thresholds.strong) bucket = 'reaction2';
    else if (state.accelG >= thresholds.mild) bucket = 'reaction1';
    if (!bucket) return;

    const dict = phrases[state.voice.language];
    speak(randomFrom(dict[bucket]));
    state.lastReactionTs = now;
  }

  function decimalForSpeech(time) {
    const fixed = time.toFixed(2);
    const [whole, decimals] = fixed.split('.');
    if (state.voice.language === 'de') return `${whole} Komma ${decimals.split('').join(' ')}`;
    return `${whole} point ${decimals.split('').join(' ')}`;
  }

  function announce0100(time, isNewBest) {
    if (!state.voice.enabled || !state.voice.announceTime) return;
    const dict = phrases[state.voice.language];
    const spoken = decimalForSpeech(time);
    speak(dict.completed(spoken), { interrupt: true });
    if (isNewBest) setTimeout(() => speak(dict.newBest), 1200);
  }

  function updateSportSettingsUI() {
    $('voiceLanguage').value = state.voice.language;
    $('voiceCharacter').value = state.voice.character;
    $('reactionIntensity').value = state.voice.intensity;
    $('voiceEnabled').checked = state.voice.enabled;
    $('autoArm').checked = state.voice.autoArm;
    $('announceTime').checked = state.voice.announceTime;
  }
  updateSportSettingsUI();

  $('voiceLanguage').addEventListener('change', e => { state.voice.language = e.target.value; saveVoiceSettings(); });
  $('voiceCharacter').addEventListener('change', e => { state.voice.character = e.target.value; saveVoiceSettings(); });
  $('reactionIntensity').addEventListener('change', e => { state.voice.intensity = e.target.value; saveVoiceSettings(); });
  $('voiceEnabled').addEventListener('change', e => { state.voice.enabled = e.target.checked; saveVoiceSettings(); });
  $('autoArm').addEventListener('change', e => { state.voice.autoArm = e.target.checked; saveVoiceSettings(); });
  $('announceTime').addEventListener('change', e => { state.voice.announceTime = e.target.checked; saveVoiceSettings(); });
  $('previewVoice').addEventListener('click', () => {
    unlockAudio();
    speakKey('activated', { interrupt: true });
  });

  // Populate / refresh available platform voices.
  if ('speechSynthesis' in window) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }

  // ---------- Sensors ----------
  async function enableSensors() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const result = await DeviceMotionEvent.requestPermission();
        if (result === 'granted') window.addEventListener('devicemotion', onMotion, { passive: true });
      } else if ('DeviceMotionEvent' in window) {
        window.addEventListener('devicemotion', onMotion, { passive: true });
      }

      if ('geolocation' in navigator) {
        if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
        state.watchId = navigator.geolocation.watchPosition(onPosition, onGeoError, {
          enableHighAccuracy: true,
          maximumAge: 120,
          timeout: 10000
        });
      } else {
        throw new Error('Geolocation not available');
      }

      state.sensorEnabled = true;
      sensorStatus.textContent = 'Sensors active';
      statusDot.classList.add('live');
      $('enableSensors').textContent = 'SENSORS ENABLED';
    } catch (err) {
      sensorStatus.textContent = 'Sensor permission unavailable';
      console.warn(err);
    }
  }

  function onGeoError(err) {
    gpsAccuracy.textContent = 'GPS unavailable';
    sensorStatus.textContent = err?.message || 'GPS error';
  }

  function onMotion(e) {
    const a = e.acceleration || e.accelerationIncludingGravity;
    if (!a) return;
    const raw = Math.max(Math.abs(a.x || 0), Math.abs(a.y || 0)) / 9.80665;
    const candidate = clamp(raw, 0, 1.5);
    state.accelG = state.accelG * 0.72 + candidate * 0.28;
    state.maxG = Math.max(state.maxG, state.accelG);
  }

  function onPosition(pos) {
    const now = performance.now();
    const coords = pos.coords;
    const speedMs = typeof coords.speed === 'number' && coords.speed >= 0 ? coords.speed : null;
    const nextSpeed = speedMs !== null ? speedMs * 3.6 : estimateSpeedFromPosition(coords, pos.timestamp);

    if (nextSpeed !== null && Number.isFinite(nextSpeed)) setSpeed(clamp(nextSpeed, 0, 320), now);

    if (state.lastGps) {
      const meters = haversine(state.lastGps.lat, state.lastGps.lon, coords.latitude, coords.longitude);
      if (meters < 150) state.distanceKm += meters / 1000;
    }
    state.lastGps = { lat: coords.latitude, lon: coords.longitude, ts: pos.timestamp };
    gpsAccuracy.textContent = `GPS ±${Math.round(coords.accuracy || 0)} m`;
    if (!state.driveStart && state.speed > 2) state.driveStart = now;
  }

  function estimateSpeedFromPosition(coords, ts) {
    if (!state.lastGps || !ts || ts <= state.lastGps.ts) return null;
    const meters = haversine(state.lastGps.lat, state.lastGps.lon, coords.latitude, coords.longitude);
    const seconds = (ts - state.lastGps.ts) / 1000;
    if (seconds <= 0 || meters > 250) return null;
    return (meters / seconds) * 3.6;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2-lat1);
    const dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function setSpeed(next, now = performance.now()) {
    const dt = Math.max(.06, (now - state.lastSpeedTs) / 1000);
    const gpsAccelG = ((next - state.speed) / 3.6) / dt / 9.80665;
    if (!state.sensorEnabled || state.accelG < .03) {
      state.accelG = state.accelG * .55 + Math.abs(gpsAccelG) * .45;
    }
    state.accelG = clamp(state.accelG, 0, 1.6);
    state.maxG = Math.max(state.maxG, state.accelG);
    state.prevSpeed = state.speed;
    state.speed = next;
    state.topSpeed = Math.max(state.topSpeed, next);
    state.lastSpeedTs = now;

    performanceLogic(now);
    maybeReactToAcceleration(now);
    recordTripSample(now);
    audioEngine.update();
  }

  $('enableSensors').addEventListener('click', enableSensors);

  // ---------- Audio ----------
  const audioEngine = {
    ctx: null,
    master: null,
    osc1: null,
    osc2: null,
    gain1: null,
    gain2: null,
    filter: null,
    lfo: null,
    lfoGain: null,

    async start() {
      if (!this.ctx) this.build();
      if (!this.ctx) return;
      await this.ctx.resume();
      state.audioOn = !state.audioOn;
      $('audioStart').textContent = state.audioOn ? 'STOP SOUND' : 'START SOUND';
      this.update(true);
    },

    build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.osc1 = this.ctx.createOscillator();
      this.osc2 = this.ctx.createOscillator();
      this.gain1 = this.ctx.createGain();
      this.gain2 = this.ctx.createGain();
      this.lfo = this.ctx.createOscillator();
      this.lfoGain = this.ctx.createGain();
      this.lfoGain.gain.value = 4;
      this.lfo.frequency.value = 7;

      this.osc1.connect(this.gain1).connect(this.filter);
      this.osc2.connect(this.gain2).connect(this.filter);
      this.lfo.connect(this.lfoGain).connect(this.osc1.frequency);
      this.filter.connect(this.master).connect(this.ctx.destination);
      this.master.gain.value = 0;
      this.osc1.start(); this.osc2.start(); this.lfo.start();
    },

    update(immediate = false) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const response = Number($('response').value) / 100;
      const character = Number($('character').value) / 100;
      const volume = Number($('volume').value) / 100;
      const s = state.speed;
      const a = state.accelG;
      const profiles = {
        cyber: { base:54, slope:4.0, ratio:1.51, wave1:'sine', wave2:'triangle', filter:1500 },
        pod:   { base:46, slope:5.8, ratio:1.98, wave1:'sawtooth', wave2:'square', filter:1050 },
        v10:   { base:68, slope:8.3, ratio:1.50, wave1:'sawtooth', wave2:'triangle', filter:1850 },
        warp:  { base:82, slope:3.2, ratio:2.01, wave1:'sine', wave2:'sine', filter:2300 },
        sport: { base:52, slope:6.6, ratio:1.72, wave1:'sawtooth', wave2:'triangle', filter:1750 }
      };
      const p = profiles[state.selectedMode] || profiles.cyber;
      this.osc1.type = p.wave1; this.osc2.type = p.wave2;
      const sportBoost = state.sportActive ? 1.16 : 1;
      const baseHz = (p.base + (s * p.slope) + (a * 190 * response)) * sportBoost;
      const t = immediate ? .02 : clamp(.18 - response * .14, .025, .15);
      this.osc1.frequency.setTargetAtTime(baseHz, now, t);
      this.osc2.frequency.setTargetAtTime(baseHz * (p.ratio + character * .08), now, t);
      this.filter.frequency.setTargetAtTime(p.filter + s * 11 + character * 1150 + (state.sportActive ? 350 : 0), now, .08);
      this.gain1.gain.setTargetAtTime(.52, now, .03);
      this.gain2.gain.setTargetAtTime(.16 + character * .16, now, .03);
      const dynamic = clamp(.14 + s/230 + a*.30, .12, 1);
      const target = state.audioOn ? volume * dynamic * (state.sportActive ? .39 : .34) : 0;
      this.master.gain.setTargetAtTime(target, now, .04);
    }
  };
  $('audioStart').addEventListener('click', () => audioEngine.start());

  // ---------- Performance ----------
  $('armRun').addEventListener('click', () => armPerformance(false));
  $('resetRun').addEventListener('click', resetPerformance);

  function armPerformance(fromSport) {
    state.run = { armed:true, active:false, startTs:0, t050:null, t0100:null, t100Start:null, t100200:null, sportRun:!!fromSport };
    $('runState').textContent = 'ARMED';
    $('startSpeed').textContent = `${Math.round(state.speed)} km/h`;
    $('armRun').textContent = 'ARMED';
    if (state.sportActive) {
      $('sportRunKicker').textContent = state.speed < 2 ? 'READY' : 'WAIT FOR STOP';
      $('sportTimer').textContent = '0.00';
      if (state.speed < 2 && fromSport) speakKey('ready');
    }
  }

  function resetPerformance() {
    state.run = { armed:false, active:false, startTs:0, t050:null, t0100:null, t100Start:null, t100200:null, sportRun:false };
    ['run050','run0100','run100200'].forEach(id => $(id).textContent = '—');
    $('maxG').textContent = '0.00';
    $('runState').textContent = 'IDLE';
    $('liveTimer').textContent = '0.00 s';
    $('armRun').textContent = 'ARM RUN';
    $('sportTimer').textContent = '0.00';
    if (state.sportActive) $('sportRunKicker').textContent = state.speed < 2 ? 'READY' : 'SPORT ACTIVE';
    state.maxG = 0;
  }

  function complete0100(elapsed) {
    const r = state.run;
    r.t0100 = elapsed;
    r.t100Start = performance.now();
    $('run0100').textContent = elapsed.toFixed(2);
    state.lastSportResult = elapsed;

    let isNewBest = false;
    if (!state.best0100 || elapsed < state.best0100) {
      state.best0100 = elapsed;
      localStorage.setItem('evdrive-best-0100', String(elapsed));
      isNewBest = true;
    }
    updateBestLabel(isNewBest);

    if (state.sportActive) {
      $('sportTimer').textContent = elapsed.toFixed(2);
      $('sportRunKicker').textContent = isNewBest ? 'NEW BEST' : '0–100 COMPLETE';
      flashSport();
      announce0100(elapsed, isNewBest);
    }
  }

  function performanceLogic(now) {
    const r = state.run;

    // Sport auto-arm again when the car returns to a standstill.
    if (state.sportActive && state.voice.autoArm && !r.active && !r.armed && state.speed < 1.2) {
      armPerformance(true);
    }

    if (r.armed && !r.active && state.prevSpeed < 2 && state.speed >= 2) {
      r.active = true;
      r.startTs = now;
      r.armed = false;
      $('runState').textContent = 'RUNNING';
      $('armRun').textContent = 'RUNNING';
      if (state.sportActive) {
        $('sportRunKicker').textContent = 'GO';
        $('sportTimer').textContent = '0.00';
        speakKey('go', { interrupt:true });
      }
    }
    if (!r.active) return;

    const elapsed = (now - r.startTs)/1000;
    if (state.sportActive) $('sportTimer').textContent = elapsed.toFixed(2);

    if (r.t050 === null && state.speed >= 50) {
      r.t050 = elapsed;
      $('run050').textContent = elapsed.toFixed(2);
    }
    if (r.t0100 === null && state.speed >= 100) complete0100(elapsed);

    if (r.t100Start && r.t100200 === null && state.speed >= 200) {
      r.t100200 = (now - r.t100Start)/1000;
      $('run100200').textContent = r.t100200.toFixed(2);
      r.active = false;
      $('runState').textContent = 'COMPLETE';
      $('armRun').textContent = 'ARM RUN';
    }

    // If the run reaches 100, the 0–100 experience is complete even if 100–200 continues in HUD.
    if (r.t0100 !== null && state.sportActive && state.speed < 100 && elapsed > r.t0100 + 1.5) {
      r.active = false;
      $('runState').textContent = 'COMPLETE';
      $('armRun').textContent = 'ARM RUN';
    }

    // Abort a launch if the car stops before reaching 100.
    if (state.speed < 1 && elapsed > 1.6 && r.t0100 === null) {
      r.active = false;
      $('runState').textContent = 'ABORTED';
      $('armRun').textContent = 'ARM RUN';
      if (state.sportActive) $('sportRunKicker').textContent = 'READY';
    }
  }

  // ---------- Trips ----------
  $('recordTrip').addEventListener('click', () => {
    if (!state.tripRecording) {
      state.tripRecording = true;
      state.tripStart = performance.now();
      state.tripSamples = [];
      $('recordTrip').textContent = 'STOP TRIP';
      $('emptyChart').style.display = 'none';
    } else {
      state.tripRecording = false;
      $('recordTrip').textContent = 'START TRIP';
      drawTrip();
    }
  });

  function recordTripSample(now) {
    if (!state.tripRecording) return;
    const last = state.tripSamples[state.tripSamples.length-1];
    if (last && now - last.ms < 300) return;
    state.tripSamples.push({ ms: now, t:(now-state.tripStart)/1000, speed:state.speed, g:state.accelG });
    if (state.tripSamples.length > 3600) state.tripSamples.shift();
  }

  $('saveTrip').addEventListener('click', () => {
    const snapshot = { savedAt:Date.now(), samples:state.tripSamples };
    localStorage.setItem('evdrive-last-trip', JSON.stringify(snapshot));
    $('saveTrip').textContent = 'SAVED';
    setTimeout(() => $('saveTrip').textContent = 'SAVE SNAPSHOT', 1000);
  });
  $('loadTrip').addEventListener('click', () => {
    try {
      const data = JSON.parse(localStorage.getItem('evdrive-last-trip') || 'null');
      if (data?.samples?.length) {
        state.tripSamples = data.samples;
        state.tripRecording = false;
        $('recordTrip').textContent = 'START TRIP';
        drawTrip();
      }
    } catch {}
  });
  $('clearTrip').addEventListener('click', () => {
    state.tripSamples = [];
    state.tripRecording = false;
    $('recordTrip').textContent = 'START TRIP';
    localStorage.removeItem('evdrive-last-trip');
    drawTrip();
  });

  function tripStats() {
    const a = state.tripSamples;
    if (a.length < 2) return { duration:0, max:0, avg:0, distance:0 };
    const duration = a[a.length-1].t - a[0].t;
    let distance = 0, speedSum = 0, max = 0;
    for (let i=1;i<a.length;i++) {
      const dt = Math.max(0, a[i].t-a[i-1].t);
      distance += ((a[i].speed+a[i-1].speed)/2) * dt / 3600;
      speedSum += a[i].speed;
      max = Math.max(max, a[i].speed);
    }
    return { duration, max, avg:speedSum/Math.max(1,a.length-1), distance };
  }

  function drawTrip() {
    const c = $('tripCanvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(600, Math.round(rect.width * dpr));
    c.height = Math.max(250, Math.round(rect.height * dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0,0,w,h);

    const samples = state.tripSamples;
    const stats = tripStats();
    $('tripDistance').textContent = `${stats.distance.toFixed(2)} km`;
    $('tripDuration').textContent = fmtTime(stats.duration);
    $('tripAverage').textContent = `${Math.round(stats.avg)} km/h`;
    $('tripMax').textContent = `${Math.round(stats.max)} km/h`;
    $('emptyChart').style.display = samples.length > 1 ? 'none' : 'grid';
    if (samples.length < 2) return;

    const css = getComputedStyle(document.body);
    const line = css.getPropertyValue('--line').trim();
    const text = css.getPropertyValue('--muted').trim();
    const fg = state.sportActive ? css.getPropertyValue('--sport').trim() : css.getPropertyValue('--text').trim();
    const pad = {l:42,r:14,t:16,b:28};
    const maxSpeed = Math.max(50, Math.ceil(stats.max/50)*50);
    const total = Math.max(1, samples[samples.length-1].t - samples[0].t);

    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.fillStyle = text; ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    for (let i=0;i<=4;i++) {
      const y = pad.t + (h-pad.t-pad.b)*(i/4);
      ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(w-pad.r,y); ctx.stroke();
      const val = Math.round(maxSpeed*(1-i/4));
      ctx.fillText(String(val), 6, y+4);
    }

    ctx.strokeStyle = fg; ctx.lineWidth = 2; ctx.beginPath();
    samples.forEach((s,i) => {
      const x = pad.l + ((s.t-samples[0].t)/total)*(w-pad.l-pad.r);
      const y = pad.t + (1-s.speed/maxSpeed)*(h-pad.t-pad.b);
      i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    });
    ctx.stroke();
  }
  window.addEventListener('resize', () => {
    if ($('view-trips').classList.contains('active')) drawTrip();
  });

  // ---------- Main animation ----------
  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now-lastFrame)/1000);
    lastFrame = now;

    if (state.demo) {
      state.demoPhase += dt;
      // Loop designed to demonstrate the full SPORT launch cycle.
      const t = state.demoPhase % 15;
      let target;
      if (t < 2.2) target = 0;
      else if (t < 5.7) target = ((t-2.2)/3.5)*112;
      else if (t < 8.3) target = 112 + Math.sin((t-5.7)*1.2)*4;
      else if (t < 12.3) target = 112*(1-(t-8.3)/4);
      else target = 0;
      const response = state.sportActive ? .23 : .17;
      const next = state.speed + (target-state.speed)*response;
      setSpeed(next, now);
      if (!state.driveStart && next > 2) state.driveStart = now;
      state.distanceKm += state.speed * dt / 3600;
    }

    speedValue.textContent = Math.round(state.speed);
    accelValue.textContent = `${state.accelG.toFixed(2)} g`;
    topSpeedValue.textContent = `${Math.round(state.topSpeed)} km/h`;
    distanceValue.textContent = `${state.distanceKm.toFixed(2)} km`;
    const driveSeconds = state.driveStart ? (now-state.driveStart)/1000 : 0;
    driveTimeValue.textContent = fmtTime(driveSeconds);
    $('maxG').textContent = state.maxG.toFixed(2);

    const angle = 180 + clamp(state.speed/240,0,1)*180;
    needle.style.transform = `rotate(${angle}deg)`;
    $('gaugeProgress').style.transform = `rotate(${clamp(state.speed/240,0,1)*180}deg)`;

    if (state.run.active) {
      const live = (now-state.run.startTs)/1000;
      $('liveTimer').textContent = `${live.toFixed(2)} s`;
      if (state.sportActive && state.run.t0100 === null) $('sportTimer').textContent = live.toFixed(2);
    }

    if (state.sportActive && state.run.armed && state.speed < 2) $('sportRunKicker').textContent = 'READY';
    if (state.tripRecording && Math.floor(now/500) !== Math.floor((now-dt*1000)/500)) drawTrip();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Service worker is useful on iPhone/Android; harmless if unsupported in Tesla browser.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
