import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => window.__BACKROOMS__.state());
async function enter(page) {
  await page.goto('/');
  await page.locator('#start-button').click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
}

test('simple menu and controls render at desktop and mobile sizes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('#error-message')).toBeHidden();
  await expect(page.locator('#menu')).not.toContainText(/fusible|relé|recupera|batería/i);
  await page.screenshot({ path: 'test-results/simple-menu.png' });
  await page.locator('#instructions-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#instructions-intro')).toContainText('salida');
  await page.locator('#sensitivity').fill('1.4');
  await page.locator('#close-instructions').click();
  for (const size of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    const button = await page.locator('#start-button').boundingBox();
    const footer = await page.locator('.menu-footer').boundingBox();
    expect(button.y + button.height).toBeLessThan(footer.y);
    expect(button.x + button.width).toBeLessThan(size.width);
  }
  await page.screenshot({ path: 'test-results/simple-menu-mobile.png' });
  expect(errors).toEqual([]);
});

test('movement, looking, unlimited flashlight and pause remain functional', async ({ page }) => {
  await enter(page);
  const before = await state(page);
  expect(before.flashlightOn).toBe(true);
  await page.keyboard.down('w');
  await expect.poll(async () => (await state(page)).z).toBeLessThan(before.z - 1);
  await page.keyboard.up('w');
  await page.keyboard.press('f');
  await expect.poll(async () => (await state(page)).flashlightOn).toBe(false);
  await page.keyboard.press('f');
  expect((await state(page)).flashlightOn).toBe(true);
  await page.keyboard.press('j');
  await page.keyboard.press('h');
  expect((await state(page)).mode).toBe('playing');
  await expect(page.locator('#fuse-count, #journal-screen, #hint-text, #battery-value')).toHaveCount(0);
  const yawBefore = (await state(page)).yaw;
  await page.mouse.move(700, 430);
  await page.mouse.down();
  await page.mouse.move(900, 460, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).yaw).not.toBe(yawBefore);
  await page.screenshot({ path: 'test-results/dark-level-zero.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
  const paused = await state(page);
  await page.keyboard.press('w');
  expect((await state(page)).elapsed).toBe(paused.elapsed);
  expect((await state(page)).z).toBe(paused.z);
  await page.locator('#restart-button').click();
  const restarted = await state(page);
  expect(restarted.flashlightOn).toBe(true);
  expect(restarted.stamina).toBe(1);
});

test('walls block movement and the exit opens immediately without collecting anything', async ({ page }) => {
  await enter(page);
  expect(await page.evaluate(() => window.__BACKROOMS__.walkTo(.2, .2))).toBe(false);
  expect(await page.evaluate(() => window.__BACKROOMS__.walkTo(14.5 * 3.2, 3.2 + .26))).toBe(true);
  await page.keyboard.down('w');
  await page.waitForTimeout(400);
  await page.keyboard.up('w');
  expect((await state(page)).z).toBeGreaterThanOrEqual(3.2 + .239);
  await page.evaluate(() => {
    const api = window.__BACKROOMS__, exit = api.world.exit;
    api.walkTo(exit.x, exit.z + 1.7); api.lookAt(exit.x, exit.z);
  });
  await expect(page.locator('#interaction-prompt')).toContainText('Abrir la salida');
  await page.keyboard.press('e');
  await expect(page.locator('#win-screen')).toBeVisible();
  await expect(page.locator('#win-summary')).toHaveText('SALIDA ENCONTRADA');
  await expect(page.locator('#next-level-button')).toBeVisible();
  await page.locator('#win-restart-button').click();
  expect((await state(page)).mode).toBe('playing');
});
