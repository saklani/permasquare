import { Browser, launch } from 'puppeteer';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import { 
  SiteAnalysis, 
  ExtractionManifest,
  SiteAsset
} from '@/types/extraction';
import { Progress, ProgressCallback, createProgress, EXTRACTION_STEPS } from '@/types/progress';

// Simple types for internal use
interface PageData {
  url: string;
  path: string;
  title: string;
  content: string;
  assets: SiteAsset[];
  links: string[];
  metadata: Record<string, string>;
}

// Global browser instance
let browserInstance: Browser | null = null;

// ===== MAIN FUNCTIONS =====

export async function analyzeSite(url: string): Promise<SiteAnalysis> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    const content = await page.content();
    const $ = cheerio.load(content);
    
    const platform = detectPlatform($, content);
    const structure = analyzeStructure($);
    const estimates = estimateContent($);
    
    return {
      platform,
      content,
      estimatedPages: estimates.pages,
      estimatedAssets: estimates.assets,
      estimatedSize: estimates.size,
      structure,
      challenges: getChallenges(platform, structure),
      recommendations: getRecommendations(platform, structure)
    };
  } finally {
    await page.close();
  }
}

export async function extractSite(
  url: string, 
  options: {
    maxPages?: number;
    delay?: number;
    onProgress?: ProgressCallback;
  } = {}
): Promise<ExtractionManifest> {
  const { maxPages = 10, delay = 1000, onProgress } = options;
  
  try {
    // Stage 1: Analyze
    onProgress?.(createProgress(EXTRACTION_STEPS.ANALYZING, 10, 'Analyzing site...'));
    const analysis = await analyzeSite(url);
    
    // Stage 2: Extract pages
    onProgress?.(createProgress(EXTRACTION_STEPS.CRAWLING, 20, 'Extracting pages...'));
    const pages = await extractPages(url, maxPages, delay, onProgress);
    
    // Stage 3: Process assets
    onProgress?.(createProgress(EXTRACTION_STEPS.DOWNLOADING, 80, 'Processing assets...'));
    const assets = collectAssets(pages);
    
    onProgress?.(createProgress(EXTRACTION_STEPS.COMPLETE, 100, 'Extraction complete!'));

    return {
      url,
      title: pages[0]?.title || 'Extracted Site',
      description: `Site extracted from ${url}`,
      totalPages: pages.length,
      totalAssets: assets.length,
      totalSize: calculateTotalSize(pages, assets),
      extractedAt: new Date().toISOString(),
      pages: pages.map(p => ({
        url: p.url,
        path: p.path,
        title: p.title,
        size: Buffer.byteLength(p.content, 'utf8')
      })),
      assets: assets.map(a => ({
        url: a.url,
        path: a.path,
        type: a.type,
        size: a.size || estimateAssetSize(a.type)
      }))
    };
    
  } catch (error) {
    throw error;
  }
}

export async function cleanup(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// ===== HELPER FUNCTIONS =====

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserInstance;
}

async function extractPages(
  startUrl: string, 
  maxPages: number, 
  delay: number,
  onProgress?: ProgressCallback
): Promise<PageData[]> {
  const browser = await getBrowser();
  const pages: PageData[] = [];
  const visited = new Set<string>();
  const queue = [startUrl];

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;
    
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const percent = 20 + (pages.length / maxPages) * 50;
      onProgress?.(createProgress(EXTRACTION_STEPS.CRAWLING, percent, `Extracting: ${url}`));

      const pageData = await extractSinglePage(browser, url);
      pages.push(pageData);

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.error(`Failed to extract ${url}:`, error);
    }
  }

  return pages;
}

async function extractSinglePage(browser: Browser, url: string): Promise<PageData> {
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    const content = await page.content();
    const $ = cheerio.load(content);
    
    const title = $('title').text() || 'Untitled Page';
    const path = getPathFromUrl(url);
    const assets = extractAssets($, url);
    const links = extractLinks($, url);
    const metadata = extractMetadata(content);

    return {
      url,
      path,
      title,
      content,
      assets,
      links,
      metadata
    };
  } finally {
    await page.close();
  }
}

function detectPlatform($: cheerio.CheerioAPI, content: string): string {
  if (content.includes('squarespace') || content.includes('Squarespace')) return 'squarespace';
  if (content.includes('wp-content')) return 'wordpress';
  if (content.includes('wix.com')) return 'wix';
  if (content.includes('webflow')) return 'webflow';
  if (content.includes('shopify')) return 'shopify';
  return 'unknown';
}

