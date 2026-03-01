# Restaurant Hours API

A conversational assistant for restaurants with Telegram integration, powered by LangGraph and Google Gemini AI.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CANAL (Telegram)                                │
│  ┌─────────────────┐                                                         │
│  │  Telegram       │                                                         │
│  │  Bot API        │                                                         │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    WEBHOOK GATEWAY (Express)                     │        │
│  │  - Validación de firmas                                          │        │
│  │  - Extracción de chat_id                                         │        │
│  └────────────────────────────┬────────────────────────────────────┘        │
│                               │                                              │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    AGENT ORCHESTRATOR (LangGraph)                │        │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │        │
│  │  │ Clasificador │───▶│  Subflujo    │───▶│   Redactor   │       │        │
│  │  │ de Intención │    │  (FAQ/Pedido)│    │   (Response) │       │        │
│  │  └──────────────┘    └──────────────┘    └──────────────┘       │        │
│  └────────────────────────────┬────────────────────────────────────┘        │
│                               │                                              │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    CONVEX (Database + Functions)                 │        │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │        │
│  │  │ Pedidos  │ │  Menu    │ │ Precios  │ │ Sessions │           │        │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │        │
│  │  (Persistencia de estado de la aplicación)                              │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    LLM PROVIDER (Google Gemini - gemma-3-27b-it) │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    OBSERVABILIDAD (Langfuse)                     │        │
│  │  ┌──────────────┐ ┌──────────────┐                               │        │
│  │  │   LangFuse   │ │ PostgreSQL DB  │  (Trazas LLM) │        │        │
│  │  │  Dashboard   │ │  (Separada)   │                               │        │
│  │  └──────────────┘ └──────────────┘                               │        │
│  └─────────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Nota sobre Bases de Datos:**
- **Convex**: Almacena el estado de la aplicación (sesiones, pedidos, checkpoints, menú, precios, FAQ)
- **LangFuse PostgreSQL**: Almacena trazas de LLM para observabilidad (latencia, tokens, prompts)
- Son dos sistemas separados con propósitos diferentes

## Features

- **Intent Classification**: Classifies user messages into saludo, faq, order, complaint, or unknown
- **FAQ Handler**: Answers questions about menu, prices, hours, and location
- **Order Handler**: Manages the complete order flow with cart state
- **Conversational Memory**: Persists conversation state via Convex checkpoints
- **Observability**: Full tracing with LangFuse for LLM calls

## Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Convex account (free tier available)
- Google AI API key (for Gemini)
- Telegram Bot Token

## Setup

### 1. Clone and Install Dependencies

```bash
cd apps/restaurant-hours-api
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Convex Configuration
CONVEX_DEPLOYMENT=your-deployment-name
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_SITE_URL=https://your-deployment.convex.site

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# ngrok (for local development)
NGROK_AUTHTOKEN=your-ngrok-authtoken

# Google AI (Gemini)
GOOGLE_GENERATIVE_AI_API_KEY=your-google-api-key

# LangFuse (Observability)
LANGFUSE_PUBLIC_KEY=your-langfuse-public-key
LANGFUSE_SECRET_KEY=your-langfuse-secret-key
LANGFUSE_HOST=http://localhost:3001
```

### 3. Deploy Convex Schema and Functions

```bash
npm run convex:dev
```

This will:
- Deploy the schema to Convex
- Deploy all queries and mutations

### 4. Seed the Database (First Time Only)

After deploying Convex, you need to seed the database with initial menu, prices, and FAQ data.

**Opción A: Desde el Dashboard de Convex**
1. Ve a https://dashboard.convex.dev
2. Selecciona tu proyecto (restaurantes)
3. Ve a la pestaña "Functions"
4. Busca `seed:seedDatabase`
5. Haz clic en "Run" y ejecuta la función

**Opción B: Desde la línea de comandos**
```bash
npx convex run seed:seedDatabase
```

Esto creará:
- 10 items del menú (hamburguesas, papas, bebidas, combos)
- 10 entradas de precios
- 6 entradas de FAQ (horarios, ubicación, delivery, pagos, reservas, estacionamiento)

### 5. Start Services with Docker Compose

```bash
npm run docker:up
```

This starts:
- **API** (port 3000): Express server with Telegram webhook
- **ngrok** (port 4040): Public tunnel for Telegram webhooks
- **LangFuse** (port 3001): LLM observability platform
- **PostgreSQL** (port 5432): Database for LangFuse

### 6. Set Telegram Webhook

```bash
npm run docker:webhook:set
```

### 7. Configure LangFuse (Opcional - Observabilidad)

LangFuse es opcional pero recomendado para visualizar las trazas de las llamadas al LLM.

