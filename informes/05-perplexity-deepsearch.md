# Análisis Técnico de Evolución: Sistema Conversacional para Restaurantes
**De MVP Telegram+n8n a Plataforma Productiva de Microservicios**

**Fecha de análisis**: 2026-02-27  
**Estado del producto**: Pre-producción (fase de definición y validación técnica)  
**Enfoque**: Industrialización incremental desde prototipo hacia producción escalable

***

## A. RESUMEN EJECUTIVO

### Decisión Recomendada

**ADOPTAR PARCIAL** con modificaciones críticas al stack propuesto.

### Justificación Técnica y de Negocio

**Stack Recomendado (con ajustes críticos)**:

| Componente | Propuesto Original | Recomendación Final | Justificación |
|------------|-------------------|---------------------|---------------|
| Canal productivo | WhatsApp | **WhatsApp** ✅ | [HECHO VERIFICADO] API estable, pricing conocido[^1] |
| Handoff/CRM | Clerk+Convex+Next.js+Kapso.ai | **Clerk+Convex+Next.js+Kapso.ai** ✅ | [HECHO VERIFICADO] Integración oficial documentada[^2][^3], Kapso.ai soporta handoff productivo[^4] |
| Orquestación IA | LangChain+LangGraph | **LangChain+LangGraph** ✅ | [HECHO VERIFICADO] Production-ready con LangGraph Studio para debugging visual[^5][^6] |
| LLM/API | Gemma 3 27B vía Google AI Studio | **Gemini 2.0 Flash** ⚠️ | [HECHO VERIFICADO] Gemma 3 27B existe[^7][^8] pero tiene limitaciones críticas en producción[^9]. **Gemini 2.0 Flash** ofrece mejor performance (55/100 vs 32/100)[^9] |
| Base de datos | Convex | **Convex (primary) + Postgres (backup)** ⚠️ | [INFERENCIA] Convex optimizado para real-time[^10] pero mantener Postgres reduce lock-in |
| Infra | Terraform+GCP | **Terraform+GCP (Cloud Run)** ✅ | [HECHO VERIFICADO] Cloud Run auto-scaling, pay-per-use[^11][^12][^13] |
| Observabilidad infra | Prometheus+Grafana | **Managed Prometheus + Grafana** ✅ | [HECHO VERIFICADO] Managed Service for Prometheus disponible[^14] |
| Observabilidad IA | Langfuse | **Langfuse self-hosted** ✅ | [HECHO VERIFICADO] MIT license gratuito con todas las features core[^15][^16] |

**Decisión sobre Gemma 3 27B**: **NO RECOMENDADO** como LLM primario para producción. [HECHO VERIFICADO] Gemma 3 27B lanzado marzo 2025, disponible en Google AI Studio con 128K context window, **PERO** reportes de usuarios y evaluaciones independientes muestran limitaciones críticas:[^7][^8][^17]

- Performance débil en programación compleja (32/100 max score vs 55/100 Gemini 2.0 Flash)[^9]
- Problemas de loops infinitos con contextos largos[^9]
- Calidad inferior para casos de uso conversacionales complejos[^9]

**Recomendación**: Usar **Gemini 2.0 Flash** como LLM primario (mejor performance/costo para este caso de uso), con Gemma 3 27B como fallback opcional solo si restricciones presupuestarias extremas lo justifican.[^9]

**Fecha de consulta**: 2026-02-27  
**Fuentes**: Google AI Changelog, Google Gemma 3 announcement, Reddit user reports, Gemma 3 technical overview[^8][^17][^7][^9]

### Time-to-Market

| Fase | Duración | Entregable Clave |
|------|----------|------------------|
| Fase 0 (POC) | 3-4 semanas | LangGraph + Convex + Gemini 2.0 Flash funcional en Telegram |
| Fase 1 (Piloto) | 6-8 semanas | WhatsApp piloto con 1 restaurante, observabilidad básica |
| Fase 2 (Producción parcial) | 8-10 semanas | 3-5 restaurantes, SLOs definidos, alertado operativo |
| Fase 3 (Go-Live) | 4-6 semanas | Multi-tenant, auto-scaling, runbooks completos |
| **TOTAL** | **21-28 semanas** | Producción completa operativa |

### Costos Estimados Mensuales por Fase

[INFERENCIA] Basado en supuesto de volumen: 1,000-5,000 conversaciones/día en Fase 2, escalando a 10,000+/día en Fase 3.

| Categoría | Fase 0 (POC) | Fase 1 (Piloto) | Fase 2 (Producción parcial) | Fase 3 (Go-Live) |
|-----------|--------------|-----------------|----------------------------|------------------|
| **GCP Cloud Run** (compute + networking) | $20-50 | $50-150 | $150-400 | $400-1,200 |
| **Convex** (function calls + storage) | $10-30 | $30-100 | $100-300 | $300-800 |
| **WhatsApp Business API** (marketing + utility + service) | $50-150 | $150-500 | $500-2,000 | $2,000-8,000 |
| **Gemini 2.0 Flash** (LLM inference) | $50-100 | $100-300 | $300-800 | $800-2,500 |
| **Langfuse self-hosted** (infra) | $30-50 | $50-100 | $100-200 | $200-400 |
| **Prometheus + Grafana** (infra) | $20-40 | $40-80 | $80-150 | $150-300 |
| **Clerk** (auth) | $0 (free tier) | $25 | $25 | $99 |
| **Kapso.ai** (WhatsApp handoff) | TBD | TBD | TBD | TBD |
| **Total estimado** | **$180-420** | **$445-1,255** | **$1,255-3,875** | **$3,949-13,299** |

**Notas**:
- WhatsApp API costos dominan en fases productivas. Optimizar para service messages (<24h window) que son FREE.[^1]
- Gemini 2.0 Flash pricing: consultar pricing oficial de Google AI Studio (no disponible en búsqueda actual; requiere verificación directa).
- Kapso.ai pricing: no encontrado en documentación pública; requiere cotización directa.

**Fuentes**: Cloud Run pricing, Convex pricing, WhatsApp API pricing, Langfuse pricing[^12][^18][^13][^19][^15][^20][^1]
**Fecha de consulta**: 2026-02-27

### Riesgos Top 10

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|--------|--------------|---------|------------|
| 1 | **Gemma 3 27B limitaciones productivas** | Alta | Crítico | [MITIGADO] Usar Gemini 2.0 Flash como primario[^9] |
| 2 | **Lock-in Convex** | Media | Alto | Abstraer queries críticos en capa de servicio, mantener Postgres como backup |
| 3 | **Costos WhatsApp API marketing messages** | Alta | Alto | Optimizar para service messages FREE (<24h)[^1], usar templates pre-aprobados, evitar marketing outbound |
| 4 | **Curva aprendizaje LangGraph vs n8n** | Media | Medio | [MITIGADO] LangGraph Studio + Langfuse compensan pérdida de UI visual de n8n[^5][^6][^21] |
| 5 | **Latencia >10s con Gemini 2.0 Flash** | Baja | Alto | Implementar caching de respuestas frecuentes, optimizar prompts, streaming responses |
| 6 | **Pricing changes Meta (WhatsApp)** | Media | Medio | [HECHO VERIFICADO] Última actualización enero 2026[^22]. Monitorear anuncios Meta trimestralmente |
| 7 | **Complejidad operacional self-hosted Langfuse + Prometheus** | Media | Medio | [ALTERNATIVA] Si no hay expertise DevOps, migrar a Langfuse Cloud Pro $199/mes[^20] |
| 8 | **Diseño prematuro de microservicios** | Media | Medio | Iniciar con 3-4 servicios core, refinar boundaries en Fase 1-2 con data real |
| 9 | **Flaky tests API-level** | Alta | Medio | Usar contract testing, mocks para WhatsApp API, fixtures de Convex |
| 10 | **Falta de expertise Terraform GCP** | Baja | Medio | Usar Cloud Foundation Toolkit[^23], training team 2-3 días, consultoría inicial |

### Recomendación Final

**ADOPTAR** la arquitectura de microservicios con el stack ajustado (Gemini 2.0 Flash como LLM primario en lugar de Gemma 3 27B), implementando roadmap incremental de 4 fases (21-28 semanas), con enfoque SRS-first y TDD pragmático. La inversión estimada en Fase 3 (Go-Live) de $3,949-13,299/mes es justificable por:

1. **Escalabilidad técnica**: Cloud Run auto-scaling, Convex real-time[^11][^10][^12]
2. **Observabilidad completa**: Langfuse MIT license + Managed Prometheus[^14][^15]
3. **Reducción de riesgo**: Implementación incremental con rollback claro en cada fase
4. **Time-to-market competitivo**: 21-28 semanas vs 6-12 meses de un big-bang approach

***

## B. ARQUITECTURA OBJETIVO

### Diagrama Lógico End-to-End

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CAPA DE CLIENTE                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  WhatsApp    │  │  Telegram    │  │  Web Widget  │              │
│  │  (Production)│  │  (Dev/Test)  │  │  (Future)    │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
└─────────┼──────────────────┼──────────────────┼───────────────────────┘
          │                  │                  │
          │         ┌────────▼──────────┐       │
          │         │   API GATEWAY      │       │
          │         │  (Cloud Run)       │       │
          │         │  - Routing         │       │
          │         │  - Rate limiting   │       │
          │         └────────┬──────────┘       │
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼───────────────────────┐
│         │         CAPA DE SERVICIOS           │                       │
│         │                  │                  │                       │
│  ┌──────▼──────┐  ┌────────▼────────┐  ┌─────▼──────┐               │
│  │  Webhook    │  │   Conversation   │  │   Menu &   │               │
│  │  Receiver   │  │   Orchestrator   │  │   Catalog  │               │
│  │  Service    │  │   (LangGraph)    │  │   Service  │               │
│  │             │  │                  │  │            │               │
│  │ - Clerk auth│◄─┤ - Intent class. │◄─┤ - FAQ      │               │
│  │ - Webhook   │  │ - State mgmt     │  │ - Pricing  │               │
│  │   validation│  │ - LLM calls      │  │ - Products │               │
│  └──────┬──────┘  └────────┬─────────┘  └─────┬──────┘               │
│         │                  │                  │                       │
│         │         ┌────────▼────────┐         │                       │
│         │         │     Order       │         │                       │
│         │         │   Management    │         │                       │
│         │         │    Service      │         │                       │
│         │         │                 │         │                       │
│         │         │ - Validation    │         │                       │
│         │         │ - Persistence   │         │                       │
│         │         │ - State machine │         │                       │
│         │         └────────┬────────┘         │                       │
│         │                  │                  │                       │
│  ┌──────▼──────┐  ┌────────▼────────┐  ┌─────▼──────┐               │
│  │  Handoff    │  │    Notification │  │  Analytics │               │
│  │  Service    │  │      Service    │  │   Service  │               │
│  │ (Kapso.ai)  │  │                 │  │            │               │
│  │             │  │ - WhatsApp send │  │ - Events   │               │
│  │ - CRM inbox │  │ - Templates     │  │ - Metrics  │               │
│  │ - Human     │  │ - Queue mgmt    │  │ - Dashboards│              │
│  │   takeover  │  │                 │  │            │               │
│  └─────────────┘  └─────────────────┘  └────────────┘               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                      CAPA DE DATOS                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Convex     │  │  PostgreSQL  │  │    Redis     │              │
│  │  (Primary)   │  │  (Backup)    │  │   (Cache)    │              │
│  │              │  │              │  │              │              │
│  │ - Sessions   │  │ - Orders     │  │ - Sessions   │              │
│  │ - Memory     │  │ - Audit log  │  │ - Rate limit │              │
│  │ - Real-time  │  │ - Analytics  │  │ - Temp data  │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                  CAPA DE OBSERVABILIDAD                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Langfuse   │  │  Prometheus  │  │   Grafana    │              │
│  │  (LLM Obs)   │  │  (Metrics)   │  │ (Dashboards) │              │
│  │              │  │              │  │              │              │
│  │ - Traces     │  │ - Infra      │  │ - Monitoring │              │
│  │ - Prompts    │  │ - App        │  │ - Alerting   │              │
│  │ - Evals      │  │ - Business   │  │ - Runbooks   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### Catálogo de Microservicios

