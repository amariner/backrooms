import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => window.__BACKROOMS__.state());
async function enter(page) {
  await page.goto('/?level=1');
  await page.locator('#start-button').click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
}

test('service wing has no item UI or prerequisite before escape', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await expect(page.locator('#objective-title')).toHaveText('ENCUENTRA LA SALIDA');
  await expect(page.locator('#level-one-status, #journal-screen, #fuse-count')).toHaveCount(0);
  const initial = await state(page);
  expect(initial).not.toHaveProperty('battery');
  expect(initial).not.toHaveProperty('collected');
  expect(initial).not.toHaveProperty('progress');
  await page.evaluate(() => {
    const api = window.__BACKROOMS__, exit = api.world.exit;
    api.walkTo(exit.x, exit.z + 1.7); api.lookAt(exit.x, exit.z);
  });
  await page.keyboard.press('e');
  await expect(page.locator('#win-screen')).toBeVisible();
  await expect(page.locator('#next-level-button')).toBeHidden();
  await expect(page.locator('#win-summary')).toHaveText('SALIDA ENCONTRADA');
  await page.locator('#win-restart-button').click();
  expect((await state(page)).detected).toBe(0);
  expect(errors).toEqual([]);
});

test('entity is visible in the beam, captures the exposed player and resets on retry', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await page.evaluate(() => {
    const api = window.__BACKROOMS__, entity = api.state().entity;
    api.walkTo(entity.x, entity.z + 5); api.lookAt(entity.x, entity.z);
  });
  await page.screenshot({ path: 'test-results/entity-flashlight.png' });
  await page.evaluate(() => {
    const api = window.__BACKROOMS__, entity = api.state().entity;
    api.walkTo(entity.x + .5, entity.z); api.lookAt(entity.x, entity.z);
    api.advance(2);
  });
  await expect(page.locator('#dead-screen')).toBeVisible();
  await page.locator('#retry-button').click();
  const restarted = await state(page);
  expect(restarted.mode).toBe('playing');
  expect(restarted.detected).toBe(0);
  expect(restarted.flashlightOn).toBe(true);
  expect(errors).toEqual([]);
});

test('dark refuges, patrol, outages and paused time work without resource management', async ({ page }) => {
  await enter(page);
  await page.keyboard.press('f');
  await expect.poll(async () => (await state(page)).hidden).toBe(true);
  await expect(page.locator('#shelter-status')).toBeVisible();
  const patrol = await page.evaluate(() => {
    const api = window.__BACKROOMS__, visited = new Set();
    for (let second = 0; second < 300; second++) {
      api.advance(1);
      const position = api.state().entity;
      api.world.patrol.forEach((point, index) => {
        if (Math.hypot(position.x - point.x, position.z - point.z) < 3) visited.add(index);
      });
    }
    return { visited: visited.size, stops: api.world.patrol.length, mode: api.state().mode };
  });
  expect(patrol.visited).toBe(patrol.stops);
  expect(patrol.mode).toBe('playing');
  await expect(page.locator('#blackout-status')).toBeVisible();
  await page.screenshot({ path: 'test-results/darker-blackout.png' });
  await page.keyboard.press('Escape');
  const paused = await state(page);
  await page.evaluate(() => window.__BACKROOMS__.advance(20));
  expect((await state(page)).elapsed).toBe(paused.elapsed);
  await page.locator('#restart-button').click();
  await expect(page.locator('#blackout-status')).toBeHidden();
  expect((await state(page)).elapsed).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/darker-service-wing.png' });
});
