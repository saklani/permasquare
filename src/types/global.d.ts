import { ArweaveWallet } from './arweave';

declare global {
  interface Window {
    arweaveWallet: ArweaveWallet;
  }
}

export {}; 