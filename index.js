#!/usr/bin/env node

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { ClobClient, OrderType, Side } = require("@polymarket/clob-client");
const { ethers, MaxUint256 } = require("ethers");

const host = 'https://clob.polymarket.com';
const chainId = 137;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CLOB_API_URL = process.env.CLOB_API_URL || "https://clob.polymarket.com";
const SIGNATURE_TYPE = parseInt(process.env.SIGNATURE_TYPE || "0");

const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const EXCHANGE_ADDRESS = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";

const usdcAbi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

const ctfAbi = [
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function setApprovalForAll(address operator, bool approved) returns (bool)"
];

// Initialize MCP server
const server = new McpServer({
  name: "Polymarket MCP",
  version: "1.0.0",
  description: "MCP server for Polymarket trading operations"
});


let globalClobClient = null;
let globalSigner = null;
let globalCredentials = null;

function createCompatibleSigner(privateKey, provider) {
    const wallet = new ethers.Wallet(privateKey, provider);
    
    if (!wallet._signTypedData && wallet.signTypedData) {
        wallet._signTypedData = wallet.signTypedData.bind(wallet);
    }
    
    return wallet;
}

async function generateApiCredentials(signer) {
    try {
        console.log("Generating new API credentials...");
        console.log(`Wallet address: ${signer.address}`);
    
        const ts = new Date().toISOString();
        console.log(`Timestamp: ${ts}`);

        const domain = {
            name: "ClobAuthDomain",
            version: "1",
            chainId: 137,
        };

        const types = {
            ClobAuth: [
                { name: "address", type: "address" },
                { name: "timestamp", type: "string" },
                { name: "nonce", type: "uint256" },
                { name: "message", type: "string" },
            ],
        };

        const value = {
            address: signer.address,
            timestamp: ts,
            nonce: 0,
            message: "This message attests that I control the given wallet",
        };

        console.log("Signing typed data...");
        const signature = await signer._signTypedData(domain, types, value);
        console.log(`Signature: ${signature}`);
        
        const tempClient = new ClobClient(CLOB_API_URL, 137, signer);
        
        console.log("Creating/deriving API key...");
        const creds = await tempClient.createOrDeriveApiKey();
        
        console.log("API credentials generated successfully");
        
        return creds;
    } catch (error) {
        console.error("Failed to generate API credentials:", error.message);
        throw error;
    }
}

async function setAllowances(signer) {
    try {
        console.log("Checking and setting allowances...");

        const usdc = new ethers.Contract(USDC_ADDRESS, usdcAbi, signer);
        const ctf = new ethers.Contract(CTF_ADDRESS, ctfAbi, signer);

        const usdcAllowanceCtf = await usdc.allowance(signer.address, CTF_ADDRESS);
        const usdcAllowanceExchange = await usdc.allowance(signer.address, EXCHANGE_ADDRESS);
        const conditionalTokensAllowanceExchange = await ctf.isApprovedForAll(signer.address, EXCHANGE_ADDRESS);

        let transactions = [];

        if (usdcAllowanceCtf === 0n) {
            console.log("Setting USDC allowance for CTF...");
            const txn = await usdc.approve(CTF_ADDRESS, MaxUint256, {
                gasPrice: ethers.parseUnits("100", "gwei"),
                gasLimit: 200000,
            });
            await txn.wait();
            transactions.push(`CTF allowance: ${txn.hash}`);
        }

        if (usdcAllowanceExchange === 0n) {
            console.log("Setting USDC allowance for Exchange...");
            const txn = await usdc.approve(EXCHANGE_ADDRESS, MaxUint256, {
                gasPrice: ethers.parseUnits("100", "gwei"),
                gasLimit: 200000,
            });
            await txn.wait();
            transactions.push(`Exchange allowance: ${txn.hash}`);
        }

        if (!conditionalTokensAllowanceExchange) {
            console.log("Setting Conditional Tokens allowance for Exchange...");
            const txn = await ctf.setApprovalForAll(EXCHANGE_ADDRESS, true, {
                gasPrice: ethers.parseUnits("100", "gwei"),
                gasLimit: 200000,
            });
            await txn.wait();
            transactions.push(`CTF approval: ${txn.hash}`);
        }

        return {
            success: true,
            transactions: transactions,
            message: transactions.length > 0 ? "Allowances set successfully" : "All allowances already sufficient"
        };
    } catch (error) {
        console.error("Error setting allowances:", error);
        throw error;
    }
}