| Servicio | Responsabilidad | API/Eventos | Storage | Ownership |
|----------|----------------|-------------|---------|-----------|
| **API Gateway** | - Routing requests<br/>- Rate limiting<br/>- Auth validation (Clerk JWT)<br/>- CORS/security headers | REST (inbound)<br/>gRPC (internal) | Redis (rate limit) | Platform Team |
| **Webhook Receiver** | - Receive WhatsApp/Telegram webhooks<br/>- Validate signatures<br/>- Extract telcliente/chat_id<br/>- Publish event to queue | REST (webhook)<br/>Event: `message.received` | Convex (log) | Bot Team |
| **Conversation Orchestrator** | - Intent classification<br/>- Route to subflujos (FAQ/Order/Handoff)<br/>- Execute LangGraph workflow<br/>- Call Gemini 2.0 Flash<br/>- Maintain memory conversacional | gRPC (sync)<br/>Event: `conversation.step_completed` | Convex (sessions, memory)<br/>Postgres (audit) | AI/NLP Team |
| **Menu & Catalog Service** | - Serve FAQ, Precios, Menu<br/>- Search/filter products<br/>- Validate product codes | REST (read-only)<br/>Cache: Redis | Convex (catalog)<br/>Postgres (backup) | Product Team |
| **Order Management Service** | - Validate pedido (product, quantity, address, payment)<br/>- State machine: incomplete/complete/error<br/>- Calculate total<br/>- Persist pedido | gRPC (sync)<br/>Event: `order.created`, `order.updated` | Convex (orders)<br/>Postgres (orders) | Order Team |
| **Handoff Service (Kapso.ai)** | - Detect escalation criteria<br/>- Pause workflow<br/>- Route to human inbox<br/>- Notify agents | REST (Kapso.ai API)<br/>Event: `handoff.initiated` | Kapso.ai (messages)<br/>Convex (handoff log) | Support Team |
| **Notification Service** | - Send WhatsApp messages (templates)<br/>- Queue management<br/>- Retry logic<br/>- Track delivery status | REST (WhatsApp API)<br/>Event: `message.sent` | Redis (queue)<br/>Convex (delivery log) | Platform Team |
| **Analytics Service** | - Aggregate events<br/>- Compute business metrics<br/>- Export to dashboards | Event-driven (consume all)<br/>REST (read) | Postgres (analytics)<br/>Clickhouse (future) | Data Team |

**Dependencias críticas**:
- Todos los servicios dependen de **Clerk** para auth (JWT validation)
- **Conversation Orchestrator** es el núcleo; fallo aquí detiene todas las conversaciones activas
- **Order Management** tiene dependencia síncrona con **Menu & Catalog** (validación de productos)

**Comunicación**:
- **Síncrona**: gRPC para servicios críticos de latencia (Orchestrator ↔ Order Management)
- **Asíncrona**: Pub/Sub (Google Cloud Pub/Sub) para eventos no-críticos (Analytics, Notifications)
- **REST**: APIs públicas (webhooks, Kapso.ai, WhatsApp API)

### Estrategia de Consistencia de Datos y Memoria Conversacional

#### Consistencia de Datos

**Modelo**: **Eventual Consistency** con **Strong Consistency** para datos críticos.

| Data Type | Consistency Model | Implementación |
|-----------|-------------------|----------------|
| **Memoria conversacional** | Eventual | Convex reactive queries[^10], reads permitidos con stale <5s |
| **Pedidos (estados finales)** | Strong | Postgres ACID transactions, Convex solo como cache read-only |
| **Catálogo (Menu/Precios)** | Eventual | Convex con TTL 60s, invalidación manual al actualizar |
| **Handoff state** | Strong | Kapso.ai como source of truth, Convex solo metadata |
| **Analytics** | Eventual | Batch processing cada 5-15 minutos, no requiere real-time |

**Patrón de escritura**:
1. **Write-through**: Pedidos se escriben a Postgres (source of truth) y replican a Convex (cache)
2. **Event Sourcing**: Eventos de conversación se persisten como append-only log en Convex, agregados asíncronos para analytics

#### Memoria Conversacional

**Diseño**:
- **Session key**: `telcliente` (Telegram) o `phone_number` (WhatsApp)
- **Storage primario**: Convex (reactive, real-time updates)
- **TTL**: 7 días de inactividad (GDPR-friendly)
- **Estructura**:

```typescript
// Convex schema
export const sessions = defineTable({
  sessionId: v.string(), // phone_number o chat_id
  restaurantId: v.string(),
  createdAt: v.number(),
  lastActivityAt: v.number(),
  state: v.object({
    currentPhase: v.union(v.literal("faq"), v.literal("order"), v.literal("handoff")),
    orderDraft: v.optional(v.object({
      items: v.array(v.object({ product: v.string(), quantity: v.number() })),
      address: v.optional(v.string()),
      paymentMethod: v.optional(v.string()),
      delivery: v.optional(v.boolean()),
    })),
    messageHistory: v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      timestamp: v.number(),
    })),
  }),
})
.index("by_session", ["sessionId"])
.index("by_restaurant", ["restaurantId", "lastActivityAt"]);
```

**Operaciones**:
- **Read**: Convex reactive query, latencia <50ms[^10]
- **Write**: Convex mutation, atomic, replicado a Postgres async para backup
- **Cleanup**: Cron job diario elimina sessions con `lastActivityAt > 7 días`

**Recuperación de estado**:
- Si usuario envía mensaje después de TTL expirado → crear nueva sesión, NO recuperar historial (privacy by design)
- Si sesión activa (<7 días) → cargar state completo, LangGraph resume desde último step

**Escalabilidad**: Convex escala horizontalmente con WebSockets, soporta millones de sessions concurrentes.[^10]

***

## C. DISEÑO DE PLATAFORMA

### Estructura de Monorepo Propuesta

```
github.com/your-org/conversational-platform/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint, test, build
│       ├── cd-dev.yml                # Deploy to dev
│       ├── cd-prod.yml               # Deploy to prod
│       └── terraform-plan.yml        # Terraform plan on PR
│
├── apps/                             # User-facing applications
│   ├── admin-dashboard/              # Next.js admin UI
│   │   ├── package.json
│   │   ├── src/
│   │   └── tsconfig.json
│   ├── webhook-receiver/             # Cloud Run service
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   └── analytics-dashboard/          # Grafana + custom UI
│       └── ...
│
├── services/                         # Backend microservices
│   ├── conversation-orchestrator/    # LangGraph workflows
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── graphs/               # LangGraph definitions
│   │   │   ├── prompts/              # Versioned prompts
│   │   │   └── tools/                # Custom tools
│   │   ├── tests/
│   │   └── tsconfig.json
│   ├── order-management/
│   │   ├── Dockerfile
│   │   ├── src/
│   │   └── tests/
│   ├── menu-catalog/
│   │   └── ...
│   ├── notification/
│   │   └── ...
│   └── analytics/
│       └── ...
│
├── packages/                         # Shared libraries
│   ├── api-contracts/                # TypeScript types/schemas
│   │   ├── src/
│   │   │   ├── events.ts             # Pub/Sub event types
│   │   │   ├── grpc/                 # gRPC proto definitions
│   │   │   └── rest/                 # OpenAPI specs
│   │   └── package.json
│   ├── convex-client/                # Convex SDK wrapper
│   │   ├── src/
│   │   └── package.json
│   ├── logger/                       # Structured logging
│   │   └── ...
│   ├── monitoring/                   # Langfuse + Prometheus helpers
│   │   └── ...
│   └── testing-utils/                # Shared test fixtures
│       └── ...
│
├── infra/                            # Terraform IaC
│   ├── modules/
│   │   ├── cloud-run/                # Cloud Run module
│   │   ├── networking/               # VPC, LB, Cloud Armor
│   │   ├── database/                 # Convex, Postgres, Redis
│   │   ├── monitoring/               # Prometheus, Grafana, Langfuse
│   │   └── secrets/                  # Secret Manager
│   ├── environments/
│   │   ├── dev/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── terraform.tfvars
│   │   ├── staging/
│   │   │   └── ...
│   │   └── prod/
│   │       └── ...
│   └── backend.tf                    # GCS backend config
│
├── scripts/                          # Automation scripts
│   ├── seed-catalog.ts               # Seed Menu/Precios to Convex
│   ├── migrate-db.sh                 # Postgres migrations
│   └── run-e2e-tests.sh              # E2E test orchestration
│
├── docs/                             # Documentation
│   ├── architecture/
│   │   ├── ADR/                      # Architecture Decision Records
│   │   └── diagrams/
│   ├── runbooks/                     # Operational runbooks
│   └── SRS/
│       ├── v1.0.md
│       └── v1.1.md
│
├── .gitignore
├── package.json                      # Root package.json (turborepo)
├── turbo.json                        # Turborepo config
├── tsconfig.json                     # Root TypeScript config
└── README.md
```

**Build system**: **Turborepo** para monorepo management (faster builds, caching).[^23]

**Package manager**: **pnpm** (disk-efficient, fast, workspaces built-in).

**Naming conventions**:
- `apps/*`: User-facing applications, deployed independently
- `services/*`: Backend microservices, 1 service = 1 Cloud Run deployment
- `packages/*`: Shared libraries, published to private npm registry (Google Artifact Registry)
- `infra/*`: Terraform modules, environments separated by folder

### CI/CD con Quality Gates

#### Pipeline Stages

**Stage 1: Linting & Formatting (fail-fast)**
- ESLint, Prettier, TypeScript strict mode
- Gitleaks (secret scanning)
- **Duration**: <2 min
- **Trigger**: Every push/PR

**Stage 2: Unit Tests**
- Jest, Vitest
- Coverage threshold: 70% para `packages/*`, 60% para `services/*`
- **Duration**: 3-5 min
- **Trigger**: Every push/PR

**Stage 3: Contract Tests**
- Pact (consumer-driven contracts)
- Validate gRPC proto compatibility
- **Duration**: 2-3 min
- **Trigger**: Every push/PR

**Stage 4: Integration Tests**
- Testcontainers (Postgres, Redis)
- Convex local dev mode
- Mock WhatsApp API (WireMock)
- **Duration**: 5-8 min
- **Trigger**: Every push/PR to `main`, `dev`

**Stage 5: E2E API-Level Tests**
- Playwright/Postman
- Real Convex dev deployment
- Real Telegram Bot API (test bot)
- **Duration**: 10-15 min
- **Trigger**: Pre-merge to `main`, nightly

**Stage 6: Security Scanning**
- Trivy (container scanning)
- Snyk (dependency vulnerabilities)
- OWASP ZAP (API security)
- **Duration**: 5-7 min
- **Trigger**: Pre-deploy to `staging`, `prod`

**Stage 7: Terraform Plan**
- `terraform plan` output posted to PR
- **Duration**: 2-3 min
- **Trigger**: Any change in `infra/*`

**Stage 8: Deploy**
- Cloud Run deployment (blue-green)
- Smoke tests (health checks)
- Rollback automatic si smoke tests fallan
- **Duration**: 5-10 min
- **Trigger**: Merge to `main` (dev), manual approval (prod)

#### Quality Gates (PR merge requirements)

| Gate | Requirement | Rationale |
|------|-------------|-----------|
| **All tests pass** | 100% pass rate | No broken builds |
| **Code coverage** | ≥70% packages, ≥60% services | Test critical paths |
| **Security scan** | 0 CRITICAL vulnerabilities | No known exploits |
| **Terraform plan** | Reviewed + approved by SRE | Infra changes audited |
| **PR review** | ≥1 approval from CODEOWNERS | Peer review |
| **No merge conflicts** | Rebased on target branch | Clean history |

#### Deployment Strategy

**Dev environment**:
- Auto-deploy on merge to `dev` branch
- Cloud Run 1 instance min, 3 max
- Convex dev deployment
- **Rollback**: Git revert + redeploy

**Staging environment**:
- Auto-deploy on merge to `main` branch
- Cloud Run 2 instances min, 10 max
- Convex staging deployment
- **Smoke tests**: 5-min health check + 3 sample conversations
- **Rollback**: Automatic si smoke tests fallan

**Prod environment**:
- Manual approval (Slack bot) after staging smoke tests pass
- Blue-green deployment (Cloud Run traffic splitting: 10% → 50% → 100%)
- Convex prod deployment
- **Canary period**: 30 min at 10%, monitor error rate, latency p95, Langfuse eval scores
- **Rollback**: Automatic si error rate >5% o latency p95 >15s

### Terraform Modules en GCP

[HECHO VERIFICADO] Terraform oficialmente soportado en GCP con provider `hashicorp/google`. Google provee **Cloud Foundation Toolkit** con módulos best-practices.[^24][^23]

#### Módulos Propuestos

**1. Networking Module** (`infra/modules/networking/`)
- VPC, subnets (us-central1, us-east1, europe-west1)
- Cloud NAT, Cloud Router
- Cloud Load Balancing (HTTPS)
- Cloud Armor (DDoS protection, WAF rules)
- **Output**: VPC ID, subnet IDs, LB IP

**2. Compute Module** (`infra/modules/cloud-run/`)
- Cloud Run services (1 por microservicio)
- Service accounts con least-privilege IAM
- VPC connector para acceso a Convex/Postgres
- Autoscaling config (min/max instances, CPU/memory)
- **Output**: Service URLs, service account emails

**3. Database Module** (`infra/modules/database/`)
- Cloud SQL (Postgres 15, HA con read replicas)
- Cloud Memorystore (Redis 7.x, HA)
- Convex (external, API config via Terraform provider si disponible; sino manual)
- Backups automáticos (daily, retention 30 días)
- **Output**: Connection strings (Secret Manager)

**4. Secrets Module** (`infra/modules/secrets/`)
- Secret Manager secrets (API keys: WhatsApp, Gemini 2.0 Flash, Clerk, Kapso.ai)
- IAM bindings (service accounts → secrets)
- Rotation policy (365 días)
- **Output**: Secret resource names

