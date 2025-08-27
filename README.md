# Signal Backend

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-LLM%20API-orange.svg)](https://openrouter.ai/)

[Signal’s](https://github.com/anthonybruno/signal) backend API that orchestrates context, routing,
and responses between services.

## What it does

The backend API acts as the orchestrator of the Signal system. It receives queries from the frontend
and intelligently routes them to the most appropriate service. It handles formatting and streaming
of responses, giving structure to how context and actions are bundled and passed through the system.

## Request Flow Architecture

```
[Frontend] → [Backend] → [OpenRouter] → [RAG/MCP/Direct] → [Response] → [Frontend]
```

When a user sends a message, the backend uses
[OpenRouter's native tool calling](https://openrouter.ai/docs/features/tool-calling) to determine
the most appropriate service for their request. Based on this analysis, it routes the request to:

- **RAG Service**: For questions about personal experience, projects, or background
- **MCP Service**: For real-time data like current GitHub activity or Spotify listening
- **Direct Response**: For general conversation or creative tasks

The chosen service processes the request and returns relevant information, which gets formatted and
streamed back to the frontend for display.

## Local Development

### Prerequisites

- Node.js 20+
- [MCP server](https://github.com/anthonybruno/signal-mcp) and
  [RAG server](https://github.com/anthonybruno/signal-rag) running locally

### Setup

```bash
npm install
cp .env.example .env
docker-compose up -d
npm run dev
```

- **URL**: http://localhost:3000
- **Health Check**: `GET /health`

## Tech Stack

- Node.js + Express
- TypeScript
- OpenRouter

## Architecture Notes

### Integration Points

- RAG Service: Adds document-based memory and context
- MCP Service: Adds live data from GitHub, Spotify, and blog feeds
- Frontend: Receives streamed LLM response via `/chat`

### Key Features

- **Unified LLM Flow**: Single OpenRouter call handles routing and processing
- **Native Tool Calling**: Leverages OpenRouter's built-in tool capabilities
- **Smart History Management**: Optimizes conversation context for efficiency
- **Streaming Responses**: Real-time delivery of LLM responses

## Development Workflow

```bash
npm run dev          # Start dev server with nodemon
npm run start        # Start production server
npm run lint         # Run ESLint
npm run lint:fix     # Fix linting issues
npm run type-check   # Type-check TypeScript (no emit)
npm run format       # Format code with Prettier
npm run format:check # Check code formatting
```

## Signal Context

This service is the brain of Signal’s multi-service system. It demonstrates routing logic, modular
architecture, and context-aware prompting. It also handles OpenRouter integration and LLM streaming
responses.

- **Additional Info**: [Signal Repo](https://github.com/anthonybruno/signal)
- **Live Site**: [signal.abruno.net](https://signal.abruno.net)
