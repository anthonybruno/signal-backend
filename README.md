# Signal Backend

Express.js API server for Signal, an AI-powered portfolio chatbot. Provides RAG (Retrieval-Augmented Generation) capabilities using ChromaDB for vector storage and OpenRouter for LLM responses.

## What it does

The backend serves as the core API for the Signal chatbot, handling:

- Chat conversations with RAG-enhanced responses
- Vector search through personal knowledge base
- Integration with MCP server for live data
- Dynamic model routing across AI providers

## Local Development

### Prerequisites

- Node.js 20+
- ChromaDB running on port 8000
- MCP server running on port 3001

### Setup

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` with your API keys.

3. Build knowledge base:

```bash
npm run setup-embeddings
```

4. Start the server:

```bash
npm run dev
```

The backend runs on port 3000.

## API Endpoints

- `POST /api/chat` - Main chat endpoint
- `POST /api/chat/stream` - Streaming chat endpoint
- `GET /api/chat/test` - Test RAG system
- `GET /api/chat/test-mcp` - Test MCP server connection
- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed system status

## Production

- **URL**: https://signal-backend.fly.dev
- **ChromaDB**: https://signal-rag.fly.dev
- **MCP Server**: https://signal-mcp.fly.dev

## Tech Stack

- Express.js with TypeScript
- ChromaDB for vector storage
- OpenAI for embeddings
- OpenRouter for LLM responses
- Winston for logging
- Helmet for security
