// All sound is synthesised with the Web Audio API — oscillators for tones
// and filtered noise for impacts — so the game ships without any audio
// files. The audio context is built lazily on the first user gesture,
// because browsers refuse to start audio before one, and every public call
// is a no-op until the engine is up.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenClock = 0;
  let sirenHigh = false;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      ctx = new AudioContextClass();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function playTone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function playNoise(dur, vol, cutoff, type) {
    if (!ensure() || muted) return;
    const now = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
  }

  function startEngine() {
    if (!ensure() || muted || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  function startSiren() {
    if (!ensure() || muted || sirenOsc) return;
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 720;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.045;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenHigh = true;
    sirenClock = 0;
  }

  function stopSiren() {
    if (!sirenOsc) return;
    try { sirenOsc.stop(); } catch { /* already stopped */ }
    sirenOsc = null;
    sirenGain = null;
  }

  return {
    unlock() { ensure(); startEngine(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },

    /** Engine hum follows the car's speed; silent on foot. */
    engine(speed, driving) {
      if (!engineOsc || muted) return;
      const target = driving ? 0.05 + Math.min(0.12, (Math.abs(speed) / 520) * 0.12) : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 0.16, ctx.currentTime, 0.08);
    },

    /** Two-tone police siren while a police car is near; call every frame. */
    siren(active, dt) {
      if (!active) { stopSiren(); return; }
      startSiren();
      if (!sirenOsc) return;
      sirenClock += dt;
      if (sirenClock > 0.45) {
        sirenClock = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 720 : 540, ctx.currentTime, 0.05);
      }
    },

    skid() { playNoise(0.18, 0.1, 900, 'bandpass'); },
    punch() { playTone(120, 0.12, 'sine', 0.35, 60); playNoise(0.08, 0.2, 500); },
    gunshot() { playNoise(0.16, 0.5, 1800, 'highpass'); playTone(220, 0.08, 'square', 0.2, 90); },
    crash() { playNoise(0.3, 0.45, 700); playTone(90, 0.25, 'sine', 0.4, 45); },
    pickup() {
      playTone(660, 0.09, 'sine', 0.25);
      setTimeout(() => playTone(990, 0.14, 'sine', 0.25), 90);
    },
    honk() { playTone(370, 0.22, 'square', 0.16, 370); playTone(466, 0.22, 'square', 0.12, 466); },
    missionDone() {
      playTone(523, 0.14, 'sine', 0.3);
      setTimeout(() => playTone(659, 0.14, 'sine', 0.3), 130);
      setTimeout(() => playTone(784, 0.3, 'sine', 0.3), 260);
    },
    fail() { playTone(320, 0.35, 'sawtooth', 0.2, 110); },
    click() { playTone(880, 0.05, 'sine', 0.15); },
  };
}
