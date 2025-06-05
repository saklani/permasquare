import { NextRequest, NextResponse } from 'next/server';
import { crawlAndSave } from '@/service/extract';

export async function POST(request: NextRequest) {
  try {
    const { url, maxPages = 100, delay = 1000 } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    
    console.log(`🕸️ [API] Starting extraction for: ${url}`);
    
    const result = await crawlAndSave(url, { maxPages, delay });
    
    return NextResponse.json({
      hostname: new URL(url).hostname,
      ...result
    });
  } catch (error) {
    console.error('❌ [API] Extraction failed:', error);
    return NextResponse.json(
      { error: 'Failed to extract site' },
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