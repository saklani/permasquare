/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@ar.io/sdk'],
  webpack: (config, { isServer, webpack }) => {
    if (isServer) {
      // Add global polyfills for server-side
      config.plugins.push(
        new webpack.DefinePlugin({
          'globalThis.self': 'globalThis',
          'self': 'globalThis'
        })
      );
    }
    return config;
  }
}

module.exports = nextConfig 