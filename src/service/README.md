# Services Directory

This directory contains all the core services for the Permasquare project.

## Available Services

### 🌐 ArNS Service (`arns.ts`)
Comprehensive ArNS (Arweave Name Service) integration using @ar.io/sdk for domain registration and management.

**Key Features:**
- Domain name availability checking
- Registration cost estimation
- Name registration and management
- Record updates and queries
- Name validation
- Testnet support

**Environment Setup:**
Ensure you have the `ARWEAVE_KEY_JSON` environment variable set with your wallet's JSON key for testnet operations.

**Usage Examples:**

```typescript
import { 
  checkNameAvailability, 
  registerArnsName, 
  estimateRegistrationCost,
  validateArnsName,
  generateArnsUrl 
} from './arns';

// Check if a name is available
const availability = await checkNameAvailability('my-site');
if (availability.available) {
  console.log('Name is available!');
}

// Validate name format
const validation = validateArnsName('my-site');
if (!validation.valid) {
  console.error('Invalid name:', validation.error);
}

// Estimate registration cost
const cost = await estimateRegistrationCost('my-site', 1);
console.log(`Cost: ${cost.formattedCost}`);

// Register a name (pointing to a deployed site)
const result = await registerArnsName({
  name: 'my-site',
  target: 'your-arweave-transaction-id',
  years: 1
});
console.log(`Registered: ${result.registrationUrl}`);

// Generate ArNS URL
const url = generateArnsUrl('my-site', '/about');
// Returns: https://my-site.ar-io.dev/about
```

### 📦 Deploy Service (`deploy.ts`)
Handles deployment of sites to Arweave using Turbo SDK with comprehensive asset processing.

### 🔧 Extract Service (`extract.ts`)
Site extraction and processing logic for various CMS platforms.

### 🗃️ Storage Service (`storage.ts`)
File storage and retrieval operations.

### ⚡ Arweave Service (`arweave.ts`)
Core Arweave blockchain interactions and wallet management.

## Integration Example

Here's how you might use the ArNS service with the deploy service:

```typescript
import { deployWithTurbo } from './deploy';
import { registerArnsName } from './arns';

// Deploy site to Arweave
const deployment = await deployWithTurbo('example.com');
console.log(`Site deployed: ${deployment.manifestUrl}`);

// Register ArNS name pointing to the deployed site
const arnsResult = await registerArnsName({
  name: 'my-awesome-site',
  target: deployment.bundleId,
  years: 1
});

console.log(`ArNS domain ready: ${arnsResult.registrationUrl}`);
```

## Environment Variables

- `ARWEAVE_KEY_JSON`: JSON string of your Arweave wallet for testnet operations
- Other environment variables may be required for specific services

## Error Handling

All services include comprehensive error handling and logging. Check the console output for detailed operation logs and error messages. 