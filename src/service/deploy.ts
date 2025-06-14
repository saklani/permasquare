import { TurboFactory } from '@ardrive/turbo-sdk';
import { loadWalletFromEnv } from './arweave';
import { getMultipleFiles, listFiles } from './storage';

export interface DeploymentResult {
  bundleId: string;
  manifestUrl: string;
  fileMapping: Record<string, string>;
  totalCost: number;
}

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
        
        // Upload to Arweave via Turbo
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
        totalCostWinston += Number(result.winc) || 0;
        console.log(`📦 [Turbo] Processed asset: ${path} -> ${result.id}`);
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
        
        // Upload to Arweave via Turbo
        const result = await turbo.upload({
          data: processedContentBuffer,
          dataItemOpts: {
            tags: [
              { name: 'Content-Type', value: mimeType },
              { name: 'Path', value: path }
            ]
          }
        });
        
        fileMapping[path] = result.id;
        totalCostWinston += Number(result.winc) || 0;
        console.log(`🎨 [Turbo] Processed CSS asset: ${path} -> ${result.id}`);
      } catch (error) {
        console.error(`❌ [Turbo] Failed to process CSS asset ${path}:`, error);
      }
    }
  }

  // Pass 3: Upload HTML pages with URL replacement using complete file mapping
  console.log("🔄 [Turbo] Pass 3: Processing HTML pages with URL replacement...");
  console.log(`📋 [Debug] Complete fileMapping now contains ${Object.keys(fileMapping).length} entries`);
  
  for (const [path, content] of pages.entries()) {
    try {
      console.log(`🔗 [Turbo] Processing HTML with URL replacement: ${path}`);
      const processedContentString = replaceUrlsWithTxIds(content, fileMapping);
      
      // Upload processed content to Arweave
      const result = await turbo.upload({
        data: Buffer.from(processedContentString, 'utf8'),
        dataItemOpts: {
          tags: [
            { name: 'Content-Type', value: 'text/html' },
            { name: 'Path', value: path }
          ]
        }
      });
      
      fileMapping[path] = result.id;
      totalCostWinston += Number(result.winc) || 0;
      console.log(`🔗 [Turbo] Processed HTML page: ${path} -> ${result.id}`);
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
  const manifestResult = await turbo.upload({
    data: JSON.stringify(manifest, null, 2),
    dataItemOpts: {
      tags: [
        { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
        { name: 'Type', value: 'manifest' }
      ]
    }
  });
  totalCostWinston += Number(manifestResult.winc) || 0;
  
  console.log(`📋 [Turbo] Created manifest: ${manifestResult.id}`);
  
  // Convert winston to AR for final cost reporting
  const totalCostAR = totalCostWinston / 1000000000000; // 1 AR = 10^12 winston

  console.log(`✅ [Turbo] All files processed successfully`);
  console.log(`💰 [Turbo] Total deployment cost: ${totalCostWinston} winc (${totalCostAR.toFixed(6)} AR)`);
  
  return {
    bundleId: manifestResult.id,
    manifestUrl: `https://arweave.net/${manifestResult.id}`,
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
  
  // Create lookup for ALL files with comprehensive path variations
  const lookup: Record<string, string> = {};
  for (const [path, txId] of Object.entries(fileMapping)) {
    // Store exact path
    lookup[path] = txId;
    
    // For HTML files, create variations
    if (path.endsWith('.html')) {
      const withoutExt = path.replace('.html', '');
      lookup[withoutExt] = txId;
      
      // Also try without leading slash
      if (withoutExt.startsWith('/')) {
        lookup[withoutExt.substring(1)] = txId;
      }
    }
    
    // For all files, try without leading slash
    if (path.startsWith('/')) {
      lookup[path.substring(1)] = txId;
    }
  }
  
  // Function to attempt URL replacement
  const tryReplaceUrl = (url: string): string | null => {
    if (!url || url.trim() === '') return null;
    
    // Skip external URLs, special protocols, fragments, and data URLs
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
    
    // Remove trailing slash for normalization
    const baseUrlNoSlash = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const baseUrlWithSlash = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    
    // Try various forms of the URL
    const urlVariations = [
      baseUrl,                                                          // exact as-is
      baseUrlNoSlash,                                                   // without trailing slash
      baseUrlWithSlash,                                                 // with trailing slash
      baseUrl.startsWith('/') ? baseUrl : '/' + baseUrl,               // with leading slash
      baseUrl.startsWith('/') ? baseUrl.substring(1) : baseUrl,        // without leading slash
      baseUrlNoSlash.startsWith('/') ? baseUrlNoSlash : '/' + baseUrlNoSlash, // no trail slash + leading slash
      baseUrlNoSlash.startsWith('/') ? baseUrlNoSlash.substring(1) : baseUrlNoSlash, // no trail slash + no leading slash
      baseUrl + '.html',                                                // add .html
      baseUrlNoSlash + '.html',                                         // no trail slash + .html
      (baseUrl.startsWith('/') ? baseUrl : '/' + baseUrl) + '.html',    // leading slash + .html
      (baseUrlNoSlash.startsWith('/') ? baseUrlNoSlash : '/' + baseUrlNoSlash) + '.html', // lead slash + no trail + .html
      (baseUrl.startsWith('/') ? baseUrl.substring(1) : baseUrl) + '.html',    // no lead slash + .html
      (baseUrlNoSlash.startsWith('/') ? baseUrlNoSlash.substring(1) : baseUrlNoSlash) + '.html' // no lead + no trail + .html
    ];
    
    // Handle docs/ prefix variations
    const normalizedBase = baseUrl.startsWith('/') ? baseUrl.substring(1) : baseUrl;
    const normalizedBaseNoSlash = normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase;
    
    if (normalizedBase.startsWith('docs/')) {
      // Strip docs/ prefix to match actual file paths
      const withoutDocs = normalizedBase.substring(5); // Remove 'docs/'
      const withoutDocsNoSlash = withoutDocs.endsWith('/') ? withoutDocs.slice(0, -1) : withoutDocs;
      
      urlVariations.push(
        withoutDocs,                                    // docs/quickstart/ -> quickstart/
        withoutDocsNoSlash,                             // docs/quickstart/ -> quickstart
        '/' + withoutDocs,                              // docs/quickstart/ -> /quickstart/
        '/' + withoutDocsNoSlash,                       // docs/quickstart/ -> /quickstart
        withoutDocs + '.html',                          // docs/quickstart/ -> quickstart/.html
        withoutDocsNoSlash + '.html',                   // docs/quickstart/ -> quickstart.html
        '/' + withoutDocs + '.html',                    // docs/quickstart/ -> /quickstart/.html
        '/' + withoutDocsNoSlash + '.html'              // docs/quickstart/ -> /quickstart.html
      );
    }
    
    // Remove duplicates while preserving order
    const uniqueVariations = [...new Set(urlVariations)];
    
    for (const variation of uniqueVariations) {
      if (lookup[variation]) {
        const txId = lookup[variation];
        return `https://arweave.net/${txId}${queryAndFragment}`;
      }
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

