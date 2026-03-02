// const puppeteer = require('puppeteer');
// [SECURE] Puppeteer dependency removed.
// File kept for interface compatibility but is functionally a ghost.
const { db } = require("../firebaseAdmin");
const fs = require("fs");
const path = require("path");

class BotExecutionService {
  constructor() {
    this.browser = null;
  }

  /**
   * Helper to load proxies from a file (if available)
   */
  getProxy() {
    // --- SAFETY PROTOCOL ACTIVE ---
    // User requested removal of proxy/bot capability to avoid ban risk.
    // Returning null forces direct connection (or no connection if blocked).
    // This effectively disables the "Wolf Hunt" automated bot network.
    console.log("[Bot] Proxy system disabled by safety protocol.");
    return null;
  }

  /**
   * Launch browser with optional proxy
   */
  async launchBrowser(proxyUrl = null) {
    // ALWAYS close old browser instance to ensure clean state (cookies/cache clearing for Views)
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    const args = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1920,1080",
      "--disable-blink-features=AutomationControlled", // Helps hide bot status
    ];

    if (proxyUrl) {
      console.log(`[Bot] Using Proxy: ${proxyUrl}`);
      args.push(`--proxy-server=${proxyUrl}`);
    }

    console.log("Launching Auto-Pilot Bot Browser (New Identity)...");
    this.browser = await puppeteer.launch({
      headless: "new",
      args: args,
    });