function analyzeStructure($: cheerio.CheerioAPI) {
  return {
    hasNavigation: $('nav, .nav, .navigation, .menu').length > 0,
    hasBlog: $('body').text().toLowerCase().includes('blog'),
    hasEcommerce: $('.cart, .shop, .product, .price').length > 0,
    hasForms: $('form').length > 0,
    hasSearch: $('input[type="search"], .search').length > 0
  };
}

function estimateContent($: cheerio.CheerioAPI) {
  const links = $('a[href]').length;
  const images = $('img').length;
  const scripts = $('script[src]').length;
  const styles = $('link[rel="stylesheet"]').length;
  
  return {
    pages: Math.min(links + 1, 50),
    assets: images + scripts + styles,
    size: (images * 50000) + (scripts * 30000) + (styles * 20000) + 100000
  };
}

function extractAssets($: cheerio.CheerioAPI, baseUrl: string): SiteAsset[] {
  const assets: SiteAsset[] = [];
  
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src) assets.push(createAsset(src, baseUrl, 'image'));
  });
  
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src) assets.push(createAsset(src, baseUrl, 'script'));
  });
  
  $('link[rel="stylesheet"][href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) assets.push(createAsset(href, baseUrl, 'stylesheet'));
  });
  
  return assets;
}

function extractLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const links: string[] = [];
  
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('#') && !href.startsWith('mailto:')) {
      try {
        const fullUrl = new URL(href, baseUrl).href;
        if (isSameDomain(fullUrl, baseUrl)) {
          links.push(fullUrl);
        }
      } catch {
        // Ignore invalid URLs
      }
    }
  });
  
  return [...new Set(links)];
}

function extractMetadata(html: string): Record<string, string> {
  const metadata: Record<string, string> = {};
  
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) metadata.title = titleMatch[1].trim();
  
  const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);
  if (descMatch) metadata.description = descMatch[1];
  
  return metadata;
}

function createAsset(url: string, baseUrl: string, type: SiteAsset['type']): SiteAsset {
  try {
    const fullUrl = new URL(url, baseUrl).href;
    return {
      url: fullUrl,
      path: getAssetPath(fullUrl),
      type,
      mimeType: getMimeType(fullUrl),
      size: estimateAssetSize(type)
    };
  } catch {
    return {
      url,
      path: 'assets/unknown',
      type,
      size: 1000
    };
  }
}

function collectAssets(pages: PageData[]): SiteAsset[] {
  const allAssets: SiteAsset[] = [];
  const seen = new Set<string>();
  
  for (const page of pages) {
    for (const asset of page.assets) {
      if (!seen.has(asset.url)) {
        seen.add(asset.url);
        allAssets.push(asset);
      }
    }
  }
  
  return allAssets;
}

// ===== UTILITY FUNCTIONS =====

function getPathFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname;
    
    if (path === '/') return 'index.html';
    if (path.endsWith('/')) path += 'index.html';
    else if (!path.includes('.')) path += '.html';
    
    return path.slice(1).replace(/[^a-zA-Z0-9._/-]/g, '_');
  } catch {
    return 'page.html';
  }
}

function getAssetPath(url: string): string {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.replace(/[^a-zA-Z0-9._/-]/g, '_');
    return 'assets' + path;
  } catch {
    return 'assets/unknown';
  }
}

function isSameDomain(url1: string, url2: string): boolean {
  try {
    return new URL(url1).hostname === new URL(url2).hostname;
  } catch {
    return false;
  }
}

function getMimeType(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase();
  const mimes: Record<string, string> = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
    'css': 'text/css', 'js': 'application/javascript'
  };
  return ext ? mimes[ext] || 'application/octet-stream' : 'application/octet-stream';
}

function estimateAssetSize(type: SiteAsset['type']): number {
  const sizes = {
    image: 50000,
    stylesheet: 20000,
    script: 30000,
    font: 100000,
    document: 500000,
    other: 10000
  };
  return sizes[type];
}

function calculateTotalSize(pages: PageData[], assets: SiteAsset[]): number {
  const pageSize = pages.reduce((sum, page) => sum + Buffer.byteLength(page.content, 'utf8'), 0);
  const assetSize = assets.reduce((sum, asset) => sum + (asset.size || 0), 0);
  return pageSize + assetSize;
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