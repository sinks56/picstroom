import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'fs';

const screenshotsDir = '/opt/cursor/artifacts/screenshots';
if (!existsSync(screenshotsDir)) mkdirSync(screenshotsDir, { recursive: true });

const APP_URL = 'http://localhost:5847/picstroom/';

async function test() {
  console.log('Starting dark mode test...');
  const browser = await chromium.launch({ headless: true });
  
  // Mobile viewport (Android phone)
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
    console.log('Loading app at', APP_URL);
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Verify dark mode is active (check for black background)
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    console.log('Background color:', bgColor);

    // Screenshot empty state (dark mode)
    console.log('Capturing dark mode empty state...');
    await page.screenshot({ 
      path: `${screenshotsDir}/dark-empty-state.png`,
      fullPage: false 
    });

    // Open discover modal and add feeds
    console.log('Opening discover modal...');
    const discoverBtn = await page.locator('button:has-text("Discover")').first();
    if (await discoverBtn.isVisible()) {
      await discoverBtn.click();
      await page.waitForTimeout(1000);
      
      // Screenshot discover modal (dark mode)
      await page.screenshot({ 
        path: `${screenshotsDir}/dark-discover-modal.png`,
        fullPage: false 
      });

      // Add a few feeds - click on feed-specific Add buttons
      const feedAddButtons = page.locator('.space-y-2 button:has-text("Add")');
      const count = await feedAddButtons.count();
      console.log(`Found ${count} feed Add buttons`);
      if (count > 0) {
        await feedAddButtons.first().click({ force: true });
        await page.waitForTimeout(8000);
      }

      // Close modal
      const closeBtn = page.locator('button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    // Wait for images to load
    console.log('Waiting for images...');
    await page.waitForTimeout(5000);

    // Screenshot row view (dark mode)
    console.log('Capturing dark row view...');
    await page.screenshot({ 
      path: `${screenshotsDir}/dark-row-view.png`,
      fullPage: false 
    });

    // Switch to grid view
    console.log('Switching to grid view...');
    const gridBtn = page.locator('button[aria-label="Grid view"]');
    if (await gridBtn.isVisible()) {
      await gridBtn.click();
      await page.waitForTimeout(2000);
    }

    // Screenshot grid view (dark mode)
    console.log('Capturing dark grid view...');
    await page.screenshot({ 
      path: `${screenshotsDir}/dark-grid-view.png`,
      fullPage: false 
    });

    // Click an image to open viewer
    console.log('Opening image viewer...');
    const images = await page.locator('img').all();
    if (images.length > 0) {
      await images[0].click();
      await page.waitForTimeout(2000);
      
      // Screenshot viewer (dark mode)
      console.log('Capturing dark viewer...');
      await page.screenshot({ 
        path: `${screenshotsDir}/dark-viewer.png`,
        fullPage: false 
      });

      // Test back navigation
      console.log('Testing back navigation...');
      await page.goBack();
      await page.waitForTimeout(1000);
      
      // Verify we're back at grid view
      const isGridVisible = await page.locator('.masonry-grid, [class*="masonry"]').isVisible().catch(() => false);
      console.log('Back navigation returned to grid:', isGridVisible);
    }

    console.log('');
    console.log('=== RESULTS ===');
    console.log(`Dark mode background: ${bgColor}`);
    console.log(`Screenshots saved to: ${screenshotsDir}`);
    console.log('');

  } catch (error) {
    console.error('Test error:', error);
    await page.screenshot({ 
      path: `${screenshotsDir}/dark-error.png`,
      fullPage: false 
    });
  } finally {
    await browser.close();
  }
}

test().catch(console.error);