    return this.browser;
  }

  /**
   * Fetches an active bot account for the platform.
   */
  async fetchBotAccount(platform) {
    try {
      const accountsSnapshot = await db
        .collection("bot_accounts")
        .where("platform", "==", platform)
        .where("status", "==", "active")
        .orderBy("lastUsed", "asc") // Use the one that hasn't been used in a while (Load Balancing)
        .limit(1)
        .get();

      if (accountsSnapshot.empty) {
        console.warn(`[Bot] No active bot accounts found for ${platform}. Running in GUEST mode.`);
        return null;
      }

      const doc = accountsSnapshot.docs[0];
      // Update lastUsed
      await doc.ref.update({ lastUsed: new Date() });

      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error(`[Bot] Error fetching bot account: ${error.message}`);
      return null;
    }
  }

  /**
   * Main entry point to execute an engagement action.
   * @param {string} targetUrl - The URL of the content to engage with.
   * @param {string} platform - 'tiktok', 'youtube', 'instagram', etc.
   * @param {string} actionType - 'like', 'comment', 'view', 'follow'.
   */
  async executeAction(targetUrl, platform, actionType) {
    // --- SAFETY PROTOCOL ---
    // Automated actions disabled.
    // We log the attempt but do NOT execute Puppeteer.
    // This is the "Organic Only" mode requested.
    console.log(`[Bot] 🛑 Action Skipped (Safety Mode): ${actionType} on ${platform}`);
    return { success: true, mock: true, message: "Action queued for human soldiers." };

    /*
        let page = null;
        try {
            // View Logic: Rotate Proxies + Clear State (No Auth needed usually)
            const isViewBot = actionType === 'view';
            const proxy = isViewBot ? this.getProxy() : null; // Only use proxy for views (saves premium IPs)
            
            await this.launchBrowser(proxy); // Fresh instance
            page = await this.browser.newPage();
            
            // ---------------------------------------------------------
            // BANDWIDTH SAVER: Smart Throttle & Block Strategy
            // ---------------------------------------------------------
            await page.setRequestInterception(true);
            
            // 1. Force LOW Quality (144p via Network Throttling)
            // This tricks the player into requesting the smallest video chunks possible.
            const client = await page.target().createCDPSession();
            await client.send('Network.emulateNetworkConditions', {
                offline: false,
                latency: 200, // 200ms
                downloadThroughput: 350 * 1024, // 350 kbps (enough for 144p, too slow for HD)
                uploadThroughput: 200 * 1024
            });

            page.on('request', (req) => {
                const resourceType = req.resourceType();
                
                // 2. BLOCK PURE WASTE (Images, Fonts, CSS, Ads)
                // We keep 'media' unblocked so the player starts, but the throttle limit
                // ensures we only download tiny chunks.
                if (['image', 'font', 'stylesheet', 'media'].includes(resourceType)) {
                     // For 'view', we MUST allow media to load for at least a few seconds
                     // or the view won't count. The throttle handles size reduction.
                     if (resourceType === 'media' && actionType === 'view') {
                         req.continue();
                     } else {
                         req.abort();
                     }
                } 
                else {
                    req.continue();
                }
            });
            
            // Set User Agent to avoid basic blocking
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });

            // Cookie Injection (ONLY for Likes/Comments)
            // Views should generally be anonymous to simulate "New Traffic"
            if (!isViewBot) {
                const botAccount = await this.fetchBotAccount(platform);
                if (botAccount && botAccount.cookies) {
                    console.log(`[Bot] Injecting cookies for account: ${botAccount.username || 'Unknown'}`);
                    await page.setCookie(...botAccount.cookies);
                } else {
                    console.log(`[Bot] No cookies found. Proceeding as Guest.`);
                }
            } else {
                console.log(`[Bot] Running anonymously for VIEW simulation.`);
            }

            console.log(`[Bot] Navigating to ${targetUrl} for ${platform} ${actionType}...`);
            await page.goto(targetUrl, { 
                waitUntil: 'networkidle2', 
                timeout: 60000 
            });

            // Platform-specific logic
            switch (platform.toLowerCase()) {
                case 'tiktok':
                    await this.handleTikTok(page, actionType);
                    break;
                case 'youtube':
                    await this.handleYouTube(page, actionType);
                    break;
                case 'instagram':
                    await this.handleInstagram(page, actionType);
                    break;
                default:
                    throw new Error(`Platform ${platform} not supported by Auto-Pilot.`)
            }

            console.log(`[Bot] Action ${actionType} completed successfully on ${platform}.`);
            return { success: true };

        } catch (error) {
            console.error(`[Bot] Error executing action: ${error.message}`);
            // Screenshot on failure for debugging
            if (page) {
                const path = require('path');
                const screenshotPath = path.join(__dirname, `../../error-${Date.now()}.png`);
                await page.screenshot({ path: screenshotPath });
                console.log(`[Bot] Saved error screenshot to ${screenshotPath}`);
            }
            return { success: false, error: error.message };
        } finally {
            if (page) await page.close();
            // Keep browser open for reuse or close it? 
            // For now, let's close it to be safe and clean.
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
        }
    }
    */
  }

  async handleTikTok(page, actionType) {
    // [SIMULATION MODE]
    return true;
  }

  /*
    async handleTikTok_LEGACY(page, actionType) {
        // Selectors for TikTok (These change frequently!)
        const LIKE_BUTTON_SELECTOR = 'span[data-e2e="like-icon"]'; 
        const REPOST_BUTTON_SELECTOR = 'span[data-e2e="share-icon"]'; // Often share first
        const REPOST_MENU_ITEM = 'div:contains("Repost")'; // jQuery-ish selector requires work in Puppeteer

        if (actionType === 'view') {
           // For views, we just need to chill on the page
           // Scroll a bit to simulate user activity
           await page.evaluate(() => { window.scrollBy(0, 50); });
           
           // RETENTION HACK (Cost Saver): 4-7 seconds
           // TikTok counts a "View" instantly on load.
           // YouTube counts ~30s, but for "Shorts" loop, 4-7s works.
           // This reduces bandwidth cost by ~80%.
           const watchTime = 4000 + Math.random() * 3000;
           await new Promise(r => setTimeout(r, watchTime));
           return;
        }

        if (actionType === 'repost' || actionType === 'share') {
            // Click Share first
            await page.waitForSelector(REPOST_BUTTON_SELECTOR, { timeout: 10000 });
            await page.click(REPOST_BUTTON_SELECTOR);
            await new Promise(r => setTimeout(r, 1000));
            
            // Find "Repost" in the menu (Yellow Loop Icon)
            // Note: Selectors for menu items are dynamic. We search by text content.
            const repostClicked = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('div, span, p'));
                const repostBtn = elements.find(el => el.textContent.trim() === 'Repost');
                if (repostBtn) {
                    repostBtn.click();
                    return true;
                }
                return false;
            });

            if (!repostClicked) throw new Error("Repost button not found in share menu");
            await new Promise(r => setTimeout(r, 2000));
            return;
        }

        if (actionType === 'like') {
            // Wait for video to load
            await page.waitForSelector(LIKE_BUTTON_SELECTOR, { timeout: 10000 });
            
            // Check if already liked? (Optimization for later)
            
            // Click Like
            await page.click(LIKE_BUTTON_SELECTOR);
            
            // Wait a bit to simulate human behavior
            await new Promise(r => setTimeout(r, 2000));
        }
        // TODO: Handle Comments
    }
    */

  async handleYouTube(page, actionType) {
    // [SIMULATION MODE]
    // Since we disabled the actual bot execution in executeAction(), this method is effectively dead code
    // but kept for structural integrity if we ever decide to re-enable it.
    return true;
  }

  /*
    async handleYouTube_LEGACY(page, actionType) {
        // Selectors for YouTube
        // Note: YouTube often puts like buttons in shadow DOM or complex structures.
        
        // This is a simplified example.
        const LIKE_BUTTON_SELECTOR = '#segmented-like-button button';
        
        if (actionType === 'view') {
           // Wait for player to load
           await page.waitForSelector('#movie_player');
           // Ensure video is playing
           // Often YT auto-plays, but sometimes it doesn't.
           await page.evaluate(() => { 
                const player = document.querySelector('#movie_player'); 
                if (player && player.getPlayerState && player.getPlayerState() !== 1) player.playVideo();
           });
           
           // YOUTUBE SHORTS HACK:
           // A "View" on Shorts is less strict than long-form.
           // 5-8 seconds usually counts if coming from unique IPs.
           // REDUCED FROM 35s to 7s -> SAVES 80% DATA.
           await new Promise(r => setTimeout(r, 7000));
           return;
        }

        if (actionType === 'share') {
            const SHARE_BUTTON = 'button[aria-label="Share"]';
            await page.waitForSelector(SHARE_BUTTON);
            await page.click(SHARE_BUTTON);
            // Wait for dialog
            await new Promise(r => setTimeout(r, 2000));
            // Usually we just want to verify the share button works, or 'Copy Link'
            // For now, opening the dialog counts as an "interaction attempt"
            return;
        }

        if (actionType === 'like') {
            await page.waitForSelector(LIKE_BUTTON_SELECTOR, { timeout: 10000 });
            await page.click(LIKE_BUTTON_SELECTOR);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    */

  async handleInstagram(page, actionType) {
    // [SIMULATION MODE]
    return true;
  }

  /*
    async handleInstagram_LEGACY(page, actionType) {
        const LIKE_BUTTON_SELECTOR = 'svg[aria-label="Like"]'; // Often an SVG inside a button
        
        if (actionType === 'like') {
            await page.waitForSelector(LIKE_BUTTON_SELECTOR, { timeout: 10000 });
            // We usually need to click the parent button, not the SVG
            await page.evaluate((sel) => {
                const svg = document.querySelector(sel);
                if (svg) svg.closest('button').click();
            }, LIKE_BUTTON_SELECTOR);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    */
}

module.exports = new BotExecutionService();
