import { NextRequest, NextResponse } from 'next/server';
import { GenericSiteExtractor } from '@/lib/extraction/extractor';
import { ExtractionSettings, ExtractionProgress } from '@/types/extraction';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, settings = {}, action = 'analyze' } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL provided' },
        { status: 400 }
      );
    }

    const defaultSettings: ExtractionSettings = {
      maxPages: action === 'extract' ? 10 : 5, // More pages for full extraction
      maxDepth: 2,
      includeAssets: true,
      followExternalLinks: false,
      respectRobotsTxt: true,
      delay: 1000, // 1 second delay between requests
      timeout: 15000,
      ...settings
    };

    const extractor = new GenericSiteExtractor();
    
    if (action === 'analyze') {
      // Just analyze the site (existing functionality)
      const analysis = await extractor.analyzeUrl(url);
      
      return NextResponse.json({
        success: true,
        analysis,
        message: 'Site analysis complete.'
      });
    
    } else if (action === 'extract') {
      // Full extraction
      let progressData: ExtractionProgress | null = null;
      
      // Set up progress tracking
      extractor.addProgressListener((progress) => {
        progressData = progress;
      });

      try {
        const manifest = await extractor.extract(url, defaultSettings);
        
        return NextResponse.json({
          success: true,
          manifest: {
            url: manifest.url,
            title: manifest.title,
            description: manifest.description,
            totalPages: manifest.pages.length,
            totalAssets: manifest.assets.length,
            totalSize: manifest.totalSize,
            extractedAt: manifest.extractedAt,
            pages: manifest.pages.map(page => ({
              url: page.url,
              path: page.path,
              title: page.title,
              size: page.content.length
            })),
            assets: manifest.assets.map(asset => ({
              url: asset.url,
              path: asset.path,
              type: asset.type,
              size: asset.size || 0
            }))
          },
          message: 'Site extraction complete!'
        });
        
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: 'Extraction failed',
          details: error,
          progress: progressData
        }, { status: 500 });
      }
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "analyze" or "extract"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Site extraction API endpoint',
    methods: ['POST'],
    actions: {
      analyze: 'Analyze site structure and platform',
      extract: 'Full site extraction with assets'
    },
    parameters: {
      url: 'string (required) - URL of the site to extract',
      action: 'string (optional) - "analyze" or "extract" (default: analyze)',
      settings: 'object (optional) - Extraction settings'
    }
  });
} 