import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { 
  SiteExtractor, 
  SiteManifest, 
  SitePage, 
  SiteAsset, 
  ExtractionSettings, 
  ExtractionProgress, 
  SiteAnalysis 
} from '@/types/extraction';
import { URLUtils, AssetUtils, ContentUtils, ProgressTracker } from './utils';
import { SiteAnalyzer } from './analyzer';

export class GenericSiteExtractor implements SiteExtractor {
  private browser: puppeteer.Browser | null = null;
  private analyzer: SiteAnalyzer;
  private progressTracker: ProgressTracker;
  private visitedUrls: Set<string> = new Set();
  private foundAssets: Set<string> = new Set();

  constructor() {
    this.analyzer = new SiteAnalyzer();
    this.progressTracker = new ProgressTracker();
  }

  addProgressListener(callback: (progress: ExtractionProgress) => void) {
    this.progressTracker.addListener(callback);
  }

  async analyzeUrl(url: string): Promise<SiteAnalysis> {
    return await this.analyzer.analyzeUrl(url);
  }

  async extract(url: string, settings: ExtractionSettings): Promise<SiteManifest> {
    // Initialize
    this.visitedUrls.clear();
    this.foundAssets.clear();
    await this.initBrowser();

    const progress: ExtractionProgress = {
      stage: 'analyzing',
      progress: 0,
      message: 'Analyzing site structure...',
      pagesFound: 0,
      pagesProcessed: 0,
      assetsFound: 0,
      assetsDownloaded: 0,
      errors: []
    };

    try {
      // Stage 1: Analyze the site
      this.updateProgress(progress, { message: 'Analyzing site structure...' });
      const analysis = await this.analyzeUrl(url);
      
      // Stage 2: Crawl pages
      this.updateProgress(progress, { 
        stage: 'crawling', 
        progress: 10,
        message: 'Discovering pages...' 
      });
      
      const pages = await this.crawlPages(url, settings, progress);
      
      // Stage 3: Download assets
      this.updateProgress(progress, { 
        stage: 'downloading', 
        progress: 60,
        message: 'Downloading assets...',
        pagesFound: pages.length 
      });
      
      const assets = await this.downloadAssets(url, pages, settings, progress);
      
      // Complete
      this.updateProgress(progress, { 
        stage: 'complete', 
        progress: 100,
        message: 'Extraction complete!' 
      });

      const manifest: SiteManifest = {
        url,
        title: `Extracted Site`,
        description: `Site extracted from ${url}`,
        pages,
        assets,
        totalSize: this.calculateTotalSize(pages, assets),
        extractedAt: new Date(),
        settings
      };

      return manifest;

    } catch (error) {
      this.updateProgress(progress, { 
        stage: 'error', 
        message: `Extraction failed: ${error}`,
        errors: [...progress.errors, error.toString()] 
      });
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  private async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    await this.analyzer.closeBrowser();
  }

  private async crawlPages(
    startUrl: string, 
    settings: ExtractionSettings, 
    progress: ExtractionProgress
  ): Promise<SitePage[]> {
    const pages: SitePage[] = [];
    const urlQueue: string[] = [startUrl];
    const maxPages = settings.maxPages || 10; // Start small
    
    while (urlQueue.length > 0 && pages.length < maxPages) {
      const currentUrl = urlQueue.shift()!;
      
      if (this.visitedUrls.has(currentUrl)) {
        continue;
      }
      
      try {
        this.visitedUrls.add(currentUrl);
        
        this.updateProgress(progress, {
          progress: 10 + (pages.length / maxPages) * 40,
          message: `Crawling: ${currentUrl}`,
          pagesProcessed: pages.length
        });

        const page = await this.extractPage(currentUrl, settings);
        pages.push(page);

        // Add delay between requests
        if (settings.delay) {
          await new Promise(resolve => setTimeout(resolve, settings.delay));
        }

      } catch (error) {
        progress.errors.push(`Failed to crawl ${currentUrl}: ${error}`);
      }
    }

    return pages;
  }

  private async extractPage(url: string, settings: ExtractionSettings): Promise<SitePage> {
    const page = await this.browser!.newPage();
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      
      const content = await page.content();
      const $ = cheerio.load(content);
      
      const title = $('title').text() || 'Untitled Page';
      const metadata = ContentUtils.extractMetadata(content);
      const links = this.extractLinks($, url);
      const assets = this.extractAssets($, url);
      
      return {
        url,
        path: URLUtils.getPathFromUrl(url),
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

  private extractLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const links: string[] = [];
    
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const absoluteUrl = URLUtils.normalizeUrl(href, baseUrl);
        if (URLUtils.isValidUrl(absoluteUrl) && URLUtils.isSameDomain(absoluteUrl, baseUrl)) {
          links.push(absoluteUrl);
        }
      }
    });
    
