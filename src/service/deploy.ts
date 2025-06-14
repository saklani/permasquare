import { TurboFactory } from '@ardrive/turbo-sdk';
import { getMultipleFiles, listFiles } from './storage';
import { loadWalletFromEnv } from './arweave';

export interface DeploymentResult {
  bundleId: string;
  manifestUrl: string;
  fileMapping: Record<string, string>;
  totalCost: number;
}

// -----------------------------
// ⚠️  DRY-RUN MODE
//    Set to true to disable actual Arweave uploads.
//    All turbo.upload calls are skipped and a fake transaction id
//    is generated so the rest of the pipeline continues to work.
//    Flip to false (or remove) for real deployment.
// -----------------------------
const DRY_RUN = false;

export async function deployWithTurbo(
  hostname: string,
  jwkWallet?: any
): Promise<DeploymentResult> {
  console.log(`🚀 [Turbo] Starting deployment for: ${hostname}`);
  
  let wallet = jwkWallet;
  if (!wallet) {
    try {
      wallet = await loadWalletFromEnv();
      console.log(`🔑 [Turbo] Using wallet from environment/file`);
    } catch (error) {
      throw new Error(`No wallet provided and could not load from environment: ${error}`);
    }
  }
  
  const turbo = TurboFactory.authenticated({ privateKey: wallet });
  const { pages, assets } = await getSiteContent(hostname);
  
  const fileMapping: Record<string, string> = {};
  let totalCostWinston = 0;

  // Pass 1: Upload non-CSS assets first
  console.log("🔄 [Turbo] Pass 1: Processing non-CSS assets...");
  for (const [path, content] of assets.entries()) {
    const mimeType = getMimeType(path);
    
    if (mimeType !== 'text/css') {
      try {
        console.log(`📦 [Turbo] Processing asset: ${path}`);
        
        let txId: string;
        if (DRY_RUN) {
          // generate deterministic fake id based on path
          txId = `fake_${Buffer.from(path).toString('base64').slice(0, 32)}`;
        } else {
          const result = await turbo.upload({
            data: content,
            dataItemOpts: {
              tags: [
                { name: 'Content-Type', value: mimeType },
                { name: 'Path', value: path }
              ]
            }
          });
          txId = result.id;
          totalCostWinston += Number(result.winc) || 0;
        }
        
        fileMapping[path] = txId;
        console.log(`📦 [Turbo] Processed asset: ${path} -> ${txId}`);
      } catch (error) {
        console.error(`❌ [Turbo] Failed to process asset ${path}:`, error);
      }
    }
  }

  // Pass 2: Process and upload CSS assets
  console.log("🔄 [Turbo] Pass 2: Processing CSS assets...");
  for (const [path, content] of assets.entries()) {
    const mimeType = getMimeType(path);
    
    if (mimeType === 'text/css') {
      try {
        console.log(`🎨 [Turbo] Processing CSS: ${path}`);
        const processedCssString = replaceUrlsWithTxIds(content.toString('utf8'), fileMapping);
        const processedContentBuffer = Buffer.from(processedCssString, 'utf8');
        
        let txId: string;
        if (DRY_RUN) {
          txId = `fake_${Buffer.from(path).toString('base64').slice(0, 32)}`;
        } else {
          const result = await turbo.upload({
            data: processedContentBuffer,
            dataItemOpts: {
              tags: [
                { name: 'Content-Type', value: mimeType },
                { name: 'Path', value: path }
              ]
            }
          });
          txId = result.id;
          totalCostWinston += Number(result.winc) || 0;
        }
        
        fileMapping[path] = txId;
        console.log(`🎨 [Turbo] Processed CSS asset: ${path} -> ${txId}`);
      } catch (error) {
        console.error(`❌ [Turbo] Failed to process CSS asset ${path}:`, error);
      }
    }
  }

  // ------------------------------------------------------------------
  // PASS 3a: Upload all HTML pages RAW (no replacement) to obtain txIds
  //          This builds a COMPLETE mapping for cross-page links.
  // ------------------------------------------------------------------
  console.log("🔄 [Turbo] Pass 3a: Upload raw HTML pages (build mapping)...");
  for (const [path, content] of pages.entries()) {
    try {
      const result = await turbo.upload({
        data: Buffer.from(content, 'utf8'),
        dataItemOpts: {
          tags: [
            { name: 'Content-Type', value: 'text/html' },
            { name: 'Path', value: path },
            { name: 'Pass', value: 'raw' }
          ]
        }
      });

      fileMapping[path] = result.id;
      totalCostWinston += Number(result.winc) || 0;

      console.log(`📄 [Turbo] Uploaded RAW page: ${path} -> ${result.id}`);
    } catch (err) {
      console.error(`❌ [Turbo] RAW HTML upload failed for ${path}:`, err);
    }
  }

  // ------------------------------------------------------------------
  // PASS 3b: Re-upload HTML pages with all URLs replaced using full mapping
  // ------------------------------------------------------------------
  console.log("🔄 [Turbo] Pass 3b: Upload processed HTML with URL replacement...");
  console.log(`📋 [Debug] Complete fileMapping now contains ${Object.keys(fileMapping).length} entries`);
  
  for (const [path, content] of pages.entries()) {
    try {
      console.log(`🔗 [Turbo] Processing HTML with URL replacement: ${path}`);
      const processedContentString = replaceUrlsWithTxIds(content, fileMapping);
      
      let txId: string;
      if (DRY_RUN) {
        txId = `fake_${Buffer.from(path).toString('base64').slice(0, 32)}`;
      } else {
        const result = await turbo.upload({
          data: Buffer.from(processedContentString, 'utf8'),
          dataItemOpts: {
            tags: [
              { name: 'Content-Type', value: 'text/html' },
              { name: 'Path', value: path }
            ]
          }
        });
        txId = result.id;
        totalCostWinston += Number(result.winc) || 0;
      }
      
      fileMapping[path] = txId;
      
      console.log(`🔗 [Turbo] Processed HTML page: ${path} -> ${txId}`);
    } catch (error) {
      console.error(`❌ [Turbo] Failed to process HTML page ${path}:`, error);
    }
  }
  
  console.log(`📋 [Debug] Final fileMapping contains ${Object.keys(fileMapping).length} entries:`);
  for (const [path, txId] of Object.entries(fileMapping)) {
    console.log(`  📋 ${path} -> ${txId}`);
  }
  
  // Create and upload manifest
  console.log("📋 [Turbo] Creating manifest...");
  const manifest = createArweaveManifest(fileMapping);
  let manifestId: string;
  if (DRY_RUN) {
    manifestId = `fake_manifest_${Date.now()}`;
  } else {
    const manifestResult = await turbo.upload({
      data: JSON.stringify(manifest, null, 2),
      dataItemOpts: {
        tags: [
          { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
          { name: 'Type', value: 'manifest' }
        ]
      }
    });
    manifestId = manifestResult.id;
    totalCostWinston += Number(manifestResult.winc) || 0;
  }
  
  console.log(`📋 [Turbo] Created manifest: ${manifestId} ${DRY_RUN ? '(DRY-RUN)' : ''}`);
  
  // Convert winston to AR for final cost reporting
  const totalCostAR = totalCostWinston / 1000000000000; // 1 AR = 10^12 winston

  console.log(`✅ [Turbo] All files processed successfully`);
  console.log(`💰 [Turbo] Total deployment cost: ${totalCostWinston} winc (${totalCostAR.toFixed(6)} AR)`);
  
  return {
    bundleId: manifestId,
    manifestUrl: DRY_RUN ? '(dry-run)' : `https://arweave.net/${manifestId}`,
    fileMapping,
    totalCost: totalCostAR
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
    file.endsWith('.htm')
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
  
  // Function to normalize URLs to a standard format for consistent matching
  const normalizeUrl = (url: string): string => {
    if (!url || url.trim() === '') return '';
    
    let normalized = url.trim();
    
    // Remove leading slash
    if (normalized.startsWith('/')) {
      normalized = normalized.substring(1);
    }
    
    // Remove trailing slash
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    
    // Remove .html extension if present
    if (normalized.endsWith('.html')) {
      normalized = normalized.replace('.html', '');
    }
    
    return normalized;
  };

  // Create lookup with normalized keys
  const lookup: Record<string, string> = {};
  for (const [path, txId] of Object.entries(fileMapping)) {
    const normalizedKey = normalizeUrl(path);
    if (normalizedKey) {
      lookup[normalizedKey] = txId;
    }
  }
  
  // Function to attempt URL replacement
  const tryReplaceUrl = (url: string): string | null => {
    if (!url || url.trim() === '') return null;
    
    // Handle previous DRY-RUN fake links: https://arweave.net/fake_<base64>
    const fakeMatch = url.match(/^https?:\/\/arweave\.net\/fake_([A-Za-z0-9+/=\-]+)$/);
    if (fakeMatch) {
      try {
        const decoded = Buffer.from(fakeMatch[1], 'base64').toString();
        const normalizedDecoded = normalizeUrl(decoded.replace(/^\//, ''));
        const realTx = lookup[normalizedDecoded] || lookup[normalizeUrl(decoded)];
        if (realTx) return `https://arweave.net/${realTx}`;
      } catch {}
    }

    // Skip other external URLs, special protocols, fragments, and data URLs
    if (url.startsWith('http://') || url.startsWith('https://') || 
        url.startsWith('//') || url.startsWith('mailto:') || 
        url.startsWith('tel:') || url.startsWith('ftp:') || 
        url.startsWith('#') || url.startsWith('javascript:') || 
        url.startsWith('data:') || url.includes('arweave.net')) {
      return null;
    }
    
    // Clean and normalize the URL
    const cleanUrl = url.trim();
    
    // Remove query parameters and fragments for lookup
    const urlParts = cleanUrl.split(/[?#]/);
    const baseUrl = urlParts[0];
    const queryAndFragment = cleanUrl.substring(baseUrl.length);
    
    // Normalize the base URL for lookup
    const normalizedUrl = normalizeUrl(baseUrl);
    
    // Handle docs/ prefix by stripping it
    let lookupKey = normalizedUrl;
    if (lookupKey.startsWith('docs/')) {
      lookupKey = lookupKey.substring(5); // Remove 'docs/' prefix
    }
    
    // Try to find a match
    if (lookup[lookupKey]) {
      const txId = lookup[lookupKey];
      return `https://arweave.net/${txId}${queryAndFragment}`;
    }
    
    return null;
  };
  
  // 1. Replace HTML attributes (href, src, action, etc.) - only relative URLs
  const attributePattern = /((?:href|src|action|data-src|data-href|srcset|content|poster|background)\s*=\s*["'])(?!https?:\/\/|\/\/|mailto:|tel:|ftp:|#|javascript:|data:)([^"']*?)(["'])/gi;
  updated = updated.replace(attributePattern, (match, prefix, url, suffix) => {
    const replacement = tryReplaceUrl(url);
    if (replacement) {
      return `${prefix}${replacement}${suffix}`;
    }
    return match;
  });
  
  // 2. Replace CSS url() functions - only relative URLs
  const cssUrlPattern = /(url\s*\(\s*['"]?)(?!https?:\/\/|\/\/|data:)([^"')]+)(['"]?\s*\))/gi;
  updated = updated.replace(cssUrlPattern, (match, prefix, url, suffix) => {
    const replacement = tryReplaceUrl(url);
    if (replacement) {
      return `${prefix}${replacement}${suffix}`;
    }
    return match;
  });
  
  // 3. Replace JavaScript imports and requires - only relative URLs
  const jsImportPattern = /((?:import|require)\s*\(\s*["'])(?!https?:\/\/|\/\/|data:)([^"']+)(["']\s*\))/gi;
  updated = updated.replace(jsImportPattern, (match, prefix, url, suffix) => {
    const replacement = tryReplaceUrl(url);
    if (replacement) {
      return `${prefix}${replacement}${suffix}`;
    }
    return match;
  });
  
  // 4. Replace srcset values (space-separated URLs with descriptors) - only relative URLs
  const srcsetPattern = /(srcset\s*=\s*["'])([^"']*?)(["'])/gi;
  updated = updated.replace(srcsetPattern, (match, prefix, srcset, suffix) => {
    const srcsetParts = srcset.split(',').map((part: string) => {
      const trimmed = part.trim();
      const spaceIndex = trimmed.indexOf(' ');
      const url = spaceIndex > -1 ? trimmed.substring(0, spaceIndex) : trimmed;
      const descriptor = spaceIndex > -1 ? trimmed.substring(spaceIndex) : '';
      
      const replacement = tryReplaceUrl(url);
      if (replacement) {
        return replacement + descriptor;
      }
      
      return part.trim();
    });
    
    return `${prefix}${srcsetParts.join(', ')}${suffix}`;
  });
  
  return updated;
}

function createArweaveManifest(fileMapping: Record<string, string>) {
  const paths: Record<string, { id: string }> = {};
  
  for (const [path, txId] of Object.entries(fileMapping)) {
    const manifestPath = path.startsWith('/') ? path.substring(1) : path;
    paths[manifestPath] = { id: txId };
  }
  
  return {
    manifest: 'arweave/paths',
    version: '0.1.0',
    index: { path: 'index.html' },
    paths
  };
}

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  
  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    eot: 'application/vnd.ms-fontobject',
    otf: 'font/otf'
  };
  
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Replace relative paths (./foo.js or foo.js) with absolute URLs.
 * 
 * @param {string} content  — your HTML/CSS/JS source as a string
 * @param {string} baseUrl  — e.g. "https://docs.liteseed.xyz/"
 * @returns {string}
 */
function replaceRelativePaths(content: string, baseUrl: string) {
  // ensure trailing slash
  if (!baseUrl.endsWith('/')) baseUrl += '/';

  return content
    // <script src="./foo.js"> or src="foo.js" (but not absolute URLs)
    .replace(/(src=["'])(?!https?:\/\/|\/\/|mailto:|tel:|ftp:)(?:\.\/)?([^"']+)/gi,
             (_, prefix, path) => prefix + baseUrl + path)

    // <link href="./styles.css"> or href="styles.css" (but not absolute URLs or #fragments)
    .replace(/(href=["'])(?!https?:\/\/|\/\/|mailto:|tel:|ftp:|#)(?:\.\/)?([^"']+)/gi,
             (_, prefix, path) => prefix + baseUrl + path)

    // CSS url(./image.png) or url(image.png) (but not absolute URLs)
    // Handle both quoted and unquoted URLs
    .replace(/url\(\s*(['"]?)(?!https?:\/\/|\/\/|data:)(?:\.\/)?([^)'"]+)\1\s*\)/gi,
             (_, quote, path) => `url(${quote}${baseUrl}${path}${quote})`);
}

