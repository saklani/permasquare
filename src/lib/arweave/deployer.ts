import Arweave from 'arweave';
import { 
  ArweaveDeployment, 
  DeploymentProgress, 
  ArweaveManifest,
  UploadedAsset,
  UploadedPage,
  DeploymentSettings,
  ArweaveError,
  InsufficientFundsError,
  UploadError
} from '@/types/arweave';
import { SiteManifest } from '@/types/extraction';
import { ArweaveUtils } from './utils';

export class ArweaveDeployer {
  private arweave: Arweave;
  private wallet: any = null;
  private progressListeners: Array<(progress: DeploymentProgress) => void> = [];

  constructor(wallet?: any) {
    this.arweave = ArweaveUtils.getArweaveInstance();
    this.wallet = wallet;
  }

  setWallet(wallet: any): void {
    this.wallet = wallet;
  }

  addProgressListener(callback: (progress: DeploymentProgress) => void): void {
    this.progressListeners.push(callback);
  }

  removeProgressListener(callback: (progress: DeploymentProgress) => void): void {
    const index = this.progressListeners.indexOf(callback);
    if (index > -1) {
      this.progressListeners.splice(index, 1);
    }
  }

  private notifyProgress(progress: DeploymentProgress): void {
    this.progressListeners.forEach(listener => {
      try {
        listener(progress);
      } catch (error) {
        console.error('Progress listener error:', error);
      }
    });
  }

  async estimateCost(manifest: SiteManifest): Promise<number> {
    try {
      const pagesData = manifest.pages.map(page => ({
        content: page.content,
        path: page.path
      }));

      const assetsData = manifest.assets
        .filter(asset => asset.content)
        .map(asset => ({
          content: asset.content!,
          path: asset.path
        }));

      const estimate = await ArweaveUtils.estimateDeploymentCost(pagesData, assetsData);
      return estimate.totalCostAR;
    } catch (error) {
      throw new ArweaveError('Failed to estimate deployment cost', 'COST_ESTIMATION_ERROR', error as Error);
    }
  }

  async deploy(
    manifest: SiteManifest, 
    settings: DeploymentSettings = {}
  ): Promise<ArweaveDeployment> {
    if (!this.wallet) {
      throw new ArweaveError('Wallet not connected', 'WALLET_NOT_CONNECTED');
    }

    const progress: DeploymentProgress = {
      stage: 'preparing',
      progress: 0,
      message: 'Preparing deployment...',
      assetsUploaded: 0,
      totalAssets: manifest.assets.length,
      pagesUploaded: 0,
      totalPages: manifest.pages.length,
      totalCost: 0,
      errors: []
    };

    try {
      // Stage 1: Validate wallet and funds
      this.notifyProgress({ ...progress, message: 'Checking wallet balance...' });
      
      const walletAddress = await this.arweave.wallets.jwkToAddress(this.wallet);
      const estimatedCost = await this.estimateCost(manifest);
      
      const hasEnoughFunds = await ArweaveUtils.checkWalletBalance(walletAddress, estimatedCost);
      if (!hasEnoughFunds) {
        const walletInfo = await ArweaveUtils.getWalletInfo(walletAddress);
        throw new InsufficientFundsError(estimatedCost, walletInfo.balance);
      }

      progress.totalCost = estimatedCost;

      // Stage 2: Upload assets
      this.notifyProgress({ 
        ...progress, 
        stage: 'uploading_assets',
        progress: 10,
        message: 'Uploading assets...' 
      });

      const uploadedAssets = await this.uploadAssets(manifest.assets, progress);

      // Stage 3: Upload pages
      this.notifyProgress({ 
        ...progress, 
        stage: 'uploading_pages',
        progress: 50,
        message: 'Uploading pages...' 
      });

      const uploadedPages = await this.uploadPages(manifest.pages, progress);

      // Stage 4: Create and upload manifest
      this.notifyProgress({ 
        ...progress, 
        stage: 'creating_manifest',
        progress: 90,
        message: 'Creating manifest...' 
      });

      const arweaveManifest = this.createArweaveManifest(uploadedPages, uploadedAssets);
      const manifestTxId = await this.uploadManifest(arweaveManifest, manifest, settings);

      // Complete
      this.notifyProgress({ 
        ...progress, 
        stage: 'complete',
        progress: 100,
        message: 'Deployment complete!' 
      });

      const deployment: ArweaveDeployment = {
        id: manifestTxId,
        url: ArweaveUtils.getManifestUrl(manifestTxId),
        manifestTxId,
        assetTxIds: uploadedAssets.map(asset => asset.arweaveTxId),
        pageTxIds: uploadedPages.map(page => page.arweaveTxId),
        totalSize: manifest.totalSize,
        deployedAt: new Date(),
        cost: estimatedCost,
        gatewayUrl: ArweaveUtils.getGatewayUrl(manifestTxId, settings.gateway)
      };

      return deployment;

    } catch (error) {
      this.notifyProgress({ 
        ...progress, 
        stage: 'error',
        message: `Deployment failed: ${error}`,
        errors: [...progress.errors, error.toString()] 
      });
      throw error;
    }
  }

