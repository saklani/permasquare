import * as cheerio from 'cheerio';
import { Browser, launch } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { URL } from 'url';
import { saveFile } from './storage';

export interface ExtractionResult {
  savedPages: string[];
  totalPages: number;
  savedAssets: string[];
  totalAssets: number;
}

export interface SiteAnalysis {
  platform: string;
  content: string;
  structure: {
    hasBlog: boolean;
    hasEcommerce: boolean;
    hasForms: boolean;
  };
  challenges: string[];
  recommendations: string[];
}

let browserInstance: Browser | null = null;

export async function crawlAndSave(
  startUrl: string,
  options: { maxPages?: number; delay?: number } = {}
): Promise<ExtractionResult> {
  const { maxPages = 100, delay = 1000 } = options;

  console.log(`🚀 [Crawl] Starting crawl for: ${startUrl}`);

  const browser = await getBrowser();
  const visited = new Set<string>();
  const queue = [startUrl];
  const savedPages: string[] = [];
  const assetQueue = new Set<string>();
  const savedAssets: string[] = [];

  while (queue.length > 0 && savedPages.length < maxPages) {
    const currentUrl = queue.shift()!;

    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    console.log(`📄 [Crawl] Processing page ${savedPages.length + 1}/${maxPages}: ${currentUrl}`);

    try {
      const page = await browser.newPage();

      try {
        await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 15000 });
        const content = await page.content();
        const $ = cheerio.load(content);

        // Save page using URL without protocol as S3 key, handle / with index.html
        let s3Key = currentUrl.replace(/^https?:\/\//, '');
        if (s3Key.endsWith('/')) {
          s3Key += 'index.html';
        } else {
          // Add .html extension to files without an extension
          const lastSlashIndex = s3Key.lastIndexOf('/');
          const filename = lastSlashIndex !== -1 ? s3Key.substring(lastSlashIndex + 1) : s3Key;

          // Check if filename has an extension (contains a dot after the last slash)
          if (!filename.includes('.')) {
            s3Key += '.html';
          }
        }
        console.log(`💾 [Save] Saving to S3 with key: ${s3Key}`);
        await saveFile(s3Key, content, 'text/html');

        const pageSize = Buffer.byteLength(content, 'utf8');
        console.log(`✅ [Save] Page saved: ${currentUrl} (${pageSize} bytes)`);
        savedPages.push(currentUrl);

        // Extract and queue assets (CSS, JS, images, fonts)
        await extractAssets($, currentUrl, startUrl, assetQueue);

        // Extract links for further crawling
        const links: string[] = [];
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;

          try {
            const fullUrl = new URL(href, currentUrl).href;
            if (isSameDomain(fullUrl, startUrl)) {
              links.push(fullUrl);
            }
          } catch {
            // Ignore invalid URLs
          }
        });

        // Add new links to queue
        const newLinks = links.filter((link: string) => !visited.has(link));
        queue.push(...newLinks.slice(0, 10)); // Limit new links per page

      } finally {
        await page.close();
      }

      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      console.error(`❌ [Crawl] Failed to process ${currentUrl}:`, error);
    }
  }

  // Download all discovered assets
  console.log(`🎨 [Assets] Downloading ${assetQueue.size} assets...`);
  for (const assetUrl of assetQueue) {
    try {
      const success = await downloadAsset(assetUrl, startUrl);
      if (success) {
        savedAssets.push(assetUrl);
      }
    } catch (error) {
      console.error(`❌ [Assets] Failed to download ${assetUrl}:`, error);
    }
  }

  console.log(`✅ [Crawl] Complete. Saved ${savedPages.length} pages and ${savedAssets.length} assets`);

  return {
    savedPages,
    totalPages: savedPages.length,
    savedAssets,
    totalAssets: savedAssets.length
  };
}

async function extractAssets(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  startUrl: string,
  assetQueue: Set<string>
): Promise<void> {
  const baseUrl = new URL(pageUrl);

  // Extract CSS files from <link> tags
  $('link[rel="stylesheet"], link[type="text/css"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      try {
        const fullUrl = new URL(href, pageUrl).href;
        if (isSameDomain(fullUrl, startUrl)) {
          assetQueue.add(fullUrl);
          console.log(`🎨 [Asset] Found CSS: ${fullUrl}`);
        }
      } catch {
        // Ignore invalid URLs
      }
    }
  });

  // Extract JavaScript files
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      try {
        const fullUrl = new URL(src, pageUrl).href;
        if (isSameDomain(fullUrl, startUrl)) {
          assetQueue.add(fullUrl);
          console.log(`📜 [Asset] Found JS: ${fullUrl}`);
        }
      } catch {
        // Ignore invalid URLs
      }
    }
  });

  // Extract images
  $('img[src], img[data-src]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src) {
      try {
        const fullUrl = new URL(src, pageUrl).href;
        if (isSameDomain(fullUrl, startUrl)) {
          assetQueue.add(fullUrl);
          console.log(`🖼️ [Asset] Found image: ${fullUrl}`);
        }
      } catch {
        // Ignore invalid URLs
      }
    }
  });

  // Extract fonts and other assets from CSS @import and url()
  $('style').each((_, el) => {
    const cssContent = $(el).text();
    extractCssAssets(cssContent, pageUrl, startUrl, assetQueue);
  });

  // Extract background images and other CSS assets from inline styles
  $('[style]').each((_, el) => {
    const styleAttr = $(el).attr('style');
    if (styleAttr) {
      extractCssAssets(styleAttr, pageUrl, startUrl, assetQueue);
    }
  });

  // Extract favicon and icons
  $('link[rel*="icon"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      try {
        const fullUrl = new URL(href, pageUrl).href;
        if (isSameDomain(fullUrl, startUrl)) {
          assetQueue.add(fullUrl);
          console.log(`🏷️ [Asset] Found icon: ${fullUrl}`);
        }
      } catch {
        // Ignore invalid URLs
      }
    }
  });
}

