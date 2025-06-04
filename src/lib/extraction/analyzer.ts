import * as puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { SiteAnalysis } from '@/types/extraction';
import { URLUtils, AssetUtils } from './utils';

export class SiteAnalyzer {
  private browser: puppeteer.Browser | null = null;

  async analyzeUrl(url: string): Promise<SiteAnalysis> {
    await this.initBrowser();
    
    try {
      const page = await this.browser!.newPage();
      
      // Set a reasonable timeout
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      
      // Get page content
      const content = await page.content();
      const $ = cheerio.load(content);
      
      // Detect platform
      const platform = this.detectPlatform($, content);
      
      // Analyze structure
      const structure = this.analyzeStructure($);
      
      // Estimate content
      const estimates = await this.estimateContent($, url);
      
      // Generate challenges and recommendations
      const challenges = this.identifyChallenges(platform, structure);
      const recommendations = this.generateRecommendations(platform, structure);
      
      await page.close();
      
      return {
        platform,
        estimatedPages: estimates.pages,
        estimatedAssets: estimates.assets,
        estimatedSize: estimates.size,
        structure,
        challenges,
        recommendations
      };
      
    } catch (error) {
      throw new Error(`Failed to analyze site: ${error}`);
    }
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
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

  private detectPlatform($: cheerio.CheerioAPI, content: string): string {
    // Check for Squarespace
    if (content.includes('squarespace') || 
        content.includes('Squarespace') ||
        $('meta[name="generator"]').attr('content')?.includes('Squarespace') ||
        $('script[src*="squarespace"]').length > 0) {
      return 'squarespace';
    }
    
    // Check for WordPress
    if (content.includes('wp-content') ||
        content.includes('wordpress') ||
        $('meta[name="generator"]').attr('content')?.includes('WordPress') ||
        $('link[href*="wp-content"]').length > 0) {
      return 'wordpress';
    }
    
    // Check for Wix
    if (content.includes('wix.com') ||
        content.includes('_wixCIDX') ||
        $('meta[name="generator"]').attr('content')?.includes('Wix') ||
        $('script[src*="wix"]').length > 0) {
      return 'wix';
    }
    
    // Check for Webflow
    if (content.includes('webflow') ||
        $('meta[name="generator"]').attr('content')?.includes('Webflow') ||
        $('script[src*="webflow"]').length > 0) {
      return 'webflow';
    }
    
    // Check for Shopify
    if (content.includes('shopify') ||
        content.includes('Shopify') ||
        $('meta[name="generator"]').attr('content')?.includes('Shopify') ||
        $('script[src*="shopify"]').length > 0) {
      return 'shopify';
    }
    
    // Check for Ghost
    if (content.includes('ghost') ||
        $('meta[name="generator"]').attr('content')?.includes('Ghost')) {
      return 'ghost';
    }
    
    // Check for Jekyll
    if ($('meta[name="generator"]').attr('content')?.includes('Jekyll')) {
      return 'jekyll';
    }
    
    // Check for Hugo
    if ($('meta[name="generator"]').attr('content')?.includes('Hugo')) {
      return 'hugo';
    }
    
    // Check for React/Next.js
    if (content.includes('__NEXT_DATA__') || 
        $('script[src*="next"]').length > 0) {
      return 'nextjs';
    }
    
    // Check for Gatsby
    if (content.includes('___gatsby') ||
        $('script[src*="gatsby"]').length > 0) {
      return 'gatsby';
    }
    
    // Check for Drupal
    if (content.includes('drupal') ||
        $('meta[name="generator"]').attr('content')?.includes('Drupal')) {
      return 'drupal';
    }
    
    return 'unknown';
  }

  private analyzeStructure($: cheerio.CheerioAPI): SiteAnalysis['structure'] {
    return {
      hasNavigation: this.hasNavigation($),
      hasBlog: this.hasBlog($),
      hasEcommerce: this.hasEcommerce($),
      hasForms: this.hasForms($),
      hasSearch: this.hasSearch($)
    };
  }

  private hasNavigation($: cheerio.CheerioAPI): boolean {
    // Look for common navigation elements
    const navSelectors = [
      'nav',
      '.nav',
      '.navigation',
      '.menu',
      '.main-menu',
      'ul.nav',
      '.navbar',
      'header nav'
    ];
    
    return navSelectors.some(selector => $(selector).length > 0);
  }

  private hasBlog($: cheerio.CheerioAPI): boolean {
    // Look for blog-related elements
    const blogIndicators = [
      'blog',
      'post',
      'article',
      'news'
    ];
    
    const text = $('body').text().toLowerCase();
    const links = $('a').map((_, el) => $(el).attr('href')).get();
    
    return blogIndicators.some(indicator => 
      text.includes(indicator) || 
      links.some(link => link?.includes(indicator))
    );
  }

  private hasEcommerce($: cheerio.CheerioAPI): boolean {
    // Look for e-commerce elements
    const ecommerceSelectors = [
      '.cart',
      '.shop',
      '.store',
      '.product',
      '.price',
      '.buy',
      '.checkout',
      '[data-cart]',
      '.add-to-cart'
    ];
    
    const ecommerceText = ['cart', 'shop', 'buy', 'price', '$', '€', '£'];
    const text = $('body').text().toLowerCase();
    
    return ecommerceSelectors.some(selector => $(selector).length > 0) ||
           ecommerceText.some(term => text.includes(term));
  }

  private hasForms($: cheerio.CheerioAPI): boolean {
    return $('form').length > 0 || 
           $('input[type="email"]').length > 0 ||
           $('textarea').length > 0;
  }

  private hasSearch($: cheerio.CheerioAPI): boolean {
    return $('input[type="search"]').length > 0 ||
           $('[placeholder*="search" i]').length > 0 ||
           $('.search').length > 0;
  }

  private async estimateContent($: cheerio.CheerioAPI, baseUrl: string): Promise<{
    pages: number;
    assets: number;
    size: number;
  }> {
    // Count internal links for page estimation
    const internalLinks = new Set<string>();
    
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const absoluteUrl = URLUtils.normalizeUrl(href, baseUrl);
        if (URLUtils.isValidUrl(absoluteUrl) && URLUtils.isSameDomain(absoluteUrl, baseUrl)) {
          internalLinks.add(absoluteUrl);
        }
      }
    });
    
    // Count assets
    const assets = new Set<string>();
    
    // Images
    $('img[src]').each((_, element) => {
      const src = $(element).attr('src');
      if (src && AssetUtils.isValidAsset(URLUtils.normalizeUrl(src, baseUrl))) {
        assets.add(src);
      }
    });
    
    // Stylesheets
    $('link[rel="stylesheet"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && AssetUtils.isValidAsset(URLUtils.normalizeUrl(href, baseUrl))) {
        assets.add(href);
      }
    });
    
    // Scripts
    $('script[src]').each((_, element) => {
      const src = $(element).attr('src');
      if (src && AssetUtils.isValidAsset(URLUtils.normalizeUrl(src, baseUrl))) {
        assets.add(src);
      }
    });
    
    // Estimate total size
    const pageCount = Math.max(internalLinks.size, 1);
    const assetCount = assets.size;
    
    // Rough size estimation
    const avgPageSize = 50000; // 50KB per page
    const avgAssetSize = 30000; // 30KB per asset
    
    const estimatedSize = (pageCount * avgPageSize) + (assetCount * avgAssetSize);
    
    return {
      pages: pageCount,
      assets: assetCount,
      size: estimatedSize
    };
  }

  private identifyChallenges(platform: string, structure: SiteAnalysis['structure']): string[] {
    const challenges: string[] = [];
    
    // Platform-specific challenges
    switch (platform) {
      case 'squarespace':
        challenges.push('Squarespace sites may have dynamic content loading');
        challenges.push('Some templates use heavy JavaScript for interactions');
        break;
      case 'wix':
        challenges.push('Wix sites are heavily JavaScript-dependent');
        challenges.push('Content may be loaded dynamically after page load');
        break;
      case 'webflow':
        challenges.push('Webflow sites may have complex animations');
        challenges.push('Custom interactions might not work in static version');
        break;
      case 'shopify':
        challenges.push('E-commerce functionality will not work in static version');
        challenges.push('Dynamic cart and checkout features will be lost');
        break;
      case 'wordpress':
        challenges.push('Plugin-generated content may not be captured');
        challenges.push('Dynamic widgets might not render properly');
        break;
    }
    
    // Structure-specific challenges
    if (structure.hasEcommerce) {
      challenges.push('E-commerce features will become non-functional');
      challenges.push('Shopping cart and payment systems need special handling');
    }
    
    if (structure.hasForms) {
      challenges.push('Contact forms will need alternative submission methods');
      challenges.push('Form validation and processing will be lost');
    }
    
    if (structure.hasSearch) {
      challenges.push('Search functionality will need to be reimplemented');
      challenges.push('Dynamic search results cannot be preserved');
    }
    
    return challenges;
  }

  private generateRecommendations(platform: string, structure: SiteAnalysis['structure']): string[] {
    const recommendations: string[] = [];
    
    // General recommendations
    recommendations.push('Review the extracted site before final deployment');
    recommendations.push('Test all links to ensure they work correctly');
    
    // Platform-specific recommendations
    switch (platform) {
      case 'squarespace':
      case 'wix':
        recommendations.push('Allow extra time for JavaScript-heavy content to load');
        recommendations.push('Consider extracting multiple times to catch dynamic content');
        break;
      case 'shopify':
        recommendations.push('Consider adding static product catalogs for reference');
        recommendations.push('Include contact information for order inquiries');
        break;
    }
    
    // Structure-specific recommendations
    if (structure.hasForms) {
      recommendations.push('Replace forms with mailto links or external form services');
      recommendations.push('Document original form functionality for reference');
    }
    
    if (structure.hasEcommerce) {
      recommendations.push('Add clear notices about non-functional shopping features');
      recommendations.push('Provide alternative contact methods for purchases');
    }
    
    if (structure.hasSearch) {
      recommendations.push('Consider implementing static site search with Lunr.js');
      recommendations.push('Provide a sitemap for navigation without search');
    }
    
    recommendations.push('Optimize images and assets for faster loading on Arweave');
    recommendations.push('Test the archived site thoroughly before sharing');
    
    return recommendations;
  }
} 