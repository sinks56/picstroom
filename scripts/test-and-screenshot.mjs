import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotsDir = join(__dirname, '..', 'screenshots');

if (!existsSync(screenshotsDir)) {
  mkdirSync(screenshotsDir, { recursive: true });
}

const APP_URL = 'http://localhost:5847';

const TEST_FEEDS = [
  'https://www.designboom.com/feed/',
  'https://www.dezeen.com/feed/'
];

async function test() {
  console.log('Starting browser...');
  const browser = await chromium.launch({ headless: true });
  
  // iPad Pro 12.9" portrait (1024x1366)
  const contextPortrait = await browser.newContext({
    viewport: { width: 1024, height: 1366 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
  });

  const pagePortrait = await contextPortrait.newPage();
  
  try {
    // Go to app
    console.log('Loading app...');
    await pagePortrait.goto(APP_URL, { waitUntil: 'networkidle' });
    await pagePortrait.waitForTimeout(1000);
    
    // Capture empty state
    console.log('Capturing empty state...');
    await pagePortrait.screenshot({ 
      path: join(screenshotsDir, 'empty-state-portrait.png'),
      fullPage: false
    });

    // Click Discover Feeds
    console.log('Opening discover feeds...');
    const discoverBtn = await pagePortrait.locator('button:has-text("Discover Feeds")');
    if (await discoverBtn.isVisible()) {
      await discoverBtn.click();
      await pagePortrait.waitForTimeout(500);
      
      // Screenshot discover modal
      await pagePortrait.screenshot({
        path: join(screenshotsDir, 'discover-modal-portrait.png'),
        fullPage: false
      });

      // Add a couple of feeds
      console.log('Adding test feeds...');
      const addButtons = await pagePortrait.locator('button:has-text("Add")').all();
      for (let i = 0; i < Math.min(3, addButtons.length); i++) {
        try {
          await addButtons[i].click();
          await pagePortrait.waitForTimeout(2000);
        } catch (e) {
          console.log(`Failed to add feed ${i}: ${e.message}`);
        }
      }

      // Close modal
      const closeBtn = await pagePortrait.locator('button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await pagePortrait.waitForTimeout(500);
      }
    } else {
      // Try adding feeds directly
      console.log('Adding feeds via URL...');
      for (const feedUrl of TEST_FEEDS) {
        try {
          // Click add feed button
          const addFeedBtn = await pagePortrait.locator('button[aria-label="Add feed"]');
          if (await addFeedBtn.isVisible()) {
            await addFeedBtn.click();
            await pagePortrait.waitForTimeout(500);
            
            // Enter URL
            const urlInput = await pagePortrait.locator('input[type="url"]');
            await urlInput.fill(feedUrl);
            
            // Submit
            const submitBtn = await pagePortrait.locator('button:has-text("Add Feed")');
            await submitBtn.click();
            await pagePortrait.waitForTimeout(5000);
          }
        } catch (e) {
          console.log(`Failed to add feed ${feedUrl}: ${e.message}`);
        }
      }
    }

    // Wait for images to load
    console.log('Waiting for images to load...');
    await pagePortrait.waitForTimeout(5000);

    // Screenshot row view (portrait)
    console.log('Capturing row view (portrait)...');
    await pagePortrait.screenshot({
      path: join(screenshotsDir, 'row-view-portrait.png'),
      fullPage: false
    });

    // Switch to grid view
    console.log('Switching to grid view...');
    const gridBtn = await pagePortrait.locator('button[aria-label="Grid view"]');
    if (await gridBtn.isVisible()) {
      await gridBtn.click();
      await pagePortrait.waitForTimeout(1000);
    }

    // Screenshot grid view (portrait)
    console.log('Capturing grid view (portrait)...');
    await pagePortrait.screenshot({
      path: join(screenshotsDir, 'grid-view-portrait.png'),
      fullPage: false
    });

    // Click an image to open viewer
    console.log('Opening full-screen viewer...');
    const images = await pagePortrait.locator('.masonry-item img, .image-row img').all();
    if (images.length > 0) {
      await images[0].click();
      await pagePortrait.waitForTimeout(1500);
      
      // Screenshot viewer
      console.log('Capturing full-screen viewer...');
      await pagePortrait.screenshot({
        path: join(screenshotsDir, 'viewer-portrait.png'),
        fullPage: false
      });

      // Close viewer
      const closeViewerBtn = await pagePortrait.locator('button[aria-label="Close"]');
      if (await closeViewerBtn.isVisible()) {
        await closeViewerBtn.click();
        await pagePortrait.waitForTimeout(500);
      }
    }

    // Test landscape (iPad Pro 12.9" landscape 1366x1024)
    console.log('Testing landscape orientation...');
    await contextPortrait.close();
    
    const contextLandscape = await browser.newContext({
      viewport: { width: 1366, height: 1024 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
    });
    
    const pageLandscape = await contextLandscape.newPage();
    await pageLandscape.goto(APP_URL, { waitUntil: 'networkidle' });
    await pageLandscape.waitForTimeout(3000);

    // Switch to row view
    const rowBtnLandscape = await pageLandscape.locator('button[aria-label="Row view"]');
    if (await rowBtnLandscape.isVisible()) {
      await rowBtnLandscape.click();
      await pageLandscape.waitForTimeout(1000);
    }

    // Screenshot row view (landscape)
    console.log('Capturing row view (landscape)...');
    await pageLandscape.screenshot({
      path: join(screenshotsDir, 'row-view-landscape.png'),
      fullPage: false
    });

    // Switch to grid view
    const gridBtnLandscape = await pageLandscape.locator('button[aria-label="Grid view"]');
    if (await gridBtnLandscape.isVisible()) {
      await gridBtnLandscape.click();
      await pageLandscape.waitForTimeout(1000);
    }

    // Screenshot grid view (landscape)
    console.log('Capturing grid view (landscape)...');
    await pageLandscape.screenshot({
      path: join(screenshotsDir, 'grid-view-landscape.png'),
      fullPage: false
    });

    await contextLandscape.close();

    console.log('\n✓ All screenshots captured successfully!');
    console.log(`Screenshots saved to: ${screenshotsDir}`);

  } catch (error) {
    console.error('Test error:', error);
    await pagePortrait.screenshot({
      path: join(screenshotsDir, 'error-state.png'),
      fullPage: false
    });
  } finally {
    await browser.close();
  }
}

test().catch(console.error);
