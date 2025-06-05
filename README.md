# Permasquare

Archive websites to Arweave with turbo bundling - simple, fast, permanent.

## Architecture

**Simple 3-step process:**
1. **Analyze** - Detect platform and analyze website structure  
2. **Extract** - Crawl pages and save to S3 storage
3. **Deploy** - Bundle and deploy to Arweave with turbo

## API Endpoints

### `/api/analyze` (POST)
Analyzes a website to detect platform and structure.
```json
{ "url": "https://example.com" }
```

### `/api/extract` (POST)  
Crawls website and saves pages to S3 storage.
```json
{ 
  "url": "https://example.com",
  "maxPages": 100,
  "delay": 1000
}
```

### `/api/deploy` (POST)
Creates turbo bundle and deploys to Arweave.
```json
{ 
  "hostname": "example.com",
  "wallet": "optional_jwk_wallet"
}
```

## Services

- `/service/extract.ts` - Website crawling and analysis
- `/service/storage.ts` - S3 storage operations  
- `/service/deploy.ts` - Turbo bundling and deployment
- `/service/arweave.ts` - Wallet generation and utilities

## Storage Structure

URLs are stored using clean paths:
- `https://example.com/about.html` → S3 key: `example.com/about.html`
- `https://example.com/` → S3 key: `example.com/index.html`

## Deployment Process

1. **Load content** from S3 by hostname
2. **Create transactions** for each file with known IDs
3. **Replace URLs** in HTML with Arweave transaction URLs  
4. **Bundle transactions** and upload to Arweave
5. **Generate manifest** for gateway access

## Tech Stack

- **Runtime**: Bun
- **Framework**: Next.js
- **Crawler**: Puppeteer + Cheerio
- **Storage**: AWS S3
- **Deployment**: Turbo SDK
- **Blockchain**: Arweave

## Environment Variables

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret  
S3_BUCKET_NAME=your_bucket
```

## Usage

```bash
bun install
bun dev
```

Open `http://localhost:3000` and start archiving websites!

## Architecture Principles

- **No callbacks, fallbacks, or class hierarchies**
- **Maximum 3 layers of function nesting**  
- **Simple, direct code flow**
- **Real-time crawling and saving**
- **URL-based storage keys**
- **Turbo bundling for known transaction IDs**
