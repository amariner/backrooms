import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => window.__BACKROOMS__.state());
const idleTouch = { forward: 0, strafe: 0, sprinting: false };
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

async function enter(page, level = 0) {
  await page.goto(`/?level=${level}`);
  await page.locator('#start-button').tap();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
}

async function center(locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 1, radiusY: 1 };
}

async function sendTouches(client, type, points = []) {
  await client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}

async function expectOnscreenTapTarget(locator, viewport) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  const exposed = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { exposed: top === element || element.contains(top), target: element.id, covering: top?.id || top?.className };
  });
  expect(exposed, `${exposed.target} is covered by ${exposed.covering}`).toMatchObject({ exposed: true });
}

test.describe('phone touch controls', () => {
  test.use(phone);

  test('detects phones, keeps controls reachable and caps the rendering resolution', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?level=1');
    await expect(page.locator('body')).toHaveAttribute('data-input', 'touch');
    await expect(page.locator('#touch-controls')).toBeHidden();
    for (const selector of ['#start-button', '#instructions-button']) {
      await expectOnscreenTapTarget(page.locator(selector), phone.viewport);
    }
    await page.locator('#instructions-button').tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(/joystick|palanca/i);
    await page.locator('#close-instructions').tap();
    await page.locator('#start-button').tap();
    await expect(page.locator('#touch-controls')).toBeVisible();
    expect((await state(page)).inputMode).toBe('touch');
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    await page.screenshot({ path: 'test-results/touch-phone-portrait.png' });
    for (const selector of ['#touch-joystick', '#touch-sprint', '#touch-flashlight', '#touch-interact', '#touch-pause', '#entity-call-button']) {
      await expectOnscreenTapTarget(page.locator(selector), phone.viewport);
    }
    const dimensions = await page.locator('#scene-canvas').evaluate((canvas) => ({
      width: canvas.width, height: canvas.height,
      cssWidth: canvas.getBoundingClientRect().width, cssHeight: canvas.getBoundingClientRect().height,
      documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
    }));
    expect(dimensions.width / dimensions.cssWidth).toBeLessThanOrEqual(1.26);
    expect(dimensions.height / dimensions.cssHeight).toBeLessThanOrEqual(1.26);
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(errors).toEqual([]);
  });

  test('two real touches move and look independently; cancellation does not leave movement stuck', async ({ page }) => {
    await enter(page);
    const client = await page.context().newCDPSession(page);
    await page.locator('#touch-sprint').tap();
    await expect(page.locator('#touch-sprint')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#touch-flashlight').tap();
    expect((await state(page)).flashlightOn).toBe(false);
    const initial = await state(page);
    const stick = await center(page.locator('#touch-joystick'));
    const look = { id: 2, x: 278, y: 360, radiusX: 1, radiusY: 1 };
    await sendTouches(client, 'touchStart', [{ ...stick, id: 1 }, look]);
    await sendTouches(client, 'touchMove', [{ ...stick, id: 1, y: stick.y - 40 }, { ...look, x: 338, y: 386 }]);
    await expect.poll(async () => Math.abs((await state(page)).touch.forward)).toBeGreaterThan(.5);
    await expect.poll(async () => Math.abs((await state(page)).yaw - initial.yaw)).toBeGreaterThan(.05);
    await expect.poll(async () => Math.abs((await state(page)).pitch - initial.pitch)).toBeGreaterThan(.02);
    await expect.poll(async () => {
      const current = await state(page);
      return Math.hypot(current.x - initial.x, current.z - initial.z);
    }).toBeGreaterThan(.35);
    await sendTouches(client, 'touchCancel');
    await expect.poll(async () => (await state(page)).touch.forward).toBe(0);
    await expect.poll(async () => (await state(page)).touch.strafe).toBe(0);
    // A normal fresh gesture must still work after browser/system cancellation.
    await sendTouches(client, 'touchStart', [{ ...stick, id: 3 }]);
    await sendTouches(client, 'touchMove', [{ ...stick, id: 3, x: stick.x + 35 }]);
    await expect.poll(async () => Math.abs((await state(page)).touch.strafe)).toBeGreaterThan(.4);
    await sendTouches(client, 'touchEnd');
    await expect.poll(async () => (await state(page)).touch.strafe).toBe(0);
    await client.detach();
  });

  test('pause, restart and rotation clear movement and sprint without breaking landscape controls', async ({ page }) => {
    await enter(page);
    await page.locator('#touch-sprint').tap();
    await page.locator('#touch-pause').tap();
    await expect(page.locator('#pause-screen')).toBeVisible();
    await expect(page.locator('#touch-controls')).toBeHidden();
    expect((await state(page)).touch).toMatchObject(idleTouch);
    const paused = await state(page);
    await page.evaluate(() => window.__BACKROOMS__.advance(10));
    expect((await state(page)).elapsed).toBe(paused.elapsed);
    await page.locator('#resume-button').tap();
    await expect(page.locator('#touch-sprint')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#touch-sprint').tap();
    const client = await page.context().newCDPSession(page);
    const stick = await center(page.locator('#touch-joystick'));
    await sendTouches(client, 'touchStart', [{ ...stick, id: 1 }]);
    await sendTouches(client, 'touchMove', [{ ...stick, id: 1, y: stick.y - 38 }]);
    await expect.poll(async () => Math.abs((await state(page)).touch.forward)).toBeGreaterThan(.5);
    const landscape = { width: 844, height: 390 };
    await page.setViewportSize(landscape);
    await expect.poll(async () => (await state(page)).touch).toMatchObject(idleTouch);
    await sendTouches(client, 'touchEnd');
    for (const selector of ['#touch-joystick', '#touch-sprint', '#touch-flashlight', '#touch-interact', '#touch-pause']) {
      await expectOnscreenTapTarget(page.locator(selector), landscape);
    }
    await page.screenshot({ path: 'test-results/touch-phone-landscape.png' });
    await page.locator('#touch-pause').tap();
    await page.locator('#restart-button').tap();
    expect((await state(page)).touch).toMatchObject(idleTouch);
    expect((await state(page)).flashlightOn).toBe(true);
    await client.detach();
  });

  test('touch-only actions call the entity and open the exit without a keyboard', async ({ page }) => {
    await enter(page, 1);
    await expect(page.locator('#touch-interact')).toBeDisabled();
    const yaw = (await state(page)).yaw;
    await page.locator('#entity-call-button').tap();
    await expect(page.locator('#entity-call-caption')).toBeVisible();
    await expect(page.locator('#entity-call-button')).toBeDisabled();
    expect((await state(page)).call.count).toBe(1);
    expect((await state(page)).yaw).toBe(yaw);
    await page.evaluate(() => {
      const api = window.__BACKROOMS__, exit = api.world.exit;
      api.walkTo(exit.x, exit.z + 1.7);
      api.lookAt(exit.x, exit.z);
    });
    await expect(page.locator('#touch-interact')).toBeEnabled();
    await page.locator('#touch-interact').tap();
    await expect(page.locator('#win-screen')).toBeVisible();
    await expect(page.locator('#touch-controls')).toBeHidden();
    expect((await state(page)).touch).toMatchObject(idleTouch);
    await page.locator('#win-restart-button').tap();
    await expect(page.locator('#touch-controls')).toBeVisible();
    expect((await state(page)).call.count).toBe(0);
  });
});

test.describe('tablet capability detection', () => {
  // iPad desktop browsing must not require a mobile user-agent string.
  test.use({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: false });

  test('a desktop user agent with touchscreen gets tablet controls and a working camera', async ({ page }) => {
    await enter(page);
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
    await expect(page.locator('body')).toHaveAttribute('data-input', 'touch');
    await expect(page.locator('#touch-controls')).toBeVisible();
    const before = await state(page);
    const client = await page.context().newCDPSession(page);
    await sendTouches(client, 'touchStart', [{ id: 1, x: 700, y: 300 }]);
    await sendTouches(client, 'touchMove', [{ id: 1, x: 810, y: 340 }]);
    await sendTouches(client, 'touchEnd');
    await expect.poll(async () => Math.abs((await state(page)).yaw - before.yaw)).toBeGreaterThan(.1);
    await page.screenshot({ path: 'test-results/touch-tablet.png' });
    await client.detach();
  });
});

test('coarse primary pointer enables controls even if maxTouchPoints is missing', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const result = original(query);
      if (/\((?:any-)?pointer:\s*coarse\)/.test(query)) Object.defineProperty(result, 'matches', { value: true });
      return result;
    };
  });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-input', 'touch');
  await page.locator('#start-button').click();
  await expect(page.locator('#touch-controls')).toBeVisible();
});

test('a narrow desktop window keeps keyboard and mouse controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => navigator.maxTouchPoints)).toBe(0);
  await expect(page.locator('body')).not.toHaveAttribute('data-input', 'touch');
  await page.locator('#start-button').click();
  await expect(page.locator('#touch-controls')).toBeHidden();
  expect((await state(page)).inputMode).not.toBe('touch');
  const initial = await state(page);
  await page.keyboard.down('w');
  await expect.poll(async () => (await state(page)).z).toBeLessThan(initial.z - .5);
  await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
});