**5. Monitoring Module** (`infra/modules/monitoring/`)
- Managed Service for Prometheus[^14]
- Grafana (self-hosted en Cloud Run o GKE)
- Langfuse (self-hosted en Cloud Run)
- Log sinks (Cloud Logging → BigQuery para análisis)
- **Output**: Prometheus endpoint, Grafana URL, Langfuse URL

**6. Pub/Sub Module** (`infra/modules/pubsub/`)
- Topics: `message.received`, `conversation.step_completed`, `order.created`, `handoff.initiated`
- Subscriptions por servicio
- Dead-letter topics
- IAM bindings
- **Output**: Topic names, subscription names

#### Ejemplo Terraform (Cloud Run service)

```hcl
# infra/modules/cloud-run/main.tf
resource "google_cloud_run_v2_service" "conversation_orchestrator" {
  name     = "conversation-orchestrator-${var.environment}"
  location = var.region
  project  = var.project_id

  template {
    service_account = google_service_account.orchestrator.email

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
      }

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = var.gemini_api_key_secret
            version = "latest"
          }
        }
      }

      env {
        name  = "CONVEX_URL"
        value = var.convex_url
      }

      env {
        name  = "LANGFUSE_HOST"
        value = var.langfuse_host
      }
    }

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = var.vpc_connector
      egress    = "PRIVATE_RANGES_ONLY"
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

resource "google_service_account" "orchestrator" {
  account_id   = "orchestrator-${var.environment}"
  display_name = "Conversation Orchestrator Service Account"
  project      = var.project_id
}

resource "google_project_iam_member" "orchestrator_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.orchestrator.email}"
}

output "service_url" {
  value = google_cloud_run_v2_service.conversation_orchestrator.uri
}
```

**Deployment**:
```bash
cd infra/environments/prod
terraform init
terraform plan -out=plan.tfout
terraform apply plan.tfout
```

**State backend**: Cloud Storage bucket `gs://${PROJECT_ID}-tfstate/` con versioning y locking.[^23]

### Seguridad: IAM, Secretos, Auditoría

#### IAM Strategy

**Principio**: **Least Privilege** + **Separation of Duties**.

| Service Account | Roles | Justificación |
|----------------|-------|---------------|
| `webhook-receiver@` | `roles/pubsub.publisher` | Solo puede publicar eventos a Pub/Sub |
| `orchestrator@` | `roles/secretmanager.secretAccessor`<br/>`roles/aiplatform.user` (Gemini API)<br/>`roles/pubsub.subscriber` | Acceso a Gemini API, Convex secret, lectura de eventos |
| `order-management@` | `roles/cloudsql.client`<br/>`roles/pubsub.publisher` | Acceso a Postgres, publica eventos de pedidos |
| `notification@` | `roles/secretmanager.secretAccessor` (WhatsApp API key) | Envío de mensajes WhatsApp |
| `analytics@` | `roles/pubsub.subscriber`<br/>`roles/bigquery.dataEditor` | Consume eventos, escribe a BigQuery |

**Human accounts**:
- Developers: `roles/editor` en `dev`, `roles/viewer` en `prod`
- SRE: `roles/owner` en todos los ambientes
- Product team: `roles/viewer` en todos los ambientes

**No usar**: Service account keys (JSON files). [HECHO VERIFICADO] Usar Workload Identity Federation para CI/CD.[^25]

#### Gestión de Secretos

**Storage**: Google Secret Manager.[^23]

**Secretos requeridos**:
1. `whatsapp-api-key` (WhatsApp Business API)
2. `gemini-api-key` (Google AI Studio)
3. `clerk-secret-key` (Clerk auth)
4. `kapso-api-key` (Kapso.ai handoff)
5. `convex-deploy-key` (Convex deployment)
6. `postgres-password` (Cloud SQL)
7. `langfuse-salt` (Langfuse encryption)

**Rotación**:
- Automática: Cada 365 días
- Manual: On-demand vía Terraform + CI/CD pipeline

**Acceso**:
- Cloud Run services: Inyección via env vars (Secret Manager integration)[^23]
- Developers: NO acceso directo a prod secrets; usar `gcloud secrets versions access` con audit log

#### Auditoría

**Cloud Audit Logs**:[^23]
- **Admin Activity**: Todos los cambios de infra (Terraform apply, IAM changes)
- **Data Access**: Acceso a secretos, queries a Cloud SQL
- **System Event**: Auto-scaling, deployments

**Retention**: 400 días (compliance GDPR).

**Alertas**:
- IAM role granted/revoked → Slack #security
- Secret accessed by unauthorized SA → PagerDuty
- Terraform apply failed → Slack #ops

**Log export**: Cloud Logging → BigQuery para análisis y compliance reports.

***

## D. OBSERVABILIDAD

### Plan Prometheus/Grafana: Métricas, Dashboards, Alertas, Runbooks

[HECHO VERIFICADO] Google ofrece **Managed Service for Prometheus** que almacena métricas en Cloud Monitoring vía Monarch, con integración oficial a Grafana.[^14]

#### Arquitectura de Observabilidad Infra

```
┌─────────────────────────────────────────────────────────┐
│  Cloud Run Services (cada microservicio)                │
│  ├─ /metrics endpoint (Prometheus format)               │
│  ├─ Structured logs (JSON, Cloud Logging)               │
│  └─ Traces (OpenTelemetry → Langfuse)                   │
└─────────────┬───────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│  GCP Managed Service for Prometheus                     │
│  ├─ Scrape /metrics cada 15s                            │
│  ├─ Store en Cloud Monitoring (Monarch)                 │
│  └─ PromQL queries vía API                              │
└─────────────┬───────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│  Grafana (self-hosted en Cloud Run)                     │
│  ├─ Datasource: Managed Prometheus                      │
│  ├─ Dashboards: Infra, App, Business                    │
│  └─ Alerting: PagerDuty, Slack                          │
└─────────────────────────────────────────────────────────┘
```

#### Métricas Core (Prometheus)

**Infraestructura (Cloud Run)**:
- `cloudrun_requests_total` (label: service, status)
- `cloudrun_request_duration_seconds` (histogram, p50/p95/p99)
- `cloudrun_cpu_utilization` (gauge)
- `cloudrun_memory_utilization` (gauge)
- `cloudrun_instance_count` (gauge, current instances)

**Aplicación (custom)**:
- `conversations_active_total` (gauge, concurrent sessions)
- `conversations_completed_total` (counter, label: status=success|error|handoff)
- `orders_created_total` (counter, label: restaurant_id)
- `orders_value_total` (counter, total $ de pedidos)
- `whatsapp_messages_sent_total` (counter, label: type=marketing|utility|service)
- `whatsapp_messages_cost_usd` (counter, costo acumulado)
- `gemini_api_requests_total` (counter, label: model, status)
- `gemini_api_latency_seconds` (histogram)
- `gemini_api_tokens_total` (counter, label: type=input|output)

**Business**:
- `conversion_rate` (gauge, % de conversaciones que terminan en pedido)
- `avg_order_value_usd` (gauge)
- `handoff_rate` (gauge, % de conversaciones escaladas a humano)

#### Dashboards Grafana

**Dashboard 1: Infrastructure Health**
- Panel 1: Request rate (req/s) por servicio (time series)
- Panel 2: Latency p95 por servicio (time series, threshold: 10s)
- Panel 3: Error rate (%) por servicio (time series, threshold: 5%)
- Panel 4: CPU/Memory utilization por servicio (gauge)
- Panel 5: Active instances por servicio (stat)

**Dashboard 2: Conversation Metrics**
- Panel 1: Active conversations (gauge)
- Panel 2: Conversation completion rate (pie chart: success, error, handoff)
- Panel 3: Avg conversation duration (histogram)
- Panel 4: Intent classification breakdown (bar chart: FAQ, Order, Handoff)
- Panel 5: Handoff triggers (table: reason, count)

**Dashboard 3: Business KPIs**
- Panel 1: Orders per day (time series)
- Panel 2: Total revenue (time series, $)
- Panel 3: Conversion rate (gauge, %)
- Panel 4: Avg order value (gauge, $)
- Panel 5: Top 5 products (table)

**Dashboard 4: LLM Observability (Gemini 2.0 Flash)**
- Panel 1: LLM requests per minute (time series)
- Panel 2: LLM latency p95 (time series)
- Panel 3: Token usage (time series, input/output stacked)
- Panel 4: LLM errors (table: error_type, count)
- Panel 5: Cost per day (time series, $)

#### Alertas

[INFERENCIA] SLO-based alerting (Service Level Objectives).

| Alert | Condition | Severity | Action | Runbook |
|-------|-----------|----------|--------|---------|
| **High Error Rate** | Error rate >5% for 5 min | Critical | PagerDuty on-call | `runbooks/high-error-rate.md` |
| **High Latency** | p95 latency >15s for 5 min | Critical | PagerDuty on-call | `runbooks/high-latency.md` |
| **Low Conversion Rate** | Conversion rate <10% for 1 hour | Warning | Slack #product | `runbooks/low-conversion.md` |
| **Gemini API Errors** | Gemini error rate >10% for 3 min | Critical | PagerDuty on-call | `runbooks/llm-errors.md` |
| **WhatsApp Webhook Failures** | Webhook validation errors >5/min | Warning | Slack #ops | `runbooks/webhook-failures.md` |
| **Handoff Queue Saturated** | Kapso.ai pending handoffs >20 for 10 min | Warning | Slack #support | `runbooks/handoff-queue.md` |
| **Instance Scaling Maxed Out** | Cloud Run instances = max for 10 min | Warning | Slack #ops | `runbooks/scaling-limit.md` |
| **Database Connection Pool Exhausted** | Postgres connections >90% for 5 min | Critical | PagerDuty on-call | `runbooks/db-pool-exhausted.md` |

**Notification channels**:
- **Critical**: PagerDuty (on-call rotation)
- **Warning**: Slack #ops, #product, #support (según alert)
- **Info**: No notification, solo visible en Grafana

#### Runbooks

**Template de Runbook** (`docs/runbooks/template.md`):

```markdown
# Runbook: [Alert Name]

## Síntomas
- Qué está roto desde perspectiva del usuario
- Qué métricas están anormales

## Impacto
- Usuarios afectados (%, cantidad)
- Funcionalidad degradada o caída

## Diagnóstico
1. Check Grafana dashboard [link]
2. Check Langfuse traces para errores recientes [link]
3. Check Cloud Logging para stack traces [query]
4. Check dependent services (Convex, WhatsApp API, Gemini API)

## Mitigación (Primeros 5 minutos)
1. [Acción inmediata para reducir impacto]
2. [Rollback a versión anterior si aplica]
3. [Escalar manualmente instancias si aplica]

## Resolución (Después de mitigación)
1. [Identificar root cause]
2. [Fix permanente]
3. [Deploy fix]
4. [Verificar métricas recuperadas]

## Postmortem
- Template: docs/postmortems/template.md
- Owner: [Team]
- Deadline: 72h después de incident resuelto
```

**Ejemplo: Runbook High Error Rate** (`docs/runbooks/high-error-rate.md`):

```markdown
# Runbook: High Error Rate

## Síntomas
- Error rate >5% en uno o más servicios
- Usuarios reciben respuestas genéricas "Lo siento, algo salió mal"
- Grafana panel "Error Rate" en rojo

## Impacto
- Alta: Conversaciones fallando, pedidos no se completan
- Usuarios: >50% afectados si error rate >5%

## Diagnóstico
1. Identifica servicio con errores: Grafana → Dashboard Infrastructure Health → Panel "Error Rate"
2. Check logs del servicio:
   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=conversation-orchestrator AND severity>=ERROR" --limit 50 --format json
   ```
3. Check Langfuse traces para requests fallidos:
   - Langfuse UI → Traces → Filter: status=error, last 10 min
4. Posibles causas:
   - Gemini API down (check status.cloud.google.com)
   - Convex timeout (check Convex dashboard)
   - WhatsApp API rate limit (check logs "429")
   - Deployment reciente rompió algo (check CI/CD)

## Mitigación (Primeros 5 minutos)
1. **Rollback deployment si error rate incrementó después de deploy reciente**:
   ```bash
   cd infra/environments/prod
   git revert HEAD
   git push
   # CI/CD auto-deploys rollback en ~5 min
   ```
2. **Si Gemini API down**: Switch a fallback LLM (Gemma 3 27B) via feature flag:
   ```bash
   gcloud run services update conversation-orchestrator --set-env-vars=USE_FALLBACK_LLM=true
   ```
3. **Si Convex timeout**: Aumentar timeout de queries Convex de 5s a 15s (temporal):
   ```typescript
   // packages/convex-client/src/client.ts
   const client = new ConvexClient(url, { requestTimeout: 15000 });
   ```

## Resolución
1. Fix root cause (depende de diagnóstico)
2. Deploy fix a staging, verificar con smoke tests
3. Deploy a prod con canary (10% → 50% → 100%)
4. Monitor error rate por 30 min post-deploy