async function initializeClient() {
    if (!PRIVATE_KEY) {
        throw new Error("POLYMARKET_PRIVATE_KEY not found in environment variables");
    }

    console.log("Initializing Polymarket client...");
    const provider = new ethers.JsonRpcProvider("https://polygon-mainnet.g.alchemy.com/v2/HPoHJ1tw9M5qdkQNgMxef");
    const signer = createCompatibleSigner(PRIVATE_KEY, provider);
    const funder = signer.address;

    await setAllowances(signer);

    const existingApiKey = process.env.CLOB_API_KEY;
    const existingSecret = process.env.CLOB_SECRET;
    const existingPassphrase = process.env.CLOB_PASS_PHRASE;
    
    let credentials;
    
    if (existingApiKey && existingSecret && existingPassphrase) {
        console.log("Using existing API credentials");
        credentials = {
            key: existingApiKey,
            secret: existingSecret,
            passphrase: existingPassphrase
        };
    } else {
        console.log("Generating new API credentials...");
        credentials = await generateApiCredentials(signer);
    }
    
    const clobClient = new ClobClient(
        host, 
        chainId, 
        signer, 
        credentials, 
        SIGNATURE_TYPE, 
        funder
    );

    console.log("✅ Polymarket client initialized successfully");
    console.log(`Wallet Address: ${signer.address}`);

    return { clobClient, signer, credentials };
}

function getClient() {
    if (!globalClobClient || !globalSigner) {
        throw new Error("Client not initialized. Please restart the server.");
    }
    return { clobClient: globalClobClient, signer: globalSigner, credentials: globalCredentials };
}

server.tool(
  "getAllMarkets",
  "Get all markets from today",
  {
    limit: z.number().optional().default(20).describe("Number of markets to fetch (default: 20)")
  },
  async ({ limit = 20 }) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const options = { method: 'GET' };
      const response = await fetch(`https://gamma-api.polymarket.com/markets?limit=${limit}&start_date_min=${today}`, options);
      const markets = await response.json();
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "success",
            count: markets ? markets.length : 0,
            date_filter: today,
            markets: markets,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "error",
            message: error.message,
            code: error.code
          }, null, 2)
        }]
      };
    }
  }
);

// Tool 1: Get Market Details Using Slug
server.tool(
  "getMarketDetails",
  "Get detailed information about a specific market using Gamma API",
  {
    marketSlug: z.string().describe("Market slug from the URL (e.g., 'will-donald-trump-win-the-2024-us-presidential-election')")
  },
  async ({ marketSlug }) => {
    try {
      const options = { method: 'GET' };
      const response = await fetch(`https://gamma-api.polymarket.com/markets?slug=${marketSlug}`, options);
      const markets = await response.json();
      
      if (!markets || markets.length === 0) {
        throw new Error(`Market not found: ${marketSlug}`);
      }

      const market = markets[0];

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "success",
            market: market,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "error",
            message: error.message,
            code: error.code
          }, null, 2)
        }]
      };
    }
  }
);

