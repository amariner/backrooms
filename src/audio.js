import { EntityCallVoice } from './entity-call-voice.js';

/** Quiet procedural soundscape and one bundled comic voice. Created by start(). */
export class AtmosphereAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.ambience = null;
    this.airFilter = null;
    this.airGain = null;
    this.muted = false;
    this.active = false;
    this.disposed = false;
    this.noise = null;
    this.loops = [];
    this.stepCountdown = 0.12;
    this.modulationCountdown = 0;
    this.entityCallVoice = new EntityCallVoice();
  }

  async start() {
    if (this.disposed) return;
    try {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this.context) {
        const context = new AudioContextClass();
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.48;

        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 16;
        compressor.ratio.value = 5;
        this.master.connect(compressor);
        compressor.connect(context.destination);

        this.ambience = context.createGain();
        this.ambience.gain.value = this.active ? 0.24 : 0.07;
        this.ambience.connect(this.master);

        // A reusable noise buffer supplies both ventilation and carpet steps.
        const length = context.sampleRate * 2;
        this.noise = context.createBuffer(1, length, context.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;

        this.airFilter = context.createBiquadFilter();
        this.airFilter.type = 'lowpass';
        this.airFilter.frequency.value = 320;
        this.airFilter.Q.value = 0.5;
        this.airGain = context.createGain();
        this.airGain.gain.value = 0.13;
        const ventilation = context.createBufferSource();
        ventilation.buffer = this.noise;
        ventilation.loop = true;
        ventilation.connect(this.airFilter);
        this.airFilter.connect(this.airGain);
        this.airGain.connect(this.ambience);
        ventilation.start();
        this.loops.push(ventilation);

        for (const [frequency, level] of [[50, 0.15], [100.15, 0.075], [150.3, 0.026]]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency;
          gain.gain.value = level;
          oscillator.connect(gain);
          gain.connect(this.ambience);
          oscillator.start();
          this.loops.push(oscillator);
        }
      }
      if (this.context.state === 'suspended') await this.context.resume();
      void this.entityCallVoice.load(this.context);
    } catch {
      // A blocked or unavailable sound device must never prevent playing.
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) this.stopCall();
    this.setParam(this.master?.gain, this.muted ? 0 : 0.48, 0.035);
  }

  setActive(active) {
    this.active = Boolean(active);
    if (!this.active) this.stopCall();
    this.stepCountdown = 0.12;
    this.setParam(this.ambience?.gain, this.active ? 0.24 : 0.07, 0.4);
  }

  setParam(param, value, smoothing = 0.12) {
    if (!param || !this.context || this.context.state === 'closed') return;
    try {
      param.setTargetAtTime(value, this.context.currentTime, smoothing);
    } catch {
      // Browsers can close audio between frames during navigation or sleep.
    }
  }

  async callEntity() {
    if (!this.active || this.muted || this.disposed || !this.context || this.context.state === 'closed') return false;
    return this.entityCallVoice.play(this.context, this.master);
  }

  stopCall() {
    this.entityCallVoice.stop();
  }

  update({ moving = false, sprinting = false, dt = 0, tension = 0 } = {}) {
    if (!this.context || this.context.state !== 'running' || this.disposed) return;
    const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.2)) : 0;
    const intensity = Number.isFinite(tension) ? Math.max(0, Math.min(tension, 1)) : 0;

    this.modulationCountdown -= elapsed;
    if (this.modulationCountdown <= 0) {
      this.modulationCountdown = 0.18;
      const breath = Math.sin(this.context.currentTime * 0.31) * 0.012;
      this.setParam(this.airFilter?.frequency, 320 + intensity * 280, 0.7);
      this.setParam(this.airGain?.gain, 0.13 + intensity * 0.06 + breath, 0.7);
    }

    if (!moving || !this.active || this.muted) {
      this.stepCountdown = 0.1;
      return;
    }
    this.stepCountdown -= elapsed;
    if (this.stepCountdown <= 0) {
      this.stepCountdown = sprinting ? 0.3 : 0.47;
      this.footstep(sprinting);
    }
  }

  footstep(sprinting) {
    try {
      const context = this.context;
      const now = context.currentTime;
      const source = context.createBufferSource();
      const lowpass = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = this.noise;
      source.playbackRate.value = 0.8 + Math.random() * 0.3;
      lowpass.type = 'lowpass';
      lowpass.frequency.value = sprinting ? 560 : 420;
      lowpass.Q.value = 0.5;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(sprinting ? 0.3 : 0.23, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      source.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(this.master);
      source.onended = () => {
        source.disconnect();
        lowpass.disconnect();
        gain.disconnect();
      };
      source.start(now, Math.random() * 1.6);
      source.stop(now + 0.19);
      this.tone(67 + Math.random() * 9, 0.12, 0.055, 0, 'sine');
    } catch {
      // Sound is optional; losing the device must not interrupt movement.
    }
  }

  tone(frequency, duration, volume, delay = 0, type = 'sine', endFrequency) {
    if (!this.context || this.context.state !== 'running' || this.disposed || this.muted) return;
    try {
      const context = this.context;
      const now = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.025, duration * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(now);
      oscillator.stop(now + duration + 0.03);
    } catch {
      // Envelopes are best effort when the browser changes audio state.
    }
  }

  presence(distance, pan = 0, breath = false, occluded = false) {
    if (!this.active || this.muted || !this.noise || this.context?.state !== 'running' || distance > 24) return;
    try {
      const context = this.context, now = context.currentTime;
      const source = context.createBufferSource(), filter = context.createBiquadFilter();
      const gain = context.createGain(), spatial = context.createStereoPanner();
      const duration = breath ? 1.25 : .28;
      const volume = (breath ? .075 : .19) * (1 - Math.min(distance / 24, 1)) ** 1.4 * (occluded ? .28 : 1);
      source.buffer = this.noise; source.playbackRate.value = breath ? .58 : .72;
      filter.type = breath ? 'bandpass' : 'lowpass';
      filter.frequency.value = breath ? (occluded ? 340 : 690) : 230;
      filter.Q.value = breath ? 1.5 : .7;
      spatial.pan.value = Math.max(-.9, Math.min(.9, pan));
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + (breath ? .4 : .035));
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      source.connect(filter); filter.connect(gain); gain.connect(spatial); spatial.connect(this.master);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); spatial.disconnect(); };
      source.start(now, breath ? 0 : .4); source.stop(now + duration + .02);
    } catch { /* Optional spatial audio must never interrupt the game. */ }
  }

  escape() {
    this.setActive(false);
    for (const [index, frequency] of [261.63, 329.63, 392, 523.25].entries()) {
      this.tone(frequency, 2.3, 0.045, index * 0.17, 'sine');
    }
  }

  dispose() {
    this.disposed = true;
    this.stopCall();
    this.entityCallVoice.buffer = null;
    for (const source of this.loops) {
      try { source.stop(); source.disconnect(); } catch { /* Already stopped. */ }
    }
    this.loops.length = 0;
    try {
      const closing = this.context?.close();
      if (closing?.catch) closing.catch(() => {});
    } catch { /* An already closed context needs no cleanup. */ }
    this.context = null;
    this.master = null;
    this.ambience = null;
    this.airFilter = null;
    this.airGain = null;
    this.noise = null;
  }
}
