# 🛡️ Trustwise - Policy Engine with LLM Judges

A configurable content moderation system that evaluates requests against rules using LLM-powered judges. Built with Node.js/Express backend and React/Vite frontend.

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

## ✨ Features

- **LLM-Powered Content Evaluation**: Uses OpenAI GPT models to intelligently evaluate content against defined rules
- **MongoDB Storage**: All configuration and evaluation history stored in MongoDB (no file-based config)
- **Reproducible Evaluations**: Re-run past evaluations with the exact same policy version and content
- **Configurable Policies**: Define policies with multiple rules, actions, and evaluation strategies
- **Multiple Evaluation Strategies**:
  - `all` - All rules must pass for content to be allowed
  - `any` - At least one rule must pass
  - `weighted_threshold` - Weighted scoring system with configurable threshold
- **Flexible Actions**: `allow`, `block`, `warn`, or `redact` based on rule outcomes
- **Professional UI**: Modern dark-themed interface for policy management and content evaluation
- **Real-time Evaluation**: Instant feedback with detailed verdict breakdown
- **Evaluation History**: Track and browse all past evaluations with search and filtering
- **Docker Ready**: Single command deployment with Docker Compose

## 🏗️ Project Structure

```
trustwise/
├── server/                  # Backend API server (TypeScript)
│   ├── src/
│   │   ├── config/         # Database connection
│   │   ├── engine/         # Engine initialization
│   │   ├── models/         # MongoDB schemas (PolicyConfig, EvaluationHistory)
│   │   ├── routes/         # API routes
│   │   ├── services/       # Core services (PolicyEngine, ConfigService, HistoryService)
│   │   └── tests/          # Unit tests
│   ├── Dockerfile
│   └── package.json
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/     # React components (PolicyPanel, HistoryPanel, etc.)
│   │   ├── services/       # API service layer
│   │   └── App.jsx         # Main application
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml      # Docker Compose configuration
├── package.json            # Root workspace config
├── env.example             # Environment variables template
└── README.md
```

## 🐳 Quick Start with Docker (Recommended)

The easiest way to run Trustwise is using Docker Compose. This will start all services (MongoDB, Server, Client) with a single command.

### Prerequisites

- Docker and Docker Compose installed
- OpenAI API key

### One-Command Start

```bash
# Clone the repository
git clone <repository-url>
cd trustwise

# Set your OpenAI API key
export OPENAI_API_KEY=your-api-key-here

# Start all services (MongoDB + Server + Client)
docker-compose up -d

# View logs
docker-compose logs -f
```

That's it! The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3002
- **API Docs**: http://localhost:3002/api/docs
- **MongoDB**: localhost:27017

### Docker Commands

```bash
# Start all services in background
docker-compose up -d

# Start and rebuild containers
docker-compose up -d --build

# Stop all services
docker-compose down

# Stop and remove volumes (clears all data)
docker-compose down -v

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f mongodb

# Restart a specific service
docker-compose restart server

# Check service health
docker-compose ps
```

### Docker Environment Variables

Create a `.env` file in the root directory:

```env
OPENAI_API_KEY=your-openai-api-key
```

Or set it inline:

```bash
OPENAI_API_KEY=sk-xxx docker-compose up -d
```

## 🚀 Manual Installation (Development)

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- MongoDB (local or Docker)
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd trustwise
   ```

2. **Start MongoDB**
   ```bash
   # Using Docker
   docker run -d --name mongodb -p 27017:27017 mongo:7
   
   # Or install MongoDB locally
   ```

3. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install
   
   # Install all workspace dependencies
   npm run install:all
   ```

4. **Configure environment**
   ```bash
   # Copy environment template
   cp env.example .env
   cp env.example server/.env
   
   # Edit .env and add your OpenAI API key and MongoDB URI
   ```

5. **Start development servers**
   ```bash
   # From root - starts both server and client
   npm run dev
   ```

6. **Open the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3002
   - API Documentation: http://localhost:3002/api/docs

## 📖 API Reference

### Evaluate Content
```http
POST /api/policy/evaluate
Content-Type: application/json

{
  "content": "Text to evaluate",
  "policy": { /* optional policy override */ }
}
```

**Response:**
```json
{
  "policy_name": "content_safety_policy",
  "policy_version": "1.0.0",
  "final_verdict": "ALLOW",
  "passed": true,
  "evaluated_at": "2025-12-03T10:00:00.000Z",
  "evaluationId": "uuid-of-saved-evaluation",
  "rule_results": [...],
  "summary": {
    "strategy": "all",
    "total_rules": 3,
    "passed": 3,
    "failed": 0,
    "uncertain": 0,
    "reason": "All 3 rule(s) passed."
  },
  "total_latency_ms": 1234
}
```

### Configuration Endpoints (MongoDB-backed)

