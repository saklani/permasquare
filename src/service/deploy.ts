import { TurboFactory } from '@ardrive/turbo-sdk';
import { listFiles, getMultipleFiles } from './storage';

export interface DeploymentResult {
  bundleId: string;
  manifestUrl: string;
  fileMapping: Record<string, string>;
  totalCost: number;
}

export async function deployWithTurbo(
  hostname: string,
  jwkWallet: any
): Promise<DeploymentResult> {
  console.log(`🚀 [Turbo] Starting deployment for: ${hostname}`);
  
  // Initialize turbo
  const turbo = TurboFactory.authenticated({
    privateKey: jwkWallet
  });
  
  // Get all site content
  const { pages, assets } = await getSiteContent(hostname);
  console.log(`📦 [Turbo] Loading ${pages.size} pages and ${assets.size} assets`);
  
  // Upload all files and track their transaction IDs
  const fileMapping: Record<string, string> = {};
  
  // Upload pages
  for (const [path, content] of pages.entries()) {
    const result = await turbo.upload({
      data: content,
      dataItemOpts: {
        tags: [
          { name: 'Content-Type', value: 'text/html' },
          { name: 'Path', value: path }
        ]
      }
    });
    fileMapping[path] = result.id;
    console.log(`📄 [Turbo] Uploaded page: ${path} -> ${result.id}`);
  }
  
  // Upload assets
  for (const [path, content] of assets.entries()) {
    const mimeType = getMimeType(path);
    const result = await turbo.upload({
      data: content,
      dataItemOpts: {
        tags: [
          { name: 'Content-Type', value: mimeType },
          { name: 'Path', value: path }
        ]
      }
    });
    fileMapping[path] = result.id;
    console.log(`🎨 [Turbo] Uploaded asset: ${path} -> ${result.id}`);
  }
  
  // Update HTML content to use transaction IDs and re-upload
  for (const [path, content] of pages.entries()) {
    const updatedContent = replaceUrlsWithTxIds(content, fileMapping);
    
    const result = await turbo.upload({
      data: updatedContent,
      dataItemOpts: {
        tags: [
          { name: 'Content-Type', value: 'text/html' },
          { name: 'Path', value: path }
        ]
      }
    });
    fileMapping[path] = result.id;
    console.log(`🔄 [Turbo] Updated page with links: ${path} -> ${result.id}`);
  }
  
  // Create and upload manifest
  const manifest = createArweaveManifest(fileMapping);
  const manifestResult = await turbo.upload({
    data: JSON.stringify(manifest, null, 2),
    dataItemOpts: {
      tags: [
        { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
        { name: 'Type', value: 'manifest' }
      ]
    }
  });
  
  console.log(`📋 [Turbo] Uploaded manifest: ${manifestResult.id}`);
  
  console.log(`✅ [Turbo] All files uploaded successfully`);
  
  return {
    bundleId: manifestResult.id,
    manifestUrl: `https://arweave.net/${manifestResult.id}`,
    fileMapping,
    totalCost: 0 // Turbo handles cost calculation
  };
}

export async function estimateDeploymentCost(hostname: string): Promise<{
  totalBytes: number;
  totalCostAR: number;
  formattedCost: string;
  formattedSize: string;
}> {
  console.log(`💰 [Cost] Estimating deployment cost for: ${hostname}`);
  
  const { pages, assets } = await getSiteContent(hostname);
  const totalBytes = calculateContentSize(pages, assets);
  
  // Simple cost estimation: ~0.01 AR per MB
  const totalCostAR = (totalBytes / 1024 / 1024) * 0.01;
  
  return {
    totalBytes,
    totalCostAR,
    formattedCost: totalCostAR.toFixed(6),
    formattedSize: formatBytes(totalBytes)
  };
}

async function getSiteContent(hostname: string): Promise<{
  pages: Map<string, string>;
  assets: Map<string, Buffer>;
}> {
  // List all files for this hostname
  const allFiles = await listFiles(`${hostname}/`);
  console.log(`📂 [Deploy] Found ${allFiles.length} files for ${hostname}`);
  
  // Separate pages and assets
  const pageFiles = allFiles.filter(file => 
    file.endsWith('.html') || 
    file.endsWith('.htm') ||
    (file.includes('/') && !file.includes('.') && !file.endsWith('/'))
  );
  const assetFiles = allFiles.filter(file => 
    !file.endsWith('/manifest.json') && 
    !pageFiles.includes(file)
  );
  
  // Bulk retrieve all files
  const allFileContents = await getMultipleFiles(allFiles);
  
  // Separate pages and assets
  const pages = new Map<string, string>();
  const assets = new Map<string, Buffer>();
  
  for (const [filePath, content] of allFileContents.entries()) {
    const relativePath = filePath.replace(`${hostname}/`, '/');
    
    if (pageFiles.some(pf => pf === filePath)) {
      pages.set(relativePath, content.toString('utf8'));
    } else {
      assets.set(relativePath, content);
    }
  }
  
  return { pages, assets };
}

function calculateContentSize(pages: Map<string, string>, assets: Map<string, Buffer>): number {
  let total = 0;
  
  for (const content of pages.values()) {
    total += Buffer.byteLength(content, 'utf8');
  }
  
  for (const content of assets.values()) {
    total += content.length;
  }
  
  return total;
}

function replaceUrlsWithTxIds(html: string, fileMapping: Record<string, string>): string {
  let updated = html;
  
  for (const [path, txId] of Object.entries(fileMapping)) {
    if (path.endsWith('.html')) continue;
    
    const patterns = [
      new RegExp(`href=["']${path}["']`, 'g'),
      new RegExp(`src=["']${path}["']`, 'g'),
      new RegExp(`url\\(["']?${path}["']?\\)`, 'g')
    ];
    
    for (const pattern of patterns) {
      updated = updated.replace(pattern, (match) => {
        return match.replace(path, `https://arweave.net/${txId}`);
      });
    }
  }
  
  return updated;
}

function createArweaveManifest(fileMapping: Record<string, string>) {
  const paths: Record<string, { id: string }> = {};
  
  for (const [path, txId] of Object.entries(fileMapping)) {
    const manifestPath = path.startsWith('/') ? path.slice(1) : path;
    paths[manifestPath] = { id: txId };
  }
  
  const indexFile = paths['index.html'] ? 'index.html' : Object.keys(paths)[0];
  
  return {
    manifest: 'arweave/paths',
    version: '0.1.0',
    index: { path: indexFile },
    paths
  };
}

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf'
  };
  
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
} 