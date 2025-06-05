import { NextRequest, NextResponse } from 'next/server';
import { deployWithTurbo, estimateDeploymentCost } from '@/service/deploy';
import { generateWallet } from '@/service/arweave';

export async function POST(request: NextRequest) {
  try {
    const { hostname, wallet } = await request.json();
    
    if (!hostname) {
      return NextResponse.json({ error: 'Hostname is required' }, { status: 400 });
    }
    
    console.log(`🚀 [API] Deploying site: ${hostname}`);
    
    // The deployWithTurbo function now handles wallet loading from arweave.json
    // and payment verification automatically
    const result = await deployWithTurbo(hostname, wallet);
    
    return NextResponse.json({
      success: true,
      ...result,
      // Include wallet info in response if one was used
      walletUsed: wallet ? 'provided' : 'from_file'
    });
  } catch (error) {
    console.error('❌ [API] Deployment failed:', error);
    
    // Provide more specific error messages for payment issues
    const errorMessage = error instanceof Error ? error.message : 'Failed to deploy site';
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hostname = searchParams.get('hostname');
    
    if (!hostname) {
      return NextResponse.json({ error: 'Hostname is required' }, { status: 400 });
    }
    
    console.log(`💰 [API] Estimating cost for: ${hostname}`);
    
    const cost = await estimateDeploymentCost(hostname);
    
    return NextResponse.json(cost);
  } catch (error) {
    console.error('❌ [API] Cost estimation failed:', error);
    return NextResponse.json(
      { error: 'Failed to estimate cost' },
      { status: 500 }
    );
  }
} 