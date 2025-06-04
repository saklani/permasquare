import { ArNSCost } from '../../types/arns';

export class ArNSUtils {
  // Validate ArNS name format
  static isValidArNSName(name: string): boolean {
    // ArNS names must be 1-51 characters, alphanumeric and hyphens, start/end with alphanumeric
    const nameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,49}[a-zA-Z0-9])?$/;
    return nameRegex.test(name) && name.length >= 1 && name.length <= 51;
  }

  // Generate ArNS name suggestions
  static generateNameSuggestions(baseName: string): string[] {
    const suggestions: string[] = [];
    const cleanBase = baseName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
    
    if (cleanBase.length > 0) {
      // Add numbers
      for (let i = 1; i <= 5; i++) {
        suggestions.push(`${cleanBase}${i}`);
        suggestions.push(`${cleanBase}-${i}`);
      }
      
      // Add common suffixes
      const suffixes = ['app', 'site', 'web', 'io', 'dev', 'pro'];
      suffixes.forEach(suffix => {
        suggestions.push(`${cleanBase}-${suffix}`);
        if (cleanBase.length + suffix.length <= 51) {
          suggestions.push(`${cleanBase}${suffix}`);
        }
      });
      
      // Add prefixes
      const prefixes = ['my', 'get', 'the', 'new'];
      prefixes.forEach(prefix => {
        if (prefix.length + cleanBase.length + 1 <= 51) {
          suggestions.push(`${prefix}-${cleanBase}`);
        }
      });
    }
    
    return suggestions
      .filter(name => this.isValidArNSName(name))
      .slice(0, 10);
  }

  // Format ArNS URL
  static formatArNSUrl(name: string, gateway: string = 'ar-io.dev'): string {
    return `https://${name}.${gateway}`;
  }

  // Format cost for display
  static formatCost(costInWinston: number): string {
    // Convert winston to AR (1 AR = 1e12 winston)
    const arAmount = costInWinston / 1e12;
    
    if (arAmount < 0.001) {
      return `${(arAmount * 1e6).toFixed(0)} µAR`;
    } else if (arAmount < 1) {
      return `${(arAmount * 1000).toFixed(2)} mAR`;
    } else {
      return `${arAmount.toFixed(4)} AR`;
    }
  }

  // Format IO tokens for display
  static formatIOTokens(amount: number): string {
    if (amount < 1000) {
      return `${amount.toFixed(2)} IO`;
    } else if (amount < 1000000) {
      return `${(amount / 1000).toFixed(2)}K IO`;
    } else {
      return `${(amount / 1000000).toFixed(2)}M IO`;
    }
  }

  // Calculate registration cost based on name length and type
  static calculateBaseCost(name: string, type: 'lease' | 'permabuy', years?: number): ArNSCost {
    const nameLength = name.length;
    let baseCost: number;
    
    // Base cost calculation (in IO tokens)
    if (nameLength === 1) {
      baseCost = type === 'permabuy' ? 100000 : 5000;
    } else if (nameLength === 2) {
      baseCost = type === 'permabuy' ? 50000 : 2500;
    } else if (nameLength === 3) {
      baseCost = type === 'permabuy' ? 25000 : 1250;
    } else if (nameLength === 4) {
      baseCost = type === 'permabuy' ? 10000 : 500;
    } else if (nameLength <= 8) {
      baseCost = type === 'permabuy' ? 5000 : 250;
    } else if (nameLength <= 13) {
      baseCost = type === 'permabuy' ? 2500 : 125;
    } else {
      baseCost = type === 'permabuy' ? 1000 : 50;
    }

    // Apply years multiplier for lease
    if (type === 'lease' && years) {
      baseCost = baseCost * years;
    }

    const networkFee = baseCost * 0.1; // 10% network fee
    const totalCost = baseCost + networkFee;

    return {
      baseCost,
      networkFee,
      totalCost,
      duration: years,
      type
    };
  }

  // Format time remaining for lease domains
  static formatTimeRemaining(endTimestamp: number): string {
    const now = Date.now();
    const remaining = endTimestamp - now;
    
    if (remaining <= 0) {
      return 'Expired';
    }
    
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 365) {
      const years = Math.floor(days / 365);
      return `${years} year${years > 1 ? 's' : ''}`;
    } else if (days > 30) {
      const months = Math.floor(days / 30);
      return `${months} month${months > 1 ? 's' : ''}`;
    } else if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''}`;
    } else {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
  }

  // Check if domain is expiring soon (within 30 days)
  static isExpiringSoon(endTimestamp: number): boolean {
    const now = Date.now();
    const thirtyDaysFromNow = now + (30 * 24 * 60 * 60 * 1000);
    return endTimestamp <= thirtyDaysFromNow;
  }

  // Generate ANT process name
  static generateANTName(arnsName: string): string {
    return `ANT-${arnsName.toUpperCase()}`;
  }

  // Generate ANT ticker
  static generateANTTicker(arnsName: string): string {
    return `ANT-${arnsName.substring(0, 8).toUpperCase()}`;
  }

  // Validate transaction ID format
  static isValidTransactionId(txId: string): boolean {
    // Arweave transaction IDs are 43 characters, base64url encoded
    const txIdRegex = /^[a-zA-Z0-9_-]{43}$/;
    return txIdRegex.test(txId);
  }

  // Get gateway URL for ArNS resolution
  static getGatewayUrl(gateway?: string): string {
    return gateway || 'ar-io.dev';
  }

  // Format domain status
  static formatDomainStatus(record: any): string {
    if (record.type === 'permabuy') {
      return 'Permanent';
    } else if (record.endTimestamp) {
      const remaining = record.endTimestamp - Date.now();
      if (remaining <= 0) {
        return 'Expired';
      } else if (this.isExpiringSoon(record.endTimestamp)) {
        return 'Expiring Soon';
      } else {
        return 'Active';
      }
    }
    return 'Unknown';
  }

  // Convert mIO to IO tokens
  static mIOToIO(mio: number): number {
    return mio / 1000000; // 1 IO = 1,000,000 mIO
  }

  // Convert IO to mIO tokens
  static IOToMIO(io: number): number {
    return io * 1000000; // 1 IO = 1,000,000 mIO
  }
} 