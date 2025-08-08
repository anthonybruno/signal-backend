# To-do

- [ ] Update npm scripts in Readme

# Signal Backend

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-LLM%20API-orange.svg)](https://openrouter.ai/)

[Signal’s](https://github.com/anthonybruno/signal) backend API that orchestrates context, routing,
and responses between services.

## What it does

The backend API acts as the orchestrator of the Signal system. It receives queries from the
frontend, determines whether to route them to the RAG server, the MCP server, or directly to an LLM
via OpenRouter. It also handles formatting and streaming of responses, giving structure to how
context and actions are bundled and passed through the system. It reflects full-stack architectural
thinking and service orchestration.

## Request Flow Architecture

```
  Frontend → Backend API → Smart Routing
                   │
                   ▼
        Intent Analysis (OpenRouter)
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
RAG Server     MCP Server    Direct Path
(Personal)    (Live Data)  (to OpenRouter)
    │              │              │
    └──────────────┼──────────────┘
                   │
                   ▼
          OpenRouter Processing
           (with base prompts)
                   │
                   ▼
           Response Streaming
                   │
                   ▼
           Frontend Display
```

When a user sends a message, the backend first analyzes what type of information they need. Based on
this analysis, it routes the request to the most appropriate service:

- **RAG Server**: For questions about my personal experience, projects, or background
- **MCP Server**: For real-time data like current GitHub activity or Spotify listening
- **Direct Path**: For general conversation or creative tasks

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
- OpenRouter LLM API
- RESTful endpoint design

## LLM Models

The backend uses different LLM models for different purposes:

- **Intent Analysis & Routing**:
  [Gemini 2.0 Flash](https://openrouter.ai/google/gemini-2.0-flash-001) for fast, cost-effective
  model for determining whether to route requests to RAG, MCP tools, or direct LLM processing.
- **Main Processing**: [Claude 3.5 Sonnet](https://openrouter.ai/anthropic/claude-3.5-sonnet) for
  high-quality model for generating responses, handling conversation, and processing context.

The system intelligently routes queries based on intent analysis, then uses the appropriate model
for the specific task at hand.

## Architecture Notes

### Integration Points

- RAG Server: Adds document-based memory and context
- MCP Server: Adds live data from GitHub, Spotify, and blog feeds
- Frontend: Receives streamed LLM response via `/chat`

## Development Workflow

```bash
npm run dev          # Start dev server with nodemon
npm run build        # Type-check TypeScript (no emit)
npm run start        # Start production server
npm run lint         # Run ESLint
npm run lint:fix     # Fix linting issues
npm run type-check   # Type-check TypeScript (no emit)
npm run format       # Format code with Prettier
```

## Signal Context

This service is the brain of Signal’s multi-service system. It demonstrates routing logic, modular
architecture, and context-aware prompting. It also handles OpenRouter integration and LLM streaming
responses.

- **Additional Info**: [Signal Repo](https://github.com/anthonybruno/signal)
- **Live Site**: [signal.abruno.net](https://signal.abruno.net)
