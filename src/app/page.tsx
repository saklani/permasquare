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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/10 via-purple-600/10 to-teal-600/10"></div>
        <div className="relative px-6 py-16">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur-sm border border-slate-200/50 rounded-xs mb-6">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-slate-700">Powered by Arweave</span>
            </div>
            
            <h1 className="text-5xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 bg-clip-text text-transparent mb-4">
              Permasquare
            </h1>
            <p className="text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
              Transform any website into a permanent, decentralized archive on Arweave with our advanced turbo bundling technology
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 pb-16 -mt-8">
        {/* URL Input Card */}
        <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-xs p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter website URL to archive..."
                className="w-full pl-10 pr-3 py-3 bg-slate-50/50 border border-slate-200/50 rounded-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 focus:bg-white transition-all duration-200"
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={loading || !url}
              className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xs hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={!loading && url ? {} : { backgroundColor: '#1d1814' }}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Analyzing...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span>Analyze Site</span>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          {analysis && (
            <div className="bg-white/60 backdrop-blur-xl border border-white/20 rounded-xs p-6 transform transition-all duration-500">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-blue-500 flex items-center justify-center rounded-xs">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Analysis Complete</h3>
                  <p className="text-sm text-slate-600">Site structure and platform detected</p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4 mb-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Platform</span>
                  </div>
                  <p className="font-semibold text-slate-800 capitalize">{analysis.platform}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Challenges</span>
                  </div>
                  <p className="text-slate-700">{analysis.challenges.join(', ')}</p>
                </div>
              </div>
              
              <button
                onClick={handleExtract}
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-xs hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Extract & Save Site
              </button>
            </div>
          )}

          {extraction && (
            <div className="bg-white/60 backdrop-blur-xl border border-white/20 rounded-xs p-6 transform transition-all duration-500">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-emerald-600 flex items-center justify-center rounded-xs">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Extraction Complete</h3>
                  <p className="text-sm text-slate-600">Site content saved to storage</p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-3 gap-4 mb-5">
                <div className="space-y-2">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Hostname</span>
                  <p className="font-semibold text-slate-800">{extraction.hostname}</p>
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Pages Archived</span>
                  <p className="font-semibold text-slate-800">{extraction.totalPages}</p>
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Assets Saved</span>
                  <p className="font-semibold text-slate-800">{extraction.totalAssets || 0}</p>
                </div>
              </div>
              
              <button
                onClick={handleDeploy}
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-medium rounded-xs hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Deploy to Arweave
              </button>
            </div>
          )}

          {deployment && (
            <div className="bg-white/60 backdrop-blur-xl border border-white/20 rounded-xs p-6 transform transition-all duration-500">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-purple-600 flex items-center justify-center rounded-xs">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Deployment Successful</h3>
                  <p className="text-sm text-slate-600">Your site is now permanently archived</p>
                </div>
              </div>
              
              <div className="space-y-3 mb-5">
                <div className="p-3 bg-slate-50/50 border border-slate-200/50 rounded-xs">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">Bundle ID</span>
                  <p className="text-xs font-mono text-slate-800 bg-white px-2 py-1 border rounded-xs break-all">{deployment.bundleId}</p>
                </div>
                
                <div className="p-3 bg-slate-50/50 border border-slate-200/50 rounded-xs">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">Permanent URL</span>
                  <a 
                    href={deployment.manifestUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium hover:underline transition-colors text-sm"
                  >
                    <span className="break-all">{deployment.manifestUrl}</span>
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
                
                <div className="p-3 bg-slate-50/50 border border-slate-200/50 rounded-xs">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">Total Cost</span>
                  <p className="font-semibold text-slate-800">{deployment.totalCost} AR</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* How it Works Section */}
        <div className="mt-12 bg-white/40 backdrop-blur-xl border border-white/20 rounded-xs p-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-3">How Permasquare Works</h2>
            <p className="text-slate-600 max-w-xl mx-auto">
              Our three-step process ensures your website is permanently preserved on the Arweave network
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center group">
              <div className="relative mb-4">
                <div className="w-16 h-16 bg-blue-500 flex items-center justify-center mx-auto rounded-xs group-hover:scale-105 transition-all duration-300">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-white flex items-center justify-center border-2 border-blue-100 rounded-xs">
                  <span className="text-xs font-bold text-blue-600">1</span>
                </div>
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Analyze</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Intelligent detection of platform architecture and potential archival challenges
              </p>
            </div>
            
            <div className="text-center group">
              <div className="relative mb-4">
                <div className="w-16 h-16 bg-emerald-600 flex items-center justify-center mx-auto rounded-xs group-hover:scale-105 transition-all duration-300">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-white flex items-center justify-center border-2 border-emerald-100 rounded-xs">
                  <span className="text-xs font-bold text-emerald-600">2</span>
                </div>
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Extract</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Advanced crawling engine captures all pages and assets with precision
              </p>
            </div>
            
            <div className="text-center group">
              <div className="relative mb-4">
                <div className="w-16 h-16 bg-purple-600 flex items-center justify-center mx-auto rounded-xs group-hover:scale-105 transition-all duration-300">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-white flex items-center justify-center border-2 border-purple-100 rounded-xs">
                  <span className="text-xs font-bold text-purple-600">3</span>
                </div>
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Deploy</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Turbo-powered bundling uploads your site permanently to Arweave
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}