    return [...new Set(links)];
  }

  private extractAssets($: cheerio.CheerioAPI, baseUrl: string): SiteAsset[] {
    const assets: SiteAsset[] = [];
    
    // Images
    $('img[src]').each((_, element) => {
      const src = $(element).attr('src');
      if (src) {
        const absoluteUrl = URLUtils.normalizeUrl(src, baseUrl);
        assets.push({
          url: absoluteUrl,
          path: URLUtils.getAssetPath(absoluteUrl, baseUrl),
          type: AssetUtils.getAssetType(absoluteUrl),
          mimeType: AssetUtils.getMimeType(absoluteUrl)
        });
      }
    });
    
    // Stylesheets
    $('link[rel="stylesheet"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const absoluteUrl = URLUtils.normalizeUrl(href, baseUrl);
        assets.push({
          url: absoluteUrl,
          path: URLUtils.getAssetPath(absoluteUrl, baseUrl),
          type: 'stylesheet',
          mimeType: 'text/css'
        });
      }
    });
    
    // Scripts
    $('script[src]').each((_, element) => {
      const src = $(element).attr('src');
      if (src) {
        const absoluteUrl = URLUtils.normalizeUrl(src, baseUrl);
        assets.push({
          url: absoluteUrl,
          path: URLUtils.getAssetPath(absoluteUrl, baseUrl),
          type: 'script',
          mimeType: 'application/javascript'
        });
      }
    });
    
    return assets;
  }

  private async downloadAssets(
    baseUrl: string, 
    pages: SitePage[], 
    settings: ExtractionSettings,
    progress: ExtractionProgress
  ): Promise<SiteAsset[]> {
    const allAssets = new Map<string, SiteAsset>();
    
    pages.forEach(page => {
      page.assets.forEach(asset => {
        allAssets.set(asset.url, asset);
      });
    });

    const assets = Array.from(allAssets.values()).slice(0, 20); // Limit for demo
    const downloadedAssets: SiteAsset[] = [];

    this.updateProgress(progress, { assetsFound: assets.length });

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      
      try {
        this.updateProgress(progress, {
          progress: 60 + (i / assets.length) * 25,
          message: `Downloading: ${asset.url}`,
          assetsDownloaded: i
        });

        // Use global fetch in Node.js environment
        const fetchFunction = global.fetch || (await import('node-fetch')).default;
        const response = await fetchFunction(asset.url);
        
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const content = Buffer.from(arrayBuffer);
          downloadedAssets.push({
            ...asset,
            content,
            size: content.length
          });
        }

      } catch (error) {
        progress.errors.push(`Failed to download ${asset.url}: ${error}`);
      }
    }

    return downloadedAssets;
  }

  private calculateTotalSize(pages: SitePage[], assets: SiteAsset[]): number {
    const pageSize = pages.reduce((total, page) => total + page.content.length, 0);
    const assetSize = assets.reduce((total, asset) => total + (asset.size || 0), 0);
    return pageSize + assetSize;
  }

  private updateProgress(current: ExtractionProgress, updates: Partial<ExtractionProgress>) {
    Object.assign(current, updates);
    this.progressTracker.notify(current);
  }
} 