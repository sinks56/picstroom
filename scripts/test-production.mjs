import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotsDir = join(__dirname, '..', 'screenshots');
const artifactsDir = '/opt/cursor/artifacts/screenshots';

for (const dir of [screenshotsDir, artifactsDir]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const APP_URL = 'http://localhost:5847/picstroom/';

async function test() {
  console.log('Starting production test...');
  const browser = await chromium.launch({ headless: true });
  
  // iPad Pro viewport
  const context = await browser.newContext({
    viewport: { width: 1024, height: 1366 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15'
  });

  const page = await context.newPage();

  try {
    console.log('Loading app at', APP_URL);
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open discover modal and add all feeds
    console.log('Opening discover modal...');
    const discoverBtn = await page.locator('button:has-text("Discover Feeds")');
    if (await discoverBtn.isVisible()) {
      await discoverBtn.click();
    } else {
      const headerBtn = page.locator('button[aria-label="Discover feeds"]');
      await headerBtn.click();
    }
    await page.waitForTimeout(1000);

    // Add all feeds
    console.log('Adding all starter feeds...');
    const addAllBtn = page.locator('text=Add all').first();
    if (await addAllBtn.isVisible()) {
      await addAllBtn.click();
      await page.waitForTimeout(15000); // Wait for feeds to load
    }

    // Close modal
    const closeBtn = page.locator('button[aria-label="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(1000);
    }

    // Wait for images to load
    console.log('Waiting for images...');
    await page.waitForTimeout(3000);

    // Screenshot row view
    console.log('Capturing row view...');
    await page.screenshot({ 
      path: join(artifactsDir, 'row-view.png'),
      fullPage: false 
    });

    // Switch to grid view
    console.log('Switching to grid view...');
    const gridBtn = page.locator('button[aria-label="Grid view"]');
    if (await gridBtn.isVisible()) {
      await gridBtn.click();
      await page.waitForTimeout(1000);
    }

    // Screenshot grid view
    console.log('Capturing grid view...');
    await page.screenshot({ 
      path: join(artifactsDir, 'grid-view.png'),
      fullPage: false 
    });

    // Click an image to open viewer
    console.log('Opening image viewer...');
    const images = await page.locator('.masonry-item img, .image-row img').all();
    if (images.length > 0) {
      await images[0].click();
      await page.waitForTimeout(1500);
      
      // Screenshot viewer
      console.log('Capturing viewer...');
      await page.screenshot({ 
        path: join(artifactsDir, 'viewer.png'),
        fullPage: false 
      });

      // Close viewer
      const closeViewerBtn = page.locator('button[aria-label="Close"]');
      if (await closeViewerBtn.isVisible()) {
        await closeViewerBtn.click();
      }
    }

    // Count feeds and images
    const feedCount = await page.locator('h2').count();
    const imageCount = await page.locator('.masonry-item, .image-row > div').count();
    
    console.log('');
    console.log('=== RESULTS ===');
    console.log(`Feeds loaded: ${feedCount}`);
    console.log(`Images visible: ${imageCount}`);
    console.log(`Screenshots saved to: ${artifactsDir}`);
    console.log('');

  } catch (error) {
    console.error('Test error:', error);
    await page.screenshot({ 
      path: join(artifactsDir, 'error.png'),
      fullPage: false 
    });
  } finally {
    await browser.close();
  }
}

test().catch(console.error);
