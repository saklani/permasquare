import { NextRequest, NextResponse } from 'next/server';
import { analyzeSite, extractSite, cleanup } from '@/lib/extraction/basic';
import { Progress } from '@/types/progress';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, action = 'analyze', maxPages = 10, delay = 1000 } = body;

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

    if (action === 'analyze') {
      // Just analyze the site
      try {
        const analysis = await analyzeSite(url);
        
        return NextResponse.json({
          success: true,
          analysis,
          message: 'Site analysis complete.'
        });
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: 'Analysis failed',
          details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
      }
    
    } else if (action === 'extract') {
      // Full extraction
      let progressData: Progress | null = null;
      
      try {
        const manifest = await extractSite(url, {
          maxPages: Math.min(maxPages, 20), // Cap at 20 pages
          delay,
          onProgress: (progress: Progress) => {
            progressData = progress;
          }
        });
        
        return NextResponse.json({
          success: true,
          manifest,
          message: 'Site extraction complete!'
        });
        
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: 'Extraction failed',
          details: error instanceof Error ? error.message : String(error),
          progress: progressData
        }, { status: 500 });
      } finally {
        // Clean up browser resources
        await cleanup();
      }
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "analyze" or "extract"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error instanceof Error ? error.message : String(error) },
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