## Postmortem
- Owner: Team que deployó el cambio que causó error
- Deadline: 72h
```

### Plan Langfuse Completo: Instrumentación, Evaluación Continua, Feedback Loops

[HECHO VERIFICADO] Langfuse es open-source (MIT license) con capacidades de observabilidad LLM completas: tracing, sessions, prompts, evals, datasets, scores, experiments, feedback, costos, latencia.[^26][^27][^28][^29][^15]

#### Arquitectura Langfuse

```
┌─────────────────────────────────────────────────────────┐
│  Conversation Orchestrator (LangGraph)                  │
│  ├─ Langfuse SDK instrumentation                        │
│  ├─ Trace every LLM call (Gemini 2.0 Flash)            │
│  ├─ Trace every tool call (Menu, Order validation)      │
│  └─ Log prompts, responses, metadata                    │
└─────────────┬───────────────────────────────────────────┘
              │ (HTTP POST /api/public/ingestion)
              ▼
┌─────────────────────────────────────────────────────────┐
│  Langfuse (self-hosted, Cloud Run)                      │
│  ├─ PostgreSQL (traces, sessions, prompts, scores)      │
│  ├─ ClickHouse (analytics, fast queries)                │
│  ├─ Redis (cache)                                        │
│  └─ S3-compatible storage (Google Cloud Storage)        │
└─────────────┬───────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│  Langfuse UI (Web)                                       │
│  ├─ Traces dashboard (filter by session, status)        │
│  ├─ Prompt management (version control)                 │
│  ├─ Evaluation results (manual + automated)             │
│  ├─ Datasets (test cases)                               │
│  └─ Analytics (cost, latency, token usage)              │
└─────────────────────────────────────────────────────────┘
```

#### Módulos/Capacidades Langfuse a Utilizar

**1. Tracing (end-to-end)**

**Instrumentación**:
```typescript
// services/conversation-orchestrator/src/index.ts
import { Langfuse } from "langfuse";

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_HOST,
});

async function handleConversation(sessionId: string, userMessage: string) {
  const trace = langfuse.trace({
    name: "conversation",
    sessionId,
    userId: sessionId, // phone_number
    metadata: { channel: "whatsapp", restaurantId: "resto-123" },
  });

  // Span: Intent classification
  const classifySpan = trace.span({
    name: "classify_intent",
    input: userMessage,
  });
  const intent = await classifyIntent(userMessage); // LLM call
  classifySpan.end({ output: intent });

  // Generation: LLM call for response
  const generation = trace.generation({
    name: "generate_response",
    model: "gemini-2.0-flash",
    modelParameters: { temperature: 0.7, maxTokens: 500 },
    input: userMessage,
  });
  const response = await callGeminiAPI(userMessage, intent);
  generation.end({
    output: response,
    usage: { input: 120, output: 80, total: 200 },
    metadata: { intent },
  });

  trace.update({ output: response });
  await langfuse.flushAsync(); // Ensure data sent before return
  return response;
}
```

**Beneficio**:
- Trace completo de cada conversación: input → intent → LLM call → tool calls → output
- Filtrar por sessionId para ver historial de un usuario específico
- Identificar bottlenecks (qué step toma más tiempo)

**2. Sessions (agrupar traces por usuario)**

**Automático**: `sessionId: phone_number` en trace agrupa todos los traces de un usuario.

**UI**: Langfuse → Sessions → buscar por phone_number → ver timeline de conversaciones.

**Beneficio**: Debug de user-specific issues ("usuario X reporta que bot no entiende su dirección").

**3. Prompt Management (versioning + A/B testing)**

**Crear prompt en UI**:
1. Langfuse UI → Prompts → Create Prompt
2. Name: `classify_intent_v1`
3. Template:
   ```
   You are a restaurant assistant. Classify the user's intent as one of: FAQ, Order, Handoff.
   
   User message: {{user_message}}
   
   Output JSON: {"intent": "FAQ|Order|Handoff", "confidence": 0.0-1.0}
   ```
4. Variables: `user_message`
5. Save & deploy

**Usar en código**:
```typescript
const prompt = await langfuse.getPrompt("classify_intent_v1");
const compiledPrompt = prompt.compile({ user_message: userMessage });
const response = await callGeminiAPI(compiledPrompt);
```

**Beneficio**:
- Cambiar prompts sin redeploy de código
- Versioning: rollback a prompt anterior si v2 no funciona
- A/B testing: 50% de tráfico usa `classify_intent_v1`, 50% usa `classify_intent_v2`, comparar eval scores

**4. Evaluations (automated + manual)**

**Automated Evals (LLM-as-a-Judge)**:
```typescript
// scripts/run-evals.ts
import { Langfuse } from "langfuse";

const langfuse = new Langfuse({ /* ... */ });

async function evaluateRelevance(traceId: string) {
  const trace = await langfuse.fetchTrace(traceId);
  const { input, output } = trace;

  // Call Gemini 2.0 Flash como judge
  const evalPrompt = `
    User query: ${input}
    Assistant response: ${output}
    
    Is the response relevant to the query? Answer Yes or No.
  `;
  const judgeResponse = await callGeminiAPI(evalPrompt);
  const score = judgeResponse.includes("Yes") ? 1 : 0;

  // Log score to Langfuse
  await langfuse.score({
    traceId,
    name: "relevance",
    value: score,
    comment: judgeResponse,
  });
}

// Run eval on last 100 traces
const traces = await langfuse.fetchTraces({ limit: 100 });
for (const trace of traces.data) {
  await evaluateRelevance(trace.id);
}
```

**Métricas evaluadas**:
- **Relevance**: Respuesta es relevante a la pregunta del usuario
- **Correctness**: Datos factuales correctos (producto existe, precio correcto)
- **Completeness**: Respuesta completa (no falta información crítica)
- **Tone**: Tono amigable y profesional
- **Handoff appropriateness**: Escalación a humano fue necesaria o no

**Frecuencia**: Diaria (cron job evalúa traces del día anterior).

**Manual Evals**:
- Product team revisa 10-20 conversaciones por semana en Langfuse UI
- Marca thumbs-up/down por conversación
- Anota comentarios ("bot no entendió dirección con apartamento")

**Beneficio**: Detectar degradación de calidad, validar mejoras de prompts, identificar edge cases.

**5. Datasets (test cases para regression testing)**

**Crear dataset en UI**:
1. Langfuse UI → Datasets → Create Dataset
2. Name: `order_validation_tests`
3. Items:
   ```json
   [
     {
       "input": "Quiero 2 pizzas margarita para llevar",
       "expectedOutput": { "intent": "Order", "items": [{"product": "pizza margarita", "quantity": 2}], "delivery": false }
     },
     {
       "input": "Cuánto cuesta la pizza napolitana?",
       "expectedOutput": { "intent": "FAQ" }
     }
   ]
   ```

**Ejecutar tests**:
```typescript
// tests/e2e/order-validation.test.ts
const dataset = await langfuse.getDataset("order_validation_tests");
for (const item of dataset.items) {
  const response = await handleConversation("test-session", item.input);
  const trace = langfuse.trace({ /* ... */ });
  // Compare response vs expectedOutput
  expect(response.intent).toBe(item.expectedOutput.intent);
}
```

**Beneficio**: Regression tests automáticos para no romper casos conocidos al cambiar prompts.

**6. Scores (user feedback + automated metrics)**

**User feedback**:
- Después de cada conversación, enviar mensaje WhatsApp: "¿Te fue útil? 👍 o 👎"
- Log feedback a Langfuse:
  ```typescript
  await langfuse.score({
    traceId,
    name: "user_feedback",
    value: thumbsUp ? 1 : 0,
  });
  ```

**Automated scores**: Eval scripts (ver sección 4).

**Agregación**: Langfuse UI → Scores → dashboard de avg score por prompt version, por día, etc.

**Beneficio**: Medir satisfacción del usuario, correlacionar con cambios de prompts.

**7. Experiments (A/B testing de prompts/models)**

**Setup**:
1. Crear 2 prompts: `classify_intent_v1`, `classify_intent_v2`
2. Feature flag en código:
   ```typescript
   const promptName = Math.random() < 0.5 ? "classify_intent_v1" : "classify_intent_v2";
   const prompt = await langfuse.getPrompt(promptName);
   ```
3. Log `promptName` en trace metadata
4. Después de 1 semana, comparar eval scores:
   ```sql
   -- Langfuse analytics
   SELECT prompt_version, AVG(relevance_score)
   FROM traces t
   JOIN scores s ON t.id = s.trace_id
   WHERE s.name = 'relevance'
   GROUP BY prompt_version;
   ```

**Beneficio**: Validar mejoras de prompts con data cuantitativa antes de rollout 100%.

**8. Feedback Loops (automated retraining)**

**Pipeline**:
1. Cada noche, extraer traces con score bajo (<0.7) de Langfuse vía API
2. Analizar patrones: intents mal clasificados, productos no encontrados, etc.
3. Crear dataset items para casos fallidos
4. Product team ajusta prompts/FAQ/catalog según insights
5. Re-evaluar con eval scripts

**Beneficio**: Mejora continua basada en data real de producción.

**9. Costs & Latency Tracking**

**Automático**: Langfuse captura `usage` (tokens) y calcula costos basado en pricing de Gemini 2.0 Flash.[^27]

**Dashboard**: Langfuse UI → Analytics → Cost per day, token usage per session, latency p95.

**Alertas**: Integrar con Prometheus:
```typescript
// Export Langfuse metrics to Prometheus
const langfuseCostGauge = new Gauge({ name: 'langfuse_llm_cost_usd_total', help: 'Total LLM cost' });
setInterval(async () => {
  const cost = await langfuse.getCostLast24h();
  langfuseCostGauge.set(cost);
}, 60000); // Every 1 min
```

**Beneficio**: Detectar cost spikes, optimizar uso de tokens, justificar presupuesto LLM.

#### Evaluación Continua

**Ciclo de evaluación**:
1. **Diaria**: Automated evals (relevance, correctness) en traces del día anterior
2. **Semanal**: Manual review de 20 conversaciones por Product team
3. **Mensual**: A/B test de nuevos prompts con traffic splitting 10%/90%

**KPIs de calidad**:
- Relevance score >0.85
- Correctness score >0.90
- User feedback thumbs-up >75%
- Handoff rate <15%

**Acción si KPI no se cumple**:
- Relevance <0.85 → revisar prompts de clasificación de intents
- Correctness <0.90 → actualizar FAQ/catalog, mejorar product validation
- User feedback <75% → analizar patrones de thumbs-down, ajustar tono/respuestas
- Handoff rate >15% → mejorar capacidad de resolver queries sin humano, o reducir umbral de escalación

***

## E. TESTING/TDD

### Matriz RF/RNF → Pruebas Concretas

**Mandatorio**: TDD pragmático con tests reales, no cosméticos. Cada test debe mapear explícitamente a RF/RNF y validar comportamiento funcional real.

**Capas de testing**:
1. **Unit**: Lógica crítica (validación de pedido, clasificación de intent)
2. **Contract**: Entre microservicios (gRPC schemas, Pub/Sub event schemas)
3. **Integration**: DB, mensajería, APIs externas
4. **E2E API-level**: Escenarios realistas (webhook → bot response)

#### Matriz RF → Test Cases

| RF ID | Requisito Funcional | Tipo Test | Test Case Concreto |
|-------|---------------------|-----------|-------------------|
| **RF-001** | Recibir mensaje entrante | Integration | `POST /webhook` con payload WhatsApp válido → event `message.received` publicado a Pub/Sub |
| **RF-002** | Extraer telcliente/chat_id | Unit | `extractSessionId(whatsappPayload)` → retorna `phone_number` |
| **RF-003** | Buscar pedido existente | Integration | `findOrderBySessionId(sessionId)` → query Convex → retorna order o null |
| **RF-004** | Crear registro inicial si no existe | Integration | `createSession(sessionId)` → insert en Convex → sesión creada con state=empty |
| **RF-005** | Mantener memoria por sesión | Integration | `getSessionMemory(sessionId)` → retorna messageHistory array |
| **RF-006** | Clasificar intención | E2E | Mock Gemini API → `classifyIntent("Cuánto cuesta la pizza?")` → intent=FAQ |
| **RF-007** | Invocar subflujo correcto | E2E | Intent=Order → LangGraph ejecuta nodo `OrderSubflow` |
| **RF-008** | Derivar a humano ante queja | E2E | userMessage="Esto es terrible!" → Gemini clasifica intent=Handoff → Kapso.ai API llamada |
| **RF-009** | Leer Menu y FAQ | Integration | `getCatalog()` → query Convex → retorna array de productos |
| **RF-010** | Resolver consultas multi-fuente | E2E | userMessage="Cuánto cuesta pizza y horarios?" → bot responde con precio + horarios (FAQ + Precios) |
| **RF-011** | Retornar señal controlada si no hay datos | Unit | `searchFAQ("tema inexistente")` → retorna `{ found: false }` sin inventar respuesta |
| **RF-012** | Construir estado acumulado pedido | Unit | `buildOrderDraft(history, newMessage)` → retorna draft con items actualizados |
| **RF-013** | Validar productos contra Precios | Integration | `validateProducts([{product: "pizza margarita"}])` → query Precios → retorna válido/inválido |
| **RF-014** | Inferir retiro si intención pickup | Unit | `parseDeliveryMethod("para llevar")` → `{ delivery: false }` |
| **RF-015** | Asumir cantidad=1 si no especificada | Unit | `parseOrderItems("1 pizza")` → `[{product: "pizza", quantity: 1}]` |
| **RF-016** | Calcular total | Unit | `calculateTotal([{product: "pizza", price: 10, quantity: 2}])` → `20` |
| **RF-017** | Marcar estado: completo/incompleto/error | Unit | `validateOrderCompleteness(draft)` → `{ status: "complete|incomplete|error_producto", missingFields: [...] }` |
| **RF-018** | Pedir datos faltantes | E2E | draft sin dirección → bot responde "¿Cuál es tu dirección?" |
| **RF-019** | Persistir solo si estado completo | Integration | `saveOrder(draft)` llamado solo si status=complete → insert en Convex + Postgres |
| **RF-020** | Transformar salida técnica en texto legible | Unit | `formatResponse({intent: "FAQ", answer: "10 USD"})` → "La pizza cuesta 10 USD." |
| **RF-021** | Responder al chat de origen | E2E | Bot response → `POST` a WhatsApp API `/messages` con `to=phone_number` |
| **RF-022** | No detener flujo por parse errors | Integration | Parse error en Gemini response → log error → retornar respuesta genérica "No entendí" |

#### Matriz RNF → Test Cases

| RNF ID | Requisito No Funcional | Tipo Test | Test Case Concreto |
|--------|------------------------|-----------|-------------------|
| **RNF-001** | No exponer credenciales | Security | Scan código con Gitleaks → 0 secrets encontrados |
| **RNF-002** | Minimizar exposición datos personales | Security | Logs no contienen phone_number completo (masked: +1234***890) |
| **RNF-003** | No filtrar estructura interna/IDs | E2E | Bot response no contiene Convex document IDs ni service names |
| **RNF-004** | No alucinar datos de negocio | E2E | Mock Gemini con producto inexistente → bot responde "Producto no encontrado", NO inventa precio |
| **RNF-005** | Consistencia estricta con Menu/FAQ/Precios | Integration | Bot response prices match exactly con tabla Precios |
| **RNF-006** | Formato estructurado intermedio | Unit | `classifyIntent()` output es JSON válido con schema `{intent, confidence}` |
| **RNF-007** | Latencia ≤10s | E2E | Webhook received → bot response sent: p95 latency <10s (load test 100 concurrent) |
| **RNF-008** | Tolerar mensajes consecutivos sin corrupción | Integration | Enviar 2 mensajes seguidos (500ms apart) → session state consistente |
| **RNF-009** | Prompts/reglas versionables | Config | Prompts stored en Langfuse con version tags, deployable sin code change |
| **RNF-010** | Trazabilidad requerimientos → tests | Meta | Every RF/RNF tiene ≥1 test en esta matriz, test IDs en código comments |

### Casos de Prueba API-Level Realistas

**Test Suite: Webhook to Bot Response (E2E)**

**Test 1: FAQ Query (Happy Path)**
```typescript
// tests/e2e/faq-query.test.ts
import { MockWhatsAppAPI, MockGeminiAPI } from "@/packages/testing-utils";

