import { chromium } from '@playwright/test';
import { STARTER_FEEDS } from '../src/lib/starter-feeds.ts';

const LIVE_URL = 'https://sinks56.github.io/picstroom/';

async function testFeeds() {
  console.log('Testing feeds on live site:', LIVE_URL);
  console.log('Total starter feeds:', STARTER_FEEDS.length);
  console.log('');

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
  
  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Collect network failures
  const networkErrors = [];
  page.on('requestfailed', request => {
    networkErrors.push({
      url: request.url(),
      failure: request.failure()?.errorText
    });
  });

  try {
    console.log('Loading app...');
    await page.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Open discover modal
    console.log('Opening discover modal...');
    const discoverBtn = page.locator('button:has-text("Discover Feeds")');
    if (await discoverBtn.isVisible()) {
      await discoverBtn.click();
      await page.waitForTimeout(1000);
    } else {
      // Try header button
      const headerDiscoverBtn = page.locator('button[aria-label="Discover feeds"]');
      await headerDiscoverBtn.click();
      await page.waitForTimeout(1000);
    }

    const results = [];

    // Test each starter feed
    for (let i = 0; i < STARTER_FEEDS.length; i++) {
      const feed = STARTER_FEEDS[i];
      console.log(`\n[${i + 1}/${STARTER_FEEDS.length}] Testing: ${feed.title}`);
      console.log(`  URL: ${feed.url}`);

      // Find the Add button for this feed
      const feedRow = page.locator(`text="${feed.title}"`).locator('..').locator('..');
      const addBtn = feedRow.locator('button:has-text("Add")');
      
      if (await addBtn.isVisible()) {
        const btnText = await addBtn.textContent();
        if (btnText?.includes('Added')) {
          console.log('  Status: Already added');
          results.push({ feed: feed.title, status: 'already_added' });
          continue;
        }

        // Click add
        consoleErrors.length = 0;
        networkErrors.length = 0;
        
        await addBtn.click();
        
        // Wait for the add to complete (button changes or error)
        let success = false;
        for (let wait = 0; wait < 20; wait++) {
          await page.waitForTimeout(500);
          const currentText = await addBtn.textContent().catch(() => '');
          if (currentText?.includes('Added')) {
            success = true;
            break;
          }
          if (currentText?.includes('Add') && !currentText?.includes('Adding')) {
            // Button went back to Add, might have failed
            break;
          }
        }

        if (success) {
          console.log('  Status: SUCCESS');
          results.push({ feed: feed.title, status: 'success' });
        } else {
          console.log('  Status: FAILED');
          if (consoleErrors.length > 0) {
            console.log('  Console errors:', consoleErrors.slice(0, 3));
          }
          if (networkErrors.length > 0) {
            console.log('  Network errors:', networkErrors.slice(0, 3).map(e => e.url.substring(0, 80)));
          }
          results.push({ 
            feed: feed.title, 
            status: 'failed',
            consoleErrors: [...consoleErrors],
            networkErrors: [...networkErrors]
          });
        }
      } else {
        console.log('  Status: Button not found');
        results.push({ feed: feed.title, status: 'button_not_found' });
      }
    }

    // Summary
    console.log('\n\n=== SUMMARY ===');
    const successful = results.filter(r => r.status === 'success' || r.status === 'already_added');
    const failed = results.filter(r => r.status === 'failed');
    console.log(`Successful: ${successful.length}`);
    console.log(`Failed: ${failed.length}`);
    
    if (failed.length > 0) {
      console.log('\nFailed feeds:');
      for (const f of failed) {
        console.log(`  - ${f.feed}`);
        if (f.networkErrors?.length > 0) {
          console.log(`    Network: ${f.networkErrors[0]?.url?.substring(0, 100)}`);
        }
      }
    }

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await browser.close();
  }
}

testFeeds().catch(console.error);
