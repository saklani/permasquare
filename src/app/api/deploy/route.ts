import { NextRequest, NextResponse } from 'next/server';
import { ArweaveDeployer } from '@/lib/arweave/deployer';
import { ArweaveUtils } from '@/lib/arweave/utils';
import { SiteManifest } from '@/types/extraction';
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

    const deployer = new ArweaveDeployer();

    if (action === 'estimate') {
      // Estimate deployment cost
      try {
        const cost = await deployer.estimateCost(manifest as SiteManifest);
        const estimate = await ArweaveUtils.estimateDeploymentCost(
          manifest.pages.map((page: any) => ({ content: page.content, path: page.path })),
          manifest.assets
            .filter((asset: any) => asset.content)
            .map((asset: any) => ({ content: asset.content, path: asset.path }))
        );

        return NextResponse.json({
          success: true,
          estimate: {
            totalCostAR: cost,
            totalCostWinston: estimate.totalCostWinston,
            totalBytes: estimate.totalBytes,
            breakdown: estimate.breakdown,
            formattedCost: ArweaveUtils.formatAR(estimate.totalCostWinston),
            formattedSize: ArweaveUtils.formatBytes(estimate.totalBytes)
          }
        });
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: 'Failed to estimate deployment cost',
          details: error.toString()
        }, { status: 500 });
      }

    } else if (action === 'deploy') {
      // Full deployment
      if (!wallet) {
        return NextResponse.json(
          { error: 'Wallet is required for deployment' },
          { status: 400 }
        );
      }

      try {
        deployer.setWallet(wallet);
        
        const deployment = await deployer.deploy(
          manifest as SiteManifest, 
          settings as DeploymentSettings
        );

        return NextResponse.json({
          success: true,
          deployment: {
            id: deployment.id,
            url: deployment.url,
            manifestTxId: deployment.manifestTxId,
            totalCost: deployment.cost,
            deployedAt: deployment.deployedAt,
            gatewayUrl: deployment.gatewayUrl,
            totalPages: deployment.pageTxIds.length,
            totalAssets: deployment.assetTxIds.length
          },
          message: 'Site deployed successfully to Arweave!'
        });

      } catch (error) {
        return NextResponse.json({
          success: false,
          error: 'Deployment failed',
          details: error.toString()
        }, { status: 500 });
      }

    } else if (action === 'check_balance') {
      // Check wallet balance
      if (!wallet) {
        return NextResponse.json(
          { error: 'Wallet is required to check balance' },
          { status: 400 }
        );
      }

      try {
        const arweave = ArweaveUtils.getArweaveInstance();
        const walletAddress = await arweave.wallets.jwkToAddress(wallet);
        const walletInfo = await ArweaveUtils.getWalletInfo(walletAddress);

        return NextResponse.json({
          success: true,
          wallet: {
            address: walletInfo.address,
            balance: walletInfo.balance,
            formattedBalance: ArweaveUtils.formatAR(walletInfo.balance.toString())
          }
        });

      } catch (error) {
        return NextResponse.json({
          success: false,
          error: 'Failed to check wallet balance',
          details: error.toString()
        }, { status: 500 });
      }

    } else if (action === 'status') {
      // Check deployment status
      const { txId } = body;
      
      if (!txId) {
        return NextResponse.json(
          { error: 'Transaction ID is required' },
          { status: 400 }
        );
      }

      try {
        const status = await deployer.getDeploymentStatus(txId);
        const url = ArweaveUtils.getManifestUrl(txId);

        return NextResponse.json({
          success: true,
          status,
          txId,
          url,
          isValid: ArweaveUtils.isValidTxId(txId)
        });

      } catch (error) {
        return NextResponse.json({
          success: false,
          error: 'Failed to check deployment status',
          details: error.toString()
        }, { status: 500 });
      }
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "estimate", "deploy", "check_balance", or "status"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Deploy API error:', error);
    return NextResponse.json(
      { error: 'Failed to process deployment request', details: error.toString() },
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