# Polymarket MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with the ability to interact with Polymarket.

## Features

- **Market Discovery**: Browse and search current prediction markets
- **Real-time Data**: Get detailed market information, prices, and statistics
- **Trading**: Place market orders (FOK/FAK) and limit orders (GTC/GTD)
- **Portfolio Management**: View balances, positions, and P&L
- **Order Management**: Track and manage your active orders
- **Multi-format Support**: Works with market slugs or direct token IDs

## Installation

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/polymarket-mcp-server.git
cd <folder-name>
pnpm install
```

### 2. Install Required Dependencies

```bash
pnpm install @modelcontextprotocol/sdk zod @polymarket/clob-client ethers
```

### 3. Environment Configuration

Create a `.env` file in the project root:

```env
# Required: Your Polygon wallet private key
PRIVATE_KEY=your_private_key_here

# Optional: Custom CLOB API URL (defaults to https://clob.polymarket.com)
CLOB_API_URL=https://clob.polymarket.com

# Optional: Signature type (defaults to 0)
SIGNATURE_TYPE=0

# Optional: Existing API credentials (will be auto-generated if not provided)
CLOB_API_KEY=your_api_key
CLOB_SECRET=your_secret
CLOB_PASS_PHRASE=your_passphrase
```

### 4. MCP Configuration

Add the server to your MCP settings file:

```json

{
  "mcpServers": {
    "poly": {
      "command": "npx",
      "args": ["polymarket-mcp"],
      "env": {
        "PRIVATE_KEY": ""
      }
    }
  }
}
```

## Available Tools

### 1. Market Discovery

#### `getAllMarkets`
Get current prediction markets with optional filtering.

```
Get me today's trending markets
```

#### `getMarketDetails`  
Get detailed information about a specific market using its slug.

```
Get details for the market "will-donald-trump-win-the-2024-us-presidential-election"
Show me info about "bitcoin-above-100k-by-end-of-2024"
```

### 2. Trading Operations

#### `placeMarketOrder`
Execute immediate market orders (Fill or Kill / Fill and Kill).

```
Buy $100 of YES on "bitcoin-above-100k-by-end-of-2024" using FOK order
Sell $50 of NO on the Trump election market with FAK
```

**Parameters:**
- `marketSlug` or `tokenID`: Market identifier
- `outcome`: YES or NO (if using marketSlug)
- `amount`: USD amount to trade
- `side`: BUY or SELL
- `orderType`: FOK (Fill or Kill) or FAK (Fill and Kill)

#### `placeLimitOrder`
Place limit orders at specific prices (Good Till Cancelled / Good Till Date).

```
Place a limit buy order for 100 shares at $0.65 on the Bitcoin market
Set a GTC sell order for 50 shares at $0.80 on Trump election
```

**Parameters:**
- `marketSlug` or `tokenID`: Market identifier  
- `outcome`: YES or NO (if using marketSlug)
- `price`: Price per share (0-1)
- `size`: Number of shares
- `side`: BUY or SELL
- `orderType`: GTC (Good Till Cancelled) or GTD (Good Till Date)
- `expirationMinutes`: Expiration time (GTD only)

### 3. Portfolio Management

#### `getPortfolio`
View complete portfolio including balances and positions.

```
Show me my portfolio
What's my current P&L?
Check my USDC balance
```

#### `getOrder`
Get details of a specific order by ID.

```
Check order status for 0x831680cb77da95792af5a052c87c8abf9d2ae5cb21f275670bc0ff58f2823c5c
```

## Usage Examples

### Starting the Server
## Important: Always run the server using Node.js directly to ensure proper initialization:

```bash
node <path-to-index.js>
```

This will:

Initialize your wallet connection
Set up required token allowances (USDC approvals for CTF and Exchange contracts)
Generate or use existing API credentials
Start the MCP server

### Basic Market Research

```
"Get details about the market 'ai-will-achieve-agi-by-2025'"

```

### Simple Trading

```
"Buy $20 of YES on 'will-spacex-reach-mars-by-2030' using a market order"
```

### Portfolio Monitoring

```
"Show me my current portfolio and P&L"

"Check my USDC balance on Polymarket"
```

### Advanced Trading

```
"Set a GTC limit sell order for 100 shares at $0.85 on token ID 123456"

"Place a FOK buy order for $500 on the climate change market"

"Check the status of my order 0x831680..."
```

## Market Slug Examples

Market slugs are found in Polymarket URLs:

- `https://polymarket.com/event/will-donald-trump-win-the-2024-us-presidential-election`
  - Slug: `will-donald-trump-win-the-2024-us-presidential-election`

- `https://polymarket.com/event/bitcoin-above-100k-by-end-of-2024`  
  - Slug: `bitcoin-above-100k-by-end-of-2024`


### API Limits
- Polymarket may have rate limits on API calls
- Large orders may have slippage on smaller markets
- Some markets may have low liquidity

## Troubleshooting

### Common Issues

**"Client not initialized"**
- Check your `PRIVATE_KEY` is set correctly
- Ensure you have USDC balance for gas fees
- Verify Polygon network connectivity

**"Market not found"**
- Double-check the market slug spelling
- Ensure the market is still active
- Try using direct token ID instead

**"Insufficient balance"**
- Add USDC to your Polygon wallet
- Check if allowances were set properly
- Verify you're on Polygon Mainnet

**"Order failed"**
- Check if market is still open for trading
- Verify price is within valid range (0-1)
- Ensure sufficient balance for the trade

## API Reference

### Market Data Endpoints
- **Gamma API**: `https://gamma-api.polymarket.com/markets`
- **Data API**: `https://data-api.polymarket.com/positions`
- **CLOB API**: `https://clob.polymarket.com`

### Contract Addresses (Polygon)
- **USDC**: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- **CTF**: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`  
- **Exchange**: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

- **Issues**: [GitHub Issues](https://github.com/PlayAINetwork/Polymarket-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/PlayAINetwork/Polymarket-mcp/discussions)
