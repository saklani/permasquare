// import { ArNSNameCheck, ArNSRegistrationRequest, ArNSRegistrationResult, ArNSProgress, ArNSRecord, ANTManagement, ArNSDeploymentData } from '../../types/arns';
// import { ArweaveWallet } from '../../types/arweave';
// import { ArNSUtils } from './utils';

// export class ArNSManager {
//   private arIO: any;
//   private wallet: any;
//   private isInitialized: boolean = false;
//   private ARIO: any;
//   private ANT: any;

//   constructor() {
//     this.wallet = null;
//     this.io = null;
//     this.ARIO = null;
//     this.ANT = null;
//   }

//   // Initialize with wallet connection
//   async initialize(wallet: any): Promise<void> {
//     try {
//       // Only initialize on client side
//       if (typeof window === 'undefined') {
//         throw new Error('ArNS manager can only be initialized in browser environment');
//       }

//       // Dynamically import the web SDK to avoid SSR issues
//       const arIOSDK = await import('@ar.io/sdk/web');
//       this.IO = (arIOSDK as any).default?.IO || (arIOSDK as any).IO;
//       this.ANT = (arIOSDK as any).default?.ANT || (arIOSDK as any).ANT;
      
//       this.wallet = wallet;
      
//       // Initialize IO client with signer for write operations
//       if (wallet && window.arweaveWallet) {
//         this.io = this.ARIO.init({
//           signer: wallet
//         });
//       } else {
//         // Read-only client
//         this.io = this.ARIO.init();
//       }
      
//       this.isInitialized = true;
//     } catch (error) {
//       console.error('Failed to initialize ArNS manager:', error);
//       throw new Error('Failed to initialize ArNS connection');
//     }
//   }

//   // Check if a name is available and get cost info
//   async checkNameAvailability(name: string): Promise<ArNSNameCheck> {
//     if (!this.isInitialized) {
//       throw new Error('ArNS manager not initialized');
//     }

//     if (!ArNSUtils.isValidArNSName(name)) {
//       return {
//         name,
//         available: false,
//         cost: undefined,
//         existingRecord: undefined
//       };
//     }

//     try {
//       // Check if name exists
//       let existingRecord: ArNSRecord | undefined;
//       try {
//         const record = await this.io.getArNSRecord({ name });
//         if (record) {
//           existingRecord = {
//             name,
//             processId: record.processId,
//             type: record.type,
//             endTimestamp: record.endTimestamp,
//             startTimestamp: record.startTimestamp,
//             undernames: record.undernames,
//             purchasePrice: record.purchasePrice
//           };
//         }
//       } catch (error) {
//         // Name not found, it's available
//       }

//       if (existingRecord) {
//         // Check if lease has expired
//         if (existingRecord.type === 'lease' && existingRecord.endTimestamp && existingRecord.endTimestamp < Date.now()) {
//           // Expired lease, available for re-registration
//           const cost = await this.calculateRegistrationCost(name);
//           return {
//             name,
//             available: true,
//             cost,
//             existingRecord
//           };
//         } else {
//           // Name is taken
//           return {
//             name,
//             available: false,
//             cost: undefined,
//             existingRecord
//           };
//         }
//       }

//       // Name is available, get cost
//       const cost = await this.calculateRegistrationCost(name);
//       return {
//         name,
//         available: true,
//         cost,
//         existingRecord: undefined
//       };

//     } catch (error) {
//       console.error('Error checking name availability:', error);
//       throw new Error(`Failed to check availability for ${name}`);
//     }
//   }

//   // Calculate registration cost for both lease and permabuy
//   private async calculateRegistrationCost(name: string) {
//     try {
//       // Get costs for lease (1-5 years) and permabuy
//       const leaseCosts = {
//         1: 0,
//         2: 0,
//         3: 0,
//         4: 0,
//         5: 0
//       };

//       // Calculate lease costs for 1-5 years
//       for (let years = 1; years <= 5; years++) {
//         try {
//           const cost = await this.io.getTokenCost({
//             intent: 'Buy-Record',
//             name,
//             type: 'lease',
//             years
//           });
//           leaseCosts[years as keyof typeof leaseCosts] = cost;
//         } catch (error) {
//           console.warn(`Failed to get lease cost for ${years} year(s):`, error);
//         }
//       }

