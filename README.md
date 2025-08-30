# Signal Backend

![Node.js](https://img.shields.io/badge/Node.js-20+-5FA04E?logo=node.js&logoColor=white&style=flat-square)
![Express](https://img.shields.io/badge/Google%20Gemini-2.5%20Flash-4B8FE8?logo=googlegemini&logoColor=white&style=flat-square)
![Fly.io](https://img.shields.io/badge/Hosted-Fly.io-24175B?logo=flydotio&logoColor=white&style=flat-square)

## Static portfolios are boring

The backend is where Signal’s conversations get routed, enriched with context, and streamed back in
real time. It’s the API layer that connects the frontend chat interface with retrieval, live tools,
and model orchestration.

## What it does

The backend coordinates the flow of every request in Signal. It:

- Performs **RAG-first retrieval** with ChromaDB to ground responses before calling a model
- Sends a **single orchestrated request** to OpenRouter, combining user input, base instructions,
  and retrieved context
- Uses **OpenRouter tool-calling** to decide if a live tool (MCP integration) should be invoked
- Orchestrates MCP calls when tools are selected, or falls back to a model response if not
- Streams responses back to the frontend in real time
- Provides **basic production safeguards** with rate limiting, Helmet for HTTP security headers, XSS
  filtering, and structured console logging

This approach mirrors how production AI systems like Perplexity or Notion AI structure their
pipelines: retrieval first, then orchestration, then model output.

## Architecture overview

![Signal Architecture](https://github.com/user-attachments/assets/9ae777bb-9564-4168-8e72-9ffbc743ae5c)

The backend acts as the hub, ensuring that every response is grounded in context and that live
integrations are orchestrated cleanly.

## Tech stack

- **Runtime:** Node.js
- **Framework:** Express
- **Retrieval:** ChromaDB (RAG)
- **Model orchestration:** OpenRouter (tool-calling enabled)
- **Integrations:** Model Context Protocol (MCP) for GitHub, Spotify, blog, and project info
- **Dev tooling:** ESLint, Prettier, Husky, and shared configs via
  [dev-config](https://www.npmjs.com/package/abruno-dev-config)
- **Ops:** Docker for portability, GitHub Actions + semantic-release for automation
- **Hosting:** Fly.io

## Local development

Signal’s services can be run locally, but setup involves multiple moving parts.  
For now, the best way to explore Signal is the [live demo](https://signal.abruno.net).

Future work may include a simplified `docker-compose` flow for local development.

## Explore

- [Overview repo](https://github.com/anthonybruno/signal)
- [Frontend repo](https://github.com/anthonybruno/signal-frontend)
- [RAG repo](https://github.com/anthonybruno/signal-rag)
- [MCP repo](https://github.com/anthonybruno/signal-mcp)
- [Live demo](https://signal.abruno.net)

## Signal context

The backend reflects how I approach **system orchestration in AI applications**: retrieval comes
first, models are orchestrated through a single entrypoint, and tool-calling is used selectively to
integrate live data. This mirrors how I think about building **scalable, team-friendly systems** in
practice.
