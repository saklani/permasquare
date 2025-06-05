// Add polyfill for server-side environment
if (typeof globalThis.self === 'undefined') {
  (globalThis as any).self = globalThis;
}

import { ARIO, ARIOReadable, ARIOWriteable, ArweaveSigner } from '@ar.io/sdk';
import { loadWalletFromEnv } from './arweave';

export interface ArnsRegistrationOptions {
  name: string;
  target: string; // Transaction ID to point to
  processId?: string; // ArNS process ID (optional, defaults to testnet)
  years?: number; // Duration of registration (default: 1)
}

export interface ArnsRegistrationResult {
  name: string;
  transactionId: string;
  processId: string;
  target: string;
  cost: number;
  registrationUrl: string;
}

export interface ArnsNameInfo {
  name: string;
  processId: string;
  owner: string;
  target: string;
  ttl: number;
  startTimestamp: number;
  endTimestamp: number;
  undernames: Record<string, any>;
}

// Initialize ARIO client for testnet - keeping it simple with any type
export function createArIOClient(wallet?: any): any {
  console.log('🌐 [ArNS] Initializing ARIO client for testnet');
  
  if (wallet) {
    const signer = new ArweaveSigner(wallet);
    return ARIO.testnet({
      signer
    });
  }
  
  // Read-only client without signer
  return ARIO.testnet();
}