**Opción A: LangFuse Cloud (Recomendado para desarrollo)**

1. Ve a https://cloud.langfuse.com
2. Crea una cuenta gratuita
3. Crea un nuevo proyecto
4. Ve a **Settings** → **API Keys**
5. Copia las keys y agrégalas a tu `.env`:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx
LANGFUSE_HOST=https://cloud.langfuse.com
```

**Opción B: LangFuse Self-Hosted**

Si prefieres self-hosted, necesitas configurar PostgreSQL y las variables de entorno correctamente. Ver la documentación de LangFuse para más detalles.

**Nota:** Sin LangFuse configurado, el agente funcionará normalmente pero sin trazabilidad de las llamadas al LLM.

## Development

### Run in Development Mode

```bash
npm run dev
```

### Run Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

## Usage

### Enable Agent Mode

Set the `USE_AGENT=true` environment variable to enable the LangGraph agent:

```bash
USE_AGENT=true npm run dev
```

Or add it to your `.env.local`:

```bash
USE_AGENT=true
```

### Telegram Commands

Send messages to your Telegram bot:

- **"Hola"** - Greeting response
- **"¿Qué tienen?"** - Menu information
- **"¿Cuáles son los horarios?"** - Business hours
- **"Quiero 2 hamburguesas"** - Start an order
- **"Delivery"** - Set delivery type
- **"Calle Falsa 123"** - Set delivery address
- **"Efectivo"** - Set payment method

## Project Structure

```
apps/restaurant-hours-api/
├── convex/                    # Convex backend
│   ├── schema.ts             # Database schema
│   ├── sessions.ts           # Session management
│   ├── checkpoints.ts        # LangGraph memory
│   ├── pedidos.ts            # Order management
│   ├── menu.ts               # Menu items
│   ├── precios.ts            # Price validation
│   ├── faq.ts                # FAQ entries
│   └── seed.ts               # Database seeding
├── src/
│   ├── agent/                # LangGraph agent
│   │   ├── types.ts          # State types
│   │   ├── llm.ts            # LLM configuration
│   │   ├── graph.ts          # StateGraph definition
│   │   ├── memory.ts         # Checkpoint persistence
│   │   ├── nodes/            # Graph nodes
│   │   │   ├── classifyIntent.ts
│   │   │   ├── faqHandler.ts
│   │   │   ├── orderHandler.ts
│   │   │   └── formatResponse.ts
│   │   └── agent.test.ts     # Agent tests
│   ├── routes/
│   │   └── telegram-webhook.ts
│   └── services/
│       └── telegram.ts
├── docker-compose.yml        # Docker services
├── Dockerfile
└── package.json
```

## Docker Services

| Service | Port | Description |
|---------|------|-------------|
| api | 3000 | Express API server |
| ngrok | 4040 | Public tunnel for webhooks |
| langfuse | 3001 | LLM observability dashboard |
| langfuse-db | 5432 | PostgreSQL for LangFuse |

## API Endpoints

### POST /telegram/webhook

Receives Telegram updates and processes them through the agent.

**Request Body:**
```json
{
  "message": {
    "chat": { "id": 123456789 },
    "text": "Hola"
  }
}
```

**Response:**
```json
{
  "ok": true
}
```

## LangGraph Flow

```
┌─────────────────┐
│  __start__      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ classify_intent │
└────────┬────────┘
         │
    ┌────┴────┬────────────┐
    │         │            │
    ▼         ▼            ▼
┌───────┐ ┌───────┐ ┌───────────────┐
│  faq  │ │ order │ │ format_response│
└───┬───┘ └───┬───┘ └───────┬───────┘
    │         │             │
    └────┬────┴─────────────┤
         │                  │
         ▼                  │
┌─────────────────┐         │
│ format_response │◄────────┘
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    __end__      │
└─────────────────┘
```

## Observability (LangFuse)

LangFuse proporciona observabilidad para las llamadas al LLM:
- Visualización de trazas para cada llamada al LLM
- Seguimiento de uso de tokens
- Métricas de latencia
- Gestión de sesiones
- Versionado de prompts

**Nota:** LangFuse usa su propia base de datos PostgreSQL para almacenar las trazas. Esto es separado de Convex, que almacena el estado de la aplicación (sesiones, pedidos, checkpoints, menú, precios, FAQ).

Acceso al dashboard en http://localhost:3001

## Troubleshooting

### Convex Connection Issues

```bash
npx convex dev --once
```

### Docker Issues

```bash
# View logs
npm run docker:logs

# Restart services
npm run docker:down
npm run docker:up
```

### LangFuse Not Starting

Ensure PostgreSQL is healthy:
```bash
docker compose ps langfuse-db
```

## License

MIT
