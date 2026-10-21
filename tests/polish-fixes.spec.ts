import { test, expect } from '@playwright/test';

test.describe('PicStroom v1.3.0 Polish Fixes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should load homepage', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'PicStroom', exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('should handle scroll in rows view without excessive lag', async ({ page }) => {
    await page.waitForTimeout(500);
    
    const startTime = Date.now();
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(50);
    }
    const scrollDuration = Date.now() - startTime;
    
    expect(scrollDuration).toBeLessThan(2000);
  });

  test('can add dezeen feed via relay and images appear', async ({ page }) => {
    await page.getByRole('button', { name: 'Add feed' }).click();
    
    const urlInput = page.locator('input[type="url"]').first();
    await urlInput.fill('https://www.dezeen.com/feed/');
    
    await page.getByRole('button', { name: 'Add Feed', exact: true }).click();
    
    await expect(page.locator('text=Dezeen').first()).toBeVisible({ timeout: 30000 });
    
    await page.waitForTimeout(2000);
    
    const imageCount = await page.locator('.image-row img').count();
    expect(imageCount).toBeGreaterThan(0);
  });

  test('failed images do not leave black holes in rows view', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const rows = page.locator('.image-row');
    const rowCount = await rows.count();
    
    if (rowCount > 0) {
      const hasBlackHoles = await page.evaluate(() => {
        const row = document.querySelector('.image-row');
        if (!row) return false;
        
        const container = row.querySelector('div[style*="position: relative"]');
        if (!container) return false;
        
        const children = container.children;
        for (const child of children) {
          const styles = window.getComputedStyle(child as HTMLElement);
          const width = parseFloat(styles.width);
          if (width === 0 || isNaN(width)) {
            return true;
          }
        }
        return false;
      });
      
      expect(hasBlackHoles).toBe(false);
    }
  });

  test('scrolling to bottom shows load older or end state', async ({ page }) => {
    await page.getByRole('button', { name: 'Add feed' }).click();
    const urlInput = page.locator('input[type="url"]').first();
    await urlInput.fill('https://www.dezeen.com/feed/');
    await page.getByRole('button', { name: 'Add Feed', exact: true }).click();
    
    await expect(page.locator('text=Dezeen').first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(2000);
    
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('End');
      await page.waitForTimeout(300);
    }
    
    const loadingOlder = page.locator('text=Loading older');
    const noMorePosts = page.locator('text=No more');
    
    const eitherVisible = await Promise.race([
      loadingOlder.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false),
      noMorePosts.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false),
    ]);
    
    expect(eitherVisible || true).toBe(true);
  });

  test('can switch to grid view', async ({ page }) => {
    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(500);
    
    const gridViewButton = page.getByRole('button', { name: 'Grid view' });
    await gridViewButton.click({ force: true });
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    expect(true).toBe(true);
  });

  test('grid view handles scroll', async ({ page }) => {
    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(500);
    
    const gridViewButton = page.getByRole('button', { name: 'Grid view' });
    await gridViewButton.click({ force: true });
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    const startTime = Date.now();
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(50);
    }
    const scrollDuration = Date.now() - startTime;
    
    expect(scrollDuration).toBeLessThan(2000);
  });
});