//       // Calculate permabuy cost
//       let permabuyCost = 0;
//       try {
//         permabuyCost = await this.io.getTokenCost({
//           intent: 'Buy-Record',
//           name,
//           type: 'permabuy'
//         });
//       } catch (error) {
//         console.warn('Failed to get permabuy cost:', error);
//       }

//       return {
//         lease: leaseCosts,
//         permabuy: permabuyCost
//       };
//     } catch (error) {
//       console.error('Error calculating registration cost:', error);
//       // Fallback to estimated costs
//       return this.getEstimatedCosts(name);
//     }
//   }

//   // Fallback cost estimation based on name length
//   private getEstimatedCosts(name: string) {
//     const baseLease = ArNSUtils.calculateBaseCost(name, 'lease', 1);
//     const basePermabuy = ArNSUtils.calculateBaseCost(name, 'permabuy');

//     return {
//       lease: {
//         1: ArNSUtils.IOToMIO(baseLease.totalCost),
//         2: ArNSUtils.IOToMIO(baseLease.totalCost * 2),
//         3: ArNSUtils.IOToMIO(baseLease.totalCost * 3),
//         4: ArNSUtils.IOToMIO(baseLease.totalCost * 4),
//         5: ArNSUtils.IOToMIO(baseLease.totalCost * 5)
//       },
//       permabuy: ArNSUtils.IOToMIO(basePermabuy.totalCost)
//     };
//   }

//   // Register an ArNS name
//   async registerName(
//     request: ArNSRegistrationRequest,
//     onProgress?: (progress: ArNSProgress) => void
//   ): Promise<ArNSRegistrationResult> {
//     if (!this.isInitialized || !this.wallet) {
//       throw new Error('Wallet not connected');
//     }

//     const { name, type, years, transactionId } = request;

//     try {
//       // Validate inputs
//       if (!ArNSUtils.isValidArNSName(name)) {
//         throw new Error('Invalid ArNS name format');
//       }

//       if (!ArNSUtils.isValidTransactionId(transactionId)) {
//         throw new Error('Invalid transaction ID format');
//       }

//       if (type === 'lease' && (!years || years < 1 || years > 5)) {
//         throw new Error('Lease duration must be 1-5 years');
//       }

//       // Step 1: Check availability
//       onProgress?.({
//         stage: 'checking',
//         message: 'Checking name availability...',
//         progress: 10
//       });

//       const availability = await this.checkNameAvailability(name);
//       if (!availability.available) {
//         throw new Error(`Name "${name}" is not available`);
//       }

//       // Step 2: Calculate final cost
//       onProgress?.({
//         stage: 'calculating_cost',
//         message: 'Calculating registration cost...',
//         progress: 20
//       });

//       const cost = type === 'lease' && years
//         ? availability.cost?.lease[years as keyof typeof availability.cost.lease] || 0
//         : availability.cost?.permabuy || 0;

//       // Step 3: Register the name
//       onProgress?.({
//         stage: 'registering',
//         message: 'Registering ArNS name...',
//         progress: 40
//       });

//       const registrationTx = await this.io.buyRecord({
//         name,
//         type,
//         years: type === 'lease' ? years : undefined
//       });

//       onProgress?.({
//         stage: 'creating_ant',
//         message: 'Creating ANT process...',
//         progress: 60
//       });

//       // Wait for registration to be processed
//       await this.waitForTransaction(registrationTx.id);

//       // Step 4: Get ANT process ID and set up record
//       const record = await this.io.getArNSRecord({ name });
//       const antProcessId = record.processId;

//       onProgress?.({
//         stage: 'linking',
//         message: 'Linking to deployed content...',
//         progress: 80
//       });

//       // Initialize ANT and set the @ record to point to the deployed content
//       const ant = this.ANT.init({
//         processId: antProcessId,
//         signer: this.wallet
//       });

//       await ant.setRecord({
//         undername: '@',
//         transactionId,
//         ttlSeconds: 3600
//       });

//       onProgress?.({
//         stage: 'complete',
//         message: 'ArNS registration complete!',
//         progress: 100
//       });

//       return {
//         success: true,
//         transactionId: registrationTx.id,
//         antProcessId,
//         arnsName: name,
//         registrationType: type,
//         cost: ArNSUtils.mIOToIO(cost)
//       };

//     } catch (error) {
//       console.error('Error registering ArNS name:', error);
      
//       onProgress?.({
//         stage: 'error',
//         message: `Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
//         progress: 0
//       });

//       return {
//         success: false,
//         arnsName: name,
//         registrationType: type,
//         cost: 0,
//         error: error instanceof Error ? error.message : 'Unknown error'
//       };
//     }
//   }

