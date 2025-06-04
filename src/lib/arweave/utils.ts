import Arweave from 'arweave';
import { 
  ArweaveConfig, 
  TransactionCost, 
  DeploymentEstimate, 
  ArweaveWallet,
  ArweaveError 
} from '@/types/arweave';

export class ArweaveUtils {
  private static instance: Arweave | null = null;

  static getArweaveInstance(config?: Partial<ArweaveConfig>): Arweave {
    if (!this.instance) {
      const defaultConfig: ArweaveConfig = {
        host: 'arweave.net',
        port: 443,
        protocol: 'https',
        timeout: 60000,
        logging: false,
        ...config
      };

      this.instance = Arweave.init(defaultConfig);
    }
    return this.instance;
  }

  static async calculateCost(dataSize: number): Promise<TransactionCost> {
    const arweave = this.getArweaveInstance();
    
    try {
      const costWinston = await arweave.transactions.getPrice(dataSize);
      const costAR = parseFloat(arweave.ar.winstonToAr(costWinston));
      
      return {
        bytes: dataSize,
        cost: costWinston,
        costAR
      };
    } catch (error) {
      throw new ArweaveError('Failed to calculate transaction cost', 'COST_CALCULATION_ERROR', error as Error);
    }
  }

  static async estimateDeploymentCost(
    pagesData: Array<{ content: string; path: string }>,
    assetsData: Array<{ content: Buffer; path: string }>
  ): Promise<DeploymentEstimate> {
    try {
      // Calculate page costs
      const pagesSize = pagesData.reduce((total, page) => total + Buffer.from(page.content).length, 0);
      const pagesCost = await this.calculateCost(pagesSize);

      // Calculate asset costs
      const assetsSize = assetsData.reduce((total, asset) => total + asset.content.length, 0);
      const assetsCost = await this.calculateCost(assetsSize);

      // Estimate manifest size (rough calculation)
      const manifestSize = 1000 + (pagesData.length + assetsData.length) * 100; // Base + entries
      const manifestCost = await this.calculateCost(manifestSize);

      const totalBytes = pagesSize + assetsSize + manifestSize;
      const totalCostWinston = (
        BigInt(pagesCost.cost) + 
        BigInt(assetsCost.cost) + 
        BigInt(manifestCost.cost)
      ).toString();
      
      const arweave = this.getArweaveInstance();
      const totalCostAR = parseFloat(arweave.ar.winstonToAr(totalCostWinston));

      return {
        totalBytes,
        totalCostWinston,
        totalCostAR,
        breakdown: {
          pages: pagesCost,
          assets: assetsCost,
          manifest: manifestCost
        }
      };
    } catch (error) {
      throw new ArweaveError('Failed to estimate deployment cost', 'ESTIMATION_ERROR', error as Error);
    }
  }

  static async getWalletInfo(walletAddress: string): Promise<ArweaveWallet> {
    const arweave = this.getArweaveInstance();
    
    try {
      const balanceWinston = await arweave.wallets.getBalance(walletAddress);
      const balanceAR = parseFloat(arweave.ar.winstonToAr(balanceWinston));
      
      return {
        address: walletAddress,
        balance: balanceAR,
        connected: true
      };
    } catch (error) {
      throw new ArweaveError('Failed to get wallet information', 'WALLET_INFO_ERROR', error as Error);
    }
  }

  static async checkWalletBalance(walletAddress: string, requiredAR: number): Promise<boolean> {
    try {
      const walletInfo = await this.getWalletInfo(walletAddress);
      return walletInfo.balance >= requiredAR;
    } catch (error) {
      return false;
    }
  }

  static formatAR(winston: string | number): string {
    const arweave = this.getArweaveInstance();
    const ar = typeof winston === 'string' 
      ? arweave.ar.winstonToAr(winston)
      : winston.toString();
    
    return parseFloat(ar).toFixed(6);
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static generateTags(data: {
    appName: string;
    appVersion: string;
    contentType?: string;
    siteName?: string;
    originalUrl?: string;
    extractedAt?: Date;
    custom?: Record<string, string>;
  }): Array<{ name: string; value: string }> {
    const tags: Array<{ name: string; value: string }> = [
      { name: 'App-Name', value: data.appName },
      { name: 'App-Version', value: data.appVersion }
    ];

    if (data.contentType) {
      tags.push({ name: 'Content-Type', value: data.contentType });
    }

    if (data.siteName) {
      tags.push({ name: 'Site-Name', value: data.siteName });
    }

    if (data.originalUrl) {
      tags.push({ name: 'Original-URL', value: data.originalUrl });
    }

    if (data.extractedAt) {
      tags.push({ name: 'Extracted-At', value: data.extractedAt.toISOString() });
    }

    // Add custom tags
    if (data.custom) {
      Object.entries(data.custom).forEach(([key, value]) => {
        tags.push({ name: key, value });
      });
    }

    return tags;
  }

  static getGatewayUrl(txId: string, gateway?: string): string {
    const baseUrl = gateway || 'https://arweave.net';
    return `${baseUrl}/${txId}`;
  }

  static getManifestUrl(manifestTxId: string, path?: string, gateway?: string): string {
    const baseUrl = this.getGatewayUrl(manifestTxId, gateway);
    return path ? `${baseUrl}${path}` : baseUrl;
  }

  static async validateTransaction(txId: string): Promise<boolean> {
    const arweave = this.getArweaveInstance();
    
    try {
      const status = await arweave.transactions.getStatus(txId);
      return status.status === 200;
    } catch {
      return false;
    }
  }

  static async waitForConfirmation(txId: string, maxAttempts: number = 20): Promise<boolean> {
    const arweave = this.getArweaveInstance();
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await arweave.transactions.getStatus(txId);
        
        if (status.status === 200) {
          return true;
        }
        
        if (status.status === 404) {
          // Transaction not found yet, wait and retry
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        
        // Other status codes indicate an error
        return false;
        
      } catch (error) {
        // Network error, wait and retry
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    return false;
  }

  static isValidTxId(txId: string): boolean {
    // Arweave transaction IDs are 43 characters long, base64url encoded
    const base64urlRegex = /^[A-Za-z0-9_-]{43}$/;
    return base64urlRegex.test(txId);
  }

  static sanitizeManifestPath(path: string): string {
    // Ensure paths start with '/' and are properly formatted for Arweave manifests
    let sanitized = path.startsWith('/') ? path : `/${path}`;
    
    // Remove any double slashes
    sanitized = sanitized.replace(/\/+/g, '/');
    
    // Remove trailing slash unless it's the root
    if (sanitized !== '/' && sanitized.endsWith('/')) {
      sanitized = sanitized.slice(0, -1);
    }
    
    return sanitized;
  }

  static async getCurrentBlockHeight(): Promise<number> {
    const arweave = this.getArweaveInstance();
    
    try {
      const info = await arweave.network.getInfo();
      return info.height;
    } catch (error) {
      throw new ArweaveError('Failed to get current block height', 'NETWORK_INFO_ERROR', error as Error);
    }
  }
} 