test("User asks for opening hours → Bot responds with FAQ answer", async () => {
  // Setup mocks
  const whatsappMock = new MockWhatsAppAPI();
  const geminiMock = new MockGeminiAPI();
  geminiMock.mockClassifyIntent({ intent: "FAQ", confidence: 0.95 });
  geminiMock.mockGenerateResponse("Abrimos de lunes a sábado, 12pm-10pm");

  // Simulate WhatsApp webhook
  const webhookPayload = {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: "1234567890",
            text: { body: "Cuáles son los horarios?" },
            timestamp: Date.now(),
          }]
        }
      }]
    }]
  };

  const response = await fetch("http://localhost:8080/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload),
  });

  expect(response.status).toBe(200);

  // Wait for bot to process (async)
  await sleep(2000);

  // Assert WhatsApp API was called with response
  const sentMessages = whatsappMock.getSentMessages();
  expect(sentMessages).toHaveLength(1);
  expect(sentMessages.to).toBe("1234567890");
  expect(sentMessages.text.body).toContain("12pm-10pm");

  // Assert Langfuse trace created
  const traces = await langfuse.fetchTraces({ sessionId: "1234567890" });
  expect(traces.data).toHaveLength(1);
  expect(traces.data.input).toContain("horarios");
  expect(traces.data.output).toContain("12pm-10pm");
});
```

**Test 2: Order Creation (Multi-Turn Conversation)**
```typescript
test("User creates order with missing data → Bot asks for missing fields → Order completed", async () => {
  const whatsappMock = new MockWhatsAppAPI();
  const geminiMock = new MockGeminiAPI();

  // Turn 1: User initiates order
  await sendWebhook({ from: "1234567890", text: "Quiero 2 pizzas margarita" });
  await sleep(1000);
  const msg1 = whatsappMock.getLastMessage();
  expect(msg1.text.body).toContain("dirección"); // Bot asks for address

  // Turn 2: User provides address
  await sendWebhook({ from: "1234567890", text: "Calle Falsa 123" });
  await sleep(1000);
  const msg2 = whatsappMock.getLastMessage();
  expect(msg2.text.body).toContain("pago"); // Bot asks for payment method

  // Turn 3: User provides payment
  await sendWebhook({ from: "1234567890", text: "Efectivo" });
  await sleep(1000);
  const msg3 = whatsappMock.getLastMessage();
  expect(msg3.text.body).toContain("confirmado"); // Order confirmed
  expect(msg3.text.body).toContain("$20"); // Total calculated

  // Assert order saved in Convex + Postgres
  const order = await convex.query("getOrderBySession", { sessionId: "1234567890" });
  expect(order.items).toHaveLength(1);
  expect(order.items.product).toBe("pizza margarita");
  expect(order.items.quantity).toBe(2);
  expect(order.address).toBe("Calle Falsa 123");
  expect(order.paymentMethod).toBe("Efectivo");
  expect(order.status).toBe("complete");

  const pgOrder = await postgres.query("SELECT * FROM orders WHERE phone_number = $1", ["1234567890"]);
  expect(pgOrder.rows.total_pedido).toBe(20);
});
```

**Test 3: Handoff Trigger (Error Handling)**
```typescript
test("User expresses frustration → Bot escalates to human", async () => {
  const whatsappMock = new MockWhatsAppAPI();
  const geminiMock = new MockGeminiAPI();
  const kapsoMock = new MockKapsoAPI();

  geminiMock.mockClassifyIntent({ intent: "Handoff", confidence: 0.88 });

  await sendWebhook({ from: "1234567890", text: "Esto no funciona! Quiero hablar con alguien!" });
  await sleep(1000);

  // Assert Kapso.ai handoff initiated
  const handoffs = kapsoMock.getHandoffRequests();
  expect(handoffs).toHaveLength(1);
  expect(handoffs.phone_number).toBe("1234567890");
  expect(handoffs.reason).toBe("user_frustration");

  // Assert bot sends handoff message
  const msg = whatsappMock.getLastMessage();
  expect(msg.text.body).toContain("agente humano");
  expect(msg.text.body).toContain("momentos");

  // Assert Convex session marked as handoff
  const session = await convex.query("getSession", { sessionId: "1234567890" });
  expect(session.state.currentPhase).toBe("handoff");
});
```

**Test 4: Performance (Latency ≤10s)**
```typescript
test("Bot responds within 10s under load", async () => {
  const concurrentUsers = 100;
  const promises = [];

  for (let i = 0; i < concurrentUsers; i++) {
    const start = Date.now();
    const promise = sendWebhook({ from: `user${i}`, text: "Hola" }).then(() => {
      const latency = Date.now() - start;
      return latency;
    });
    promises.push(promise);
  }

  const latencies = await Promise.all(promises);
  const p95 = percentile(latencies, 0.95);
  expect(p95).toBeLessThan(10000); // 10s
});
```

### Estrategia Anti-Flaky + Evidencia Mínima por PR

**Causas comunes de flaky tests**:
1. **Race conditions**: Async operations no esperadas correctamente
2. **Dependencias externas**: APIs reales (WhatsApp, Gemini) down o latentes
3. **Test pollution**: Estado compartido entre tests
4. **Non-deterministic LLM outputs**: Gemini responses varían

**Mitigaciones**:

| Causa | Mitigación |
|-------|-----------|
| **Race conditions** | Usar `await` consistentemente, `waitFor()` helpers con timeout, evitar `sleep()` hardcoded (usar polling) |
| **Dependencias externas** | Mock todas las APIs externas (WireMock, nock), usar contratos fijos (contract testing), no llamar APIs reales en CI |
| **Test pollution** | `beforeEach()` limpia DB test (Convex dev mode reset), transacciones Postgres rollback después de test, Redis flush |
| **Non-deterministic LLM** | Mock Gemini API con responses fijas para tests, solo test LLM real en E2E smoke tests (no en CI por cada PR) |

**Implementación Anti-Flaky**:

```typescript
// packages/testing-utils/src/wait-for.ts
export async function waitFor<T>(
  fn: () => Promise<T>,
  options: { timeout?: number; interval?: number } = {}
): Promise<T> {
  const timeout = options.timeout || 5000;
  const interval = options.interval || 100;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      // Ignore errors, keep polling
    }
    await sleep(interval);
  }

  throw new Error(`waitFor timeout after ${timeout}ms`);
}

// Usage in test
const msg = await waitFor(
  () => whatsappMock.getLastMessage(),
  { timeout: 5000 }
);
```

**Evidencia Mínima por PR**:

| Cambio en PR | Evidencia Requerida | Verificación en CI |
|--------------|---------------------|--------------------|
| **Nuevo RF** | ≥1 test que valida RF (unit/integration/E2E) | CI ejecuta test, falla si test no pasa |
| **Cambio en prompt** | ≥1 eval score en Langfuse para sample de 10 conversaciones | Manual (Product team aprueba PR después de revisar Langfuse) |
| **Nuevo servicio** | ≥1 contract test con servicios dependientes | CI ejecuta contract tests, falla si schema breaking change |
| **Infra change (Terraform)** | `terraform plan` output en PR comment | CI posta plan, SRE aprueba PR |
| **Bugfix** | Regression test que reproduce bug + fix | CI ejecuta test, falla si bug reaparece |

**CI Enforcement**:
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm test:unit --coverage
      - run: pnpm test:integration
      - run: pnpm test:e2e # Only if PR to main
      - name: Check coverage
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 70" | bc -l) )); then
            echo "Coverage $COVERAGE% < 70% threshold"
            exit 1
          fi
```

***

## F. ROADMAP INCREMENTAL

### Fase 0: POC (Proof of Concept)

**Duración**: 3-4 semanas  
**Objetivo**: Validar stack técnico (LangGraph + Convex + Gemini 2.0 Flash) con flujo MVP funcional en Telegram.

**Alcance**:
- LangGraph workflow básico: clasificación de intent (FAQ/Order), respuestas simples
- Convex: sesiones + memoria conversacional (solo Telegram chat_id)
- Gemini 2.0 Flash: API calls con prompts hardcoded (no versionados)
- Telegram Bot API: webhook + send message
- Langfuse: instrumentación básica (traces, no evals)
- **NO incluye**: WhatsApp, handoff, Terraform, Postgres, tests E2E

**Entregables**:
1. Repo GitHub con estructura de monorepo básica (1 app, 1 service, 1 package)
2. Conversation Orchestrator (LangGraph) deployed en local dev
3. Convex dev deployment con schema `sessions`
4. Telegram bot funcional (responde FAQ simple + toma pedido incompleto)
5. Langfuse self-hosted local (Docker Compose) con traces visibles
6. Documentación: README con setup instructions

**Riesgos**:
- **R1**: LangGraph learning curve alta → **Mitigación**: 1 dev full-time en LangGraph Studio tutorials (2 días)
- **R2**: Gemini 2.0 Flash latencia >10s → **Mitigación**: Implementar streaming responses (partial outputs)
- **R3**: Convex dev mode limitaciones → **Mitigación**: Documentar workarounds, plan migración a Convex prod en Fase 1

**Metricas de éxito**:
- Bot responde a 3 tipos de queries: FAQ (horarios), Order (1 producto), Error handling (producto inexistente)
- Latencia promedio <5s (Telegram, no WhatsApp todavía)
- Traces visibles en Langfuse con input/output correctos

**Esfuerzo**: 2 devs full-time, 3-4 semanas = **6-8 persona-semanas**

### Fase 1: Piloto (WhatsApp + 1 Restaurante)

**Duración**: 6-8 semanas  
**Objetivo**: Producción piloto con WhatsApp API, 1 restaurante real, observabilidad básica operativa.

**Alcance**:
- **Canal**: WhatsApp Business API (sandbox inicialmente, production al final de fase)
- **Handoff**: Kapso.ai integrado, inbox operativo para agentes humanos
- **Auth**: Clerk + Convex para staff del restaurante (admin dashboard básico)
- **Infra**: Terraform + GCP Cloud Run (dev + staging ambientes)
- **Observabilidad**:
  - Prometheus + Grafana: métricas infra (CPU, memory, requests)
  - Langfuse: traces + prompts versionados (no evals automáticos todavía)