  private async uploadAssets(
    assets: SiteManifest['assets'], 
    progress: DeploymentProgress
  ): Promise<UploadedAsset[]> {
    const uploadedAssets: UploadedAsset[] = [];
    const validAssets = assets.filter(asset => asset.content);

    for (let i = 0; i < validAssets.length; i++) {
      const asset = validAssets[i];
      
      try {
        progress.assetsUploaded = i;
        progress.progress = 10 + (i / validAssets.length) * 30;
        progress.message = `Uploading asset: ${asset.path}`;
        this.notifyProgress(progress);

        const txId = await this.uploadData(
          asset.content!,
          asset.mimeType || 'application/octet-stream',
          {
            'Content-Type': asset.mimeType || 'application/octet-stream',
            'File-Type': asset.type,
            'Original-URL': asset.url,
            'Asset-Path': asset.path
          }
        );

        const cost = await ArweaveUtils.calculateCost(asset.content!.length);

        uploadedAssets.push({
          originalUrl: asset.url,
          arweaveTxId: txId,
          path: asset.path,
          type: asset.type,
          size: asset.content!.length,
          cost: cost.costAR
        });

      } catch (error) {
        const errorMsg = `Failed to upload asset ${asset.path}: ${error}`;
        progress.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    progress.assetsUploaded = validAssets.length;
    return uploadedAssets;
  }

  private async uploadPages(
    pages: SiteManifest['pages'],
    progress: DeploymentProgress
  ): Promise<UploadedPage[]> {
    const uploadedPages: UploadedPage[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      
      try {
        progress.pagesUploaded = i;
        progress.progress = 50 + (i / pages.length) * 30;
        progress.message = `Uploading page: ${page.path}`;
        this.notifyProgress(progress);

        const txId = await this.uploadData(
          Buffer.from(page.content),
          'text/html',
          {
            'Content-Type': 'text/html',
            'Page-Title': page.title,
            'Original-URL': page.url,
            'Page-Path': page.path
          }
        );

        const cost = await ArweaveUtils.calculateCost(Buffer.from(page.content).length);

        uploadedPages.push({
          originalUrl: page.url,
          arweaveTxId: txId,
          path: page.path,
          title: page.title,
          size: Buffer.from(page.content).length,
          cost: cost.costAR
        });

      } catch (error) {
        const errorMsg = `Failed to upload page ${page.path}: ${error}`;
        progress.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    progress.pagesUploaded = pages.length;
    return uploadedPages;
  }

  private async uploadData(
    data: Buffer, 
    contentType: string, 
    customTags: Record<string, string> = {}
  ): Promise<string> {
    try {
      const transaction = await this.arweave.createTransaction({ data }, this.wallet);
      
      // Add standard tags
      const tags = ArweaveUtils.generateTags({
        appName: 'Permasquare',
        appVersion: '1.0.0',
        contentType,
        custom: customTags
      });

      tags.forEach(tag => {
        transaction.addTag(tag.name, tag.value);
      });

      await this.arweave.transactions.sign(transaction, this.wallet);
      
      const response = await this.arweave.transactions.post(transaction);
      
      if (response.status !== 200) {
        throw new UploadError(`Upload failed with status ${response.status}`, transaction.id);
      }

      return transaction.id;

    } catch (error) {
      throw new UploadError(`Failed to upload data: ${error}`);
    }
  }

  private createArweaveManifest(
    pages: UploadedPage[], 
    assets: UploadedAsset[]
  ): ArweaveManifest {
    const manifest: ArweaveManifest = {
      manifest: 'arweave/paths',
      version: '0.1.0',
      paths: {}
    };

    // Add pages to manifest
    pages.forEach(page => {
      const manifestPath = ArweaveUtils.sanitizeManifestPath(page.path);
      manifest.paths[manifestPath] = { id: page.arweaveTxId };
    });

    // Add assets to manifest
    assets.forEach(asset => {
      const manifestPath = ArweaveUtils.sanitizeManifestPath(asset.path);
      manifest.paths[manifestPath] = { id: asset.arweaveTxId };
    });

    // Set index page (look for index.html or first page)
    const indexPage = pages.find(page => 
      page.path === 'index.html' || 
      page.path === '/index.html' ||
      page.path === '/'
    ) || pages[0];

    if (indexPage) {
      manifest.index = { path: ArweaveUtils.sanitizeManifestPath(indexPage.path) };
    }

    return manifest;
  }

  private async uploadManifest(
    manifest: ArweaveManifest, 
    siteManifest: SiteManifest,
    settings: DeploymentSettings
  ): Promise<string> {
    try {
      const manifestData = Buffer.from(JSON.stringify(manifest, null, 2));
      
      const customTags = {
        'Site-Title': siteManifest.title || 'Untitled Site',
        'Site-Description': siteManifest.description || '',
        'Original-URL': siteManifest.url,
        'Total-Pages': siteManifest.pages.length.toString(),
        'Total-Assets': siteManifest.assets.length.toString(),
        'Total-Size': siteManifest.totalSize.toString(),
        'Extracted-At': siteManifest.extractedAt.toISOString(),
        ...settings.tags
      };

      return await this.uploadData(manifestData, 'application/x.arweave-manifest+json', customTags);

    } catch (error) {
      throw new UploadError(`Failed to upload manifest: ${error}`);
    }
  }

  async getDeploymentStatus(txId: string): Promise<'pending' | 'confirmed' | 'failed'> {
    try {
      const status = await this.arweave.transactions.getStatus(txId);
      
      if (status.status === 200) {
        return 'confirmed';
      } else if (status.status === 404) {
        return 'pending';
      } else {
        return 'failed';
      }
    } catch {
      return 'failed';
    }
  }
} 