import { TurboFactory, ArweaveSigner } from '@ardrive/turbo-sdk';
import { listFiles, getMultipleFiles } from './storage';
import { loadWalletFromEnv, getWalletBalance } from './arweave';

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
  
  // Initialize turbo with the wallet - no pre-funding check
  const turbo = TurboFactory.authenticated({
    privateKey: wallet
  });
  
  // Get all site content
  const { pages, assets } = await getSiteContent(hostname);
  console.log(`📦 [Turbo] Loading ${pages.size} pages and ${assets.size} assets`);
  
  const fileMapping: Record<string, string> = {};
  let totalCostWinston = 0;

  // Pass 1: Upload all non-CSS assets
  console.log("🔄 [Turbo] Pass 1: Uploading non-CSS assets...");
  for (const [path, content] of assets.entries()) {
    const mimeType = getMimeType(path);
    if (mimeType !== 'text/css') {
      try {
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
        console.log(`🎨 [Turbo] Uploaded non-CSS asset: ${path} -> ${result.id} (${result.winc || 0} winc)`);
      } catch (error) {
        console.error(`❌ [Turbo] Failed to upload non-CSS asset ${path}:`, error);
        // Optionally, rethrow or collect errors to report later
        // For now, we'll log and continue, but this item won't be in fileMapping
      }
    }
  }

  // Pass 2: Process and upload CSS assets
  console.log("🔄 [Turbo] Pass 2: Processing and uploading CSS assets...");
  for (const [path, content] of assets.entries()) {
    const mimeType = getMimeType(path);
    if (mimeType === 'text/css') {
      let processedContentBuffer = content; // Default to original if processing fails
      try {
        console.log(`🎨 [Turbo] Processing CSS: ${path}`);
        const processedCssString = preprocessCssContent(content.toString('utf8'), fileMapping, path);
        processedContentBuffer = Buffer.from(processedCssString, 'utf8');
        
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
        console.log(`🎨 [Turbo] Uploaded CSS asset: ${path} -> ${result.id} (${result.winc || 0} winc)`);
      } catch (error) {
        console.error(`❌ [Turbo] Failed to process or upload CSS asset ${path}:`, error);
        // If CSS processing/upload fails, its links might be broken or it might be missing.
      }
    }
  }

  // Pass 3: Process and upload HTML pages
  console.log("🔄 [Turbo] Pass 3: Processing and uploading HTML pages...");
  for (const [path, content] of pages.entries()) {
    let processedContentString = content; // Default to original
    try {
      console.log(`📄 [Turbo] Processing HTML: ${path}`);
      processedContentString = replaceUrlsWithTxIds(content, fileMapping);
      
      const result = await turbo.upload({
        data: processedContentString,
        dataItemOpts: {
          tags: [
            { name: 'Content-Type', value: 'text/html' },
            { name: 'Path', value: path }
          ]
        }
      });
      fileMapping[path] = result.id;
      totalCostWinston += Number(result.winc) || 0;
      console.log(`📄 [Turbo] Uploaded HTML page: ${path} -> ${result.id} (${result.winc || 0} winc)`);
    } catch (error) {
      console.error(`❌ [Turbo] Failed to process or upload HTML page ${path}:`, error);
    }
  }
  
  // Create and upload manifest
  console.log("📋 [Turbo] Creating and uploading manifest...");
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
  let updated = html;
  
  console.log(`🔗 [URL Replace] Starting replacement for ${Object.keys(fileMapping).length} files`);
  console.log(`🔗 [URL Replace] Available file mappings:`, Object.keys(fileMapping));
  
  // Step 2: Replace HTML attribute URLs (href, src, action, etc.)
  // Handle quoted attributes
  const htmlAttrPattern = /((?:href|src|action|data-src|data-href|content|poster|background)=)(["'])([^"']*?)\2/gi;
  updated = updated.replace(htmlAttrPattern, (match, attrName, quote, url) => {
    if (shouldSkipUrl(url)) {
      return match;
    }
    
    const txId = findPathMapping(url, pathLookup);
    if (txId) {
      const arweaveUrl = `https://arweave.net/${txId}`;
      console.log(`🔗 [HTML Attr] ${url} -> ${arweaveUrl}`);
      return `${attrName}${quote}${arweaveUrl}${quote}`;
    }
    
    return match;
  });
  
  // Handle unquoted attributes (less common but valid HTML)
  const htmlAttrUnquotedPattern = /((?:href|src|action|data-src|data-href|content|poster|background)=)([^\s>"']+)/gi;
  updated = updated.replace(htmlAttrUnquotedPattern, (match, attrName, url) => {
    if (shouldSkipUrl(url)) {
      return match;
    }
    
    const txId = findPathMapping(url, pathLookup);
    if (txId) {
      const arweaveUrl = `https://arweave.net/${txId}`;
      console.log(`🔗 [HTML Unquoted] ${url} -> ${arweaveUrl}`);
      return `${attrName}"${arweaveUrl}"`;
    }
    
    return match;
  });
  
  // Step 3: Handle srcset attributes separately (they can contain multiple URLs)
  const srcsetPattern = /(srcset=)(["'])([^"']*?)\2/gi;
  updated = updated.replace(srcsetPattern, (match, attrName, quote, srcsetValue) => {
    const updatedSrcset = srcsetValue.replace(/(\S+?)(\s+[0-9\.]+[wx]?)?(?=\s*,|\s*$)/g, (urlMatch: string, url: string, descriptor: string = '') => {
      if (shouldSkipUrl(url.trim())) {
        return urlMatch;
      }
      
      const txId = findPathMapping(url.trim(), pathLookup);
      if (txId) {
        const arweaveUrl = `https://arweave.net/${txId}`;
        console.log(`🔗 [Srcset] ${url} -> ${arweaveUrl}`);
        return `${arweaveUrl}${descriptor}`;
      }
      
      return urlMatch;
    });
    
    return `${attrName}${quote}${updatedSrcset}${quote}`;
  });
  
  // Step 4: Replace CSS url() references
  const cssUrlPattern = /url\s*\(\s*(["']?)([^"'\)]*?)\1\s*\)/g;
  updated = updated.replace(cssUrlPattern, (match, quote, url) => {
    if (shouldSkipUrl(url)) {
      return match;
    }
    
    const txId = findPathMapping(url, pathLookup);
    if (txId) {
      const arweaveUrl = `https://arweave.net/${txId}`;
      console.log(`🔗 [CSS url()] ${url} -> ${arweaveUrl}`);
      return `url(${quote}${arweaveUrl}${quote})`;
    }
    
    return match;
  });
  
  // Step 5: Replace JavaScript dynamic imports
  const jsImportPattern = /(import\s*\(\s*)(["'])([^"']*?)\2(\s*\))/g;
  updated = updated.replace(jsImportPattern, (match, importPrefix, quote, url, importSuffix) => {
    if (shouldSkipUrl(url)) {
      return match;
    }
    
    const txId = findPathMapping(url, pathLookup);
    if (txId) {
      const arweaveUrl = `https://arweave.net/${txId}`;
      console.log(`🔗 [JS Import] ${url} -> ${arweaveUrl}`);
      return `${importPrefix}${quote}${arweaveUrl}${quote}${importSuffix}`;
    }
    
    return match;
  });
  
  // Step 6: Handle any remaining JSON references (for manifests, configs)
  updated = replaceJsonReferences(updated, pathLookup);
  
  console.log(`🔗 [URL Replace] Completed processing`);
  return updated;
}

function buildPathLookup(fileMapping: Record<string, string>): Map<string, string> {
  const lookup = new Map<string, string>();
  const conflicts = new Map<string, string[]>();
  
  for (const [originalPath, txId] of Object.entries(fileMapping)) {
    const variations = generatePathVariations(originalPath);
    
    for (const variation of variations) {
      if (lookup.has(variation)) {
        // Track conflicts for debugging
        if (!conflicts.has(variation)) {
          conflicts.set(variation, [lookup.get(variation)!]);
        }
        conflicts.get(variation)!.push(txId);
        
        // Use the most specific (longest original path) if there are conflicts
        const existingOriginal = Object.keys(fileMapping).find(key => fileMapping[key] === lookup.get(variation)!);
        if (!existingOriginal || originalPath.length > existingOriginal.length) {
          lookup.set(variation, txId);
        }
      } else {
        lookup.set(variation, txId);
      }
    }
  }
  
  // Log conflicts for debugging
  if (conflicts.size > 0) {
    console.warn(`⚠️ [Path Lookup] Found ${conflicts.size} path conflicts:`, Array.from(conflicts.entries()));
  }
  
  return lookup;
}

function generatePathVariations(path: string): string[] {
  const variations = new Set<string>();
  
  // Normalize path - remove double slashes and trailing slashes (except root)
  let normalizedPath = path.replace(/\/+/g, '/');
  if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  variations.add(normalizedPath);
  
  // Handle relative paths that start with ./
  if (normalizedPath.startsWith('./')) {
    const withoutDotSlash = normalizedPath.substring(2);
    if (withoutDotSlash) {
      variations.add('/' + withoutDotSlash);
      variations.add(withoutDotSlash);
    }
  }
  
  // Without leading slash
  if (normalizedPath.startsWith('/')) {
    const withoutLeading = normalizedPath.substring(1);
    if (withoutLeading) {
      variations.add(withoutLeading);
      // Also add with ./ prefix for relative paths
      variations.add('./' + withoutLeading);
    }
  }
  
  // With leading slash (if doesn't have one)
  if (!normalizedPath.startsWith('/') && normalizedPath) {
    variations.add('/' + normalizedPath);
    // Also add relative path version
    if (!normalizedPath.startsWith('./')) {
      variations.add('./' + normalizedPath);
    }
  }
  
  // Handle URL encoded versions
  try {
    const decoded = decodeURIComponent(normalizedPath);
    if (decoded !== normalizedPath) {
      variations.add(decoded);
      if (decoded.startsWith('/')) {
        const withoutLeading = decoded.substring(1);
        if (withoutLeading) {
          variations.add(withoutLeading);
          variations.add('./' + withoutLeading);
        }
      } else {
        variations.add('/' + decoded);
        if (!decoded.startsWith('./')) {
          variations.add('./' + decoded);
        }
      }
    }
  } catch (e) {
    // Invalid URL encoding, skip
  }
  
  // For HTML files, add variations without .html extension
  if (normalizedPath.endsWith('.html')) {
    const withoutExt = normalizedPath.replace(/\.html$/, '');
    if (withoutExt) {
      variations.add(withoutExt);
      if (withoutExt.startsWith('/')) {
        const withoutLeadingSlash = withoutExt.substring(1);
        if (withoutLeadingSlash) {
          variations.add(withoutLeadingSlash);
        }
      } else {
        variations.add('/' + withoutExt);
      }
    }
  }
  
  // For index.html files, add directory variations
  if (normalizedPath.endsWith('/index.html')) {
    const dirPath = normalizedPath.replace('/index.html', '/');
    variations.add(dirPath);
    
    // Directory without trailing slash
    if (dirPath !== '/') {
      const dirWithoutSlash = dirPath.slice(0, -1);
      variations.add(dirWithoutSlash);
      
      // Also without leading slash
      if (dirWithoutSlash.startsWith('/')) {
        const relative = dirWithoutSlash.substring(1);
        if (relative) {
          variations.add(relative);
        }
      }
    }
    
    // Directory without leading slash
    if (dirPath.startsWith('/') && dirPath !== '/') {
      variations.add(dirPath.substring(1));
    }
  } else if (normalizedPath.endsWith('index.html')) {
    // Handle case where it's just "index.html" (root index)
    variations.add('/');
    variations.add('');
  }
  
  // For paths without extension that might be HTML files
  if (!normalizedPath.includes('.') && normalizedPath) {
    variations.add(normalizedPath + '.html');
    if (!normalizedPath.startsWith('/')) {
      variations.add('/' + normalizedPath + '.html');
    } else {
      const withoutSlash = normalizedPath.substring(1);
      if (withoutSlash) {
        variations.add(withoutSlash + '.html');
      }
    }
    
    // Also try as index.html in directory
    variations.add(normalizedPath + '/index.html');
    if (!normalizedPath.startsWith('/')) {
      variations.add('/' + normalizedPath + '/index.html');
    } else {
      const withoutSlash = normalizedPath.substring(1);
      if (withoutSlash) {
        variations.add(withoutSlash + '/index.html');
      }
    }
  }
  
  // Remove empty strings and duplicates
  const filtered = Array.from(variations).filter(v => v !== '');
  
  console.log(`🔗 [Path Variations] Generated ${filtered.length} variations for '${path}':`, filtered);
  return filtered;
}

function findPathMapping(url: string, pathLookup: Map<string, string>): string | null {
  // Clean URL (remove query params and fragments) and decode URL encoding
  let cleanUrl = url.split('?')[0].split('#')[0].trim();
  
  // Decode URL encoding
  try {
    cleanUrl = decodeURIComponent(cleanUrl);
  } catch (error) {
    console.warn(`⚠️ [URL Decode] Failed to decode URL '${cleanUrl}', using as-is`);
  }
  
  if (!cleanUrl) {
    return null;
  }
  
  // Additional cleanup for common URL issues
  cleanUrl = cleanUrl.replace(/\/+/g, '/'); // Remove double slashes
  if (cleanUrl.length > 1 && cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1); // Remove trailing slash except for root
  }
  
  // Normalize relative paths that start with ./
  if (cleanUrl.startsWith('./')) {
    cleanUrl = cleanUrl.substring(2);
  }
  
  // Handle root path
  if (cleanUrl === '/' || cleanUrl === '') {
    const rootOptions = ['/index.html', 'index.html', '/'];
    for (const option of rootOptions) {
      if (pathLookup.has(option)) {
        return pathLookup.get(option)!;
      }
    }
    return null;
  }
  
  // Direct lookup first
  if (pathLookup.has(cleanUrl)) {
    const txId = pathLookup.get(cleanUrl)!;
    console.log(`🎯 [Path Found] Direct match: '${cleanUrl}' -> ${txId}`);
    return txId;
  }
  
  // Try path variations
  const variations = generatePathVariations(cleanUrl);
  for (const variation of variations) {
    if (pathLookup.has(variation)) {
      const txId = pathLookup.get(variation)!;
      console.log(`🎯 [Path Found] Variation match: '${cleanUrl}' via '${variation}' -> ${txId}`);
      return txId;
    }
  }
  
  // Fallback: try removing leading dots and slashes
  const cleanedPath = cleanUrl.replace(/^\.?\/+/, '');
  if (cleanedPath !== cleanUrl && cleanedPath) {
    if (pathLookup.has(cleanedPath)) {
      const txId = pathLookup.get(cleanedPath)!;
      console.log(`🎯 [Path Found] Cleaned match: '${cleanUrl}' via '${cleanedPath}' -> ${txId}`);
      return txId;
    }
  }
  
  console.warn(`⚠️ [Path Not Found] No mapping found for: '${cleanUrl}'`);
  return null;
}

function shouldSkipUrl(url: string): boolean {
  if (!url || url.trim() === '') return true;
  
  const trimmedUrl = url.trim();
  
  // Skip very short URLs that are likely not actual file paths
  if (trimmedUrl.length < 2) return true;
  
  const skipPatterns = [
    /^https?:\/\//i,         // External URLs (case insensitive)
    /^\/\//,                 // Protocol-relative URLs
    /^#/,                    // Anchors
    /^mailto:/i,             // Email links
    /^tel:/i,                // Phone links
    /^data:/i,               // Data URIs
    /^javascript:/i,         // JavaScript URIs
    /^blob:/i,               // Blob URLs
    /^about:/i,              // About URIs
    /^chrome:/i,             // Chrome URIs
    /^moz-extension:/i,      // Firefox extension URIs
    /^chrome-extension:/i,   // Chrome extension URIs
    /arweave\.net/i,         // Already processed Arweave URLs
    /^[\w-]+:\/\//,          // Other protocols
    /^{.*}$/,                // Template literals or variables
    /^\$\{.*\}$/             // Template variables
  ];
  
  // Also skip if it looks like a CDN or external domain
  const externalDomainPatterns = [
    /^\/\/[^\/]+\./,         // Protocol-relative with domain
    /fonts\.googleapis\.com/i,
    /fonts\.gstatic\.com/i,
    /ajax\.googleapis\.com/i,
    /code\.jquery\.com/i,
    /cdn\./i,
    /amazonaws\.com/i,
    /jsdelivr\.net/i,
    /unpkg\.com/i,
    /cdnjs\.cloudflare\.com/i
  ];
  
  return skipPatterns.some(pattern => pattern.test(trimmedUrl)) ||
         externalDomainPatterns.some(pattern => pattern.test(trimmedUrl));
}

function replaceJsonReferences(content: string, pathLookup: Map<string, string>): string {
  // Handle JSON-like references in manifests, service workers, etc.
  // Look for quoted strings that look like file paths (contain common file extensions)
  const jsonPattern = /"([^"]*\.(?:html|htm|css|js|mjs|jsx|ts|tsx|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|otf|json|xml|txt|pdf|mp4|mp3|wav|ogg)(?:\?[^"]*)?(?:#[^"]*)?)"/gi;
  
  return content.replace(jsonPattern, (match, path) => {
    // Clean the path (remove query params and fragments for lookup)
    const cleanPath = path.split('?')[0].split('#')[0];
    
    if (shouldSkipUrl(cleanPath)) {
      return match;
    }
    
    const txId = findPathMapping(cleanPath, pathLookup);
    if (txId) {
      const arweaveUrl = `https://arweave.net/${txId}`;
      console.log(`🔗 [JSON Ref] ${path} -> ${arweaveUrl}`);
      // Preserve query params and fragments if they exist
      const queryAndFragment = path.substring(cleanPath.length);
      return `"${arweaveUrl}${queryAndFragment}"`;
    }
    
    return match;
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

function preprocessCssContent(cssContent: string, fileMapping: Record<string, string>, cssFilePath: string): string {
  console.log(`🎨 [CSS] Processing CSS content for: ${cssFilePath}`);
  
  const pathLookup = buildPathLookup(fileMapping);
  let updatedCss = cssContent;
  
  // Handle @import statements
  const importPattern = /@import\s+(?:url\s*\(\s*)?(["'])([^"']*?)\1(?:\s*\))?/g;
  updatedCss = updatedCss.replace(importPattern, (match, quote, importPath) => {
    if (shouldSkipUrl(importPath)) {
      return match;
    }

         const resolvedPath = resolveRelativeUrl(importPath, cssFilePath);
    const txId = findPathMapping(resolvedPath, pathLookup);
    
    if (txId) {
      const arweaveUrl = `https://arweave.net/${txId}`;
      console.log(`📥 [CSS Import] '${importPath}' (resolved to '${resolvedPath}') in '${cssFilePath}' -> ${arweaveUrl}`);
      return match.replace(importPath, arweaveUrl);
    }
    
    return match;
  });
  
  // Handle url() references
  const urlPattern = /url\s*\(\s*(["']?)([^"'\)]*?)\1\s*\)/g;
  updatedCss = updatedCss.replace(urlPattern, (match, quote, urlPath) => {
    if (shouldSkipUrl(urlPath)) {
      return match;
    }

         const resolvedPath = resolveRelativeUrl(urlPath, cssFilePath);
    const txId = findPathMapping(resolvedPath, pathLookup);
    
    if (txId) {
      const arweaveUrl = `https://arweave.net/${txId}`;
      console.log(`🎨 [CSS URL] '${urlPath}' (resolved to '${resolvedPath}') in '${cssFilePath}' -> ${arweaveUrl}`);
      return `url(${quote}${arweaveUrl}${quote})`;
    }
    
    return match;
  });
  
  console.log(`🎨 [CSS] Finished processing CSS for: ${cssFilePath}`);
  return updatedCss;
}

function resolveRelativeUrl(url: string, basePath: string): string {
  // If the URL is already absolute (starts with /) or contains a protocol, return as-is
  if (url.startsWith('/') || url.includes(':')) {
    return url;
  }
  
  try {
    // Ensure basePath starts with a slash for correct URL resolution
    const normalizedBasePath = basePath.startsWith('/') ? basePath : '/' + basePath;
    
    // Use URL constructor to resolve relative paths
    const baseUrl = new URL(normalizedBasePath, 'file://localhost');
    const resolvedUrl = new URL(url, baseUrl);
    const resolvedPath = resolvedUrl.pathname;
    
    console.log(`🔗 [Path Resolve] Base: '${basePath}', Relative: '${url}', Resolved: '${resolvedPath}'`);
    return resolvedPath;
  } catch (error) {
    console.warn(`⚠️ [Path Resolve] Failed to resolve '${url}' relative to '${basePath}'. Using original. Error: ${error}`);
    return url;
  }
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