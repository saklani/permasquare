import { NextRequest, NextResponse } from 'next/server';
import { analyzeSite } from '@/service/extract';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    
    console.log(`🔍 [API] Analyzing site: ${url}`);
    
    const analysis = await analyzeSite(url);
    
    return NextResponse.json(analysis);
  } catch (error) {
    console.error('❌ [API] Site analysis failed:', error);
    return NextResponse.json(
      { error: 'Failed to analyze site' },
      { status: 500 }
    );
  }
}