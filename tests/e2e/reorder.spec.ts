import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = '/workspace/shots-150';
mkdirSync(SHOTS, { recursive: true });

const FEEDS = [
  { url: 'https://www.dezeen.com/feed/', title: 'Dezeen' },
  { url: 'https://www.thisiscolossal.com/feed/', title: 'Colossal' },
  { url: 'https://segd.org/feed', title: 'SEGD' },
  { url: 'https://etapes.com/feed/', title: 'Étapes' }
];

const backup = JSON.stringify({
  app: 'PicStroom', format: 1, version: 'e2e', exportedAt: new Date().toISOString(),
  settings: { viewMode: 'rows' }, folders: [], favorites: [],
  feeds: FEEDS.map((f, i) => ({ id: `e2e${i}`, url: f.url, title: f.title, order: i }))
});

const rowTitles = (page: Page) => page.locator('.ps-row .ps-row-title h2').allTextContents();
const listTitles = (page: Page) => page.locator('[data-testid=feed-reorder-item] .ps-reorder-title').allTextContents();

/** Real touch events through CDP (Android-like: long-press then drag). */
async function touchDrag(page: Page, x: number, y0: number, y1: number, holdMs: number) {
  const cdp = await page.context().newCDPSession(page);
  const tp = (y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(y0) });
  await page.waitForTimeout(holdMs);
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(y0 + ((y1 - y0) * i) / steps) });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('import a backup, reorder feeds (handle drag, long-press, buttons), order persists and drives the home rows', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await expect(page.getByTestId('header')).toBeVisible();

  // Import via paste.
  await page.getByLabel('Settings').click();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await page.getByRole('button', { name: 'Paste to import' }).click();
  await page.getByTestId('import-paste').fill(backup);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByTestId('backup-status')).toContainText('4 feeds added');
  await page.screenshot({ path: `${SHOTS}/1-data-backup.png` });

  await page.getByRole('button', { name: 'Feeds', exact: true }).click();
  await expect.poll(() => listTitles(page)).toEqual(['Dezeen', 'Colossal', 'SEGD', 'Étapes']);
  await page.screenshot({ path: `${SHOTS}/2-feeds-list.png` });

  // 1) Drag the handle of "Étapes" (mouse) to the top.
  const items = page.getByTestId('feed-reorder-item');
  const handle = items.nth(3).getByTestId('feed-drag-handle');
  const hb = (await handle.boundingBox())!;
  const top = (await items.nth(0).boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + ((top.y + 4 - hb.y - hb.height / 2) * i) / 10);
  await page.screenshot({ path: `${SHOTS}/3-dragging.png` });
  await page.mouse.up();
  await expect.poll(() => listTitles(page)).toEqual(['Étapes', 'Dezeen', 'Colossal', 'SEGD']);

  // 2) Long-press "Dezeen" (row body, touch) and drag it to the bottom.
  const b1 = (await items.nth(1).locator('.ps-reorder-text').boundingBox())!;
  const last = (await items.nth(3).boundingBox())!;
  await touchDrag(page, b1.x + 40, b1.y + b1.height / 2, last.y + last.height - 4, 500);
  await expect.poll(() => listTitles(page)).toEqual(['Étapes', 'Colossal', 'SEGD', 'Dezeen']);

  // A quick touch swipe on a row (no hold) must NOT reorder.
  const b2 = (await items.nth(0).locator('.ps-reorder-text').boundingBox())!;
  await touchDrag(page, b2.x + 40, b2.y + b2.height / 2, b2.y + 120, 0);
  await expect.poll(() => listTitles(page)).toEqual(['Étapes', 'Colossal', 'SEGD', 'Dezeen']);

  // 3) Buttons.
  await page.getByLabel('Move SEGD up').click();
  await expect.poll(() => listTitles(page)).toEqual(['Étapes', 'SEGD', 'Colossal', 'Dezeen']);
  await page.getByLabel('Move Étapes down').click();
  await expect.poll(() => listTitles(page)).toEqual(['SEGD', 'Étapes', 'Colossal', 'Dezeen']);
  await expect(page.getByLabel('Move SEGD up')).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/4-reordered.png` });

  // Home rows follow the order.
  await page.keyboard.press('Escape');
  await expect.poll(() => rowTitles(page)).toEqual(['SEGD', 'Étapes', 'Colossal', 'Dezeen']);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/5-home-rows.png` });

  // Survives a restart.
  await page.reload();
  await expect.poll(() => rowTitles(page)).toEqual(['SEGD', 'Étapes', 'Colossal', 'Dezeen']);

  // Export: copy backup round-trips the order.
  await page.getByLabel('Settings').click();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await page.getByRole('button', { name: 'Copy backup' }).click();
  await expect(page.getByTestId('backup-status')).toContainText('Backup copied');
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.feeds.map((f: { title: string }) => f.title)).toEqual(['SEGD', 'Étapes', 'Colossal', 'Dezeen']);

  // Export file (browser download).
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export feeds & settings' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^picstroom-backup-\d{4}-\d{2}-\d{2}\.json$/);

  expect(errors).toEqual([]);
});