export async function checkNameAvailability(name: string): Promise<{
  available: boolean;
  info?: ArnsNameInfo;
  error?: string;
}> {
  try {
    console.log(`🔍 [ArNS] Checking availability for name: ${name}`);
    
    const arIO = createArIOClient();
    
    try {
      const nameInfo = await arIO.getArNSRecord({ 
        name,
        // Use testnet ArNS registry process ID
        processId: 'bLAgYxAdX2Ry-nt6aH2ixgfFBXTKiuoFHFF6gyHpDNI'
      });
      
      // If record is undefined or null, name is available
      if (!nameInfo) {
        console.log(`✅ [ArNS] Name "${name}" is available`);
        return { available: true };
      }
      
      return {
        available: false,
        info: {
          name,
          processId: nameInfo.processId || 'unknown',
          owner: nameInfo.owner || 'unknown',
          target: nameInfo.target || 'unknown',
          ttl: nameInfo.ttl || 0,
          startTimestamp: nameInfo.startTimestamp || 0,
          endTimestamp: nameInfo.endTimestamp || 0,
          undernames: nameInfo.undernames || {}
        }
      };
    } catch (error: any) {
      // If record not found, name is available
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        console.log(`✅ [ArNS] Name "${name}" is available`);
        return { available: true };
      }
      
      throw error;
    }
  } catch (error: any) {
    console.error(`❌ [ArNS] Error checking name availability:`, error);
    return {
      available: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

export async function estimateRegistrationCost(
  name: string,
  years: number = 1
): Promise<{
  costInIOTokens: number;
  costInAR: number;
  formattedCost: string;
}> {
  try {
    console.log(`💰 [ArNS] Estimating registration cost for "${name}" (${years} year${years > 1 ? 's' : ''})`);
    
    const arIO = createArIOClient();
    
    // Get the cost estimate from ArIO with testnet process ID
    const costDetails = await arIO.getTokenCost({
      intent: 'Buy-Record',
      name,
      years,
      // Use testnet ArNS registry process ID
      processId: 'bLAgYxAdX2Ry-nt6aH2ixgfFBXTKiuoFHFF6gyHpDNI'
    });
    
    const costInIOTokens = costDetails.tokenCost;
    // Convert IO tokens to AR (this is an approximation, actual rate may vary)
    const costInAR = costInIOTokens * 0.001; // Approximate conversion rate
    
    console.log(`💰 [ArNS] Registration cost for "${name}": ${costInIOTokens} IO tokens (~${costInAR.toFixed(6)} AR)`);
    
    return {
      costInIOTokens,
      costInAR,
      formattedCost: `${costInIOTokens} IO tokens (~${costInAR.toFixed(6)} AR)`
    };
  } catch (error: any) {
    console.error(`❌ [ArNS] Error estimating registration cost:`, error);
    throw new Error(`Failed to estimate registration cost: ${error.message}`);
  }
}

export async function registerArnsName(
  options: ArnsRegistrationOptions,
  wallet?: any
): Promise<ArnsRegistrationResult> {
  try {
    console.log(`🚀 [ArNS] Starting registration for name: ${options.name}`);
    
    let jwkWallet = wallet;
    if (!jwkWallet) {
      jwkWallet = await loadWalletFromEnv();
    }
    
    const arIO = createArIOClient(jwkWallet);
    
    // Check if name is available first
    const availability = await checkNameAvailability(options.name);
    if (!availability.available) {
      throw new Error(`Name "${options.name}" is not available`);
    }
    
    // Get cost estimate
    const costEstimate = await estimateRegistrationCost(options.name, options.years || 1);
    console.log(`💰 [ArNS] Registration will cost: ${costEstimate.formattedCost}`);
    
    // Perform the registration
    console.log(`📝 [ArNS] Submitting registration transaction...`);
    
    // Register using the client directly with processId for testnet
    const registrationResult = await arIO.buyRecord({
      name: options.name,
      target: options.target,
      years: options.years || 1,
      // Use testnet ArNS registry process ID
      processId: options.processId || 'bLAgYxAdX2Ry-nt6aH2ixgfFBXTKiuoFHFF6gyHpDNI'
    });
    
    const registrationUrl = `https://${options.name}.ar-io.dev`;
    
    console.log(`✅ [ArNS] Registration successful!`);
    console.log(`🌐 [ArNS] Domain URL: ${registrationUrl}`);
    console.log(`📄 [ArNS] Transaction ID: ${registrationResult.id}`);
    
    return {
      name: options.name,
      transactionId: registrationResult.id,
      processId: options.processId || 'default-testnet',
      target: options.target,
      cost: costEstimate.costInIOTokens,
      registrationUrl
    };
  } catch (error: any) {
    console.error(`❌ [ArNS] Registration failed:`, error);
    throw new Error(`ArNS registration failed: ${error.message}`);
  }
}

export async function updateArnsRecord(
  name: string,
  newTarget: string,
  wallet?: any
): Promise<{
  name: string;
  transactionId: string;
  newTarget: string;
  updateUrl: string;
}> {
  try {
    console.log(`🔄 [ArNS] Updating record for name: ${name} -> ${newTarget}`);
    
    let jwkWallet = wallet;
    if (!jwkWallet) {
      jwkWallet = await loadWalletFromEnv();
    }
    
    const arIO = createArIOClient(jwkWallet);
    
    // Update the record directly with processId for testnet
    const updateResult = await arIO.upgradeRecord({
      name,
      target: newTarget,
      // Use testnet ArNS registry process ID
      processId: 'bLAgYxAdX2Ry-nt6aH2ixgfFBXTKiuoFHFF6gyHpDNI'
    });
    
    const updateUrl = `https://${name}.ar-io.dev`;
    
    console.log(`✅ [ArNS] Record updated successfully!`);
    console.log(`🌐 [ArNS] Domain URL: ${updateUrl}`);
    console.log(`📄 [ArNS] Transaction ID: ${updateResult.id}`);
    
    return {
      name,
      transactionId: updateResult.id,
      newTarget,
      updateUrl
    };
  } catch (error: any) {
    console.error(`❌ [ArNS] Update failed:`, error);
    throw new Error(`ArNS record update failed: ${error.message}`);
  }
}

export async function getArnsRecord(name: string): Promise<ArnsNameInfo | null> {
  try {
    console.log(`📋 [ArNS] Fetching record for name: ${name}`);
    
    const arIO = createArIOClient();
    const record = await arIO.getArNSRecord({ 
      name,
      // Use testnet ArNS registry process ID
      processId: 'bLAgYxAdX2Ry-nt6aH2ixgfFBXTKiuoFHFF6gyHpDNI'
    });
    
    return {
      name,
      processId: record.processId || 'unknown',
      owner: record.owner || 'unknown',
      target: record.target || 'unknown',
      ttl: record.ttl || 0,
      startTimestamp: record.startTimestamp || 0,
      endTimestamp: record.endTimestamp || 0,
      undernames: record.undernames || {}
    };
  } catch (error: any) {
    console.error(`❌ [ArNS] Error fetching record:`, error);
    return null;
  }
}

export async function listOwnedNames(wallet?: any): Promise<string[]> {
  try {
    console.log(`📋 [ArNS] Fetching owned ArNS names`);
    
    let jwkWallet = wallet;
    if (!jwkWallet) {
      jwkWallet = await loadWalletFromEnv();
    }
    
    const arIO = createArIOClient(jwkWallet);
    
    // This would need to be implemented based on ArIO SDK capabilities
    // For now, return empty array as placeholder
    console.log(`⚠️ [ArNS] Listing owned names feature not yet implemented in SDK`);
    return [];
  } catch (error: any) {
    console.error(`❌ [ArNS] Error listing owned names:`, error);
    return [];
  }
}

export function generateArnsUrl(name: string, path?: string): string {
  const baseUrl = `https://${name}.ar-io.dev`;
  return path ? `${baseUrl}${path.startsWith('/') ? path : '/' + path}` : baseUrl;
}

export function validateArnsName(name: string): {
  valid: boolean;
  error?: string;
} {
  // ArNS name validation rules
  if (!name || name.length === 0) {
    return { valid: false, error: 'Name cannot be empty' };
  }
  
  if (name.length < 3) {
    return { valid: false, error: 'Name must be at least 3 characters long' };
  }
  
  if (name.length > 63) {
    return { valid: false, error: 'Name cannot be longer than 63 characters' };
  }
  
  // Must start and end with alphanumeric character
  if (!/^[a-z0-9]/.test(name) || !/[a-z0-9]$/.test(name)) {
    return { valid: false, error: 'Name must start and end with alphanumeric character' };
  }
  
  // Can only contain lowercase letters, numbers, and hyphens
  if (!/^[a-z0-9-]+$/.test(name)) {
    return { valid: false, error: 'Name can only contain lowercase letters, numbers, and hyphens' };
  }
  
  // Cannot contain consecutive hyphens
  if (name.includes('--')) {
    return { valid: false, error: 'Name cannot contain consecutive hyphens' };
  }
  
  return { valid: true };
} 