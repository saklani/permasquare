import Arweave from 'arweave';
import fs from 'fs';
import path from 'path';

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
  console.log('�� [Arweave] Checking Arweave wallet balance');
  
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