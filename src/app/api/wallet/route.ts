import { NextRequest, NextResponse } from 'next/server';
import { loadWalletFromEnv, getWalletBalance, getTurboBalance, fundTurboWallet } from '@/service/arweave';

export async function GET() {
  try {
    console.log('🔍 [API] Checking wallet status');
    
    const wallet = await loadWalletFromEnv();
    const arweaveBalance = await getWalletBalance(wallet);
    const turboBalance = await getTurboBalance(wallet);
    
    return NextResponse.json({
      success: true,
      wallet: {
        address: arweaveBalance.address,
        arweave: {
          balance: arweaveBalance.balance,
          balanceAR: arweaveBalance.balanceAR
        },
        turbo: {
          balance: turboBalance.winc,
          balanceAR: turboBalance.ar
        }
      }
    });
  } catch (error) {
    console.error('❌ [API] Wallet check failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check wallet status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, amount } = await request.json();
    
    if (action === 'fund') {
      if (!amount || amount <= 0) {
        return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 });
      }
      
      console.log(`💳 [API] Funding Turbo wallet with ${amount} AR`);
      
      const wallet = await loadWalletFromEnv();
      const result = await fundTurboWallet(wallet, amount);
      
      if (result.success) {
        // Get updated balances
        const arweaveBalance = await getWalletBalance(wallet);
        const turboBalance = await getTurboBalance(wallet);
        
        return NextResponse.json({
          success: true,
          fundingTxId: result.txId,
          wallet: {
            address: arweaveBalance.address,
            arweave: {
              balance: arweaveBalance.balance,
              balanceAR: arweaveBalance.balanceAR
            },
            turbo: {
              balance: turboBalance.winc,
              balanceAR: turboBalance.ar
            }
          }
        });
      } else {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('❌ [API] Wallet operation failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to perform wallet operation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 