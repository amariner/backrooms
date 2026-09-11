import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => window.__BACKROOMS__.state());
async function enter(page) {
  await page.goto('/');
  await page.locator('#start-button').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
}

test('menu, instructions and responsive layout render without browser errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('#error-message')).toBeHidden();
  await page.screenshot({ path: 'test-results/menu-desktop.png' });
  await page.locator('#instructions-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#sensitivity').fill('1.4');
  await page.locator('#close-instructions').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  for (const size of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    const button = await page.locator('#start-button').boundingBox();
    expect(button.y + button.height).toBeLessThan(size.height);
    expect(button.x + button.width).toBeLessThan(size.width);
    await expect(page.locator('#start-button')).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/menu-mobile.png' });
  expect(errors).toEqual([]);
});

test('keyboard movement, mouse view, light, hints and pause are functional', async ({ page }) => {
  await enter(page);
  const before = await state(page);
  await page.keyboard.down('w');
  await expect.poll(async () => (await state(page)).z, { timeout: 12000 }).toBeLessThan(before.z - 1);
  await page.keyboard.up('w');
  await page.keyboard.press('f');
  await expect.poll(async () => (await state(page)).flashlightOn).toBe(true);
  await page.keyboard.press('h');
  await expect(page.locator('#hint-text')).toBeVisible();
  await expect(page.locator('#hint-text')).toContainText('OFICINAS');
  const yawBefore = (await state(page)).yaw;
  await page.mouse.move(700, 430);
  await page.mouse.down();
  await page.mouse.move(900, 460, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).yaw).not.toBe(yawBefore);
  await page.screenshot({ path: 'test-results/gameplay.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
  const paused = await state(page);
  await page.keyboard.press('w');
  expect((await state(page)).z).toBe(paused.z);
  expect((await state(page)).elapsed).toBe(paused.elapsed);
  await page.locator('#resume-button').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#restart-button').click();
  const restarted = await state(page);
  expect(restarted.collected).toEqual([]);
  expect(restarted.flashlightOn).toBe(false);
  expect(restarted.stamina).toBe(1);
});

test('walls block movement and all three fuses are required for the exit', async ({ page }) => {
  await enter(page);
  // The development harness changes position only; interaction and game state use real keys.
  const approach = async (kind, id) => page.evaluate(({ kind, id }) => {
    const api = window.__BACKROOMS__;
    const target = kind === 'exit' ? api.world.exit : api.world.fuses.find((f) => f.id === id);
    const moved = api.walkTo(target.x, target.z + 1.7);
    api.lookAt(target.x, target.z);
    return moved;
  }, { kind, id });
  expect(await approach('exit')).toBe(true);
  await page.keyboard.press('e');
  expect((await state(page)).mode).toBe('playing');
  await expect(page.locator('#toast')).toContainText('Faltan 3 fusibles');
  expect(await page.evaluate(() => window.__BACKROOMS__.walkTo(.2, .2))).toBe(false);
  const nearWall = await page.evaluate(() => {
    const api = window.__BACKROOMS__;
    return api.walkTo(14.5 * 3.2, 1 * 3.2 + .26);
  });
  expect(nearWall).toBe(true);
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  expect((await state(page)).z).toBeGreaterThanOrEqual(3.2 + .239);
  for (const [i, id] of ['A', 'B', 'C'].entries()) {
    expect(await approach('fuse', id)).toBe(true);
    await page.keyboard.press('e');
    await expect(page.locator('#fuse-count')).toHaveText(`${i + 1} / 3`);
    await page.keyboard.press('e');
    expect((await state(page)).collected).toHaveLength(i + 1);
  }
  await expect(page.locator('#objective-title')).toHaveText('ENCUENTRA LA SALIDA');
  expect(await approach('exit')).toBe(true);
  await page.keyboard.press('e');
  await expect(page.locator('#win-screen')).toBeVisible();
  expect((await state(page)).mode).toBe('won');
  await page.screenshot({ path: 'test-results/victory.png' });
  await page.locator('#win-restart-button').click();
  await expect(page.locator('#fuse-count')).toHaveText('0 / 3');
  expect((await state(page)).mode).toBe('playing');
});