function extractCssAssets(
  cssContent: string,
  pageUrl: string,
  startUrl: string,
  assetQueue: Set<string>
): void {
  // Extract @import statements
  const importRegex = /@import\s+(?:url\()?['"](.*?)['"](?:\))?/g;
  let match;
  while ((match = importRegex.exec(cssContent)) !== null) {
    try {
      const fullUrl = new URL(match[1], pageUrl).href;
      if (isSameDomain(fullUrl, startUrl)) {
        assetQueue.add(fullUrl);
        console.log(`📥 [Asset] Found @import: ${fullUrl}`);
      }
    } catch {
      // Ignore invalid URLs
    }
  }

  // Extract url() references (fonts, images, etc.)
  const urlRegex = /url\(['"]?(.*?)['"]?\)/g;
  while ((match = urlRegex.exec(cssContent)) !== null) {
    try {
      const fullUrl = new URL(match[1], pageUrl).href;
      if (isSameDomain(fullUrl, startUrl)) {
        assetQueue.add(fullUrl);
        console.log(`🔗 [Asset] Found CSS url(): ${fullUrl}`);
      }
    } catch {
      // Ignore invalid URLs
    }
  }
}

async function downloadAsset(assetUrl: string, startUrl: string): Promise<boolean> {
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      // Set appropriate headers for different asset types
      await page.setExtraHTTPHeaders({
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (compatible; Permasquare/1.0)'
      });

      const response = await page.goto(assetUrl, { timeout: 10000 });

      if (!response || response.status() !== 200) {
        console.warn(`⚠️ [Asset] Non-200 response for ${assetUrl}: ${response?.status()}`);
        return false;
      }

      const content = await response.buffer();
      const contentType = response.headers()['content-type'] || getMimeTypeFromUrl(assetUrl);

      // Create S3 key from URL
      const s3Key = assetUrl.replace(/^https?:\/\//, '');

      console.log(`💾 [Asset] Saving to S3: ${s3Key} (${content.length} bytes, ${contentType})`);
      await saveFile(s3Key, content, contentType);

      return true;
    } finally {
      await page.close();
    }
  } catch (error) {
    console.error(`❌ [Asset] Failed to download ${assetUrl}:`, error);
    return false;
  }
}

function getMimeTypeFromUrl(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'css': 'text/css',
    'js': 'application/javascript',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject',
    'otf': 'font/otf'
  };

  return mimeTypes[ext || ''] || 'application/octet-stream';
}

export async function analyzeSite(url: string): Promise<SiteAnalysis> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    const content = await page.content();
    const $ = cheerio.load(content);

    const platform = detectPlatform(content);
    const structure = analyzeStructure($);

    return {
      platform,
      content,
      structure,
      challenges: getChallenges(platform, structure),
      recommendations: getRecommendations(platform, structure)
    };
  } finally {
    await page.close();
  }
}

export async function cleanup(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    // Serverless environment configuration
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;

    browserInstance = await launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  return browserInstance;
}

function isSameDomain(url1: string, url2: string): boolean {
  try {
    return new URL(url1).hostname === new URL(url2).hostname;
  } catch {
    return false;
  }
}

function detectPlatform(content: string): string {
  const platforms = [
    { name: 'squarespace', indicators: ['squarespace', 'Squarespace'] },
    { name: 'wordpress', indicators: ['wp-content'] },
    { name: 'wix', indicators: ['wix.com'] },
    { name: 'webflow', indicators: ['webflow'] },
    { name: 'shopify', indicators: ['shopify'] },
    { name: 'next.js', indicators: ['__NEXT_DATA__'] },
    { name: 'sveltekit', indicators: ['data-sveltekit-preload-data'] }
  ];

  for (const platform of platforms) {
    if (platform.indicators.some(indicator => content.includes(indicator))) {
      return platform.name;
    }
  }

  return 'unknown';
}

function analyzeStructure($: cheerio.CheerioAPI) {
  return {
    hasBlog: $('body').text().toLowerCase().includes('blog'),
    hasEcommerce: $('.cart, .shop, .product, .price').length > 0,
    hasForms: $('form').length > 0
  };
}

function getChallenges(platform: string, structure: any): string[] {
  const challenges: string[] = [];
  if (platform === 'squarespace') challenges.push('May have dynamic content');
  if (structure.hasEcommerce) challenges.push('E-commerce features won\'t work');
  if (structure.hasForms) challenges.push('Forms need replacement');
  return challenges;
}

function getRecommendations(platform: string, structure: any): string[] {
  const recommendations: string[] = [];
  recommendations.push('Test all links after deployment');
  recommendations.push('Verify images load correctly');
  if (structure.hasForms) recommendations.push('Use third-party form service');
  return recommendations;
} 