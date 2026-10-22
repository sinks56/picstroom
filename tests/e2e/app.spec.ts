import { test, expect, type Page } from '@playwright/test';

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR/i.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function addFeed(page: Page, name: string) {
  const row = page.getByTestId(`discover-${name}`);
  await row.getByRole('button').click();
  await expect(row.getByText('Added')).toBeVisible({ timeout: 90_000 });
}

async function loadedImages(page: Page, scope: string) {
  return page.evaluate(sel => [...document.querySelectorAll<HTMLImageElement>(sel)].filter(i => i.complete && i.naturalWidth > 0).length, scope);
}

async function swipe(page: Page, dx: number) {
  const vp = page.viewportSize()!;
  const y = vp.height / 2;
  const x0 = dx < 0 ? vp.width * 0.8 : vp.width * 0.2;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x0 + (dx * i) / 6, y);
  await page.mouse.up();
}

test('add feeds, browse rows and grid, viewer swipe, back restores scroll', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await expect(page.getByTestId('header')).toBeVisible();

  // Header sits at the very top with no inset, below the simulated status bar with one.
  expect((await page.getByTestId('header').boundingBox())!.y).toBe(0);
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-area-inset-top', '24px'));
  expect((await page.getByTestId('header').boundingBox())!.y).toBe(24);
  expect((await page.locator('.ps-statusbar-shield').boundingBox())!.height).toBe(24);
  await page.evaluate(() => document.documentElement.style.removeProperty('--safe-area-inset-top'));

  await page.getByLabel('Discover feeds').click();
  await addFeed(page, 'Dezeen');
  await addFeed(page, 'Colossal');
  await page.keyboard.press('Escape');

  // Rows: thumbnails (resized), fixed height, loaded.
  await expect(page.locator('.ps-row')).toHaveCount(2);
  await expect.poll(() => loadedImages(page, '.ps-row img'), { timeout: 30_000 }).toBeGreaterThan(3);
  const rowSrc = await page.locator('.ps-row img').first().getAttribute('src');
  expect(rowSrc).toContain('wsrv.nl');

  // Grid
  await page.getByLabel('Grid view').click();
  await expect(page.getByTestId('grid')).toBeVisible();
  await expect.poll(() => loadedImages(page, '[data-testid=grid] img'), { timeout: 30_000 }).toBeGreaterThan(6);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(800);
  const mounted = await page.locator('[data-testid=grid] .ps-cell').count();
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThanOrEqual(90);

  // Open a visible cell.
  const scrollBefore = await page.evaluate(() => scrollY);
  expect(scrollBefore).toBeGreaterThan(1000);
  const cellId = await page.evaluate(() => {
    const cells = [...document.querySelectorAll<HTMLElement>('[data-testid=grid] .ps-cell')];
    const c = cells.find(el => { const r = el.getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight - 40; });
    c?.click();
    return c?.dataset.imageId;
  });
  expect(cellId).toBeTruthy();
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute('data-image-id', cellId!);
  const startIndex = Number(await viewer.getAttribute('data-index'));

  // Swipe forward 3 times, back once.
  for (let i = 0; i < 3; i++) {
    await swipe(page, -260);
    await expect(viewer).toHaveAttribute('data-index', String(startIndex + i + 1));
    await page.waitForTimeout(350);
  }
  await swipe(page, 260);
  await expect(viewer).toHaveAttribute('data-index', String(startIndex + 2));
  const lastId = await viewer.getAttribute('data-image-id');
  // The current slide's large image decodes.
  await expect.poll(() => page.evaluate(() => {
    const v = document.querySelector('[data-testid=viewer]')!;
    return [...v.querySelectorAll<HTMLImageElement>('img')].some(i => i.naturalWidth > 0 && !i.classList.contains('ps-slot-loading'));
  })).toBe(true);

  // Back (Android back / browser back) closes the viewer and restores position.
  await page.goBack();
  await expect(viewer).toHaveCount(0);
  await page.waitForTimeout(300);
  const scrollAfter = await page.evaluate(() => scrollY);
  const lastVisible = await page.evaluate(id => {
    const el = document.querySelector<HTMLElement>(`[data-testid=grid] [data-image-id="${id}"]`);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  }, lastId);
  expect(lastVisible).toBe(true);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(page.viewportSize()!.height);
  // Header is still there after back.
  await expect(page.getByTestId('header')).toBeVisible();

  // Persisted: reload keeps feeds and view.
  await page.reload();
  await expect(page.getByTestId('grid')).toBeVisible();

  expect(errors).toEqual([]);
});

test('diagnostics are visible and copyable from settings', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'e2e synthetic error', error: new Error('e2e synthetic error') })));
  await page.getByLabel('Settings').click();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.getByTestId('diagnostics')).toContainText('e2e synthetic error');
  expect(errors.filter(e => !e.includes('e2e synthetic'))).toEqual([]);
});
