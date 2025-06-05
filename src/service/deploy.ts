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
  
  // Create comprehensive path mappings with all variations
  const pathMappings = new Map<string, string>();
  
  for (const [path, txId] of Object.entries(fileMapping)) {
    // Add the original path
    pathMappings.set(path, txId);
    
    // Add path without leading slash
    if (path.startsWith('/')) {
      pathMappings.set(path.substring(1), txId);
    }
    
    // For HTML files, create additional mappings
    if (path.endsWith('.html')) {
      const pathWithoutExt = path.replace(/\.html$/, '');
      pathMappings.set(pathWithoutExt, txId);
      
      // Without leading slash and extension
      if (pathWithoutExt.startsWith('/')) {
        pathMappings.set(pathWithoutExt.substring(1), txId);
      }
      
      // Handle index.html as directory root
      if (path.endsWith('/index.html')) {
        const dirPath = path.replace('/index.html', '/');
        pathMappings.set(dirPath, txId);
        pathMappings.set(dirPath.slice(0, -1), txId); // without trailing slash
        
        // Also add without leading slash
        if (dirPath.length > 1) {
          pathMappings.set(dirPath.substring(1), txId);
          pathMappings.set(dirPath.substring(1).slice(0, -1), txId);
        }
      }
    }
  }
  
  console.log(`🔗 [URL Replace] Created ${pathMappings.size} path mappings from ${Object.keys(fileMapping).length} files`);
  
  // Replace URLs in all possible attributes and contexts
  for (const [originalPath, txId] of pathMappings.entries()) {
    if (!originalPath) continue; // Skip empty paths
    
    const escapedPath = escapeRegex(originalPath);
    const patterns = [
      // Standard href and src attributes
      new RegExp(`href=["']${escapedPath}["']`, 'g'),
      new RegExp(`src=["']${escapedPath}["']`, 'g'),
      new RegExp(`action=["']${escapedPath}["']`, 'g'), // Forms
      new RegExp(`data-src=["']${escapedPath}["']`, 'g'), // Lazy loading
      new RegExp(`data-href=["']${escapedPath}["']`, 'g'), // Dynamic links
      new RegExp(`srcset=["'][^"']*${escapedPath}[^"']*["']`, 'g'), // Responsive images
      
      // CSS url() references  
      new RegExp(`url\\(["']?${escapedPath}["']?\\)`, 'g'),
      
      // Relative paths with ./
      new RegExp(`href=["']\\.\/${escapedPath.replace(/^\//, '')}["']`, 'g'),
      new RegExp(`src=["']\\.\/${escapedPath.replace(/^\//, '')}["']`, 'g'),
      
      // JavaScript string references (common in SPAs and dynamic content)
      new RegExp(`["']${escapedPath}["']`, 'g'),
      
      // Manifest and service worker references
      new RegExp(`"${escapedPath}"`, 'g'),
      
      // Meta tag content (for manifests, etc.)
      new RegExp(`content=["'][^"']*${escapedPath}[^"']*["']`, 'g')
    ];
    
    for (const pattern of patterns) {
      updated = updated.replace(pattern, (match) => {
        // Skip if this looks like it's already been replaced
        if (match.includes('arweave.net')) {
          return match;
        }
        
        const arweaveUrl = `https://arweave.net/${txId}`;
        
        // Handle different attribute types
        if (match.includes('href=')) {
          return match.replace(/href=["'][^"']*["']/, `href="${arweaveUrl}"`);
        } else if (match.includes('src=')) {
          return match.replace(/src=["'][^"']*["']/, `src="${arweaveUrl}"`);
        } else if (match.includes('action=')) {
          return match.replace(/action=["'][^"']*["']/, `action="${arweaveUrl}"`);
        } else if (match.includes('data-src=')) {
          return match.replace(/data-src=["'][^"']*["']/, `data-src="${arweaveUrl}"`);
        } else if (match.includes('data-href=')) {
          return match.replace(/data-href=["'][^"']*["']/, `data-href="${arweaveUrl}"`);
        } else if (match.includes('srcset=')) {
          return match.replace(new RegExp(escapedPath, 'g'), arweaveUrl);
        } else if (match.includes('url(')) {
          return match.replace(/url\([^)]*\)/, `url(${arweaveUrl})`);
        } else if (match.includes('content=')) {
          return match.replace(new RegExp(escapedPath, 'g'), arweaveUrl);
        } else if (match.match(/^["'].*["']$/)) {
          // JavaScript string - be more careful here
          return match.replace(new RegExp(`["']${escapedPath}["']`, 'g'), `"${arweaveUrl}"`);
        } else if (match.match(/^".*"$/)) {
          // JSON string
          return match.replace(new RegExp(`"${escapedPath}"`, 'g'), `"${arweaveUrl}"`);
        }
        
        return match;
      });
    }
  }
  
  // Clean up any remaining relative links
  updated = cleanupRelativeLinks(updated, fileMapping);
  
  return updated;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanupRelativeLinks(html: string, fileMapping: Record<string, string>): string {
  let updated = html;
  
  // Comprehensive pattern to catch all link attributes
  const linkPatterns = [
    /((?:href|src|action|data-src|data-href)=["'])([^"']*)(["'])/g,
    // Handle srcset attributes specially
    /(srcset=["'])([^"']*)(["'])/g
  ];
  
  for (const pattern of linkPatterns) {
    updated = updated.replace(pattern, (match, prefix, content, suffix) => {
      // For srcset, we need to handle multiple URLs
      if (prefix.includes('srcset=')) {
        const updatedContent = content.replace(/([^\s,]+)/g, (url: string) => {
          return processRelativeUrl(url, fileMapping) || url;
        });
        return `${prefix}${updatedContent}${suffix}`;
      } else {
        // Single URL
        const processedUrl = processRelativeUrl(content, fileMapping);
        return processedUrl ? `${prefix}${processedUrl}${suffix}` : match;
      }
    });
  }
  
  return updated;
}

function processRelativeUrl(url: string, fileMapping: Record<string, string>): string | null {
  // Skip external URLs, anchors, data URLs, and protocols
  if (url.startsWith('http') || 
      url.startsWith('//') || 
      url.startsWith('#') || 
      url.startsWith('mailto:') || 
      url.startsWith('tel:') ||
      url.startsWith('data:') ||
      url.startsWith('javascript:') ||
      url.includes('arweave.net')) {
    return null;
  }
  
  // Try multiple variations of the URL
  const urlVariations = [];
  let cleanUrl = url;
  
  // Remove query parameters and fragments for matching
  cleanUrl = cleanUrl.split('?')[0].split('#')[0];
  
  // Remove leading ./ or /
  const normalizedUrl = cleanUrl.replace(/^\.?\//, '/');
  urlVariations.push(normalizedUrl);
  
  // Try without leading slash
  if (normalizedUrl.startsWith('/')) {
    urlVariations.push(normalizedUrl.substring(1));
  }
  
  // If it doesn't end with an extension, try adding .html
  if (!normalizedUrl.includes('.')) {
    urlVariations.push(normalizedUrl + '.html');
    if (normalizedUrl.startsWith('/')) {
      urlVariations.push(normalizedUrl.substring(1) + '.html');
    }
  }
  
  // Try index.html variations for directory paths
  if (normalizedUrl.endsWith('/')) {
    urlVariations.push(normalizedUrl + 'index.html');
    if (normalizedUrl.startsWith('/')) {
      urlVariations.push(normalizedUrl.substring(1) + 'index.html');
    }
  }
  
  // Check if we have any of these variations mapped
  for (const variation of urlVariations) {
    for (const [path, txId] of Object.entries(fileMapping)) {
      if (path === variation || 
          path.endsWith(variation) || 
          variation.endsWith(path.replace(/^\//, ''))) {
        console.log(`🔗 [Cleanup] Mapping ${url} -> ${variation} -> ${txId}`);
        return `https://arweave.net/${txId}`;
      }
    }
  }
  
  return null;
}

function preprocessCssContent(cssContent: string, fileMapping: Record<string, string>): string {
  let updatedCss = cssContent;
  
  // Create comprehensive path mappings
  const pathMappings = new Map<string, string>();
  
  for (const [path, txId] of Object.entries(fileMapping)) {
    pathMappings.set(path, txId);
    
    // Also map paths without leading slash
    if (path.startsWith('/')) {
      pathMappings.set(path.substring(1), txId);
    }
    
    // Map relative paths
    const relativePath = path.startsWith('/') ? path.substring(1) : path;
    pathMappings.set(relativePath, txId);
    pathMappings.set('./' + relativePath, txId);
    pathMappings.set('../' + relativePath, txId);
  }
  
  // Replace @import statements (multiple formats)
  const importPatterns = [
    /@import\s+url\(['"]([^'"]*)['"]\)/g,
    /@import\s+['"]([^'"]*)['"]/g,
    /@import\s+url\(([^)]*)\)/g
  ];
  
  for (const pattern of importPatterns) {
    updatedCss = updatedCss.replace(pattern, (match, importPath) => {
      const cleanPath = importPath.replace(/^['"]|['"]$/g, ''); // Remove quotes
      const processedUrl = findMatchingPath(cleanPath, pathMappings);
      if (processedUrl) {
        console.log(`🎨 [CSS Import] ${cleanPath} -> ${processedUrl}`);
        return match.replace(cleanPath, processedUrl);
      }
      return match;
    });
  }
  
  // Replace url() references with comprehensive pattern matching
  const urlRegex = /url\(\s*(['"]?)([^'")\s]*)\1\s*\)/g;
  updatedCss = updatedCss.replace(urlRegex, (match, quote, urlPath) => {
    // Skip external URLs, data URLs, and already processed URLs
    if (urlPath.startsWith('http') || 
        urlPath.startsWith('//') || 
        urlPath.startsWith('data:') ||
        urlPath.includes('arweave.net')) {
      return match;
    }
    
    const processedUrl = findMatchingPath(urlPath, pathMappings);
    if (processedUrl) {
      console.log(`🎨 [CSS URL] ${urlPath} -> ${processedUrl}`);
      return `url(${processedUrl})`;
    }
    
    return match;
  });
  
  console.log(`🎨 [CSS] Processed CSS file with ${pathMappings.size} potential replacements`);
  return updatedCss;
}

function findMatchingPath(searchPath: string, pathMappings: Map<string, string>): string | null {
  // Clean the search path
  const cleanPath = searchPath.split('?')[0].split('#')[0]; // Remove query/fragment
  
  // Direct match
  if (pathMappings.has(cleanPath)) {
    return `https://arweave.net/${pathMappings.get(cleanPath)}`;
  }
  
  // Try variations
  const variations = [
    cleanPath,
    cleanPath.startsWith('/') ? cleanPath.substring(1) : '/' + cleanPath,
    cleanPath.startsWith('./') ? cleanPath.substring(2) : './' + cleanPath,
    cleanPath.startsWith('../') ? cleanPath.substring(3) : '../' + cleanPath
  ];
  
  for (const variation of variations) {
    if (pathMappings.has(variation)) {
      return `https://arweave.net/${pathMappings.get(variation)}`;
    }
    
    // Check if any mapped path ends with this variation
    for (const [mappedPath, txId] of pathMappings.entries()) {
      if (mappedPath.endsWith(variation) || variation.endsWith(mappedPath.replace(/^\//, ''))) {
        return `https://arweave.net/${txId}`;
      }
    }
  }
  
  return null;
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