- **Database**: Convex (primary) + Postgres (backup para orders)
- **Testing**: Unit + Integration tests (coverage 60%), E2E smoke tests manual
- **Microservicios**: 4 servicios desplegados
  1. Webhook Receiver
  2. Conversation Orchestrator
  3. Order Management
  4. Notification Service

**Entregables**:
1. WhatsApp bot funcional para 1 restaurante piloto
2. Kapso.ai handoff operativo (agentes pueden tomar control de conversación)
3. Terraform modules para Cloud Run, networking, database
4. Grafana dashboard: Infrastructure Health (latency, error rate, instances)
5. Langfuse con prompts versionados en UI (clasificación, respuestas)
6. Admin dashboard (Next.js): ver pedidos, estado handoff
7. Documentación: Runbook básico (how to deploy, how to rollback)

**Riesgos**:
- **R1**: WhatsApp API approval delays → **Mitigación**: Iniciar approval process en Semana 1 de Fase 1 (tarda 3-5 semanas), usar sandbox mientras tanto
- **R2**: Kapso.ai integration issues → **Mitigación**: Fallback manual: agentes responden via WhatsApp Business App (no inbox automático)
- **R3**: Terraform learning curve → **Mitigación**: Usar Cloud Foundation Toolkit templates, consultoría SRE externa (3 días)[^23]
- **R4**: Postgres-Convex sync inconsistencies → **Mitigación**: Postgres = source of truth para orders, Convex solo cache read-only

**Metricas de éxito**:
- 1 restaurante usando bot en WhatsApp productivo
- ≥80% de conversaciones completadas sin handoff
- Latencia p95 <10s (WhatsApp webhook → bot response)
- 0 downtime durante deploys (blue-green Cloud Run)
- ≥3 handoffs exitosos con agentes humanos vía Kapso.ai

**Esfuerzo**: 3 devs + 1 SRE part-time, 6-8 semanas = **20-26 persona-semanas**

### Fase 2: Producción Parcial (3-5 Restaurantes)

**Duración**: 8-10 semanas  
**Objetivo**: Escalar a 3-5 restaurantes, SLOs definidos, alertado operativo, evals automáticos.

**Alcance**:
- **Multi-tenant**: Cada restaurante tiene su propio catalog, FAQ, config
- **SLOs definidos**:
  - Availability: 99.5% uptime (max 3.6h downtime/mes)
  - Latency: p95 <10s, p99 <15s
  - Error rate: <5%
  - Conversion rate: ≥12% (conversaciones → pedidos)
- **Alertado**: PagerDuty integrado, runbooks completos (8 alertas críticas)
- **Observabilidad avanzada**:
  - Prometheus: métricas de negocio (conversion rate, avg order value)
  - Grafana: 4 dashboards (Infra, Conversation, Business, LLM)
  - Langfuse: evals automáticos diarios (relevance, correctness), datasets con 50 test cases
- **Testing**: E2E API-level tests automáticos (15 test cases), contract tests, cobertura 70%
- **Microservicios**: 7 servicios desplegados (agregar Menu & Catalog, Analytics, Handoff)
- **Infra**: Prod environment con auto-scaling (min 2, max 20 instances), Redis cache, Postgres HA

**Entregables**:
1. 3-5 restaurantes productivos en WhatsApp
2. SLO dashboard en Grafana (uptime, latency, error rate actuales vs targets)
3. PagerDuty on-call rotation configurada, 8 runbooks completos
4. Langfuse evals automáticos (cron job diario evalúa traces, sube scores)
5. Datasets Langfuse con 50 test cases (regresión + edge cases)
6. E2E test suite (15 tests) ejecutándose en CI pre-merge a `main`
7. Terraform prod environment con HA Postgres, Redis, multi-region Cloud Run (us-central1, us-east1)
8. Admin dashboard: analytics por restaurante (pedidos/día, revenue, conversion rate)
9. Documentación: 8 runbooks (high error rate, high latency, low conversion, etc.)

**Riesgos**:
- **R1**: SLO 99.5% difícil de alcanzar con dependencias externas (Gemini API, WhatsApp API) → **Mitigación**: Circuit breaker para Gemini (fallback a responses cacheadas), retry logic para WhatsApp
- **R2**: Multi-tenant bugs (leak de datos entre restaurantes) → **Mitigación**: Tests de aislamiento (verificar que restaurante A no ve pedidos de B), row-level security en Postgres
- **R3**: Cost spikes con 3-5 restaurantes → **Mitigación**: Budget alerts en GCP ($500/semana threshold), optimizar Gemini prompts (reducir tokens), usar service messages WhatsApp (<24h = free)[^1]
- **R4**: Eval scores bajos (<0.7) al escalar → **Mitigación**: Manual review de casos fallidos, ajuste de prompts, expansión de FAQ

**Metricas de éxito**:
- 3-5 restaurantes productivos, cada uno con ≥50 conversaciones/día
- SLOs cumplidos: Availability 99.5%, Latency p95 <10s, Error rate <5%
- Conversion rate ≥12% (promedio entre restaurantes)
- Eval scores: Relevance ≥0.85, Correctness ≥0.90
- User feedback thumbs-up ≥75%
- 0 incidents P0 (downtime total), ≤2 incidents P1 (degradación parcial) por mes

**Esfuerzo**: 3 devs + 1 SRE full-time, 8-10 semanas = **32-40 persona-semanas**

### Fase 3: Go-Live (Multi-Tenant, Auto-Scaling)

**Duración**: 4-6 semanas  
**Objetivo**: Producción completa, escalable a 10+ restaurantes, auto-onboarding, observabilidad end-to-end.

**Alcance**:
- **Auto-onboarding**: Restaurantes pueden registrarse self-service (admin dashboard con signup flow)
- **Auto-scaling**: Cloud Run escala automáticamente 2 → 50 instances según load
- **Global deployment**: Multi-region (us-central1, us-east1, europe-west1) con Cloud Load Balancer
- **Observabilidad completa**:
  - Prometheus + Grafana: alertas proactivas (predict load spikes)
  - Langfuse: A/B testing de prompts productivo (traffic splitting), feedback loops automáticos
- **Security hardening**: Cloud Armor WAF, DDoS protection, audit logs exportados a BigQuery
- **Disaster recovery**: Automated backups (Postgres daily, Convex snapshots), runbook de DR con RTO 1h, RPO 15min
- **Microservicios finales**: 8 servicios (agregar API Gateway como servicio separado)

**Entregables**:
1. 10+ restaurantes productivos (meta: 15-20 al final de Fase 3)
2. Auto-onboarding flow: restaurante completa form → bot configurado en <24h (manual approval todavía)
3. Cloud Load Balancer multi-region con health checks
4. Cloud Armor WAF rules (SQL injection, XSS, rate limiting por IP)
5. Disaster recovery runbook + quarterly DR drill schedule
6. Langfuse A/B testing productivo: 2 prompts en traffic split 50/50, eval scores comparados semanalmente
7. Prometheus alertas predictivas: "Load spike expected en 2h basado en historical pattern"
8. Admin dashboard: self-service catalog update (restaurante sube CSV con productos/precios)
9. Documentación completa: Architecture diagrams, ADRs (Architecture Decision Records), postmortem template

**Riesgos**:
- **R1**: Auto-scaling costo explosion → **Mitigación**: Cost caps en GCP (max $5k/mes), alertas de presupuesto, tuning de autoscaling policies (target CPU 70%)
- **R2**: Multi-region complexity bugs → **Mitigación**: Canary rollout (deploy us-central1 primero, luego us-east1, luego europe-west1), region-specific smoke tests
- **R3**: A/B testing prompts rompe experiencia usuario → **Mitigación**: Traffic split conservador (90/10 inicialmente), kill switch para revertir a prompt A si eval scores caen >10%
- **R4**: Disaster recovery nunca testeado → **Mitigación**: Quarterly DR drills obligatorios (simular fallo Postgres, restaurar desde backup, medir RTO/RPO real)

**Metricas de éxito**:
- 10-20 restaurantes productivos
- Availability 99.9% (max 43min downtime/mes)
- Auto-scaling funciona: instances escalan de 2 → 30 durante peak hours (12pm-2pm, 7pm-9pm), vuelven a 2 en off-peak
- Total revenue procesado: $50k+/mes (suma de todos los pedidos)
- User feedback thumbs-up ≥80%
- DR drill exitoso: RTO <1h, RPO <15min
- A/B testing de prompts: ≥1 prompt v2 deployado con eval scores +5% vs v1

**Esfuerzo**: 3 devs + 1 SRE + 1 Product Manager, 4-6 semanas = **20-30 persona-semanas**

### Resumen Roadmap

| Fase | Duración | Entregable Clave | Riesgo Principal | Esfuerzo | Costo/Mes Estimado |
|------|----------|------------------|------------------|----------|-------------------|
| **Fase 0 (POC)** | 3-4 sem | LangGraph + Convex + Gemini funcional en Telegram | LangGraph learning curve | 6-8 p-sem | $180-420 |
| **Fase 1 (Piloto)** | 6-8 sem | WhatsApp + 1 restaurante + Kapso.ai + Terraform | WhatsApp API approval delays | 20-26 p-sem | $445-1,255 |
| **Fase 2 (Prod Parcial)** | 8-10 sem | 3-5 restaurantes + SLOs + evals automáticos | Multi-tenant data leakage | 32-40 p-sem | $1,255-3,875 |
| **Fase 3 (Go-Live)** | 4-6 sem | 10-20 restaurantes + auto-scaling + multi-region | Auto-scaling cost explosion | 20-30 p-sem | $3,949-13,299 |
| **TOTAL** | **21-28 sem** | Producción completa operativa | - | **78-104 p-sem** | - |

**Rollback por fase**:
- **Fase 0**: N/A (solo dev local)
- **Fase 1**: Revertir deployment Cloud Run a commit anterior (5 min), notificar restaurante piloto
- **Fase 2**: Blue-green deployment Cloud Run (traffic 100% → 0% en servicio con issue), rollback Terraform (infra changes)
- **Fase 3**: Multi-region canary rollback (us-east1 rollback primero, luego us-central1 si issue persiste)

***

## G. DELTA SRS v1.1

**Base**: SRS v1.0 (borrador validación), fecha 2026-02-27  
**Target**: SRS v1.1 (arquitectura microservicios productiva)

### Cambios Antes → Después

#### 1. Alcance

**Antes (SRS v1.0)**:
- Consultas automáticas (menu, horarios, pagos) ✅ MANTENER
- Toma y validación de pedidos por chat ✅ MANTENER
- Memoria conversacional por cliente ✅ MANTENER
- Derivación a humano (incompleta end-to-end) → **EXPANDIR**

**Después (SRS v1.1)**:
- **AGREGAR**: Handoff completo end-to-end con Kapso.ai (inbox operativo, agentes pueden tomar control)
- **AGREGAR**: Multi-tenant (múltiples restaurantes en misma plataforma)
- **AGREGAR**: Admin dashboard (Next.js) para visualizar pedidos, estado handoff, analytics
- **AGREGAR**: Auto-onboarding de restaurantes (self-service signup)
- **MANTENER**: Consultas automáticas, toma de pedidos, memoria conversacional

**Fuera de alcance SRS v1.1**:
- Telegram productivo (solo dev/test; WhatsApp es canal productivo)
- CRM externo completo (Kapso.ai cubre handoff; no se integra con Salesforce/Zendesk en v1.1)
- Pagos online (solo efectivo/transferencia manual; integración Stripe/MercadoPago en v2.0)

#### 2. Supuestos y Dependencias

**Antes (SRS v1.0)**:
1. n8n operativo con credenciales configuradas → **ELIMINAR**
2. OpenAI API disponible (GPT-4o/4.1) → **REEMPLAZAR**
3. Telegram Bot API configurado → **MANTENER** (solo dev/test)
4. Tablas actualizadas: Pedidos, Precios, Menu, FAQ → **MANTENER** + **AGREGAR** Convex schema
5. Base Postgres para memoria conversacional → **REEMPLAZAR**

**Después (SRS v1.1)**:
1. ~~n8n operativo con credenciales configuradas~~ → **ELIMINADO** (reemplazado por LangGraph)
2. ~~OpenAI API disponible (GPT-4o/4.1)~~ → **REEMPLAZADO** por Gemini 2.0 Flash API (Google AI Studio)
3. Telegram Bot API configurado → **MANTENER** (solo dev/test)
4. Tablas actualizadas: Pedidos, Precios, Menu, FAQ → **MIGRADO** a Convex schema + Postgres backup
5. ~~Base Postgres para memoria conversacional~~ → **REEMPLAZADO** por Convex (primary) + Postgres (backup solo orders)
6. **AGREGAR**: WhatsApp Business API account aprobado y configurado
7. **AGREGAR**: Kapso.ai account con API key
8. **AGREGAR**: Clerk account con Convex integration configurada
9. **AGREGAR**: Google Cloud project con billing habilitado
10. **AGREGAR**: Langfuse self-hosted deployment (Cloud Run o local Docker)
11. **AGREGAR**: Terraform state backend (Cloud Storage bucket configurado)
12. **AGREGAR**: GitHub repository con CI/CD configurado (GitHub Actions)

