import * as cheerio from 'cheerio';
import { Browser, launch } from 'puppeteer';
import { URL } from 'url';
import { saveFile } from './storage';

export interface ExtractionResult {
  savedPages: string[];
  totalPages: number;
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

  console.log(`✅ [Crawl] Complete. Saved ${savedPages.length} pages`);
  
  return {
    savedPages,
    totalPages: savedPages.length
  };
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
    browserInstance = await launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
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