// Tool 2: Place Market Order (FOK/FAK)
server.tool(
  "placeMarketOrder",
  "Place a market order (Fill or Kill / Fill and Kill)",
  {
    marketSlug: z.string().optional().describe("Market slug from the URL (e.g., 'fordow-nuclear-facility-destroyed-before-july'). Either marketSlug+outcome OR tokenID must be provided"),
    outcome: z.enum(["YES", "NO"]).optional().describe("Market outcome to bet on - YES or NO (required if using marketSlug)"),
    tokenID: z.string().optional().describe("Direct token ID for the market outcome (alternative to marketSlug+outcome)"),
    amount: z.number().describe("Amount in USD to trade"),
    side: z.enum(["BUY", "SELL"]).describe("Order side - BUY or SELL"),
    orderType: z.enum(["FOK", "FAK"]).describe("Order type - FOK (Fill or Kill) or FAK (Fill and Kill)"),
    tickSize: z.string().optional().describe("Tick size for the market (auto-detected if using marketSlug)")
  },
  async ({ marketSlug, outcome, tokenID, amount, side, orderType, tickSize }) => {
    try {
      let finalTokenID;
      let finalTickSize;
      let marketInfo = null;

      if (!tokenID && (!marketSlug || !outcome)) {
        throw new Error("Either provide tokenID directly, or provide both marketSlug and outcome");
      }

      if (tokenID) {
        finalTokenID = tokenID;
        finalTickSize = tickSize || "0.01"; 
        console.log(`Using provided tokenID: ${finalTokenID} with tickSize: ${finalTickSize}`);
      } else {
        console.log(`Fetching market details for: ${marketSlug}`);
        const marketResponse = await fetch(`https://gamma-api.polymarket.com/markets?slug=${marketSlug}`);
        const markets = await marketResponse.json();
        
        if (!markets || markets.length === 0) {
          throw new Error(`Market not found: ${marketSlug}`);
        }

        const market = markets[0];
        marketInfo = {
          question: market.question,
          slug: marketSlug,
          endDate: market.endDate
        };

        const tokenIds = JSON.parse(market.clobTokenIds);
        finalTokenID = outcome === "YES" ? tokenIds[0] : tokenIds[1];
        finalTickSize = market.orderPriceMinTickSize.toString();

        console.log(`Market: ${market.question}`);
        console.log(`Token ID (${outcome}): ${finalTokenID}`);
        console.log(`Tick Size: ${finalTickSize}`);
      }

      const { clobClient } = getClient();

      const sideEnum = side === "BUY" ? Side.BUY : Side.SELL;
      const orderTypeEnum = orderType === "FOK" ? OrderType.FOK : OrderType.FAK;

      console.log(`Placing ${orderType} ${side} order for $${amount}${outcome ? ` on ${outcome}` : ''}`);

      const orderResponse = await clobClient.createAndPostMarketOrder(
        {
          tokenID: finalTokenID,
          amount: amount,
          side: sideEnum,
          orderType: orderTypeEnum,
        },
        { tickSize: finalTickSize },
        orderTypeEnum
      );

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "success",
            market: marketInfo,
            orderResponse: orderResponse,
            orderDetails: {
              outcome: outcome || "Unknown (using direct tokenID)",
              tokenID: finalTokenID,
              amount: amount,
              side: side,
              orderType: orderType,
              tickSize: finalTickSize,
              inputMethod: tokenID ? "Direct tokenID" : "Market slug + outcome"
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "error",
            message: error.message,
            code: error.code
          }, null, 2)
        }]
      };
    }
  }
);

