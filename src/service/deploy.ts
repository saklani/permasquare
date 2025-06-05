import { TurboFactory, ArweaveSigner } from '@ardrive/turbo-sdk';
import { listFiles, getMultipleFiles } from './storage';
import { loadWalletFromEnv, fundBundlerIfNeeded, getWalletBalance } from './arweave';

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
  
  // Use provided wallet or load from environment/file
  let wallet = jwkWallet;
  if (!wallet) {
    try {
      wallet = await loadWalletFromEnv();
      console.log(`🔑 [Turbo] Using wallet from environment/file`);
    } catch (error) {
      throw new Error(`No wallet provided and could not load from environment: ${error}`);
    }
  }
  
  // Get estimated cost for payment verification
  const costEstimate = await estimateDeploymentCost(hostname);
  console.log(`💰 [Turbo] Estimated cost: ${costEstimate.formattedCost} AR (${costEstimate.formattedSize})`);
  
  // Check if bundler funding is needed
  const fundingResult = await fundBundlerIfNeeded(wallet, costEstimate.totalCostAR);
  if (!fundingResult.funded) {
    throw new Error(`Bundler funding failed: ${fundingResult.error}`);
  }
  
  // Initialize turbo with verified wallet
  const turbo = TurboFactory.authenticated({
    privateKey: wallet
  });
  
  // Get all site content
  const { pages, assets } = await getSiteContent(hostname);
  console.log(`📦 [Turbo] Loading ${pages.size} pages and ${assets.size} assets`);
  
  // Track total costs
  let totalCostWinston = 0;
  
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
    totalCostWinston += Number(result.winc) || 0;
    console.log(`📄 [Turbo] Uploaded page: ${path} -> ${result.id} (${result.winc || 0} winc)`);
  }
  
  // Upload assets (with CSS preprocessing)
  for (const [path, content] of assets.entries()) {
    const mimeType = getMimeType(path);
    let processedContent = content;
    
    // Process CSS files to update internal references
    if (mimeType === 'text/css') {
      processedContent = Buffer.from(
        preprocessCssContent(content.toString('utf8'), fileMapping), 
        'utf8'
      );
    }
    
    const result = await turbo.upload({
      data: processedContent,
      dataItemOpts: {
        tags: [
          { name: 'Content-Type', value: mimeType },
          { name: 'Path', value: path }
        ]
      }
    });
    fileMapping[path] = result.id;
    totalCostWinston += Number(result.winc) || 0;
    console.log(`🎨 [Turbo] Uploaded asset: ${path} -> ${result.id} (${result.winc || 0} winc)`);
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
    totalCostWinston += Number(result.winc) || 0;
    console.log(`🔄 [Turbo] Updated page with links: ${path} -> ${result.id} (${result.winc || 0} winc)`);
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
  
  totalCostWinston += Number(manifestResult.winc) || 0;
  console.log(`📋 [Turbo] Uploaded manifest: ${manifestResult.id} (${manifestResult.winc || 0} winc)`);
  
  // Convert winston to AR for final cost reporting
  const totalCostAR = totalCostWinston / 1000000000000; // 1 AR = 10^12 winston
  
  console.log(`✅ [Turbo] All files uploaded successfully`);
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

interface PathVariation {
  original: string;
  normalized: string;
  withoutExtension?: string;
  directory?: string;
}

interface ReplacementContext {
  attribute: string;
  quote: string;
  value: string;
}

function replaceUrlsWithTxIds(html: string, fileMapping: Record<string, string>): string {
  // Step 1: Build optimized path lookup with all variations
  const pathLookup = buildPathLookup(fileMapping);
  
  // Step 2: Single-pass replacement using comprehensive regex
  let updated = html;
  
  // Combined regex pattern to match all URL contexts in one pass
  const urlPattern = /((?:href|src|action|data-src|data-href|content|srcset)=["'])([^"']*)(["'])|(?:url\()(["']?)([^)'"]*)\4(\))|(?:import\s*\()(["'])([^"']*)\7(\))/g;
  
  updated = updated.replace(urlPattern, (match, attrPrefix, attrValue, attrSuffix, cssQuote1, cssValue, cssSuffix, jsPrefix, jsValue, jsSuffix) => {
    let url: string;
    let isAttribute = false;
    let isCss = false;
    let isJs = false;
    
    if (attrPrefix && attrValue !== undefined) {
      // HTML attribute
      url = attrValue;
      isAttribute = true;
    } else if (cssValue !== undefined) {
      // CSS url()
      url = cssValue;
      isCss = true;
    } else if (jsValue !== undefined) {
      // JavaScript dynamic import
      url = jsValue;
      isJs = true;
    } else {
      return match;
    }
    
    // Skip external URLs and data URIs
    if (shouldSkipUrl(url)) {
      return match;
    }
    
    // Find replacement
    const txId = findPathMapping(url, pathLookup);
    if (!txId) {
      return match;
    }
    
    const arweaveUrl = `https://arweave.net/${txId}`;
    
    // Return appropriate replacement based on context
    if (isAttribute) {
      if (attrPrefix.includes('srcset=')) {
        // Handle srcset with multiple URLs
        const updatedSrcset = attrValue.replace(/([^\s,]+)/g, (srcUrl: string) => {
          const srcTxId = findPathMapping(srcUrl.split(' ')[0], pathLookup);
          return srcTxId ? `https://arweave.net/${srcTxId}${srcUrl.includes(' ') ? ' ' + srcUrl.split(' ').slice(1).join(' ') : ''}` : srcUrl;
        });
        return `${attrPrefix}${updatedSrcset}${attrSuffix}`;
      } else {
        return `${attrPrefix}${arweaveUrl}${attrSuffix}`;
      }
    } else if (isCss) {
      return `url(${cssQuote1 || ''}${arweaveUrl}${cssQuote1 || ''})`;
    } else if (isJs) {
      return `${jsPrefix}${jsValue.charAt(0)}${arweaveUrl}${jsValue.charAt(0)}${jsSuffix}`;
    }
    
    return match;
  });
  
  // Step 3: Handle any remaining JSON references (for manifests, configs)
  updated = replaceJsonReferences(updated, pathLookup);
  
  console.log(`🔗 [URL Replace] Processed content with ${Object.keys(fileMapping).length} files mapped`);
  return updated;
}

function buildPathLookup(fileMapping: Record<string, string>): Map<string, string> {
  const lookup = new Map<string, string>();
  
  for (const [originalPath, txId] of Object.entries(fileMapping)) {
    const variations = generatePathVariations(originalPath);
    
    for (const variation of variations) {
      // Use the most specific (longest) path if there are conflicts
      if (!lookup.has(variation) || variation.length > (lookup.get(variation)?.length || 0)) {
        lookup.set(variation, txId);
      }
    }
  }
  
  return lookup;
}

function generatePathVariations(path: string): string[] {
  const variations = new Set<string>();
  
  // Normalize path
  const normalizedPath = path.replace(/\/+/g, '/');
  variations.add(normalizedPath);
  
  // Without leading slash
  if (normalizedPath.startsWith('/')) {
    variations.add(normalizedPath.substring(1));
  }
  
  // With leading slash (if doesn't have one)
  if (!normalizedPath.startsWith('/')) {
    variations.add('/' + normalizedPath);
  }
  
  // For HTML files, add variations without .html extension
  if (normalizedPath.endsWith('.html')) {
    const withoutExt = normalizedPath.replace(/\.html$/, '');
    variations.add(withoutExt);
    if (withoutExt.startsWith('/')) {
      variations.add(withoutExt.substring(1));
    }
    if (!withoutExt.startsWith('/')) {
      variations.add('/' + withoutExt);
    }
  }
  
  // For index.html, add directory variations
  if (normalizedPath.endsWith('/index.html')) {
    const dirPath = normalizedPath.replace('/index.html', '/');
    variations.add(dirPath);
    variations.add(dirPath.slice(0, -1)); // without trailing slash
    
    if (dirPath !== '/') {
      variations.add(dirPath.substring(1)); // without leading slash
      variations.add(dirPath.substring(1).slice(0, -1)); // without leading and trailing slash
    }
  }
  
  // For files without extension in root, try with .html
  if (!normalizedPath.includes('.') && !normalizedPath.includes('/')) {
    variations.add(normalizedPath + '.html');
    variations.add('/' + normalizedPath + '.html');
  }
  
  return Array.from(variations);
}

function findPathMapping(url: string, pathLookup: Map<string, string>): string | null {
  // Clean URL (remove query params and fragments)
  const cleanUrl = url.split('?')[0].split('#')[0].trim();
  
  if (!cleanUrl || cleanUrl === '/') {
    return pathLookup.get('/index.html') || pathLookup.get('index.html') || null;
  }
  
  // Direct lookup
  if (pathLookup.has(cleanUrl)) {
    return pathLookup.get(cleanUrl)!;
  }
  
  // Try path variations
  const variations = generatePathVariations(cleanUrl);
  for (const variation of variations) {
    if (pathLookup.has(variation)) {
      return pathLookup.get(variation)!;
    }
  }
  
  // Fallback: try relative path resolution
  const relativePath = cleanUrl.replace(/^\.?\/+/, '');
  if (relativePath !== cleanUrl && pathLookup.has(relativePath)) {
    return pathLookup.get(relativePath)!;
  }
  
  return null;
}

function shouldSkipUrl(url: string): boolean {
  if (!url || url.trim() === '') return true;
  
  const skipPatterns = [
    /^https?:\/\//,           // External URLs
    /^\/\//,                  // Protocol-relative URLs
    /^#/,                     // Anchors
    /^mailto:/,               // Email links
    /^tel:/,                  // Phone links
    /^data:/,                 // Data URIs
    /^javascript:/,           // JavaScript URIs
    /^blob:/,                 // Blob URLs
    /arweave\.net/,           // Already processed
    /^[\w-]+:\/\//           // Other protocols
  ];
  
  return skipPatterns.some(pattern => pattern.test(url));
}

function replaceJsonReferences(content: string, pathLookup: Map<string, string>): string {
  // Handle JSON-like references in manifests, service workers, etc.
  const jsonPattern = /"([^"]*\.[a-zA-Z0-9]{1,5})"/g;
  
  return content.replace(jsonPattern, (match, path) => {
    if (shouldSkipUrl(path)) {
      return match;
    }
    
    const txId = findPathMapping(path, pathLookup);
    return txId ? `"https://arweave.net/${txId}"` : match;
  });
}

// Keep the existing cleanupRelativeLinks function but simplify it
function cleanupRelativeLinks(html: string, fileMapping: Record<string, string>): string {
  // This function is now mostly redundant due to the improved main replacement
  // but keeping it for any edge cases
  const pathLookup = buildPathLookup(fileMapping);
  
  const linkPattern = /((?:href|src|action|data-src|data-href)=["'])([^"']*)(["'])/g;
  
  return html.replace(linkPattern, (match, prefix, url, suffix) => {
    if (shouldSkipUrl(url)) {
      return match;
    }
    
    const txId = findPathMapping(url, pathLookup);
    return txId ? `${prefix}https://arweave.net/${txId}${suffix}` : match;
  });
}

function preprocessCssContent(cssContent: string, fileMapping: Record<string, string>): string {
  console.log('🎨 [CSS] Processing CSS content...');
  
  // Use the same optimized path lookup
  const pathLookup = buildPathLookup(fileMapping);
  let updatedCss = cssContent;
  
  // Combined regex for all CSS URL patterns
  const cssUrlPattern = /(@import\s+(?:url\()?['"](.*?)['"](?:\))?)|(?:url\((['"]?)(.*?)\3\))/g;
  
  updatedCss = updatedCss.replace(cssUrlPattern, (match, importMatch, importPath, urlQuote, urlPath) => {
    let targetPath: string;
    let isImport = false;
    
    if (importMatch && importPath) {
      // @import statement
      targetPath = importPath;
      isImport = true;
    } else if (urlPath !== undefined) {
      // url() reference
      targetPath = urlPath;
    } else {
      return match;
    }
    
    // Skip external URLs and data URIs
    if (shouldSkipUrl(targetPath)) {
      return match;
    }
    
    const txId = findPathMapping(targetPath, pathLookup);
    if (txId) {
      const arweaveUrl = `https://arweave.net/${txId}`;
      
      if (isImport) {
        console.log(`📥 [CSS Import] ${targetPath} -> ${arweaveUrl}`);
        return match.replace(targetPath, arweaveUrl);
      } else {
        console.log(`🎨 [CSS URL] ${targetPath} -> ${arweaveUrl}`);
        return `url(${urlQuote || ''}${arweaveUrl}${urlQuote || ''})`;
      }
    }
    
    return match;
  });
  
  console.log(`🎨 [CSS] Processed CSS file with ${pathLookup.size} potential replacements`);
  return updatedCss;
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