//   // Get user's ArNS domains
//   async getUserDomains(walletAddress: string): Promise<ArNSRecord[]> {
//     if (!this.isInitialized) {
//       throw new Error('ArNS manager not initialized');
//     }

//     try {
//       // Get all ArNS records and filter by owner
//       const { items } = await this.io.getArNSRecords({
//         limit: 1000,
//         sortBy: 'startTimestamp',
//         sortOrder: 'desc'
//       });

//       // Filter records owned by the user
//       const userRecords: ArNSRecord[] = [];
      
//       for (const item of items) {
//         try {
//           // Get ANT info to check ownership
//           const ant = this.ANT.init({ processId: item.processId });
//           const owner = await ant.getOwner();
          
//           if (owner === walletAddress) {
//             userRecords.push({
//               name: item.name,
//               processId: item.processId,
//               type: item.type,
//               endTimestamp: item.endTimestamp,
//               startTimestamp: item.startTimestamp,
//               undernames: item.undernames,
//               purchasePrice: item.purchasePrice
//             });
//           }
//         } catch (error) {
//           // Skip if can't verify ownership
//           console.warn(`Could not verify ownership for ${item.name}:`, error);
//         }
//       }

//       return userRecords;
//     } catch (error) {
//       console.error('Error getting user domains:', error);
//       return [];
//     }
//   }

//   // Get ANT management info
//   async getANTManagement(processId: string): Promise<ANTManagement> {
//     if (!this.isInitialized) {
//       throw new Error('ArNS manager not initialized');
//     }

//     try {
//       const ant = this.ANT.init({ processId });
      
//       const [state, owner, controllers] = await Promise.all([
//         ant.getState(),
//         ant.getOwner(),
//         ant.getControllers()
//       ]);

//       return {
//         processId,
//         owner,
//         controllers,
//         records: state.Records || {},
//         name: state.Name || '',
//         ticker: state.Ticker || ''
//       };
//     } catch (error) {
//       console.error('Error getting ANT management info:', error);
//       throw new Error('Failed to get ANT information');
//     }
//   }

//   // Update ANT record
//   async updateANTRecord(
//     processId: string,
//     undername: string,
//     transactionId: string,
//     ttlSeconds: number = 3600
//   ): Promise<string> {
//     if (!this.isInitialized || !this.wallet) {
//       throw new Error('Wallet not connected');
//     }

//     try {
//       const ant = this.ANT.init({
//         processId,
//         signer: this.wallet
//       });

//       const result = await ant.setRecord({
//         undername,
//         transactionId,
//         ttlSeconds
//       });

//       return result.id;
//     } catch (error) {
//       console.error('Error updating ANT record:', error);
//       throw new Error('Failed to update ANT record');
//     }
//   }

//   // Wait for transaction confirmation
//   private async waitForTransaction(txId: string, maxAttempts: number = 10): Promise<void> {
//     for (let i = 0; i < maxAttempts; i++) {
//       try {
//         // Check transaction status
//         const status = await fetch(`https://arweave.net/tx/${txId}/status`);
//         if (status.ok) {
//           const data = await status.json();
//           if (data.confirmed) {
//             return;
//           }
//         }
//       } catch (error) {
//         console.warn(`Attempt ${i + 1} to check transaction status failed:`, error);
//       }
      
//       // Wait before next attempt
//       await new Promise(resolve => setTimeout(resolve, 5000));
//     }
    
//     throw new Error('Transaction confirmation timeout');
//   }

//   // Get wallet balance in IO tokens
//   async getWalletBalance(address: string): Promise<number> {
//     if (!this.isInitialized) {
//       throw new Error('ArNS manager not initialized');
//     }

//     try {
//       const balance = await this.io.getBalance({ address });
//       return ArNSUtils.mIOToIO(balance);
//     } catch (error) {
//       console.error('Error getting wallet balance:', error);
//       return 0;
//     }
//   }

//   // Create ArNS deployment data for UI
//   createDeploymentData(
//     arweaveTxId: string,
//     arnsName: string,
//     registrationType: 'lease' | 'permabuy',
//     antProcessId: string
//   ): ArNSDeploymentData {
//     return {
//       arweaveTxId,
//       arnsName,
//       registrationType,
//       antProcessId,
//       finalUrl: ArNSUtils.formatArNSUrl(arnsName)
//     };
//   }
// } 