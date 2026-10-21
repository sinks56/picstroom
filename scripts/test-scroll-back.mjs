import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'fs';

const screenshotsDir = '/opt/cursor/artifacts/screenshots';
if (!existsSync(screenshotsDir)) mkdirSync(screenshotsDir, { recursive: true });

const APP_URL = 'http://localhost:5847/picstroom/';

async function test() {
  console.log('Starting scroll and back navigation test...');
  const browser = await chromium.launch({ headless: true });
  
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
  });

  const page = await context.newPage();

  try {
    console.log('Loading app...');
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Add a feed first
    console.log('Adding feed...');
    const discoverBtn = await page.locator('button:has-text("Discover")').first();
    if (await discoverBtn.isVisible()) {
      await discoverBtn.click();
      await page.waitForTimeout(1000);

      const feedAddBtn = page.locator('.space-y-2 button:has-text("Add")').first();
      if (await feedAddBtn.isVisible()) {
        await feedAddBtn.click({ force: true });
        await page.waitForTimeout(8000);
      }

      const closeBtn = page.locator('button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    // Switch to grid view
    console.log('Switching to grid view...');
    const gridBtn = page.locator('button[aria-label="Grid view"]');
    if (await gridBtn.isVisible()) {
      await gridBtn.click();
      await page.waitForTimeout(2000);
    }

    // Scroll down to load more images
    console.log('Scrolling down...');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(500);
    }

    // Get scroll position before clicking image
    const scrollBefore = await page.evaluate(() => window.scrollY);
    console.log(`Scroll position before viewer: ${scrollBefore}`);

    // Screenshot scroll position
    await page.screenshot({ 
      path: `${screenshotsDir}/scroll-position-before.png`,
      fullPage: false 
    });

    // Click an image to open viewer
    console.log('Opening image viewer...');
    const images = await page.locator('img').all();
    if (images.length > 5) {
      await images[5].click();
      await page.waitForTimeout(1500);

      // Screenshot viewer
      await page.screenshot({ 
        path: `${screenshotsDir}/viewer-open.png`,
        fullPage: false 
      });

      // Go back using browser back
      console.log('Testing back navigation...');
      await page.goBack();
      await page.waitForTimeout(1000);

      // Get scroll position after back
      const scrollAfter = await page.evaluate(() => window.scrollY);
      console.log(`Scroll position after back: ${scrollAfter}`);

      // Screenshot after back
      await page.screenshot({ 
        path: `${screenshotsDir}/scroll-position-after.png`,
        fullPage: false 
      });

      // Check if scroll position was retained (within some tolerance)
      const scrollRetained = Math.abs(scrollAfter - scrollBefore) < 100;
      console.log(`Scroll position retained: ${scrollRetained}`);
    }

    // Check for dark mode (true black)
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    console.log(`Dark mode background: ${bgColor}`);

    console.log('');
    console.log('=== RESULTS ===');
    console.log(`Dark mode: ${bgColor === 'rgb(0, 0, 0)' ? 'PASS (true black)' : 'FAIL'}`);
    console.log(`Screenshots saved to: ${screenshotsDir}`);

  } catch (error) {
    console.error('Test error:', error);
    await page.screenshot({ 
      path: `${screenshotsDir}/test-error.png`,
      fullPage: false 
    });
  } finally {
    await browser.close();
  }
}

test().catch(console.error);
