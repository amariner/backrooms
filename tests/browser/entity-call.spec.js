import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => window.__BACKROOMS__.state());
async function enter(page, roll = 0) {
  // Exercise a real clickable HUD in the same fallback used without mouse capture.
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new Error('Test drag controls'));
  });
  await page.goto('/?level=1');
  await page.locator('#start-button').click();
  await page.evaluate(async (value) => {
    const { EntityCallState } = await import('/src/entity-call-state.js');
    const original = EntityCallState.prototype.call;
    EntityCallState.prototype.call = function (position) { return original.call(this, position, () => value); };
  }, roll);
}

test('button calls from a fixed location, breaks hiding, attracts through corridors and respects cooldown', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await page.keyboard.press('f');
  await expect.poll(async () => (await state(page)).hidden).toBe(true);
  const before = await state(page);
  const button = page.getByRole('button', { name: 'Llamar a la entidad: Entitiiii!!' });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(page.locator('#entity-call-caption')).toBeVisible();
  const called = await state(page);
  expect(called.call.count).toBe(1);
  expect(called.hidden).toBe(false);
  expect(called.noise).toBe(1);
  expect(called.entity).toEqual(before.entity); // Never teleports on a call.
  await page.keyboard.press('g');
  expect((await state(page)).call.count).toBe(1);
  await page.evaluate(() => window.__BACKROOMS__.advance(4));
  const response = await state(page);
  expect(response.call.target).toEqual({ x: before.x, z: before.z });
  expect(response.entity).not.toEqual(before.entity);
  expect(Math.hypot(response.entity.x - before.entity.x, response.entity.z - before.entity.z)).toBeLessThan(15);
  await page.screenshot({ path: 'test-results/entity-call-hud.png' });
  await page.evaluate(() => window.__BACKROOMS__.advance(4.1));
  await expect(button).toBeEnabled();
  await page.keyboard.press('g');
  expect((await state(page)).call.count).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await button.boundingBox();
  const subtitle = await page.locator('#entity-call-caption').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(subtitle.y + subtitle.height).toBeLessThan(bounds.y);
  await page.screenshot({ path: 'test-results/entity-call-mobile.png' });
  expect(errors).toEqual([]);
});

test('a missed call makes noise without a lure; pause freezes cooldown and restart clears it', async ({ page }) => {
  await enter(page, .9);
  await page.locator('#entity-call-button').focus();
  await page.keyboard.press('Space');
  const called = await state(page);
  expect(called.call.count).toBe(1);
  expect(called.call.pending).toBe(false);
  expect(called.call.target).toBeNull();
  expect(called.call.shouting).toBe(true);
  await page.keyboard.press('Escape');
  const paused = await state(page);
  await page.keyboard.press('g');
  await page.evaluate(() => window.__BACKROOMS__.advance(30));
  expect((await state(page)).call).toEqual(paused.call);
  await expect(page.locator('#entity-call-button')).toBeHidden();
  await page.locator('#resume-button').click();
  await page.evaluate(() => window.__BACKROOMS__.advance(8.1));
  await expect(page.locator('#entity-call-button')).toBeEnabled();
  await page.locator('#sound-toggle').click();
  await page.keyboard.press('g');
  expect((await state(page)).call.count).toBe(2); // Muting doesn't change the game rules.
  await page.keyboard.press('Escape');
  await page.locator('#restart-button').click();
  const restarted = await state(page);
  expect(restarted.call).toEqual({ count: 0, cooldown: 0, shouting: false, pending: false, target: null });
  await expect(page.locator('#entity-call-caption')).toBeHidden();
  await expect(page.locator('#entity-call-button')).toBeEnabled();
});

test('the call is absent from the level without an entity', async ({ page }) => {
  await page.goto('/?level=0');
  await page.keyboard.press('g');
  await page.locator('#start-button').click();
  await page.keyboard.press('g');
  await expect(page.locator('#entity-call-control')).toBeHidden();
  await expect(page.locator('#entity-call-caption')).toBeHidden();
  expect((await state(page)).mode).toBe('playing');
});

test('bundled voice decodes, plays and releases audio nodes when stopped', async ({ page }) => {
  await enter(page);
  const result = await page.evaluate(async () => {
    const { EntityCallVoice } = await import('/src/entity-call-voice.js');
    const voice = new EntityCallVoice();
    const context = new AudioContext();
    await context.resume();
    try {
      const played = await voice.play(context, context.destination);
      const buffer = voice.buffer;
      let peak = 0;
      if (buffer) for (const sample of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(sample));
      const activeSources = voice.sources.length;
      voice.stop();
      return { played, duration: buffer?.duration, peak, activeSources, remainingNodes: voice.nodes.length, remainingSources: voice.sources.length };
    } finally { voice.stop(); await context.close(); }
  });
  expect(result.played).toBe(true);
  expect(result.duration).toBeGreaterThan(1.5);
  expect(result.duration).toBeLessThan(5);
  expect(result.peak).toBeGreaterThan(.05);
  expect(result.activeSources).toBeGreaterThan(0);
  expect(result.remainingNodes).toBe(0);
  expect(result.remainingSources).toBe(0);
});
