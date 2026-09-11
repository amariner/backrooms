import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityCallVoice } from '../src/entity-call-voice.js';
import { AtmosphereAudio } from '../src/audio.js';

function audioContext() {
  const nodes = [];
  const parameter = () => ({
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {},
  });
  const node = () => {
    const result = {
      gain: parameter(), detune: parameter(), frequency: parameter(), delayTime: parameter(),
      connected: [], stopped: false, disconnected: false,
      connect(destination) { this.connected.push(destination); },
      disconnect() { this.disconnected = true; },
      start() { this.started = true; },
      stop() { this.stopped = true; },
    };
    nodes.push(result);
    return result;
  };
  return {
    state: 'running', currentTime: 0, nodes,
    createBufferSource: node, createOscillator: node, createGain: node, createDelay: node,
    resume() { this.state = 'running'; return Promise.resolve(); },
    close() { this.state = 'closed'; return Promise.resolve(); },
  };
}

test('operatic call routes its voice and echoes to the game master, and does not overlap', async () => {
  const voice = new EntityCallVoice();
  voice.buffer = { duration: 2.48 };
  const context = audioContext(), destination = {};
  assert.equal(await voice.play(context, destination), true);
  const firstNodes = [...voice.nodes], firstSources = [...voice.sources];
  assert.equal(voice.nodes.filter(node => node.connected.includes(destination)).length, 1);
  assert.ok(firstSources.every(source => source.started));
  assert.equal(await voice.play(context, destination), true);
  assert.ok(firstSources.every(source => source.stopped));
  assert.ok(firstNodes.every(node => node.disconnected));
  voice.stop();
  assert.equal(voice.nodes.length, 0);
  assert.ok(context.nodes.every(node => node.disconnected));
});

test('a call canceled while its audio is loading never plays late', async () => {
  const voice = new EntityCallVoice(), context = audioContext();
  let finishLoading;
  voice.load = () => new Promise(resolve => { finishLoading = resolve; });
  const pending = voice.play(context, {});
  voice.stop();
  finishLoading({ duration: 2.48 });
  assert.equal(await pending, false);
  assert.equal(context.nodes.length, 0);
});

test('a suspended sound device is resumed by the call gesture', async () => {
  const audio = new AtmosphereAudio();
  audio.context = audioContext();
  audio.context.state = 'suspended';
  audio.master = audio.context.createGain();
  audio.entityCallVoice.buffer = { duration: 2.48 };
  audio.setActive(true);
  assert.equal(await audio.callEntity(), true);
  assert.equal(audio.context.state, 'running');
  audio.dispose();
});

test('pausing, muting, and disposing stop the call, without allowing muted calls', async () => {
  const audio = new AtmosphereAudio();
  audio.context = audioContext();
  audio.master = audio.context.createGain();
  audio.entityCallVoice.buffer = { duration: 2.48 };
  assert.equal(await audio.callEntity(), false);
  audio.setActive(true);
  assert.equal(await audio.callEntity(), true);
  audio.setActive(false);
  assert.equal(audio.entityCallVoice.nodes.length, 0);
  audio.setActive(true);
  assert.equal(await audio.callEntity(), true);
  audio.setMuted(true);
  assert.equal(audio.entityCallVoice.nodes.length, 0);
  assert.equal(await audio.callEntity(), false);
  audio.setMuted(false);
  assert.equal(await audio.callEntity(), true);
  audio.dispose();
  assert.equal(audio.entityCallVoice.nodes.length, 0);
  assert.equal(await audio.callEntity(), false);
});