// Tool 3: Place Limit Order (GTC/GTD)
server.tool(
  "placeLimitOrder",
  "Place a limit order (Good Till Cancelled / Good Till Date)",
  {
    marketSlug: z.string().optional().describe("Market slug from the URL (e.g., 'fordow-nuclear-facility-destroyed-before-july'). Either marketSlug+outcome OR tokenID must be provided"),
    outcome: z.enum(["YES", "NO"]).optional().describe("Market outcome to bet on - YES or NO (required if using marketSlug)"),
    tokenID: z.string().optional().describe("Direct token ID for the market outcome (alternative to marketSlug+outcome)"),
    price: z.number().describe("Price per share (between 0 and 1)"),
    size: z.number().describe("Size in shares to trade"),
    side: z.enum(["BUY", "SELL"]).describe("Order side - BUY or SELL"),
    orderType: z.enum(["GTC", "GTD"]).describe("Order type - GTC (Good Till Cancelled) or GTD (Good Till Date)"),
    tickSize: z.string().optional().describe("Tick size for the market (auto-detected if using marketSlug)"),
    expirationMinutes: z.number().optional().default(60).describe("Expiration time in minutes (only for GTD orders)")
  },
  async ({ marketSlug, outcome, tokenID, price, size, side, orderType, tickSize, expirationMinutes }) => {
    try {
      let finalTokenID;
      let finalTickSize;
      let marketInfo = null;

      if (!tokenID && (!marketSlug || !outcome)) {
        throw new Error("Either provide tokenID directly, or provide both marketSlug and outcome");
      }

      if (tokenID) {
        finalTokenID = tokenID;
        finalTickSize = tickSize || "0.01";
        console.log(`Using provided tokenID: ${finalTokenID} with tickSize: ${finalTickSize}`);
      } else {
        console.log(`Fetching market details for: ${marketSlug}`);
        const marketResponse = await fetch(`https://gamma-api.polymarket.com/markets?slug=${marketSlug}`);
        const markets = await marketResponse.json();
        
        if (!markets || markets.length === 0) {
          throw new Error(`Market not found: ${marketSlug}`);
        }

        const market = markets[0];
        marketInfo = {
          question: market.question,
          slug: marketSlug,
          endDate: market.endDate
        };

        const tokenIds = JSON.parse(market.clobTokenIds);
        finalTokenID = outcome === "YES" ? tokenIds[0] : tokenIds[1];
        finalTickSize = market.orderPriceMinTickSize.toString();

        console.log(`Market: ${market.question}`);
        console.log(`Token ID (${outcome}): ${finalTokenID}`);
        console.log(`Tick Size: ${finalTickSize}`);
      }

      const { clobClient } = getClient();

      const sideEnum = side === "BUY" ? Side.BUY : Side.SELL;
      const orderTypeEnum = orderType === "GTC" ? OrderType.GTC : OrderType.GTD;

      let orderParams = {
        tokenID: finalTokenID,
        price: price,
        side: sideEnum,
        size: size,
      };

      if (orderType === "GTD") {
        const expirationTime = parseInt(((new Date().getTime() + expirationMinutes * 60 * 1000 + 10 * 1000) / 1000).toString());
        orderParams.expiration = expirationTime;
      }

      console.log(`Placing ${orderType} ${side} limit order: ${size} shares at $${price}${outcome ? ` on ${outcome}` : ''}`);

      const orderResponse = await clobClient.createAndPostOrder(
        orderParams,
        { tickSize: finalTickSize },
        orderTypeEnum
      );

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "success",
            market: marketInfo,
            orderResponse: orderResponse,
            orderDetails: {
              outcome: outcome || "Unknown (using direct tokenID)",
              tokenID: finalTokenID,
              price: price,
              size: size,
              side: side,
              orderType: orderType,
              tickSize: finalTickSize,
              totalCost: (price * size).toFixed(4),
              expiration: orderParams.expiration ? new Date(orderParams.expiration * 1000).toISOString() : "No expiration (GTC)",
              inputMethod: tokenID ? "Direct tokenID" : "Market slug + outcome"
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "error",
            message: error.message,
            code: error.code
          }, null, 2)
        }]
      };
    }
  }
);

// Tool 4: Get Order Details
server.tool(
  "getOrder",
  "Get details of a specific order by order ID",
  {
    orderId: z.string().describe("The order ID to retrieve details for (e.g., '0x831680cb77da95792af5a052c87c8abf9d2ae5cb21f275670bc0ff58f2823c5c')")
  },
  async ({ orderId }) => {
    try {
      const { clobClient } = getClient();

      console.log(`Fetching order details for: ${orderId}`);
      const order = await clobClient.getOrder(orderId);

      if (!order) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "error",
              message: `Order not found: ${orderId}`
            }, null, 2)
          }]
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "success",
            orderId: orderId,
            order: {
              id: order.id,
              market: order.market,
              side: order.side,
              price: order.price,
              size: order.size,
              sizeMatched: order.size_matched,
              remainingSize: order.size - (order.size_matched || 0),
              status: order.status,
              orderType: order.order_type,
              createdAt: order.created_at,
              updatedAt: order.updated_at,
              maker: order.maker,
              taker: order.taker,
              tokenId: order.token_id,
              feeRateBps: order.fee_rate_bps,
              nonce: order.nonce,
              expiration: order.expiration,
              signature: order.signature
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "error",
            message: error.message,
            code: error.code,
            orderId: orderId
          }, null, 2)
        }]
      };
    }
  }
);

