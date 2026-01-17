# Crypto Event Tracker

Real-time blockchain event tracker for USDC token transfers and approvals on Ethereum Sepolia testnet.

## Purpose

This project monitors USDC smart contract events (Transfer & Approval) in real-time using WebSocket connections to the blockchain. Events are processed through a message queue and streamed to the frontend via Server-Sent Events (SSE).

## Tech Stack

### Backend
- **Node.js** + **Express** - API server
- **TypeScript** - Type safety
- **Ethers.js** - Blockchain interaction
- **RabbitMQ** - Message queue for event processing
- **Redis** - Caching last processed block
- **Alchemy** - WebSocket RPC provider

### Frontend
- **React** - UI library
- **Vite** - Build tool
- **TypeScript** - Type safety
- **SSE (EventSource)** - Real-time event streaming

### Infrastructure
- **Turborepo** - Monorepo management

## Project Structure

```
packages/
├── backend/          # Express API + Event Listener
│   └── src/
│       ├── app.ts              # Express server with SSE endpoint
│       ├── web3/               # Blockchain event listener
│       └── services/queue/     # RabbitMQ producer/consumer
└── frontend/         # React app
    └── src/
        ├── App.tsx             # Main UI
        └── hooks/useSSE.ts     # SSE hook for real-time updates
```

## How It Works

1. **Event Listener** connects to Ethereum via WebSocket and listens for USDC contract events
2. **Producer** publishes events to RabbitMQ with routing keys (`event.transfer`, `event.approval`)
3. **Consumer** subscribes to events based on user selection (Transfer, Approval, or All)
4. **SSE Endpoint** streams events to the frontend in real-time
5. **React App** displays events as they arrive

## Running Locally

```bash
# Install dependencies
yarn install

# Start backend
yarn backend dev

# Start frontend
yarn frontend dev
```

## Environment Variables

### Backend (.env.local)
```
RPC_WSS_URL=wss://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost
PORT=3000
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:3000
```