#### 3. Restricciones

**Antes (SRS v1.0)**:
- Calidad depende de prompts y datos → **MANTENER**
- Handoff humano incompleto → **RESOLVER**
- Canal actual: solo Telegram → **CAMBIAR**

**Después (SRS v1.1)**:
- Calidad depende de prompts y datos → **MANTENER** + **AGREGAR**: Prompts versionados en Langfuse, evals automáticos para validar calidad
- ~~Handoff humano incompleto~~ → **RESUELTO**: Kapso.ai integrado, handoff end-to-end operativo
- ~~Canal actual: solo Telegram~~ → **CAMBIADO**: WhatsApp es canal productivo, Telegram solo dev/test
- **AGREGAR**: Latencia objetivo ≤10s (SLO); si p95 >10s, escalar infra o optimizar prompts
- **AGREGAR**: Presupuesto mensual cap: $15k/mes (Fase 3); si se excede, pausar auto-onboarding de nuevos restaurantes
- **AGREGAR**: Compliance: GDPR (retention 7 días memoria conversacional, data deletion request <30 días)
- **AGREGAR**: Lock-in mitigation: Postgres como backup de Convex para reducir vendor lock-in

#### 4. Requisitos Funcionales (RF)

**Nuevos RF en v1.1**:

| ID | Requisito Funcional | Prioridad | Implementación |
|----|---------------------|-----------|----------------|
| **RF-023** | Sistema debe soportar múltiples restaurantes (multi-tenant) con catálogos independientes | P0 (crítico) | Convex schema con `restaurantId` FK, queries filtradas por tenant |
| **RF-024** | Admin dashboard debe permitir a restaurante ver pedidos del día en tiempo real | P1 (alto) | Next.js app con Convex reactive queries, tabla de pedidos actualizada cada 5s |
| **RF-025** | Restaurante debe poder actualizar catálogo (productos/precios) vía admin dashboard | P1 (alto) | Upload CSV, parse y validar, update Convex `catalog` table |
| **RF-026** | Sistema debe notificar a restaurante cuando hay pedido nuevo (push notification o email) | P2 (medio) | Cloud Pub/Sub event `order.created` → Cloud Function → Sendgrid API o FCM |
| **RF-027** | Handoff a humano debe marcar conversación como "en espera" y desactivar bot hasta que agente tome control | P0 (crítico) | Kapso.ai API `POST /handoff` → Convex session update `state.currentPhase = "handoff"` |
| **RF-028** | Agente humano debe poder ver historial completo de conversación antes de tomar control | P1 (alto) | Kapso.ai inbox embedded con historial de Convex `messageHistory` |
| **RF-029** | Sistema debe reiniciar bot después de que agente humano cierre handoff | P1 (alto) | Kapso.ai webhook `handoff.closed` → Convex session update `state.currentPhase = "faq"` (reset) |
| **RF-030** | Sistema debe soportar mensajes con imágenes (foto del producto, ubicación) | P2 (medio) | WhatsApp API media download → Cloud Storage → parse con Gemini Vision (future) |
| **RF-031** | Sistema debe enviar confirmación de pedido con resumen (items, total, dirección, ETA) | P1 (alto) | After order saved, format response con WhatsApp message template pre-aprobado |
| **RF-032** | Sistema debe permitir cancelación de pedido por usuario dentro de 5 min de confirmación | P2 (medio) | User sends "Cancelar pedido" → validate timestamp < 5 min → update order status "canceled" |
| **RF-033** | Sistema debe exportar analytics de conversaciones (conversion rate, avg order value, handoff rate) | P1 (alto) | Analytics Service consume Pub/Sub events → aggregate daily → Postgres analytics table → Grafana dashboard |

**RF modificados de v1.0**:

| ID | Cambio | Justificación |
|----|--------|---------------|
| **RF-006** | Clasificar intención: FAQ / pedido / derivación humano → **EXPANDIR**: agregar intents "Cancelar", "Modificar", "Estado Pedido" | Casos de uso adicionales identificados en Fase 1 piloto |
| **RF-012** | Construir estado acumulado pedido → **AGREGAR**: validar max 10 items por pedido (anti-abuse) | Prevenir pedidos fraudulentos masivos |
| **RF-019** | Persistir solo si estado completo → **AGREGAR**: dual-write a Convex (cache) + Postgres (source of truth) | Reducir lock-in Convex, backup en Postgres |

#### 5. Requisitos No Funcionales (RNF)

**Nuevos RNF en v1.1**:

| ID | Requisito No Funcional | Métrica | Implementación |
|----|------------------------|---------|----------------|
| **RNF-011** | Availability: Sistema debe tener uptime ≥99.5% (max 3.6h downtime/mes) | Uptime % | Cloud Run multi-instance, HA Postgres, health checks |
| **RNF-012** | Scalability: Sistema debe soportar 10,000 conversaciones concurrentes sin degradación | Concurrent sessions | Cloud Run autoscaling (max 50 instances), Convex horizontal scaling |
| **RNF-013** | Security: Datos en tránsito cifrados con TLS 1.3 | Encryption protocol | Cloud Run enforce HTTPS, Postgres SSL required |
| **RNF-014** | Security: Datos en reposo cifrados con AES-256 | Encryption algorithm | Cloud SQL encryption at rest, Convex encryption default |
| **RNF-015** | Compliance: GDPR data retention 7 días (memoria conversacional), 90 días (pedidos) | Retention days | Cron job daily purge Convex sessions > 7d, Postgres orders > 90d (soft delete) |
| **RNF-016** | Observability: Todas las requests LLM deben trazarse en Langfuse con metadata completo | Trace coverage % | Langfuse SDK instrumentation en Conversation Orchestrator (100% LLM calls traced) |
| **RNF-017** | Observability: Alertas críticas deben notificar a on-call en <5 min | Alert latency | PagerDuty integration con Prometheus Alertmanager |
| **RNF-018** | Cost Efficiency: Costo promedio por conversación debe ser <$0.10 (LLM + infra) | Cost/conversation | Optimizar prompts (reducir tokens), usar service messages WhatsApp (<24h = free)[^1], caching de FAQ responses |
| **RNF-019** | Disaster Recovery: RTO (Recovery Time Objective) 1 hora, RPO (Recovery Point Objective) 15 min | RTO/RPO | Postgres automated backups cada 15min, Convex snapshots daily, runbook DR tested quarterly |
| **RNF-020** | Maintainability: Código debe tener coverage ≥70% (packages), ≥60% (services) | Test coverage % | CI enforces coverage thresholds, PR blocks merge si coverage cae |

**RNF modificados de v1.0**:

| ID | Cambio | Justificación |
|----|--------|---------------|
| **RNF-007** | Latencia objetivo chat ≤10s → **REFINAR**: p95 latency <10s, p99 <15s (SLOs formales) | Definir SLOs medibles para alertado |
| **RNF-008** | Tolerar mensajes consecutivos sin corrupción de estado → **AGREGAR**: rate limiting 10 msg/min por usuario | Prevenir abuse y message flooding |

#### 6. Interfaces Externas (IE)

**Antes (SRS v1.0)**:
- Telegram Bot API → **MANTENER** (dev/test)
- OpenAI Chat Models → **REEMPLAZAR**
- Google Gemini (auxiliar opcional) → **REEMPLAZAR**
- PostgreSQL → **MANTENER** (nuevo rol: backup)
- n8n Data Tables → **ELIMINAR**

**Después (SRS v1.1)**:

| IE ID | Interface Externa | Tipo | Uso | Documentación |
|-------|------------------|------|-----|---------------|
| **IE-001** | WhatsApp Business API | REST (inbound webhook + outbound) | Recibir/enviar mensajes | https://developers.facebook.com/docs/whatsapp/cloud-api |
| **IE-002** | Telegram Bot API | REST | Recibir/enviar mensajes (dev/test) | https://core.telegram.org/bots/api |
| **IE-003** | Gemini 2.0 Flash API (Google AI Studio) | REST (Google GenAI SDK) | LLM inference (clasificación, respuestas) | https://ai.google.dev/gemini-api/docs |
| **IE-004** | Convex | WebSocket + REST | Database real-time (sessions, catalog) | https://docs.convex.dev |
| **IE-005** | PostgreSQL (Cloud SQL) | SQL (pg driver) | Database backup (orders, analytics) | https://cloud.google.com/sql/docs |
| **IE-006** | Redis (Cloud Memorystore) | Redis protocol | Cache (FAQ responses, rate limiting) | https://redis.io/docs |
| **IE-007** | Kapso.ai API | REST | Handoff handoff, inbox management | https://docs.kapso.ai |
| **IE-008** | Clerk API | REST (Clerk SDK) | Auth (JWT validation, user management) | https://clerk.com/docs |
| **IE-009** | Langfuse API | REST (Langfuse SDK) | Observability LLM (traces, prompts, evals) | https://langfuse.com/docs |
| **IE-010** | Google Cloud Pub/Sub | Pub/Sub protocol | Event-driven messaging (async) | https://cloud.google.com/pubsub/docs |
| **IE-011** | Prometheus | HTTP (metrics endpoint) | Metrics collection | https://prometheus.io/docs |
| **IE-012** | Grafana | HTTP (dashboard UI + API) | Metrics visualization, alerting | https://grafana.com/docs |
| ~~**IE-XXX**~~ | ~~n8n Data Tables~~ | ~~REST~~ | ~~ELIMINADO~~ | - |
| ~~**IE-XXX**~~ | ~~OpenAI API~~ | ~~REST~~ | ~~ELIMINADO~~ | - |

#### 7. Criterios de Aceptación

**Nuevos criterios v1.1**:

| ID | Criterio de Aceptación | Método de Verificación |
|----|------------------------|------------------------|
| **AC-001** | Fase 1: 1 restaurante piloto con ≥50 conversaciones/semana, handoff operativo | Manual test + Grafana dashboard (conversation count, handoff success rate) |
| **AC-002** | Fase 2: 3-5 restaurantes con SLO 99.5% uptime, p95 latency <10s cumplidos por 2 semanas consecutivas | Automated monitoring (Prometheus alerts silent) |
| **AC-003** | Fase 3: 10-20 restaurantes con auto-onboarding funcional (restaurante completa form → bot configurado <24h) | Manual test + admin dashboard (pending approvals queue) |
| **AC-004** | Tests E2E: 15 test cases API-level pasan en CI (pre-merge a `main`) | CI pipeline (GitHub Actions) pass green |
| **AC-005** | Cobertura de tests: ≥70% packages, ≥60% services | Coverage report en CI (enforced by quality gate) |
| **AC-006** | Langfuse evals: Relevance ≥0.85, Correctness ≥0.90 (promedio últimos 7 días) | Langfuse UI → Scores dashboard |
| **AC-007** | User feedback: ≥75% thumbs-up (promedio últimos 30 días) | Langfuse UI → User feedback scores |
| **AC-008** | Disaster Recovery: DR drill ejecutado con éxito (RTO <1h, RPO <15min) | Manual drill + postmortem doc |
| **AC-009** | Security: 0 vulnerabilidades CRITICAL en scan Trivy (pre-deploy a prod) | CI pipeline (security scan stage) |
| **AC-010** | Documentation: 8 runbooks completos, ADRs para decisiones arquitecturales clave | Manual review (Product/SRE approval) |

#### 8. Matriz de Trazabilidad

**Sample (full matrix en doc aparte)**:

| RF/RNF ID | Test Case ID | Test Type | Status |
|-----------|--------------|-----------|--------|
| RF-001 | TC-E2E-001 | E2E | ✅ Implementado (Fase 1) |
| RF-023 | TC-INT-023 | Integration | 🚧 Pendiente (Fase 2) |
| RNF-007 | TC-PERF-007 | Performance | ✅ Implementado (Fase 2) |
| RNF-011 | TC-E2E-SLO-001 | E2E | 🚧 Pendiente (Fase 3) |

#### 9. TBD (To Be Determined)

**Resueltos de v1.0**:
- ~~TBD-001: Implementación final de Derivar Humano + CRM~~ → **RESUELTO**: Kapso.ai (ver RF-027, RF-028)
- ~~TBD-002: Canal final (Telegram vs WhatsApp)~~ → **RESUELTO**: WhatsApp productivo, Telegram dev/test
- ~~TBD-003: Políticas de seguridad/retención/anonimizado~~ → **RESUELTO**: Ver RNF-015 (GDPR compliance)

**Nuevos TBD en v1.1**:

