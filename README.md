# 🛡️ Trustwise - Policy Engine with LLM Judges

A configurable content moderation system that evaluates requests against rules using LLM-powered judges. Built with Node.js/Express backend and React/Vite frontend.

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

## 📖 Documentation

For detailed documentation, see the [/docs](/docs) folder:

- [Functional Requirements](./docs/FUNCTIONAL_REQUIREMENTS.md) - Policy CRUD, Evaluation Engine, Judge & Aggregator interfaces
- [Non-Functional Requirements](./docs/NON_FUNCTIONAL_REQUIREMENTS.md) - Concurrency, Resilience, Observability, Scalability
- [API Reference](./docs/API.md) - Complete REST API documentation

**Live API Documentation:** `http://localhost:3002/api-docs` (Swagger UI)

---

## 🏗️ Project Structure

```
trustwise/
├── server/                  # Backend API (TypeScript/Express)
│   ├── src/
│   │   ├── config/         # Database configuration
│   │   ├── engine/         # Engine initialization
│   │   ├── models/         # MongoDB schemas
│   │   ├── routes/         # REST API routes
│   │   ├── services/       # Core services
│   │   │   ├── PolicyEngine.ts      # Main orchestrator
│   │   │   ├── JudgeService.ts      # LLM judge abstraction
│   │   │   ├── AggregationStrategy.ts # Verdict aggregation
│   │   │   ├── ConfigService.ts     # Configuration management
│   │   │   └── HistoryService.ts    # Evaluation history
│   │   ├── types/          # TypeScript definitions
│   │   └── tests/          # Unit tests
│   └── package.json
├── client/                  # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # UI components
│   │   └── services/       # API client
│   └── package.json
├── docs/                    # Documentation
└── package.json            # Root workspace config
```

---

## ⚡ Quick Start

### Docker (Recommended)

```bash
# Set OpenAI API key and start
export OPENAI_API_KEY=your-api-key
docker-compose up -d

# Access
# Frontend: http://localhost:5173
# Backend:  http://localhost:3002
# Swagger:  http://localhost:3002/api-docs
```

### Manual Setup

```bash
# Install dependencies
npm install && npm run install:all

# Configure environment
cp env.example .env
# Edit .env with your OPENAI_API_KEY

# Start MongoDB
docker run -d --name mongodb -p 27017:27017 mongo:7

# Start development
npm run dev
```

---

## 🔧 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (required) | - |
| `PORT` | Server port | `3002` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/trustwise` |
| `OPENAI_MODEL` | OpenAI model | `gpt-4o-mini` |
| `CLIENT_URL` | CORS origin | `http://localhost:5173` |

---

## 🚀 Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both server and client |
| `npm run dev:server` | Start backend only |
| `npm run dev:client` | Start frontend only |
| `npm test` | Run tests |
| `npm run build` | Build for production |
| `docker-compose up -d` | Start with Docker |

---

## 📦 Core Modules

| Module | Description |
|--------|-------------|
| **PolicyEngine** | Main orchestrator - dispatches rules, aggregates verdicts |
| **JudgeService** | LLM abstraction with retry, circuit breaker, rate limiting |
| **AggregationStrategy** | Verdict strategies: `all`, `any`, `weighted_threshold` |
| **HistoryService** | Evaluation history storage for audit & replay |
| **ConfigService** | MongoDB-backed configuration management |

---

## 📝 License

ISC License - see LICENSE file for details.
