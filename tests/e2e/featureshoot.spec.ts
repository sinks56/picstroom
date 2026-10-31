import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = '/workspace/shots-151';
mkdirSync(SHOTS, { recursive: true });

// Feature Shoot is a WordPress + Jetpack feed whose newest post can be many weeks old: it must
// still show pictures (not "No images"), and its i0.wp.com images must load.
const backup = JSON.stringify({
  app: 'PicStroom', format: 1, version: 'e2e', exportedAt: new Date().toISOString(),
  settings: { viewMode: 'rows' }, folders: [], favorites: [],
  feeds: [{ id: 'fs1', url: 'https://www.featureshoot.com/feed/', title: 'Feature Shoot', order: 0 }]
});

const loaded = (page: import('@playwright/test').Page, sel: string) =>
  page.evaluate(s => [...document.querySelectorAll<HTMLImageElement>(s)].filter(i => i.complete && i.naturalWidth > 0).length, sel);

test('Feature Shoot feed shows loaded pictures in rows and grid', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await page.getByLabel('Settings').click();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await page.getByRole('button', { name: 'Paste to import' }).click();
  await page.getByTestId('import-paste').fill(backup);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByTestId('backup-status')).toContainText('1 feed');
  await page.keyboard.press('Escape');

  await expect.poll(() => loaded(page, '.ps-row img'), { timeout: 60_000 }).toBeGreaterThan(4);
  const src = await page.locator('.ps-row img').first().getAttribute('src');
  expect(src).toContain('i0.wp.com');
  await page.screenshot({ path: `${SHOTS}/featureshoot-rows.png` });

  await page.getByLabel('Grid view').click();
  await expect(page.getByTestId('grid')).toBeVisible();
  await expect.poll(() => loaded(page, '[data-testid=grid] img'), { timeout: 60_000 }).toBeGreaterThan(4);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/featureshoot-grid.png` });
  expect(errors).toEqual([]);
});
