import { NextRequest, NextResponse } from 'next/server';
import { estimateDeployment, deployToArweave } from '@/lib/arweave/deploy';
import { ExtractionManifest } from '@/types/extraction';
import { DeploymentSettings } from '@/types/arweave';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { manifest, wallet, settings = {}, action = 'estimate' } = body;

    if (!manifest) {
      return NextResponse.json(
        { error: 'Site manifest is required' },
        { status: 400 }
      );
    }

    if (action === 'estimate') {
      try {
        const estimate = await estimateDeployment(manifest as ExtractionManifest);

        return NextResponse.json({
          success: true,
          estimate,
          message: 'Cost estimation complete.'
        });

      } catch (error) {
        return NextResponse.json({
          success: false,
          error: 'Failed to estimate deployment cost',
          details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
      }

    } else if (action === 'deploy') {
      if (!wallet) {
        return NextResponse.json(
          { error: 'Wallet is required for deployment' },
          { status: 400 }
        );
      }

      try {        
        const deployment = await deployToArweave(
          manifest as ExtractionManifest,
          wallet,
          {
            onProgress: (progress) => {
              console.log(`Deployment progress: ${progress.step} - ${progress.percent}% - ${progress.message}`);
            }
          }
        );

        return NextResponse.json({
          success: true,
          deployment,
          message: 'Site deployed successfully to Arweave!'
        });

      } catch (error) {
        return NextResponse.json({
          success: false,
          error: 'Deployment failed',
          details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
      }
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "estimate" or "deploy"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Deploy API error:', error);
    return NextResponse.json(
      { error: 'Failed to process deployment request', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Arweave deployment API endpoint',
    methods: ['POST'],
    actions: {
      estimate: 'Estimate deployment cost',
      deploy: 'Deploy site to Arweave',
      check_balance: 'Check wallet balance',
      status: 'Check deployment status'
    },
    parameters: {
      manifest: 'object (required) - Site manifest from extraction',
      wallet: 'object (required for deploy/check_balance) - Arweave wallet JWK',
      settings: 'object (optional) - Deployment settings',
      action: 'string (optional) - Action to perform (default: estimate)',
      txId: 'string (required for status) - Transaction ID to check'
    }
  });
} 