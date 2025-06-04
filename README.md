# Permasquare

A tool to publish Squarespace (or similar CMS) sites to Arweave with ArNS integration.

## Features

- 🔗 **Arweave Wallet Integration** - Connect using ArConnect or other Arweave wallets
- 📦 **Site Extraction** - Extract and convert Squarespace sites to static files
- 🌐 **Permanent Storage** - Store sites permanently on Arweave
- 🏷️ **ArNS Integration** - Register friendly domain names for deployed sites

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed on your system
- An Arweave wallet (ArConnect browser extension recommended)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd permasquare
```

2. Install dependencies:
```bash
bun install
```

3. Run the development server:
```bash
bun dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Usage

1. **Connect Wallet**: Click the "Connect Wallet" button and select your Arweave wallet
2. **Upload Site**: Use the "Upload Site" button to extract and deploy your Squarespace site
3. **Register ArNS**: Register a friendly domain name for your deployed site

## Tech Stack

- **Frontend**: Next.js 14 with TypeScript
- **Styling**: Tailwind CSS
- **Wallet**: Arweave Wallet Kit
- **Blockchain**: Arweave + ArNS
- **Package Manager**: Bun

## Project Structure

```
permasquare/
├── src/
│   └── app/
│       ├── layout.tsx      # App layout with wallet provider
│       ├── page.tsx        # Main page with wallet connection
│       └── globals.css     # Global styles
├── package.json
└── README.md
```

## Development Roadmap

See [tasks.md](tasks.md) for the complete development roadmap and task breakdown.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License
