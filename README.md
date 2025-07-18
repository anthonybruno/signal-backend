# Portfolio Chat Backend

A RAG-powered (Retrieval-Augmented Generation) chatbot backend that serves as my personal portfolio assistant. Built with Express.js, ChromaDB for vector storage, and integrates with OpenAI for embeddings and OpenRouter for LLM responses.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │───▶│  Express API     │───▶│   ChromaDB      │
│   (Chat UI)     │    │  (This Backend)  │    │ (Vector Store)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │  OpenAI          │
                        │  (Embeddings)    │
                        └──────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │  OpenRouter      │
                        │  (LLM Responses) │
                        └──────────────────┘
```

## Features

- **RAG System**: Retrieves relevant personal information to enhance LLM responses
- **Vector Search**: ChromaDB with OpenAI embeddings for semantic similarity search
- **Multiple LLM Support**: OpenRouter integration supporting Claude, GPT, and other models
- **Production Ready**: Comprehensive error handling, logging, rate limiting, and validation
- **Health Monitoring**: Detailed health check endpoints for system status
- **Security**: Helmet, CORS, rate limiting, and input validation

## Prerequisites

- **Node.js** 18+ (check with `node --version`)
- **Docker** (for ChromaDB) or Python 3.8+ (alternative)
- **OpenAI API Key** (for embeddings)
- **OpenRouter API Key** (for LLM responses)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Copy the environment template:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```bash
# Required API Keys
OPENAI_API_KEY=sk-your-openai-key-here
OPENROUTER_API_KEY=sk-or-v1-your-openrouter-key-here

# Other settings (defaults should work)
PORT=3000
NODE_ENV=development
```

### 3. Start ChromaDB

**Option A: Using Docker (Recommended)**

```bash
# Start ChromaDB in the background
docker run -d -p 8000:8000 chromadb/chroma

# Or if you want to see logs:
docker run -p 8000:8000 chromadb/chroma
```

**Option B: Using Python**

```bash
pip install chromadb
chroma run --host localhost --port 8000
```

### 4. Add Your Personal Content

Create your personal knowledge base files in `data/personal/`:

```bash
mkdir -p data/personal
```

Add files like:

- `experience.md` - Your work history and achievements
- `skills.md` - Technical skills and expertise
- `projects.md` - Key projects and accomplishments
- `interests.md` - Professional interests and opinions

### 5. Build Your Knowledge Base

```bash
# Process and embed your personal content
npm run setup-embeddings

# Or to rebuild everything from scratch:
npm run reset-embeddings
```

### 6. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm run build
npm start
```

## API Endpoints

### Chat Endpoints

#### POST `/api/chat`

Main chat endpoint with RAG integration.

**Request:**

```json
{
  "message": "Tell me about your React experience",
  "conversationHistory": [
    { "role": "user", "content": "Previous message" },
    { "role": "assistant", "content": "Previous response" }
  ],
  "model": "anthropic/claude-3.5-sonnet",
  "temperature": 0.7
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "I've been working with React for over 8 years...",
    "model": "anthropic/claude-3.5-sonnet",
    "contextUsed": true,
    "metadata": {
      "timestamp": "2025-01-07T17:30:00.000Z",
      "usage": {
        "prompt_tokens": 1250,
        "completion_tokens": 300,
        "total_tokens": 1550
      }
    }
  }
}
```

#### GET `/api/chat/test`

Test the RAG system end-to-end.

### Health Endpoints

#### GET `/api/health`

Basic health check.

#### GET `/api/health/detailed`

Comprehensive system status including memory usage and dependency checks.

## Project Structure

```
src/
├── config/
│   ├── database.ts          # ChromaDB configuration
│   └── env.ts               # Environment validation
├── middleware/
│   └── errorHandler.ts      # Global error handling
├── routes/
│   ├── chat.ts              # Chat endpoints
│   └── health.ts            # Health check endpoints
├── services/
│   ├── embeddingService.ts  # Vector database operations
│   ├── llmService.ts        # OpenRouter LLM integration
│   └── ragService.ts        # RAG orchestration
├── utils/
│   └── logger.ts            # Winston logging setup
└── index.ts                 # Main server entry point

data/
└── personal/                # Your knowledge base content
    ├── experience.md
    ├── skills.md
    └── ...

scripts/
├── setup-embeddings.ts     # Build knowledge base
└── debug-embeddings.ts     # Debug vector search
```

## Development Workflow

### Testing the System

```bash
# Test RAG system
curl http://localhost:3000/api/chat/test

# Test a chat message
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is your experience with TypeScript?"}'

# Check system health
curl http://localhost:3000/api/health/detailed
```

### Updating Your Knowledge Base

```bash
# 1. Edit files in data/personal/
# 2. Rebuild embeddings
npm run reset-embeddings
# 3. Test the changes
npm run debug-embeddings
```

### Debugging

**Check ChromaDB Connection:**

```bash
curl http://localhost:8000/api/v1/heartbeat
```

**Debug Vector Search:**

```bash
npm run debug-embeddings
```

**View Logs:**

- Development: Console output with colors
- Production: Check `logs/app.log` and `logs/error.log`

## Deployment

### Environment Variables for Production

```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
CHROMA_HOST=your-chroma-host
CHROMA_PORT=8000

# API Keys
OPENAI_API_KEY=sk-your-key
OPENROUTER_API_KEY=sk-or-v1-your-key

# Security
ALLOWED_ORIGINS=https://your-frontend-domain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Deployment Steps

1. **Build the application:** `npm run build`
2. **Set environment variables** for your hosting platform
3. **Deploy ChromaDB** (or use hosted vector DB)
4. **Run embeddings setup** on server: `npm run setup-embeddings`
5. **Start the server:** `npm start`

## Troubleshooting

### Common Issues

**ChromaDB Connection Failed**

```bash
# Check if ChromaDB is running
curl http://localhost:8000/api/v1/heartbeat

# Restart ChromaDB
docker restart <container-id>
```

**No Context Retrieved (Distance scores too high)**

```bash
# Debug search results
npm run debug-embeddings

# Check similarity threshold in src/services/ragService.ts
# Current threshold: 1.3 (adjust based on your content)
```

**OpenAI/OpenRouter API Errors**

- Verify API keys in `.env`
- Check API key permissions and billing
- Review rate limits in service logs

**Empty Knowledge Base**

```bash
# Verify files exist
ls -la data/personal/

# Rebuild embeddings
npm run reset-embeddings
```

### Performance Tips

- **Memory Usage**: Monitor with `/api/health/detailed`
- **Response Times**: Check logs for token usage and processing time
- **Rate Limiting**: Adjust limits in `.env` based on expected traffic
- **Model Selection**: Use faster models for development, premium models for production

## API Keys Setup

### OpenAI (for embeddings)

1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Add to `.env` as `OPENAI_API_KEY`
4. **Cost**: ~$0.001 to embed entire knowledge base

### OpenRouter (for LLM responses)

1. Go to https://openrouter.ai/
2. Sign up and create API key
3. Add to `.env` as `OPENROUTER_API_KEY`
4. **Cost**: Varies by model (~$0.01-0.10 per response)

## Contributing

This is a personal portfolio project, but if you're building something similar:

1. Fork the repository
2. Create a feature branch
3. Add your personal content to `data/personal/`
4. Update the system prompt in `src/services/llmService.ts`
5. Test thoroughly with `npm run debug-embeddings`

## License

MIT License - Feel free to use this as a template for your own portfolio chatbot!
