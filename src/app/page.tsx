"use client";

import { ArweaveDeployment, DeploymentEstimate } from "@/types/arweave";
import { ExtractionManifest, SiteAnalysis } from "@/types/extraction";
import { AlertCircle, CheckCircle, DollarSign, ExternalLink, Globe, Loader, Upload } from "lucide-react";
import { useEffect, useState } from "react";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [manifest, setManifest] = useState<ExtractionManifest | null>(null);
  const [estimate, setEstimate] = useState<DeploymentEstimate | null>(null);
  const [deployment, setDeployment] = useState<ArweaveDeployment | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
    // Check wallet availability
    if (typeof window !== 'undefined' && window.arweaveWallet) {
      setWalletAvailable(true);
      checkConnection();
    }
  }, []);

  const checkConnection = async () => {
    try {
      if (typeof window !== 'undefined' && window.arweaveWallet) {
        const permissions = await window.arweaveWallet.getPermissions();
        if (permissions.includes('ACCESS_ADDRESS')) {
          const addr = await window.arweaveWallet.getActiveAddress() as string;
          setAddress(addr);
          setConnected(true);
        }
      }
    } catch (error) {
      console.log("No wallet connected", error);
    }
  };

  const connectWallet = async () => {
    try {
      setLoading(true);
      if (typeof window === 'undefined' || !window.arweaveWallet) {
        alert("Please install ArConnect wallet extension");
        return;
      }

      await window.arweaveWallet.connect([
        'ACCESS_ADDRESS',
        'ACCESS_PUBLIC_KEY',
        'SIGN_TRANSACTION'
      ]);

      const addr = await window.arweaveWallet.getActiveAddress() as string;
      setAddress(addr);
      setConnected(true);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      alert("Failed to connect wallet. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!url) {
      setError('Please enter a URL');
      return;
    }

    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setAnalyzing(true);
    setError('');
    setAnalysis(null);
    setManifest(null);
    setEstimate(null);
    setDeployment(null);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, action: 'analyze' }),
      });

      const data = await response.json();

      if (data.success) {
        setAnalysis(data.analysis);
      } else {
        setError(data.error || 'Failed to analyze site');
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExtract = async () => {
    setExtracting(true);
    setError('');
    setManifest(null);
    setEstimate(null);
    setDeployment(null);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, action: 'extract' }),
      });

      const data = await response.json();

      if (data.success) {
        setManifest(data.manifest);
        // Automatically estimate cost after extraction
        await estimateDeployment(data.manifest);
      } else {
        setError(data.error || 'Failed to extract site');
      }
    } catch (err) {
      setError('Network error during extraction. Please try again.');
    } finally {
      setExtracting(false);
    }
  };

  const estimateDeployment = async (manifestData?: ExtractionManifest) => {
    const targetManifest = manifestData || manifest;
    if (!targetManifest) return;

    setEstimating(true);
    setError('');

    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          manifest: targetManifest, 
          action: 'estimate' 
        }),
      });

      const data = await response.json();

      if (data.success) {
        setEstimate(data.estimate);
      } else {
        setError(data.error || 'Failed to estimate deployment cost');
      }
    } catch (err) {
      setError('Network error during cost estimation.');
    } finally {
      setEstimating(false);
    }
  };

  const handleDeploy = async () => {
    if (!manifest || !connected) return;

    setDeploying(true);
    setError('');
    setDeployment(null);

    try {
      // Get wallet JWK
      const walletJWK = await window.arweaveWallet.getActivePublicKey();

      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          manifest, 
          wallet: walletJWK,
          action: 'deploy' 
        }),
      });

      const data = await response.json();

      if (data.success) {
        setDeployment(data.deployment);
      } else {
        setError(data.error || 'Failed to deploy to Arweave');
      }
    } catch (err) {
      setError('Network error during deployment. Please try again.');
    } finally {
      setDeploying(false);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getPlatformColor = (platform: string): string => {
    switch (platform) {
      case 'squarespace': return 'bg-blue-100 text-blue-800';
      case 'wordpress': return 'bg-purple-100 text-purple-800';
      case 'wix': return 'bg-orange-100 text-orange-800';
      case 'webflow': return 'bg-green-100 text-green-800';
      case 'shopify': return 'bg-pink-100 text-pink-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Don't render anything until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <h1 className="text-3xl font-bold text-gray-900">Permasquare</h1>
          </div>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Publish your Squarespace or other CMS sites to Arweave with permanent storage
          </p>
        </header>

        {/* Main Content */}
        <div className="max-w-3xl mx-auto space-y-6">
          
          {/* Wallet Connection */}
          <div className="bg-white border-2 border-black shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div>
                  <h3 className="font-semibold text-gray-900">Arweave Wallet</h3>
                  {connected ? (
                    <p className="text-sm text-gray-600">{address.slice(0, 8)}...{address.slice(-8)}</p>
                  ) : (
                    <p className="text-sm text-gray-600">Connect your wallet to get started</p>
                  )}
                </div>
              </div>
              
              {!connected ? (
                <button
                  onClick={connectWallet}
                  disabled={loading || !walletAvailable}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 transition-colors duration-200"
                >
                  {loading ? "Connecting..." : "Connect Wallet"}
                </button>
              ) : (
                <div className="flex items-center bg-green-50 text-green-600 border-2 border-black p-2">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  <span className="font-medium">Connected</span>
                </div>
              )}
            </div>
            
            {!walletAvailable && (
              <div className="mt-4 bg-orange-50 border border-orange-200  p-3">
                <div className="flex items-center text-orange-800">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  <p className="text-sm">Please install the ArConnect browser extension</p>
                </div>
              </div>
            )}
          </div>

          {/* Site Extraction */}
          {connected && (
            <div className="bg-white border-2 border-black shadow-sm p-6">
              <div className="flex items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900">Extract & Deploy Site</h3>
              </div>

              {/* URL Input */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                    Website URL
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="url"
                      id="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.squarespace.com"
                      className="flex-1 px-4 py-3 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg text-gray-500"
                      disabled={analyzing || extracting || deploying}
                    />
                    <button
                      onClick={handleAnalyze}
                      disabled={analyzing || extracting || deploying || !url}
                      className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white px-8 py-3  font-medium transition-colors duration-200 flex items-center text-lg"
                    >
                      {analyzing ? (
                        <>
                          <Loader className="w-5 h-5 mr-2 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Globe className="w-5 h-5 mr-2" />
                          Analyze
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="bg-red-50 border border-red-200  p-4">
                    <div className="flex items-center text-red-800">
                      <AlertCircle className="w-5 h-5 mr-2" />
                      <p className="font-medium">{error}</p>
                    </div>
                  </div>
                )}

                {/* Analysis Results */}
                {analysis && !manifest && (
                  <div className="space-y-4 pt-4 border-t border-gray-200">
                    {/* Platform & Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-sm text-gray-600">Platform</p>
                        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getPlatformColor(analysis.platform)}`}>
                          {analysis.platform.charAt(0).toUpperCase() + analysis.platform.slice(1)}
                        </span>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-gray-600">Pages</p>
                        <p className="text-xl font-bold text-gray-900">{analysis.estimatedPages}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-gray-600">Assets</p>
                        <p className="text-xl font-bold text-gray-900">{analysis.estimatedAssets}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-gray-600">Size</p>
                        <p className="text-xl font-bold text-gray-900">{formatSize(analysis.estimatedSize)}</p>
                      </div>
                    </div>

                    {/* Ready to Extract */}
                    <div className="bg-green-50 border border-green-200  p-6 text-center">
                      <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
                      <h4 className="text-lg font-semibold text-green-900 mb-2">Ready to Extract! 🚀</h4>
                      <p className="text-green-800 mb-4">
                        Site analysis complete. Click below to start full extraction.
                      </p>
                      <button
                        onClick={handleExtract}
                        disabled={extracting}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-8 py-3  font-medium transition-colors duration-200 flex items-center mx-auto"
                      >
                        {extracting ? (
                          <>
                            <Loader className="w-5 h-5 mr-2 animate-spin" />
                            Extracting...
                          </>
                        ) : (
                          <>
                            <Upload className="w-5 h-5 mr-2" />
                            Start Extraction
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Extraction Results */}
                {manifest && !deployment && (
                  <div className="space-y-4 pt-4 border-t border-gray-200">
                    <div className="bg-blue-50 border border-blue-200  p-6">
                      <div className="flex items-center mb-4">
                        <CheckCircle className="w-8 h-8 text-blue-600 mr-3" />
                        <div>
                          <h4 className="text-lg font-semibold text-blue-900">Extraction Complete! 🎉</h4>
                          <p className="text-blue-800">{manifest.title}</p>
                        </div>
                      </div>
                      
                      {/* Extraction Stats */}
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="text-center">
                          <p className="text-sm text-gray-600">Pages</p>
                          <p className="text-xl font-bold text-gray-900">{manifest.totalPages}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-600">Assets</p>
                          <p className="text-xl font-bold text-gray-900">{manifest.totalAssets}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-600">Total Size</p>
                          <p className="text-xl font-bold text-gray-900">{formatSize(manifest.totalSize)}</p>
                        </div>
                      </div>

                      {/* Cost Estimate */}
                      {estimate && (
                        <div className="bg-white  p-4 mb-4">
                          <div className="flex items-center mb-2">
                            <DollarSign className="w-5 h-5 text-green-600 mr-2" />
                            <h5 className="font-medium text-gray-900">Deployment Cost Estimate</h5>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-gray-600">Total Cost</p>
                              <p className="text-xl font-bold text-green-600">{estimate.formattedCost} AR</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Total Size</p>
                              <p className="text-xl font-bold text-gray-900">{estimate.formattedSize}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bg-white  p-4 mb-4">
                        <h5 className="font-medium text-gray-900 mb-2">Extracted Content:</h5>
                        <div className="text-sm text-gray-600 space-y-1">
                          {manifest.pages.slice(0, 5).map((page, index) => (
                            <div key={index} className="flex justify-between">
                              <span>📄 {page.title || 'Untitled'}</span>
                              <span>{formatSize(page.size)}</span>
                            </div>
                          ))}
                          {manifest.pages.length > 5 && (
                            <p className="text-gray-500">+ {manifest.pages.length - 5} more pages...</p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={handleDeploy}
                        disabled={deploying || estimating}
                        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-6 py-3  font-medium transition-colors duration-200 flex items-center justify-center"
                      >
                        {deploying ? (
                          <>
                            <Loader className="w-5 h-5 mr-2 animate-spin" />
                            Deploying to Arweave...
                          </>
                        ) : estimating ? (
                          <>
                            <Loader className="w-5 h-5 mr-2 animate-spin" />
                            Estimating Cost...
                          </>
                        ) : (
                          <>
                            <Upload className="w-5 h-5 mr-2" />
                            Deploy to Arweave
                            {estimate && <span className="ml-2 text-purple-200">({estimate.formattedCost} AR)</span>}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Deployment Results */}
                {deployment && (
                  <div className="space-y-4 pt-4 border-t border-gray-200">
                    <div className="bg-green-50 border border-green-200  p-6">
                      <div className="flex items-center mb-4">
                        <CheckCircle className="w-8 h-8 text-green-600 mr-3" />
                        <div>
                          <h4 className="text-lg font-semibold text-green-900">Successfully Deployed! 🌐</h4>
                          <p className="text-green-800">Your site is now permanently stored on Arweave</p>
                        </div>
                      </div>
                      
                      {/* Deployment Stats */}
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="text-center">
                          <p className="text-sm text-gray-600">Transaction ID</p>
                          <p className="text-xs font-mono text-gray-900">{deployment.id.slice(0, 8)}...{deployment.id.slice(-8)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-600">Cost</p>
                          <p className="text-xl font-bold text-green-600">{deployment.totalCost.toFixed(6)} AR</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-600">Files</p>
                          <p className="text-xl font-bold text-gray-900">{deployment.totalPages + deployment.totalAssets}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <a
                          href={deployment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-3  font-medium transition-colors duration-200 flex items-center justify-center"
                        >
                          <ExternalLink className="w-5 h-5 mr-2" />
                          View Site
                        </a>
                        <button
                          onClick={() => navigator.clipboard.writeText(deployment.url)}
                          className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3  font-medium transition-colors duration-200"
                        >
                          Copy URL
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}