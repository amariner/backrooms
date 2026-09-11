import { test, expect } from '@playwright/test';

const deployment = process.env.BACKROOMS_PRODUCTION_URL;
test.skip(!deployment, 'Set BACKROOMS_PRODUCTION_URL to test a deployed production build.');

test('production serves both levels and the entity call without development code', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const level of [0, 1]) {
    const response = await page.goto(`${deployment}/?level=${level}`);
    expect(response.status()).toBe(200);
    await expect(page.locator('#start-button')).toBeEnabled();
    await expect(page.locator('#error-message')).toBeHidden();
    expect(await page.evaluate(() => window.__BACKROOMS__)).toBeUndefined();
    await page.locator('#start-button').click();
    await expect(page.locator('#hud')).toBeVisible();
    if (level === 1) {
      await page.keyboard.press('g');
      await expect(page.locator('#entity-call-caption')).toBeVisible();
      await expect(page.locator('#entity-call-button')).toBeDisabled();
      await page.screenshot({ path: 'test-results/railway-level-one.png' });
    } else await expect(page.locator('#entity-call-control')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-screen')).toBeVisible();
  }
  const audio = await request.get(`${deployment}/audio/entitiiii.mp3`);
  expect(audio.status()).toBe(200);
  expect(audio.headers()['content-type']).toContain('audio/mpeg');
  expect((await audio.body()).length).toBeGreaterThan(10000);
  const partial = await request.get(`${deployment}/audio/entitiiii.mp3`, { headers: { Range: 'bytes=0-99' } });
  expect(partial.status()).toBe(206);
  expect((await partial.body()).length).toBe(100);
  const secretPath = await request.get(`${deployment}/.env`);
  expect(secretPath.status()).toBe(404);
  const missingAsset = await request.get(`${deployment}/assets/not-a-real-file.js`);
  expect(missingAsset.status()).toBe(404);
  expect(errors).toEqual([]);
});

test.describe('production on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });

  test('touch controls move, look, call and pause in the deployed build', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(`${deployment}/?level=1`);
    expect(response.status()).toBe(200);
    expect(await page.evaluate(() => window.__BACKROOMS__)).toBeUndefined();
    await expect(page.locator('body')).toHaveAttribute('data-input', 'touch');
    await page.locator('#start-button').tap();
    await expect(page.locator('#touch-controls')).toBeVisible();
    await page.locator('#touch-flashlight').tap();
    await expect(page.locator('#flashlight-status')).toHaveText('LINTERNA OFF');
    await page.locator('#touch-flashlight').tap();
    await expect(page.locator('#flashlight-status')).toHaveText('LINTERNA ON');
    await page.locator('#touch-sprint').tap();
    await expect(page.locator('#touch-sprint')).toHaveAttribute('aria-pressed', 'true');
    const initialHeading = await page.locator('#compass').textContent();
    const stick = await page.locator('#touch-joystick').boundingBox();
    const left = { id: 1, x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
    const right = { id: 2, x: 275, y: 350 };
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ ...left, y: left.y - 40 }, { ...right, x: 315, y: 365 }],
    });
    await expect(page.locator('#compass')).not.toHaveText(initialHeading);
    // The deployed build intentionally has no debug API: stamina confirms actual
    // sprinting movement, while the compass above confirms independent looking.
    await expect.poll(() => page.locator('#stamina-fill').evaluate((element) =>
      new DOMMatrix(getComputedStyle(element).transform).a)).toBeLessThan(.99);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.locator('#entity-call-button').tap();
    await expect(page.locator('#entity-call-caption')).toBeVisible();
    await expect(page.locator('#entity-call-button')).toBeDisabled();
    await page.screenshot({ path: 'test-results/railway-touch-phone.png' });
    await page.locator('#touch-pause').tap();
    await expect(page.locator('#pause-screen')).toBeVisible();
    await expect(page.locator('#touch-controls')).toBeHidden();
    await page.locator('#resume-button').tap();
    await expect(page.locator('#touch-controls')).toBeVisible();
    await expect(page.locator('#touch-sprint')).toHaveAttribute('aria-pressed', 'false');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#touch-pause')).toBeVisible();
    await page.screenshot({ path: 'test-results/railway-touch-landscape.png' });
    expect(errors).toEqual([]);
    await client.detach();
  });
});
