# 🛡️ Trustwise - Policy Engine with LLM Judges

A configurable content moderation system that evaluates requests against rules using LLM-powered judges. Built with Node.js/Express backend and React/Vite frontend.

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)

## ✨ Features

- **LLM-Powered Content Evaluation**: Uses OpenAI GPT models to intelligently evaluate content against defined rules
- **Configurable Policies**: Define policies with multiple rules, actions, and evaluation strategies
- **Multiple Evaluation Strategies**:
  - `all` - All rules must pass for content to be allowed
  - `any` - At least one rule must pass
  - `weighted_threshold` - Weighted scoring system with configurable threshold
- **Flexible Actions**: `allow`, `block`, `warn`, or `redact` based on rule outcomes
- **Professional UI**: Modern dark-themed interface for policy management and content evaluation
- **Real-time Evaluation**: Instant feedback with detailed verdict breakdown
- **Reloadable Configuration**: Apply policy file changes without restarting the server

## 🏗️ Project Structure

```
trustwise/
├── server/                  # Backend API server
│   ├── src/
│   │   ├── config/         # Policy configuration files
│   │   ├── engine/         # Engine initialization
│   │   ├── routes/         # API routes
│   │   ├── services/       # Core services (PolicyEngine, JudgeService)
│   │   └── tests/          # Unit tests
│   └── package.json
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/       # API service layer
│   │   └── App.jsx         # Main application
│   └── package.json
├── package.json            # Root workspace config
├── env.example             # Environment variables template
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd trustwise
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install
   
   # Install all workspace dependencies
   npm run install:all
   
   # Or manually:
   cd server && npm install
   cd ../client && npm install
   ```

3. **Configure environment**
   ```bash
   # Copy environment template
   cp env.example .env
   
   # Also copy to server directory
   cp env.example server/.env
   
   # Edit .env and add your OpenAI API key
   ```

4. **Start development servers**
   ```bash
   # From root - starts both server and client
   npm run dev
   
   # Or start individually:
   npm run dev:server  # Backend on port 3002
   npm run dev:client  # Frontend on port 5173
   ```

5. **Open the application**
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
  "policy_version": "1.0",
  "final_verdict": "ALLOW",
  "passed": true,
  "evaluated_at": "2025-12-03T10:00:00.000Z",
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

### Get Policy Configuration
```http
GET /api/policy/config
```

### Update Policy Configuration
```http
POST /api/policy/config
Content-Type: application/json

{
  "policy": { /* policy object */ }
}
```

### Validate Policy
```http
POST /api/policy/validate
Content-Type: application/json

{
  "policy": { /* policy object */ }
}
```

### Health Check
```http
GET /api/policy/health
```

### Reload Policy Configuration
```http
POST /api/policy/config/reload
```

## 📋 Policy Configuration

Policies are defined in JSON format:

```json
{
  "name": "content_safety_policy",
  "version": "1.0",
  "default_action": "block",
  "evaluation_strategy": "all",
  "threshold": 0.7,
  "rules": [
    {
      "id": "no_harmful_content",
      "description": "Block content promoting harm",
      "judge_prompt": "Evaluate if this content promotes violence or self-harm...",
      "on_fail": "block",
      "weight": 1.0
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
| `OPENAI_MODEL` | OpenAI model | `gpt-4o-mini` |
| `CLIENT_URL` | CORS origin for client | `http://localhost:5173` |
| `VITE_API_BASE_URL` | Backend API URL (client) | `http://localhost:3002/api/policy` |