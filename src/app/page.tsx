"use client";

import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [extraction, setExtraction] = useState<any>(null);
  const [deployment, setDeployment] = useState<any>(null);

  const handleAnalyze = async () => {
    if (!url) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      const data = await response.json();
      setAnalysis(data);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExtract = async () => {
    if (!url) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, maxPages: 10 })
      });
      
      const data = await response.json();
      setExtraction(data);
    } catch (error) {
      console.error('Extraction failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    if (!extraction?.hostname) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname: extraction.hostname })
      });
      
      const data = await response.json();
      setDeployment(data);
    } catch (error) {
      console.error('Deployment failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Permasquare
          </h1>
          <p className="text-lg text-gray-700">
            Archive websites to Arweave with turbo bundling
          </p>
        </div>

        <div className="bg-white p-6 mb-6 border border-gray-200">
          <div className="flex gap-4 mb-4">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter website URL..."
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-800 bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:border-transparent focus:bg-white"
            />
            <button
              onClick={handleAnalyze}
              disabled={loading || !url}
              className="px-6 py-2 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: '#1d1814' }}
            >
              Analyze
            </button>
          </div>

          {analysis && (
            <div className="mb-4 p-4 bg-gray-50 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Analysis Results</h3>
              <p className="text-gray-800"><strong>Platform:</strong> {analysis.platform}</p>
              <p className="text-gray-800"><strong>Challenges:</strong> {analysis.challenges.join(', ')}</p>
              <button
                onClick={handleExtract}
                disabled={loading}
                className="mt-3 px-4 py-2 bg-green-700 text-white font-medium hover:bg-green-800 disabled:opacity-50 transition-colors"
              >
                Extract Site
              </button>
            </div>
          )}

          {extraction && (
            <div className="mb-4 p-4 bg-gray-50 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Extraction Results</h3>
              <p className="text-gray-800"><strong>Hostname:</strong> {extraction.hostname}</p>
              <p className="text-gray-800"><strong>Pages Saved:</strong> {extraction.totalPages}</p>
              <button
                onClick={handleDeploy}
                disabled={loading}
                className="mt-3 px-4 py-2 bg-purple-700 text-white font-medium hover:bg-purple-800 disabled:opacity-50 transition-colors"
              >
                Deploy to Arweave
              </button>
            </div>
          )}

          {deployment && (
            <div className="p-4 bg-gray-50 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Deployment Results</h3>
              <p className="text-gray-800"><strong>Bundle ID:</strong> {deployment.bundleId}</p>
              <p className="text-gray-800"><strong>Manifest URL:</strong> 
                <a 
                  href={deployment.manifestUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-700 hover:text-blue-900 hover:underline ml-1 font-medium"
                >
                  {deployment.manifestUrl}
                </a>
              </p>
              <p className="text-gray-800"><strong>Total Cost:</strong> {deployment.totalCost} AR</p>
            </div>
          )}

          {loading && (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
              <p className="mt-2 text-gray-700 font-medium">Processing...</p>
            </div>
          )}
        </div>

        <div className="bg-white p-6 border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">How it works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 border border-gray-300">
                <span className="text-xl font-bold text-gray-800">1</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Analyze</h3>
              <p className="text-sm text-gray-700">Detect platform and analyze website structure</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 border border-gray-300">
                <span className="text-xl font-bold text-gray-800">2</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Extract</h3>
              <p className="text-sm text-gray-700">Crawl pages and save to S3 storage</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 border border-gray-300">
                <span className="text-xl font-bold text-gray-800">3</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Deploy</h3>
              <p className="text-sm text-gray-700">Bundle and deploy to Arweave with turbo</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}