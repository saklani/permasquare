// Arweave deployment types and interfaces

export interface ArweaveDeployment {
  id: string;
  url: string;
  manifestTxId: string;
  assetTxIds?: string[];
  pageTxIds?: string[];
  totalSize?: number;
  deployedAt: Date | string;
  cost?: number; // in AR
  totalCost: number; // in AR (for compatibility)
  gatewayUrl: string;
  totalPages: number;
  totalAssets: number;
}

export interface DeploymentProgress {
  stage: 'preparing' | 'uploading_assets' | 'uploading_pages' | 'creating_manifest' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  assetsUploaded: number;
  totalAssets: number;
  pagesUploaded: number;
  totalPages: number;
  totalCost: number; // in AR
  currentTxId?: string;
  errors: string[];
}

export interface ArweaveManifest {
  manifest: 'arweave/paths';
  version: '0.1.0';
  index?: {
    path: string;
  };
  paths: Record<string, ArweaveManifestPath>;
}

export interface ArweaveManifestPath {
  id: string;
}

export interface UploadedAsset {
  originalUrl: string;
  arweaveTxId: string;
  path: string;
  type: string;
  size: number;
  cost: number;
}

export interface UploadedPage {
  originalUrl: string;
  arweaveTxId: string;
  path: string;
  title: string;
  size: number;
  cost: number;
}

export interface DeploymentSettings {
  gateway?: string;
  bundlr?: boolean; // Use Bundlr for faster uploads
  tags?: Record<string, string>; // Custom tags for transactions
  useDispatch?: boolean; // Use ArweaveJS dispatch mode
}

export interface BundlrConfig {
  url?: string;
  currency?: 'arweave';
  provider?: any; // Wallet provider
}

export interface ArweaveConfig {
  host: string;
  port: number;
  protocol: string;
  timeout: number;
  logging: boolean;
}

export interface TransactionCost {
  bytes: number;
  cost: string; // in winston
  costAR: number; // in AR
}

export interface DeploymentEstimate {
  totalBytes: number;
  totalCostWinston: string;
  totalCostAR: number;
  formattedCost: string;
  formattedSize: string;
  breakdown: {
    pages: TransactionCost;
    assets: TransactionCost;
    manifest: TransactionCost;
  };
}

// ArConnect wallet interface types
export type PermissionType = 
  | 'ACCESS_ADDRESS'
  | 'ACCESS_PUBLIC_KEY'
  | 'ACCESS_ALL_ADDRESSES'
  | 'SIGN_TRANSACTION'
  | 'ENCRYPT'
  | 'DECRYPT'
  | 'SIGNATURE';

export interface AppInfo {
  name?: string;
  logo?: string;
}

export interface GatewayConfig {
  host: string;
  port: number;
  protocol: 'http' | 'https';
}

export interface Transaction {
  id: string;
  last_tx: string;
  owner: string;
  tags: Array<{ name: string; value: string }>;
  target: string;
  quantity: string;
  data: string;
  reward: string;
  signature: string;
  data_size: string;
  data_root: string;
}

export interface SignatureOptions {
  hashAlgorithm?: string;
  saltLength?: number;
}

export interface ArweaveWallet {
  walletName: string;
  connect(
    permissions: PermissionType[],
    appInfo?: AppInfo,
    gateway?: GatewayConfig
  ): Promise<void>;
  disconnect(): Promise<void>;
  getActiveAddress(): Promise<string>;
  getActivePublicKey(): Promise<string>;
  getAllAddresses(): Promise<string[]>;
  getWalletNames(): Promise<{ [addr: string]: string }>;
  signature(
    transaction: ArrayBufferView,
    options?: SignatureOptions
  ): Promise<Uint8Array>;
  sign(
    transaction: Transaction,
    options?: SignatureOptions
  ): Promise<Transaction>;
  getPermissions(): Promise<PermissionType[]>;
  encrypt(
    data: ArrayBufferView,
    algorithm: string,
    options?: any
  ): Promise<Uint8Array>;
  decrypt(
    data: ArrayBufferView,
    algorithm: string,
    options?: any
  ): Promise<Uint8Array>;
  getArweaveConfig(): Promise<{
    host: string;
    port: number;
    protocol: string;
  }>;
  dispatch(transaction: Transaction): Promise<string>;
}

// Error types
export class ArweaveError extends Error {
  constructor(message: string, public code?: string, public originalError?: Error) {
    super(message);
    this.name = 'ArweaveError';
  }
}

export class InsufficientFundsError extends ArweaveError {
  constructor(required: number, available: number) {
    super(`Insufficient funds: ${required} AR required, ${available} AR available`);
    this.name = 'InsufficientFundsError';
  }
}

export class UploadError extends ArweaveError {
  constructor(message: string, public txId?: string) {
    super(message);
    this.name = 'UploadError';
  }
} 