// Tool 5: Get Portfolio
server.tool(
  "getPortfolio",
  "Get complete portfolio including account balance and all positions",
  {},
  async () => {
    try {
      const { clobClient, signer } = getClient();

      const provider = new ethers.JsonRpcProvider("https://polygon-mainnet.g.alchemy.com/v2/HPoHJ1tw9M5qdkQNgMxef");
      const usdc = new ethers.Contract(USDC_ADDRESS, usdcAbi, provider);

      const balance = await usdc.balanceOf(signer.address);
      const decimals = await usdc.decimals();
      const balanceFormatted = ethers.formatUnits(balance, decimals);

      let polymarketBalance;
      try {
        const balanceData = await clobClient.getBalanceAllowance({
          asset_type: "COLLATERAL"
        });
        polymarketBalance = balanceData.balance;
      } catch (error) {
        polymarketBalance = "Unable to fetch";
      }

      let positions = [];
      let positionsError = null;
      try {
        const options = { method: 'GET' };
        const positionsResponse = await fetch(`https://data-api.polymarket.com/positions?sizeThreshold=1&limit=50&sortDirection=DESC&user=${signer.address}`, options);
        const positionsData = await positionsResponse.json();
        positions = positionsData || [];
      } catch (error) {
        positionsError = error.message;
        positions = [];
      }

      let totalPositionValue = 0;
      let totalUnrealizedPnL = 0;
      
      if (Array.isArray(positions)) {
        positions.forEach(position => {
          if (position.size && position.price) {
            totalPositionValue += parseFloat(position.size) * parseFloat(position.price);
          }
          if (position.unrealizedPnl) {
            totalUnrealizedPnL += parseFloat(position.unrealizedPnl);
          }
        });
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "success",
            portfolio: {
              walletAddress: signer.address,
              balances: {
                usdcWalletBalance: balanceFormatted,
                usdcPolymarketBalance: polymarketBalance,
                totalLiquidBalance: polymarketBalance !== "Unable to fetch" ? 
                  (parseFloat(balanceFormatted) + parseFloat(polymarketBalance)).toFixed(6) : 
                  "Unable to calculate"
              },
              positionsSummary: {
                totalPositions: Array.isArray(positions) ? positions.length : 0,
                totalPositionValue: totalPositionValue.toFixed(4),
                totalUnrealizedPnL: totalUnrealizedPnL.toFixed(4),
                positionsError: positionsError
              },
              positions: positions,
              timestamp: new Date().toISOString()
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "error",
            message: error.message,
            code: error.code
          }, null, 2)
        }]
      };
    }
  }
);

// Start the server
async function startServer() {
  try {
    console.log("🚀 Starting Polymarket MCP server...");

    if (PRIVATE_KEY) {
      try {
        const { clobClient, signer, credentials } = await initializeClient();
        globalClobClient = clobClient;
        globalSigner = signer;
        globalCredentials = credentials;
        
        
        try {
          const balanceData = await clobClient.getBalanceAllowance({
            asset_type: "COLLATERAL"
          });
          console.log(`USDC Balance: ${balanceData.balance}`);
        } catch (balanceError) {
          console.log("ℹCould not fetch balance at startup");
        }
        
      } catch (initError) {
        console.error("Failed to initialize Polymarket client:", initError.message);
        console.log("Server will start but trading functions will not work");
        console.log("Please check your POLYMARKET_PRIVATE_KEY and network connection");
      }
    } else {
      console.log("POLYMARKET_PRIVATE_KEY not found - trading functions will not work");
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("Polymarket MCP server started successfully");
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

startServer();