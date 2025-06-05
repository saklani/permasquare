import { NextRequest, NextResponse } from 'next/server';
import { deployWithTurbo, estimateDeploymentCost } from '@/service/deploy';
import { generateWallet } from '@/service/arweave';

export async function POST(request: NextRequest) {
  try {
    const { hostname, wallet } = await request.json();
    
    if (!hostname) {
      return NextResponse.json({ error: 'Hostname is required' }, { status: 400 });
    }
    
    let jwkWallet = wallet;
    if (!jwkWallet) {
      console.log('🔑 [API] No wallet provided, generating new one');
      jwkWallet = await generateWallet();
    }
    
    console.log(`🚀 [API] Deploying site: ${hostname}`);
    
    const result = await deployWithTurbo(hostname, jwkWallet);
    
    return NextResponse.json({
      success: true,
      ...result,
      wallet: jwkWallet
    });
  } catch (error) {
    console.error('❌ [API] Deployment failed:', error);
    return NextResponse.json(
      { error: 'Failed to deploy site' },
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