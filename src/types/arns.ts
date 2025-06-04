export interface ArNSRecord {
  name: string;
  processId: string;
  type: 'lease' | 'permabuy';
  endTimestamp?: number;
  startTimestamp: number;
  undernames: number;
  purchasePrice?: number;
}

export interface ArNSNameCheck {
  name: string;
  available: boolean;
  cost?: {
    lease: {
      1: number;
      2: number;
      3: number;
      4: number;
      5: number;
    };
    permabuy: number;
  };
  registrationFee?: number;
  existingRecord?: ArNSRecord;
  suggestions?: string[];
}

export interface ArNSRegistrationRequest {
  name: string;
  type: 'lease' | 'permabuy';
  years?: number; // Only for lease type
  transactionId: string; // Arweave transaction to link to
  processId?: string; // ANT process ID if existing
}

export interface ArNSRegistrationResult {
  success: boolean;
  transactionId?: string;
  antProcessId?: string;
  arnsName: string;
  registrationType: 'lease' | 'permabuy';
  cost: number;
  error?: string;
}

export interface ArNSProgress {
  stage: 'checking' | 'calculating_cost' | 'registering' | 'creating_ant' | 'linking' | 'complete' | 'error';
  message: string;
  progress: number; // 0-100
  details?: any;
}

export interface ArNSManagerState {
  availableNames: Map<string, ArNSNameCheck>;
  registrationProgress: Map<string, ArNSProgress>;
  userDomains: ArNSRecord[];
  isLoading: boolean;
  error: string | null;
}

export interface ArNSCost {
  baseCost: number;
  networkFee: number;
  totalCost: number;
  duration?: number; // years for lease
  type: 'lease' | 'permabuy';
}

export interface ANTRecord {
  undername: string;
  transactionId: string;
  ttlSeconds: number;
}

export interface ANTManagement {
  processId: string;
  owner: string;
  controllers: string[];
  records: Record<string, ANTRecord>;
  name: string;
  ticker: string;
}

export interface ArNSDeploymentData {
  arweaveTxId: string;
  arnsName: string;
  registrationType: 'lease' | 'permabuy';
  antProcessId: string;
  finalUrl: string;
} 