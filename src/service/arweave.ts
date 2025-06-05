import Arweave from 'arweave';
import fs from 'fs';
import path from 'path';
import { TurboFactory } from '@ardrive/turbo-sdk';

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https'
});

export async function loadWalletFromEnv(): Promise<any> {
  try {
    // First try environment variable
    const walletJson = process.env.ARWEAVE_KEY_JSON;
    
    if (walletJson) {
      const wallet = JSON.parse(walletJson);
      const address = await arweave.wallets.jwkToAddress(wallet);
      console.log(`🔑 [Arweave] Loaded wallet from environment variable: ${address}`);
      return wallet;
    }
    
    // Fallback to file if environment variable not set
    const walletPath = path.join(process.cwd(), 'arweave.json');
    if (fs.existsSync(walletPath)) {
      const walletData = fs.readFileSync(walletPath, 'utf8');
      const wallet = JSON.parse(walletData);
      const address = await arweave.wallets.jwkToAddress(wallet);
      console.log(`🔑 [Arweave] Loaded wallet from file (fallback): ${address}`);
      return wallet;
    }
    
    throw new Error('No wallet found in environment variable or file');
  } catch (error) {
    console.log(`⚠️ [Arweave] Could not load wallet: ${error}`);
    throw new Error('Could not load wallet from ARWEAVE_KEY_JSON environment variable or arweave.json file');
  }
}

export async function generateWallet(): Promise<any> {
  console.log('🔑 [Arweave] Generating new wallet');
  const wallet = await arweave.wallets.generate();
  const address = await arweave.wallets.jwkToAddress(wallet);
  
  console.log(`✅ [Arweave] Wallet generated: ${address}`);
  
  return wallet;
}

export async function getWalletBalance(wallet: any): Promise<{
  address: string;
  balance: string;
  balanceAR: number;
}> {
  console.log('💰 [Arweave] Checking wallet balance');
  
  const address = await arweave.wallets.jwkToAddress(wallet);
  const winston = await arweave.wallets.getBalance(address);
  const ar = parseFloat(arweave.ar.winstonToAr(winston));
  
  console.log(`💰 [Arweave] Balance for ${address}: ${ar} AR`);
  
  return {
    address,
    balance: winston,
    balanceAR: ar
  };
}

export async function getTurboBalance(wallet: any): Promise<{
  winc: string;
  ar: number;
}> {
  try {
    console.log('💰 [Turbo] Checking Turbo balance');
    
    const turbo = TurboFactory.authenticated({ privateKey: wallet });
    const balance = await turbo.getBalance();
    
    const arBalance = parseFloat(balance.winc) / 1000000000000; // Convert winc to AR
    
    console.log(`💰 [Turbo] Balance: ${balance.winc} winc (${arBalance.toFixed(6)} AR)`);
    
    return {
      winc: balance.winc,
      ar: arBalance
    };
  } catch (error) {
    console.error(`❌ [Turbo] Error getting balance:`, error);
    throw error;
  }
}

export async function fundTurboWallet(
  wallet: any, 
  amountAR: number
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    console.log(`💳 [Turbo] Funding Turbo wallet with ${amountAR} AR`);
    
    const turbo = TurboFactory.authenticated({ privateKey: wallet });
    
    // Convert AR to Winston for funding
    const winstonAmount = arweave.ar.arToWinston(amountAR.toString());
    
    const result = await turbo.topUpWithTokens({
      tokenAmount: winstonAmount,
      feeMultiplier: 1.1 // Add 10% fee buffer
    });
    
    console.log(`✅ [Turbo] Successfully funded wallet. TX: ${result.id}`);
    
    return {
      success: true,
      txId: result.id
    };
  } catch (error) {
    console.error(`❌ [Turbo] Error funding wallet:`, error);
    return {
      success: false,
      error: `Failed to fund Turbo wallet: ${error}`
    };
  }
}

export async function fundBundlerIfNeeded(
  wallet: any, 
  estimatedCostAR: number
): Promise<{ funded: boolean; fundingTxId?: string; error?: string }> {
  try {
    console.log(`💳 [Arweave] Checking if bundler funding is needed for ${estimatedCostAR} AR`);
    
    // Check Arweave wallet balance
    const arweaveBalance = await getWalletBalance(wallet);
    console.log(`💰 [Arweave] Main wallet balance: ${arweaveBalance.balanceAR.toFixed(6)} AR`);
    
    // Check Turbo balance
    const turboBalance = await getTurboBalance(wallet);
    console.log(`💰 [Turbo] Turbo balance: ${turboBalance.ar.toFixed(6)} AR`);
    
    // Calculate required balance (add 50% buffer for safety)
    const requiredTurboBalance = estimatedCostAR * 1.5;
    
    if (turboBalance.ar >= requiredTurboBalance) {
      console.log(`✅ [Turbo] Sufficient Turbo balance available`);
      return { funded: true };
    }
    
    // Calculate how much we need to fund
    const fundingNeeded = requiredTurboBalance - turboBalance.ar;
    console.log(`💸 [Turbo] Need to fund ${fundingNeeded.toFixed(6)} AR to Turbo wallet`);
    
    // Check if main wallet has enough to fund Turbo
    if (arweaveBalance.balanceAR < fundingNeeded) {
      return {
        funded: false,
        error: `Insufficient Arweave balance. Need ${fundingNeeded.toFixed(6)} AR for Turbo funding, but only have ${arweaveBalance.balanceAR.toFixed(6)} AR available.`
      };
    }
    
    // Fund the Turbo wallet
    const fundingResult = await fundTurboWallet(wallet, fundingNeeded);
    
    if (!fundingResult.success) {
      return {
        funded: false,
        error: fundingResult.error
      };
    }
    
    // Wait a moment for the funding to process
    console.log(`⏳ [Turbo] Waiting for funding to process...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verify the funding worked
    const newTurboBalance = await getTurboBalance(wallet);
    if (newTurboBalance.ar >= estimatedCostAR) {
      console.log(`✅ [Turbo] Successfully funded Turbo wallet. New balance: ${newTurboBalance.ar.toFixed(6)} AR`);
      return {
        funded: true,
        fundingTxId: fundingResult.txId
      };
    } else {
      return {
        funded: false,
        error: `Funding appeared to succeed but Turbo balance is still insufficient. Expected: ${estimatedCostAR.toFixed(6)} AR, Got: ${newTurboBalance.ar.toFixed(6)} AR`
      };
    }
    
  } catch (error) {
    console.error(`❌ [Arweave] Error in bundler funding:`, error);
    return {
      funded: false,
      error: `Failed to handle bundler funding: ${error}`
    };
  }
}

export async function getTransactionStatus(txId: string): Promise<{
  id: string;
  status: string;
  confirmations: number;
}> {
  console.log(`📊 [Arweave] Checking transaction status: ${txId}`);
  
  try {
    const status = await arweave.transactions.getStatus(txId);
    
    return {
      id: txId,
      status: status.status === 200 ? 'confirmed' : 'pending',
      confirmations: status.confirmed?.number_of_confirmations || 0
    };
  } catch (error) {
    return {
      id: txId,
      status: 'not_found',
      confirmations: 0
    };
  }
} 