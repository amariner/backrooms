/** A bundled spoken vowel, performed as an intentionally silly little aria. */
export class EntityCallVoice {
  constructor() {
    this.buffer = null;
    this.loading = null;
    this.generation = 0;
    this.nodes = [];
    this.sources = [];
    this.cleanupTimer = null;
  }

  async load(context) {
    if (this.buffer) return this.buffer;
    if (!this.loading) {
      const base = import.meta.env?.BASE_URL || '/';
      this.loading = (async () => {
        const response = await fetch(`${base}audio/entitiiii.mp3`);
        if (!response.ok) throw new Error('Entity voice unavailable');
        this.buffer = await context.decodeAudioData(await response.arrayBuffer());
        return this.buffer;
      })().catch(() => null).finally(() => { this.loading = null; });
    }
    return this.loading;
  }

  async play(context, destination) {
    this.stop();
    const generation = this.generation;
    let buffer;
    try {
      // Resume directly in the button/key gesture, before awaiting the asset.
      const resumed = context.state === 'suspended' ? context.resume() : Promise.resolve();
      [buffer] = await Promise.all([this.load(context), resumed]);
    } catch {
      return false;
    }
    // A pause, mute or restart while decoding must not produce a late shout.
    if (!buffer || generation !== this.generation || context.state !== 'running') return false;
    try {
      const now = context.currentTime;
      const source = context.createBufferSource();
      const output = context.createGain();
      const vibrato = context.createOscillator();
      const depth = context.createGain();
      this.sources = [source, vibrato];
      this.nodes = [source, output, vibrato, depth];
      source.buffer = buffer;

      // Low, cheeky "en-ti", a scooped high "tiiiii", then a theatrical fall.
      source.detune.setValueAtTime(-140, now);
      source.detune.linearRampToValueAtTime(-80, now + .24);
      source.detune.linearRampToValueAtTime(310, now + .55);
      source.detune.linearRampToValueAtTime(370, now + 1.05);
      source.detune.linearRampToValueAtTime(230, now + 1.6);
      source.detune.linearRampToValueAtTime(-50, now + 2.35);
      vibrato.frequency.value = 5.35;
      depth.gain.setValueAtTime(0, now);
      depth.gain.setValueAtTime(0, now + .35);
      depth.gain.linearRampToValueAtTime(58, now + .8);
      depth.gain.linearRampToValueAtTime(72, now + 1.65);
      vibrato.connect(depth);
      depth.connect(source.detune);

      output.gain.setValueAtTime(0, now);
      output.gain.linearRampToValueAtTime(.9, now + .018);
      output.connect(destination);
      source.connect(output);
      // Short, quiet reflections retain consonant clarity in the corridors.
      for (const [seconds, amount] of [[.16, .14], [.33, .065]]) {
        const delay = context.createDelay(.5);
        const echo = context.createGain();
        delay.delayTime.value = seconds;
        echo.gain.value = amount;
        source.connect(delay);
        delay.connect(echo);
        echo.connect(output);
        this.nodes.push(delay, echo);
      }
      source.onended = () => {
        if (generation !== this.generation) return;
        // Allow the last reflection to finish, then release every node.
        this.cleanupTimer = setTimeout(() => {
          if (generation === this.generation) this.stop();
        }, 380);
      };
      source.start(now);
      vibrato.start(now);
      vibrato.stop(now + buffer.duration + 1);
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  stop() {
    this.generation += 1;
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* It may have naturally finished. */ }
    }
    for (const node of this.nodes) {
      try { node.disconnect(); } catch { /* Device was closed. */ }
    }
    this.sources.length = 0;
    this.nodes.length = 0;
  }
}
