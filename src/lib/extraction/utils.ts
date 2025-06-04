import { URL } from 'url';
import { SiteAsset, ExtractionProgress } from '@/types/extraction';

export class URLUtils {
  static normalizeUrl(url: string, baseUrl?: string): string {
    try {
      // Handle relative URLs
      if (baseUrl && !url.startsWith('http')) {
        return new URL(url, baseUrl).href;
      }
      
      // Normalize absolute URLs
      const urlObj = new URL(url);
      
      // Remove fragments and unnecessary query params
      urlObj.hash = '';
      
      // Remove trailing slashes except for root
      if (urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      
      return urlObj.href;
    } catch {
      return url; // Return original if parsing fails
    }
  }

  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }

  static isSameDomain(url1: string, url2: string): boolean {
    try {
      const domain1 = new URL(url1).hostname;
      const domain2 = new URL(url2).hostname;
      return domain1 === domain2;
    } catch {
      return false;
    }
  }

  static getPathFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      let path = urlObj.pathname;
      
      // Convert to filename-safe path
      if (path === '/') {
        return 'index.html';
      }
      
      if (path.endsWith('/')) {
        path += 'index.html';
      } else if (!path.includes('.')) {
        path += '.html';
      }
      
      // Remove leading slash and sanitize
      return path.slice(1).replace(/[^a-zA-Z0-9._/-]/g, '_');
    } catch {
      return 'page.html';
    }
  }

  static getAssetPath(assetUrl: string, baseUrl: string): string {
    try {
      const urlObj = new URL(assetUrl);
      let path = urlObj.pathname;
      
      // Sanitize path
      path = path.replace(/[^a-zA-Z0-9._/-]/g, '_');
      
      // Ensure we have an extension
      if (!path.includes('.')) {
        path += '.asset';
      }
      
      return 'assets' + path;
    } catch {
      return 'assets/unknown.asset';
    }
  }

  static getDomainFromUrl(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }
}

export class AssetUtils {
  static getAssetType(url: string): SiteAsset['type'] {
    const extension = url.split('.').pop()?.toLowerCase();
    
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
    const styleExtensions = ['css'];
    const scriptExtensions = ['js', 'jsx', 'ts', 'tsx'];
    const fontExtensions = ['woff', 'woff2', 'ttf', 'otf', 'eot'];
    const documentExtensions = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
    
    if (extension) {
      if (imageExtensions.includes(extension)) return 'image';
      if (styleExtensions.includes(extension)) return 'stylesheet';
      if (scriptExtensions.includes(extension)) return 'script';
      if (fontExtensions.includes(extension)) return 'font';
      if (documentExtensions.includes(extension)) return 'document';
    }
    
    return 'other';
  }

  static getMimeType(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      // Images
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'bmp': 'image/bmp',
      'ico': 'image/x-icon',
      
      // Styles
      'css': 'text/css',
      
      // Scripts
      'js': 'application/javascript',
      'jsx': 'application/javascript',
      'ts': 'application/typescript',
      'tsx': 'application/typescript',
      
      // Fonts
      'woff': 'font/woff',
      'woff2': 'font/woff2',
      'ttf': 'font/ttf',
      'otf': 'font/otf',
      'eot': 'application/vnd.ms-fontobject',
      
      // Documents
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'rtf': 'application/rtf',
      
      // Other
      'html': 'text/html',
      'xml': 'application/xml',
      'json': 'application/json'
    };
    
    return extension ? mimeTypes[extension] || 'application/octet-stream' : 'application/octet-stream';
  }

  static isValidAsset(url: string): boolean {
    // Filter out data URLs, mailto links, etc.
    if (url.startsWith('data:') || url.startsWith('mailto:') || url.startsWith('tel:')) {
      return false;
    }
    
    // Must be a valid HTTP/HTTPS URL
    return URLUtils.isValidUrl(url);
  }

  static estimateAssetSize(assetType: SiteAsset['type']): number {
    // Rough estimates in bytes
    const estimates = {
      image: 50000,      // 50KB average
      stylesheet: 20000, // 20KB average
      script: 30000,     // 30KB average
      font: 100000,      // 100KB average
      document: 500000,  // 500KB average
      other: 10000       // 10KB average
    };
    
    return estimates[assetType];
  }
}

export class ContentUtils {
  static extractMetadata(html: string): Record<string, string> {
    const metadata: Record<string, string> = {};
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }
    
    // Extract meta tags
    const metaMatches = html.matchAll(/<meta[^>]+>/gi);
    for (const match of metaMatches) {
      const metaTag = match[0];
      
      // Extract name and content
      const nameMatch = metaTag.match(/name\s*=\s*["']([^"']+)["']/i);
      const contentMatch = metaTag.match(/content\s*=\s*["']([^"']+)["']/i);
      
      if (nameMatch && contentMatch) {
        metadata[nameMatch[1]] = contentMatch[1];
      }
      
      // Extract property and content (for Open Graph, etc.)
      const propertyMatch = metaTag.match(/property\s*=\s*["']([^"']+)["']/i);
      if (propertyMatch && contentMatch) {
        metadata[propertyMatch[1]] = contentMatch[1];
      }
    }
    
    return metadata;
  }

  static cleanHtml(html: string): string {
    // Remove scripts and noscript tags
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
    
    // Remove comments
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    
    // Remove unnecessary whitespace
    html = html.replace(/\s+/g, ' ');
    
    return html.trim();
  }

  static extractText(html: string): string {
    // Simple text extraction (in real implementation, you'd use a proper HTML parser)
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static estimateReadingTime(text: string): number {
    const wordsPerMinute = 200;
    const wordCount = text.split(/\s+/).length;
    return Math.ceil(wordCount / wordsPerMinute);
  }
}

export class ProgressTracker {
  private listeners: Array<(progress: ExtractionProgress) => void> = [];

  addListener(callback: (progress: ExtractionProgress) => void): void {
    this.listeners.push(callback);
  }

  removeListener(callback: (progress: ExtractionProgress) => void): void {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  notify(progress: ExtractionProgress): void {
    this.listeners.forEach(listener => {
      try {
        listener(progress);
      } catch (error) {
        console.error('Progress listener error:', error);
      }
    });
  }

  clear(): void {
    this.listeners = [];
  }
} 