// Core interfaces for site extraction functionality

export interface SiteAsset {
  url: string;
  path: string;
  type: 'image' | 'stylesheet' | 'script' | 'font' | 'document' | 'other';
  mimeType?: string;
  content?: Buffer;
  size?: number;
}

export interface SitePage {
  url: string;
  path: string;
  title: string;
  content: string;
  assets: SiteAsset[];
  links: string[];
  metadata: Record<string, string>;
}

export interface SiteManifest {
  url: string;
  title: string;
  description: string;
  pages: SitePage[];
  assets: SiteAsset[];
  totalSize: number;
  extractedAt: Date;
  settings: ExtractionSettings;
}

export interface ExtractionManifest {
  url: string;
  title: string;
  description: string;
  totalPages: number;
  totalAssets: number;
  totalSize: number;
  extractedAt: string;
  pages: Array<{
    url: string;
    path: string;
    title: string;
    size: number;
  }>;
  assets: Array<{
    url: string;
    path: string;
    type: string;
    size: number;
  }>;
}

export interface ExtractionSettings {
  maxPages?: number;
  maxDepth?: number;
  includeAssets?: boolean;
  followExternalLinks?: boolean;
  respectRobotsTxt?: boolean;
  delay?: number; // milliseconds between requests
  timeout?: number; // request timeout in milliseconds
  userAgent?: string;
  excludePatterns?: string[];
  includePatterns?: string[];
}

export interface ExtractionProgress {
  stage: 'analyzing' | 'crawling' | 'downloading' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  pagesFound: number;
  pagesProcessed: number;
  assetsFound: number;
  assetsDownloaded: number;
  errors: string[];
}

export interface SiteAnalysis {
  platform: string;
  estimatedPages: number;
  estimatedAssets: number;
  estimatedSize: number;
  structure: {
    hasNavigation: boolean;
    hasBlog: boolean;
    hasEcommerce: boolean;
    hasForms: boolean;
    hasSearch: boolean;
  };
  challenges: string[];
  recommendations: string[];
}

export interface ExtractionJob {
  id: string;
  url: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: ExtractionProgress;
  manifest?: SiteManifest;
  createdAt: Date;
  completedAt?: Date;
}

// Abstract interface for site extractors
export interface SiteExtractor {
  extract(url: string, settings: ExtractionSettings): Promise<SiteManifest>;
  analyzeUrl(url: string): Promise<SiteAnalysis>;
  addProgressListener(callback: (progress: ExtractionProgress) => void): void;
} 