| TBD ID | Pregunta Abierta | Impacto | Owner | Deadline |
|--------|------------------|---------|-------|----------|
| **TBD-101** | Pricing Gemini 2.0 Flash definitivo (no encontrado en búsqueda actual) | Alto (afecta costos Fase 2+) | Tech Lead | Fin Fase 1 (antes de scale a 3-5 restaurantes) |
| **TBD-102** | Pricing Kapso.ai definitivo (no encontrado en docs públicas) | Medio (afecta costos handoff) | Product Manager | Fin Fase 1 |
| **TBD-103** | Estrategia de migración de datos de n8n a Convex (si hay pedidos existentes en producción real) | Bajo (asumimos pre-prod) | Tech Lead | Antes de Fase 1 (si aplica) |
| **TBD-104** | Modelo de revenue: ¿cobrar a restaurantes por conversación, por pedido, o suscripción mensual? | Alto (business model) | CEO/CFO | Antes de Fase 3 (auto-onboarding) |
| **TBD-105** | Integración de pagos online (Stripe/MercadoPago): roadmap v2.0 o v1.2? | Medio | Product Manager | Fin Fase 3 (basado en feedback restaurantes) |
| **TBD-106** | Langfuse Cloud Pro ($199/mes) vs self-hosted ($0 + infra): decisión final para Fase 2 | Medio (afecta ops burden) | SRE | Fin Fase 1 (evaluar DevOps capacity real) |
| **TBD-107** | Estrategia de internacionalización (i18n): ¿soportar inglés/portugués en v1.1 o v2.0? | Bajo (nice-to-have) | Product Manager | Después de Fase 3 (basado en demand) |

### IDs Propuestos para SRS v1.1

**Nomenclatura**:
- **RF**: Requisito Funcional (RF-001 a RF-099)
- **RNF**: Requisito No Funcional (RNF-001 a RNF-099)
- **IE**: Interface Externa (IE-001 a IE-099)
- **AC**: Criterio de Aceptación (AC-001 a AC-099)
- **TBD**: To Be Determined (TBD-101 a TBD-199, para distinguir de TBDs v1.0)
- **TC**: Test Case (TC-UNIT-XXX, TC-INT-XXX, TC-E2E-XXX, TC-PERF-XXX)

**Próximos IDs disponibles**:
- RF: RF-034 (últimos usados: RF-001 a RF-033)
- RNF: RNF-021 (últimos usados: RNF-001 a RNF-020)
- IE: IE-013 (últimos usados: IE-001 a IE-012)
- AC: AC-011 (últimos usados: AC-001 a AC-010)
- TBD: TBD-108 (últimos usados: TBD-101 a TBD-107)

***

## H. BACKLOG INICIAL EJECUTABLE

**Top 20 Historias Técnicas/Funcionales Priorizadas**

**Priorización**: MoSCoW (Must, Should, Could, Won't) + Value/Effort matrix

| # | Historia | Tipo | Prioridad | Fase | Estimación | Dependencias | Criterio de Aceptación |
|---|----------|------|-----------|------|------------|--------------|------------------------|
| **1** | Como developer, quiero configurar monorepo Turborepo con estructura base (apps, services, packages, infra) para tener fundación del proyecto | Setup | Must | Fase 0 | 3 días | Ninguna | README con instrucciones setup, `pnpm install` exitoso, build correcto |
| **2** | Como developer, quiero implementar Conversation Orchestrator con LangGraph (intent classification básico: FAQ/Order/Handoff) para reemplazar n8n | Feature | Must | Fase 0 | 5 días | #1 | Test unitario: `classifyIntent("horarios")` → `{ intent: "FAQ" }` |
| **3** | Como developer, quiero integrar Gemini 2.0 Flash API (Google AI Studio) para LLM inference | Feature | Must | Fase 0 | 3 días | #2 | Test integration: LLM call exitoso con response válido |
| **4** | Como developer, quiero configurar Convex dev deployment con schema `sessions` para almacenar memoria conversacional | Infra | Must | Fase 0 | 2 días | #1 | Query Convex `sessions` retorna array vacío (schema creado) |
| **5** | Como developer, quiero instrumentar Conversation Orchestrator con Langfuse SDK (traces básicos) | Observability | Must | Fase 0 | 2 días | #2, #3 | Langfuse UI muestra trace con input/output de conversación test |
| **6** | Como user, quiero enviar mensaje a Telegram bot y recibir respuesta generada por Gemini 2.0 Flash (FAQ simple) | Feature | Must | Fase 0 | 3 días | #2, #3, #4 | E2E test: webhook Telegram → bot responde con FAQ answer |
| **7** | Como developer, quiero configurar Clerk + Convex auth integration para autenticar staff del restaurante | Auth | Must | Fase 1 | 3 días | #4 | Test: login con Clerk → JWT válido → Convex query autorizada |
| **8** | Como developer, quiero integrar WhatsApp Business API (sandbox inicialmente) reemplazando Telegram como canal productivo | Feature | Must | Fase 1 | 5 días | #2, #3 | E2E test: webhook WhatsApp → bot responde (sandbox) |
| **9** | Como developer, quiero integrar Kapso.ai API para handoff humano (crear handoff, listar inbox) | Feature | Must | Fase 1 | 4 días | #8 | Test integration: `POST /handoff` exitoso → Kapso.ai inbox muestra conversación |
| **10** | Como developer, quiero implementar Order Management Service (validación de pedido, persistencia Convex + Postgres) | Feature | Must | Fase 1 | 5 días | #4, #2 | Test integration: `saveOrder(draft)` → insert Convex + Postgres exitoso, IDs consistentes |
| **11** | Como developer, quiero configurar Terraform modules (networking, cloud-run, database) para desplegar a GCP staging | Infra | Must | Fase 1 | 6 días | #1 | `terraform apply` exitoso → Cloud Run services deployed, accessibles vía HTTPS |
| **12** | Como developer, quiero configurar CI/CD (GitHub Actions) con quality gates (lint, test, coverage 60%) | DevOps | Must | Fase 1 | 4 días | #1 | PR to `main` ejecuta CI → tests pasan → merge permitido |
| **13** | Como SRE, quiero configurar Managed Service for Prometheus + Grafana self-hosted con dashboard Infrastructure Health | Observability | Must | Fase 1 | 5 días | #11 | Grafana dashboard muestra latency, error rate, instances de Cloud Run services |
| **14** | Como product owner, quiero admin dashboard (Next.js) con vista de pedidos del día (real-time con Convex reactive queries) | Feature | Should | Fase 1 | 5 días | #7, #10 | Dashboard muestra tabla de pedidos actualizándose cada 5s (no requiere refresh) |
| **15** | Como developer, quiero implementar multi-tenant support (Convex schema con `restaurantId` FK, queries filtradas) | Feature | Must | Fase 2 | 4 días | #4, #10 | Test: restaurante A no puede ver pedidos de restaurante B (isolation test) |
| **16** | Como developer, quiero configurar Postgres HA (Cloud SQL) con automated backups cada 15min para DR | Infra | Must | Fase 2 | 3 días | #11 | DR drill: restaurar Postgres desde backup → RTO <1h verificado |
| **17** | Como developer, quiero implementar automated evals (Langfuse + Gemini como judge) para relevance & correctness scores | Observability | Should | Fase 2 | 4 días | #5 | Cron job diario evalúa traces → Langfuse UI muestra scores promedio ≥0.85 |
| **18** | Como developer, quiero implementar E2E test suite (15 test cases API-level) con mocks de WhatsApp + Gemini | Testing | Must | Fase 2 | 6 días | #8, #3 | CI ejecuta E2E tests → 15/

---

## References

1. [WhatsApp Business API Pricing 2026: Complete Guide - Flowcall](https://flowcall.co/blog/whatsapp-business-api-pricing-2026) - Marketing messages cost $0.025-$0.1365 per message, utility messages range from $0.004-$0.0456, and ...

2. [Integrate Convex with Clerk - Databases | Clerk Docs](https://clerk.com/docs/guides/development/integrations/databases/convex) - Set up Clerk as a Convex auth provider · In the Clerk Dashboard, navigate to the Convex integration ...

3. [Convex & Clerk | Convex Developer Hub](https://docs.convex.dev/auth/clerk) - Clerk is an authentication platform providing login via passwords, social identity providers, one-ti...

4. [WhatsApp Inbox - Kapso Documentation](https://docs.kapso.ai/docs/platform/inbox) - Click “Handoff” when a workflow is running to take control. The workflow pauses immediately and you ...

5. [LangGraph: Agent Orchestration Framework for Reliable AI Agents](https://www.langchain.com/langgraph) - Simplify prototyping, debugging, and sharing of agents in our visual LangGraph Studio. Deploy your a...

6. [LangGraph overview - Docs by LangChain](https://docs.langchain.com/oss/javascript/langgraph/overview) - Debugging with LangSmith: Gain deep visibility into complex agent behavior with visualization tools ...

7. [Release notes | Gemini API - Google AI for Developers](https://ai.google.dev/gemini-api/docs/changelog) - Launched an experimental Gemini 2.0 Flash model capable of image generation and editing. Released ge...

8. [Gemma 3: Google's new open model based on Gemini 2.0](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-3/) - Get an API key directly from Google AI Studio and use Gemma 3 with the Google GenAI SDK. Customize a...

9. [Gemma 3: Impressive Context Window, But Does It Deliver ... - Reddit](https://www.reddit.com/r/LocalLLaMA/comments/1j9kees/gemma_3_impressive_context_window_but_does_it/) - While it aces simple addition and subtraction, it tends to get stuck in infinite loops with large nu...

10. [A Guide to Real-Time Databases for Faster, More Responsive Apps](https://stack.convex.dev/real-time-database) - TL;DR: Real-time is the new normal​​ Convex gives you a fully reactive, ACID-safe backend that syncs...

11. [Microservices architecture on Google Cloud](https://cloud.google.com/blog/topics/developers-practitioners/microservices-architecture-google-cloud) - With a microservices architecture, the solution is built as a set of independent modules based on bu...

12. [Google Cloud Run Pricing in 2025: A Comprehensive Guide](https://cloudchipr.com/blog/cloud-run-pricing) - At $0.40 per million, that's $3.20 in request charges. (This is included in the total above.) The re...

13. [Cloud Run pricing | Google Cloud](https://cloud.google.com/run/pricing) - Cloud Run charges you only for the resources you use, rounded up to the nearest 100 millisecond. You...

14. [Query using Grafana | Google Cloud Observability](https://docs.cloud.google.com/stackdriver/docs/managed-prometheus/query) - To use Grafana with Managed Service for Prometheus, you use the data source syncer to generate OAuth...

15. [Pricing Self Host - Langfuse](https://langfuse.com/pricing-self-host) - Self-host all core Langfuse features for free without any limitations. Free Deployment guide MIT Lic...

16. [Self-host Langfuse (Open Source LLM Observability)](https://langfuse.com/self-hosting) - Langfuse is open source and can be self-hosted using Docker. This section contains guides for differ...

17. [Gemma 3 model overview - Google AI for Developers](https://ai.google.dev/gemma/docs/core) - Gemma 3 models (4B, 12B, and 27B) can handle prompt inputs up to 128K tokens, a 16x larger context w...

18. [Convex Pricing, Features & Best Alternatives (2026) - srvrlss](https://www.srvrlss.io/provider/convex/) - 5.0

19. [Plans and Pricing - Convex](https://www.convex.dev/pricing) - Plans & pricing ; Database storage · Database bandwidth · File storage ; 50 GB total. Then $0.20 per...

20. [Langfuse Pricing 2026: Plans, Costs & Breakdown - CheckThat.ai](https://checkthat.ai/brands/langfuse/pricing) - The math rarely favors self-hosting:​​ A medium-scale self-hosted deployment costs approximately $3,...

21. [LangGraph Studio: The first agent IDE - LangChain Blog](https://blog.langchain.com/langgraph-studio-the-first-agent-ide/) - LangGraph Studio provides a specialized agent IDE for visualizing, interacting with, and debugging c...

22. [WhatsApp Business API Pricing 2026 | ₹0.20 per conversation](https://chatmitra.com/pricing/) - Official WhatsApp Business API pricing starting at just ₹0.20 per conversation. No monthly fees, zer...

23. [Automating Google Cloud Operations Using Infrastructure as Code](https://www.d3vtech.com/insights/automating-google-cloud-operations-using-infrastructure-as-code/) - In this article, we'll explore how to automate Google Cloud operations using IaC, focusing on Terraf...

24. [Infrastructure as Code on Google Cloud](https://docs.cloud.google.com/docs/terraform/iac-overview) - HashiCorp Terraform is an IaC tool that lets you define resources in cloud and on-premises in human-...

25. [Infrastructure as Code with Terraform and Identity Federation](https://cloud.google.com/blog/products/devops-sre/infrastructure-as-code-with-terraform-and-identity-federation) - Terraform Cloud workspaces integrate with Workload Identity Federation to authenticate with Google C...

26. [Transform Large Language Model Observability with Langfuse](https://aws.amazon.com/blogs/apn/transform-large-language-model-observability-with-langfuse/) - The company uses LLM observability features offered by Langfuse such as real-time LLM tracing across...

27. [LLM Monitoring and Observability: Hands-on with Langfuse](https://towardsdatascience.com/llm-monitoring-and-observability-hands-on-with-langfuse/) - Langfuse offers a wide variety of features such as LLM observability, tracing, LLM token and cost mo...

28. [Langfuse Documentation](https://langfuse.com/docs) - Langfuse is an open source LLM engineering platform. It includes observability, analytics, and exper...

29. [LLM Observability & Application Tracing (Open Source) - Langfuse](https://langfuse.com/docs/observability/overview) - Open source application tracing and observability for LLM apps. Capture traces, monitor latency, tra...

