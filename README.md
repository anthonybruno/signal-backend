# Signal Backend

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-LLM%20API-orange.svg)](https://openrouter.ai/)

[Signal's](https://github.com/anthonybruno/signal) backend API that orchestrates RAG context, LLM
routing, and streaming responses.

## What it does

This server is the central orchestrator that coordinates RAG context retrieval using OpenAI
embeddings, routes requests through OpenRouter with prompt caching and intent functionality, and
streams personalized responses back to the frontend. It combines personal context (RAG) with AI
capabilities to deliver intelligent, context-aware interactions.

## Local Development

### Prerequisites

- Node.js 20+
- [MCP server](https://github.com/anthonybruno/signal-mcp) running
- [RAG server](https://github.com/anthonybruno/signal-rag) running

### Setup

```bash
npm install
cp .env.example .env
docker-compose up -d
npm run dev
```

- **URL**: http://localhost:3000
- **Health Check**: `GET /health`

## Architecture

```
[Frontend] → [Backend] → [RAG Service] → [OpenRouter + Context + Tools] → [Response]
```

## Available Scripts

- `npm run dev` - Dev server with nodemon
- `npm run start` - Production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix linting issues
- `npm run type-check` - TypeScript check
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

## Tech Stack

- Node.js + TypeScript
- Express.js
- OpenRouter
- RAG + MCP integration

## Signal Context

This service is the brain of Signal's multi-service system. It demonstrates modular architecture,
OpenRouter integration, and LLM streaming responses. As part of a broader portfolio, it showcases
API orchestration, real-time communication, and intelligent context management.

- **Additional Info**: [Signal Repo](https://github.com/anthonybruno/signal)
- **Live Site**: [signal.abruno.net](https://signal.abruno.net)