```http
# Get current configuration
GET /api/policy/config

# Update configuration
POST /api/policy/config
Content-Type: application/json
{ "policy": {...}, "judge": {...}, "settings": {...} }

# Reload from MongoDB
POST /api/policy/config/reload

# Reset to default values
POST /api/policy/config/reset
```

### Rule Management (MongoDB-backed)

```http
# Add a new rule
POST /api/policy/rules
Content-Type: application/json
{
  "id": "rule_id",
  "description": "Rule description",
  "judge_prompt": "Evaluate if...",
  "on_fail": "block",
  "weight": 1.0
}

# Update a rule
PUT /api/policy/rules/:ruleId

# Delete a rule
DELETE /api/policy/rules/:ruleId
```

### Evaluation History (MongoDB-backed)

```http
# List evaluation history
GET /api/history?page=1&limit=20&verdict=ALLOW&search=text

# Get evaluation statistics
GET /api/history/stats

# Get specific evaluation
GET /api/history/:evaluationId

# Re-run past evaluation (same policy & content)
POST /api/history/:evaluationId/rerun
Content-Type: application/json
{ "saveToHistory": true }

# Delete evaluation
DELETE /api/history/:evaluationId
```

### Utility Endpoints

```http
# Validate policy configuration
POST /api/policy/validate

# Health check (includes MongoDB status)
GET /api/policy/health
GET /health
```

## 📋 Policy Configuration

Policies are stored in MongoDB and automatically seeded with default values on first run:

```json
{
  "name": "content_safety_policy",
  "version": "1.0.0",
  "default_action": "warn",
  "evaluation_strategy": "all",
  "threshold": 0.7,
  "rules": [
    {
      "id": "no_hate_speech",
      "description": "Detect and prevent hate speech",
      "judge_prompt": "Analyze the content for hate speech...",
      "on_fail": "block",
      "weight": 1.0
    },
    {
      "id": "no_pii",
      "description": "Detect personally identifiable information",
      "judge_prompt": "Scan the content for PII...",
      "on_fail": "redact",
      "weight": 0.9
    },
    {
      "id": "professional_tone",
      "description": "Ensure professional tone",
      "judge_prompt": "Evaluate if the content is professional...",
      "on_fail": "warn",
      "weight": 0.7
    }
  ]
}
```

### Evaluation Strategies

| Strategy | Description |
|----------|-------------|
| `all` | All rules must pass (AND logic) |
| `any` | At least one rule must pass (OR logic) |
| `weighted_threshold` | Weighted sum must exceed threshold |

### Actions

| Action | Description |
|--------|-------------|
| `allow` | Permit the content |
| `block` | Reject the content |
| `warn` | Allow with warning flag |
| `redact` | Allow but mark for redaction |

### Verdicts

| Verdict | Description |
|---------|-------------|
| `PASS` | Rule passed - content meets criteria |
| `FAIL` | Rule failed - content violates criteria |
| `UNCERTAIN` | Cannot determine with confidence |

## 🎨 UI Features

### Policy Panel (Left Column)
- View current policy configuration
- Edit policy name, rules, and settings
- Add/remove evaluation rules
- Configure evaluation strategy and thresholds
- Real-time policy validation

### Evaluation Panel (Right Column)
- Input content for evaluation
- Test with sample content presets
- View detailed evaluation results
- See individual rule verdicts with reasoning
- Monitor latency and performance

### History Tab
- Browse all past evaluations
- Filter by verdict (ALLOW, BLOCK, WARN, etc.)
- Search by content or policy name
- View detailed evaluation breakdown
- **Re-run past evaluations** with exact same policy version
- Delete evaluation records

## 🧪 Testing

Run the test suite:
```bash
npm test
# or
cd server && npm test
```

## 🔧 Development Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start both server and client in development mode |
| `npm run dev:server` | Start only the backend server |
| `npm run dev:client` | Start only the frontend client |
| `npm start` | Start the backend server in production mode |
| `npm run build` | Build the client for production |
| `npm test` | Run backend tests |
| `npm run install:all` | Install all workspace dependencies |
| `npm run clean` | Remove all node_modules |

## 🌐 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (required) | - |
| `PORT` | Server port | `3002` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/trustwise` |
| `OPENAI_MODEL` | OpenAI model | `gpt-4o-mini` |
| `CLIENT_URL` | CORS origin for client | `http://localhost:5173` |
| `VITE_API_URL` | Backend API URL (client) | `http://localhost:3002` |

## 🗄️ MongoDB Collections

Trustwise uses two MongoDB collections:

| Collection | Description |
|------------|-------------|
| `policy_configs` | Stores policy configuration (rules, settings, etc.) |
| `evaluation_history` | Stores all evaluation results with policy snapshots |

## 📝 License

ISC License - see LICENSE file for details.
