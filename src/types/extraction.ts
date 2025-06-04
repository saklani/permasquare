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

// Removed ExtractionProgress - now using simplified Progress from @/types/progress

export interface SiteAnalysis {
  platform: string;
  content: string;
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
