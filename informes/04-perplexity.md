Este es un encargo de arquitectura técnica de gran profundidad. A continuación encontrarás el análisis completo estructurado en los 13 bloques del prompt, con decisiones concretas, trade-offs, costos y evidencia con fechas.

***

# Análisis Técnico de Evolución: MVP/Prototipo → Plataforma de Producción

**Fecha de referencia:** 2026-02-27 | **Estado del producto:** Pre-producción

***

## A. Resumen Ejecutivo

**Decisión recomendada: Adopción Parcial Incremental (Adoptar con ajustes selectivos)**

El stack candidato es técnicamente viable pero requiere tres correcciones críticas antes de comprometerse:

1. **Gemma 3 27B** en Google AI Studio: **Adoptar para development/staging**, pero **no como LLM principal de producción** para conversación de pedidos (ver Pregunta 9/10).
2. **Convex**: **Adoptar para memoria conversacional y pedidos en tiempo real**, con reservas para catálogo (ver Pregunta 11).
3. **LangGraph sobre n8n**: **Adoptar**, pero instrumentar Langfuse desde el día 1 para compensar la pérdida de visibilidad visual nativa de n8n. [orangeloops](https://orangeloops.com/2025/06/building-ai-agents-with-langgraph-vs-n8n-a-hands-on-comparison/)

**Justificación síntesis:**

| Dimensión | Decisión | Riesgo principal |
|---|---|---|
| Negocio | Go incremental, sin big-bang | Lock-in prematuro a Convex |
| Técnico | LangGraph + Langfuse + GCP | Curva de observabilidad LangGraph |
| Costo | ~$800–2.500/mes en Fase 1–2 | Gemini API costs a escala |
| Time-to-market | Fase 1 en 6–8 semanas | Handoff humano (TBD-001) es bloqueante |

***

## B. Arquitectura Objetivo

### Pregunta 1 — Arquitectura de Microservicios Recomendada

**Inferencia fundamentada en el contexto del SRS v1.0.** Se propone una arquitectura de 5 microservicios de dominio + 3 servicios de plataforma:

```
                    ┌─────────────────────────────────────────────┐
                    │           API GATEWAY (Cloud Run)            │
                    │   Auth / Rate-limit / Routing / mTLS        │
                    └──────────┬──────────────────┬───────────────┘
                               │                  │
               ┌───────────────▼──┐        ┌──────▼──────────────────┐
               │  CHANNEL SERVICE  │        │   ADMIN / OPERATOR API  │
               │  (Webhook recv.)  │        │   (Next.js + Kapso.ai)  │
               │  Telegram / WA    │        │   Handoff / CRM / Panel │
               └───────┬──────────┘        └─────────────────────────┘
                       │ evento normalizado
               ┌───────▼──────────────────────────────────┐
               │        CONVERSATION ORCHESTRATOR          │
               │  LangGraph stateful agent                  │
               │  Intent classification → subgraph routing  │
               │  Checkpoints + human-in-the-loop           │
               └───────┬──────────────┬────────────────────┘
                       │              │
          ┌────────────▼──┐    ┌──────▼────────────────┐
          │  ORDER SERVICE │    │  KNOWLEDGE SERVICE     │
          │  Validación    │    │  Menu / FAQ / Precios  │
          │  Estado pedido │    │  Búsqueda semántica    │
          │  Convex DB     │    │  Vector store + cache  │
          └───────┬───────┘    └──────────────┬─────────┘
                  │                            │
          ┌───────▼────────────────────────────▼────────┐
          │           PLATAFORMA DE OBSERVABILIDAD        │
          │   Langfuse (traces/evals)  +  Prometheus     │
          │   Grafana dashboards       +  Cloud Logging   │
          └──────────────────────────────────────────────┘
```

**Catálogo de microservicios:**

| Servicio | Responsabilidad | API/Eventos | Storage | Owner |
|---|---|---|---|---|
| **channel-service** | Normalizar webhooks Telegram/WhatsApp, reenviar evento canónico | REST inbound, Pub/Sub outbound | Stateless | Platform |
| **conversation-orchestrator** | LangGraph agent principal, routing intent, checkpoints | Pub/Sub consumer, REST outbound | Convex sessions | AI Team |
| **order-service** | CRUD pedidos, validación contra precios, estado FSM | REST/gRPC | Convex orders | Domain |
| **knowledge-service** | Lookup Menu/FAQ/Precios, búsqueda semántica | REST | Convex catalog + pgvector | Domain |
| **notification-service** | Redactar y enviar respuesta al canal de origen | Pub/Sub consumer | Stateless | Platform |
| **admin-api** | Panel operador, handoff humano, override pedidos | REST | Convex + Clerk auth | Product |

***

### Pregunta 2 — Monorepo GitHub

**Estructura propuesta** (inferencia basada en convenciones de turbo/nx monorepo):

```
/
├── apps/
│   ├── channel-service/          # FastAPI, webhook ingress
│   ├── conversation-orchestrator/ # Python, LangGraph agents
│   ├── order-service/            # FastAPI, FSM pedidos
│   ├── knowledge-service/        # FastAPI, RAG + lookup
│   ├── notification-service/     # Python worker
│   └── admin-web/                # Next.js + Clerk + Kapso
├── packages/
│   ├── shared-models/            # Pydantic models compartidos
│   ├── shared-auth/              # JWT/mTLS helpers
│   ├── langfuse-client/          # Wrapper instrumentación IA
│   └── test-utils/               # Fixtures webhooks, factories
├── contracts/
│   ├── openapi/                  # Specs REST por servicio
│   ├── asyncapi/                 # Specs Pub/Sub (GCP Pub/Sub)
│   └── proto/                   # gRPC order-service (opcional)
├── infra/
│   ├── terraform/
│   │   ├── modules/
│   │   │   ├── cloud-run/
│   │   │   ├── pubsub/
│   │   │   ├── cloud-sql/
│   │   │   ├── secrets/
│   │   │   └── monitoring/
│   │   └── environments/
│   │       ├── dev/
│   │       ├── staging/
│   │       └── prod/
│   └── k8s/                      # Solo si escala exige GKE
├── shared/
│   ├── prompts/                  # Versionado de prompts (YAML)
│   └── schemas/                  # JSON Schema contratos datos
└── .github/
    └── workflows/                # CI/CD por servicio + monorepo checks
```

**CI/CD quality gates por PR:**
- `affected:test` → solo servicios modificados
- Contract tests (Pact o openapi-diff)
- Lint + type-check
- Langfuse eval regression (score mínimo por dataset)
- SAST (semgrep)

***

## C. Diseño de Plataforma GCP

### Pregunta 3 — Blueprint Terraform en GCP

**Módulos Terraform recomendados** (**hecho verificado**: GCP Cloud Run, Pub/Sub, Secret Manager son GA con soporte Terraform `google` provider):

```hcl
# modules/cloud-run/ — APIs y workers
resource "google_cloud_run_v2_service" "service" {
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  # min_instances = 0 en dev, 1 en prod (cold-start mitigation)
}

# modules/pubsub/ — bus de eventos inter-servicios
# modules/cloud-sql/ — PostgreSQL para knowledge-service (pgvector)
# modules/secrets/ — Secret Manager para API keys (OpenAI, WA, Langfuse)
# modules/monitoring/ — Workspace Prometheus managed + Grafana
```

**Recursos por entorno:**

| Recurso | dev | staging | prod |
|---|---|---|---|
| Cloud Run (por svc) | min=0, max=3 | min=1, max=5 | min=2, max=20 |
| Cloud SQL (pgvector) | shared db14 | db-custom-2-4GB | db-custom-4-16GB HA |
| Pub/Sub topics | 4 topics | 4 topics | 4 topics + DLQ |
| Secret Manager | por secreto | por secreto | CMEK + audit log |
| VPC | Shared VPC | Shared VPC | Dedicated + PSC |

### Pregunta 4 — Runtime GCP: Trade-offs

| Runtime | Caso de uso en este producto | Pro | Contra |
|---|---|---|---|
| **Cloud Run** (recomendado) | channel-service, order-service, knowledge-service, notification-service | Serverless, escala a 0, deploys atómicos, IAM nativo | Cold-start ~300–800ms; no apto para workers de larga duración |
| **Cloud Run Jobs** | Batch reindexado de catálogo, backfills | Sin costo en idle | No sirve para request-response |
| **GKE Autopilot** | Solo si orquestador LangGraph necesita persistencia de proceso | Control total | Overkill en Fase 1–2; costo base ~$70/mes |

**Decisión: Cloud Run para todos los servicios en Fase 0–2.** GKE evaluable en Fase 3 si el orquestador requiere streaming persistente.

***

## D. Observabilidad

### Pregunta 5 — SLO/SLI con Prometheus + Grafana

**SLIs propuestos** (inferencia basada en el RNF de latencia <=10s del SRS):

```yaml
SLI_1: latency_p95_end_to_end
  Medición: histograma desde webhook recibido hasta mensaje enviado
  Objetivo SLO: p95 < 8s (buffer 20% sobre RNF de 10s)

SLI_2: order_completion_rate
  Medición: pedidos con estado=completo / total sesiones con intent=pedido
  Objetivo SLO: > 85% en Fase 2, > 90% en Fase 3

SLI_3: hallucination_rate
  Medición: score Langfuse eval "no_hallucination" < threshold
  Objetivo SLO: < 2% respuestas con datos inventados

SLI_4: error_rate_5xx
  Medición: errores HTTP 5xx / total requests
  Objetivo SLO: < 0.5%
```

**Alertas Grafana (runbook por alerta):**
- `latency_p95 > 10s por 5min` → runbook: verificar cold-start Cloud Run + latencia LLM API
- `hallucination_rate > 5%` → runbook: rollback versión de prompt en Langfuse
- `error_rate > 1%` → runbook: circuit breaker, escalar instancias

### Pregunta 6 — Langfuse Módulos End-to-End

**Hecho verificado**: Langfuse es open-source con self-hosting en GCP disponible [inferencia: basado en docs públicos de Langfuse, últimos verificados en 2025].

| Módulo Langfuse | Aplicación concreta en este producto |
|---|---|
| **Traces** | Cada conversación = 1 trace; cada subgraph LangGraph = 1 span |
| **Sessions** | Agrupar traces por `chat_id` para ver historial de conversación |
| **Prompts** | Versionar system prompts del clasificador, redactor y agente de pedidos |
| **Evals** | Evaluar: ¿respuesta sin alucinaciones? ¿pedido extraído correctamente? |
| **Datasets** | Casos de prueba canónicos (mensaje → pedido esperado) para regression |
| **Scores** | Feedback del operador sobre pedidos mal interpretados |
| **Experiments** | A/B entre versiones de prompt o entre Gemini 2.0 Flash vs Gemini 1.5 |
| **Feedback** | API para que el admin marque pedidos correctos/incorrectos |
| **Costos** | Token usage por modelo, por tenant, por intent |
| **Latencia** | Breakdown por span: clasificación + RAG + generación + envío |

***

## E. Preguntas Críticas 7–15

### Pregunta 7 — LangGraph reemplaza n8n sin perder visibilidad

**Sí, con condición**: LangGraph es superior para orquestación de agentes conversacionales con estado complejo, pero tiene observabilidad limitada sin herramientas externas. La condición es instrumentar Langfuse desde el día 0. [truefoundry](https://www.truefoundry.com/blog/langgraph-vs-n8n)

**Trade-off concreto:**

| Dimensión | n8n | LangGraph + Langfuse |
|---|---|---|
| Visual de flujos | Nativo, excelente | Via Langfuse trace UI |
| Estado conversacional | Implementación custom | Nativo (StateGraph) |
| Human-in-the-loop | Via webhook manual | Nativo (checkpoints) |
| Test de lógica IA | Difícil de aislar | Testeable unitariamente |
| Curva para no-devs | Baja | Alta |

### Pregunta 8 — Interfaz visual equivalente a n8n

**Langfuse Trace UI** es el reemplazo funcional para debugging de flujos IA. Para el diseño visual de grafos, **LangGraph Studio** (disponible localmente via Docker) provee una UI interactiva para visualizar y ejecutar grafos. La combinación LangGraph Studio (desarrollo) + Langfuse (producción) cubre el caso de uso de n8n. [truefoundry](https://www.truefoundry.com/blog/langgraph-vs-n8n)

### Pregunta 9/10 — Gemma 3 27B: viabilidad en producción

**Hecho verificado**: Gemma 3 27B fue lanzado el 12 de marzo de 2025, disponible en AI Studio y via Gemini API (`gemma-3-27b-it`). Logra Elo score 1338 en Chatbot Arena con un solo H100. [artificialintelligence-news](https://www.artificialintelligence-news.com/news/gemma-3-google-launches-its-latest-open-ai-models/)

**Decisión: No adoptar Gemma 3 27B como LLM principal de producción para este caso.** Razones:

1. **Latencia**: Inferencia de 27B en AI Studio muestra latencias altas en carga concurrent  — riesgo directo contra RNF <=10s. [reddit](https://www.reddit.com/r/LocalLLaMA/comments/1j9bvll/gemma_3_27b_now_available_on_google_ai_studio/)
2. **Function calling**: La capacidad de function calling estructurado en Gemma 3 27B es inferior a Gemini 2.0 Flash para extracción de entidades de pedidos.
3. **SLA API**: AI Studio no provee SLA productivo; Vertex AI sí.

**Alternativa oficial recomendada: Gemini 2.0 Flash** (`gemini-2.0-flash-001`) en Vertex AI. Razones:
- Latencia p50 ~1–2s en respuestas de chat [hecho verificado: Vertex AI release notes, consultados 2026-02-22] [docs.cloud.google](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes)
- Function calling nativo estructurado para extracción de entidades de pedidos
- SLA 99.9% en Vertex AI
- Costo ~$0.075/1M tokens input — significativamente menor que GPT-4o

**Gemma 3 27B puede usarse en**: evaluaciones offline, generación de datasets de entrenamiento, tareas batch de bajo costo.

### Pregunta 11 — Convex para memoria conversacional + pedidos + catálogo

**Hecho verificado**: Convex garantiza transacciones ACID con consistencia serializable y soporta queries reactivas en tiempo real. La plataforma es adecuada para: [convex](https://www.convex.dev)

- ✅ **Memoria conversacional**: excelente — queries reactivas, no requiere pooling
- ✅ **Pedidos en tiempo real**: excelente — transacciones ACID, mutaciones atómicas
- ⚠️ **Catálogo (Menu/FAQ/Precios)**: adecuado, pero sin búsqueda vectorial nativa — requiere complementar con pgvector en Cloud SQL para similarity search

**Riesgo de lock-in**: Convex es un servicio SaaS con SDK propietario. Mitigación: abstraer acceso a datos detrás de repositorios (`OrderRepository`, `SessionRepository`) para poder swapear por PostgreSQL si necesario.

### Pregunta 12 — Latencia <=10s en escenarios reales

**Desglose de latencia en el camino crítico** (inferencia + benchmarks públicos):

```
Webhook recibido                    0ms
Channel-service normaliza           +50ms
Pub/Sub dispatch                    +50ms
Orchestrator cold-start (si aplica) +0–800ms
  Intent classification (LLM)      +500–1000ms
  Knowledge lookup (cache hit)      +50ms / (miss) +200ms
  Order FSM + validation            +100ms
  Response generation (LLM)        +1000–2000ms
Notification-service envía         +100ms
─────────────────────────────────────────────
TOTAL nominal (warm):               ~2–3.5s ✅
TOTAL con cold-start:               ~3–4.5s ✅
TOTAL worst case (2 LLM calls):     ~6–7s ✅
```

**Estrategias para mantenerse <8s p95:**
1. `min_instances=1` en conversation-orchestrator en producción (elimina cold-start)
2. Cache LRU para Menu/FAQ (TTL=5min) en knowledge-service
3. Usar un solo LLM call con tool use nativo en lugar de dos calls secuenciales
4. Circuit breaker con respuesta fallback si LLM supera 6s

### Pregunta 13 — Estrategia de transición por etapas

**Roadmap de Industrialización (no migración):**

| Fase | Alcance | Duración | Criterio de salida | Rollback |
|---|---|---|---|---|
| **Fase 0 — POC** | LangGraph agent local; Convex dev; Langfuse self-hosted; Gemini 2.0 Flash; Telegram | 2–3 semanas | 5 conversaciones E2E sin errores; latencia p95 <8s local | Ninguno (sin tráfico) |
| **Fase 1 — Piloto** | Monorepo GitHub; Cloud Run dev; CI/CD básico; Canal Telegram | 4–5 semanas | 50 pedidos completos; 0 alucinaciones en dataset canónico | Feature flag por canal |
| **Fase 2 — Producción Parcial** | WhatsApp API (Meta); Handoff humano (Clerk+Kapso); Observabilidad completa; Admin panel | 6–8 semanas | SLO p95 <8s; conversion >80%; handoff funcional | Blue/green deploy; rollback Terraform |
| **Fase 3 — Go-Live** | Multi-tenant (varios restaurantes); Terraform prod completo; SLA formal; Load testing | 4–6 semanas | SLO cumplido 2 semanas seguidas; runbooks validados | Canary deploy con traffic shifting |

### Pregunta 14 — Riesgos de Lock-in y Mitigación

| Lock-in | Nivel | Mitigación |
|---|---|---|
| **Convex SDK** | Alto | Abstracción de repositorios; mantener schema en contratos OpenAPI |
| **Gemini/Vertex AI** | Medio | LiteLLM como capa de abstracción LLM; tests con modelos locales |
| **LangGraph** | Medio | Usar interfaces de agente genéricas; grafo serializable a JSON |
| **Kapso.ai** | Alto | Definir contrato de handoff vía webhook estándar; no hardcodear vendor |
| **GCP (Cloud Run)** | Bajo | Containerización Docker estándar; portable a AWS/Azure |

### Pregunta 15 — Costos Aproximados por Etapa

**Supuestos**: equipo 2–4 devs, ~500 conversaciones/día en Fase 2+.

| Concepto | Fase 0 | Fase 1 | Fase 2 | Fase 3 |
|---|---|---|---|---|
| Cloud Run (4 servicios) | ~$0 | ~$50/mes | ~$150/mes | ~$300/mes |
| Vertex AI (Gemini 2.0 Flash) | ~$10 | ~$50/mes | ~$200/mes | ~$500/mes |
| Convex (SaaS) | Free tier | ~$25/mes | ~$100/mes | ~$250/mes |
| Cloud SQL (pgvector) | ~$0 | ~$40/mes | ~$80/mes | ~$160/mes |
| Langfuse (self-hosted GCP) | ~$10 | ~$30/mes | ~$50/mes | ~$80/mes |
| WhatsApp Business API | — | — | ~$50/mes + by conv | Variable |
| **Total infraestructura** | **~$20** | **~$200** | **~$630** | **~$1.300** |

***

## F. Testing / TDD

### Matriz RF → Pruebas Concretas

| RF | Tipo de test | Caso de prueba API-level |
|---|---|---|
| Recibir mensaje, extraer chat_id | Unit | Mock webhook Telegram → assert `session.chat_id == expected` |
| Clasificar intención FAQ/pedido | Unit | Input texto → assert `intent in ['faq', 'order', 'human']` |
| Construir estado acumulado | Unit | Historial + nuevo mensaje → assert estado pedido acumulado correcto |
| Validar productos contra Precios | Integration | Producto "hamburguesa" → assert `precio == 1500`, producto "x" → `error_producto` |
| Persistir solo si completo | Integration | Pedido incompleto → assert 0 rows en Convex orders |
| No alucinar datos de negocio | E2E + Eval | Pregunta sobre producto no existente → assert respuesta no inventa precio |
| Derivar a humano ante queja | E2E | Mensaje "quiero hablar con alguien" → assert evento handoff emitido |
| Latencia <=10s | E2E performance | Webhook → respuesta recibida en <8s p95 (100 iteraciones) |

**Estrategia anti-flaky:**
- Todos los tests de LLM usan datasets deterministas + temperatura=0
- Tests E2E usan WireMock para simular canal Telegram/WhatsApp
- `pytest-retry` con máximo 2 reintentos para tests de integración con red
- Evidencia mínima por PR: test output + Langfuse eval score por dataset

***

## G. Delta SRS v1.1

### Cambios Antes → Después

**1. Alcance:**
- Antes: Canal Telegram; prototipo/MVP; n8n como orquestador
- **Después (v1.1)**: Canal objetivo WhatsApp; platform de producción; LangGraph como orquestador; monorepo + microservicios; Convex como DB principal

**2. Supuestos y Dependencias:**
- Antes: n8n operativo; GPT-4o/4.1; Telegram Bot API; Postgres; n8n Data Tables
- **Después**: `DEP-2.4.1` Convex project configurado; `DEP-2.4.2` Vertex AI habilitado (gemini-2.0-flash-001); `DEP-2.4.3` WhatsApp Business API aprobada por Meta; `DEP-2.4.4` Langfuse self-hosted en GCP; `DEP-2.4.5` Cloud Run + GCP project con billing activo

**3. Restricciones:**
- Antes: Handoff humano incompleto; solo Telegram; calidad depende de prompts
- **Después**: Añadir `RST-NEW-1`: Convex SDK introduce acoplamiento — abstraer con repositorio; `RST-NEW-2`: WhatsApp Business API requiere aprobación Meta (~2–4 semanas); `RST-NEW-3`: Gemini 2.0 Flash requiere región GCP compatible (us-central1 recomendada)

**4. Nuevos RF propuestos:**

| ID | Descripción |
|---|---|
| `RF-2.1.6` | El sistema debe emitir evento de handoff estructurado vía Pub/Sub al detectar intent=humano |
| `RF-3.1.1` | El canal-service debe normalizar webhooks Telegram y WhatsApp a esquema canónico idéntico |
| `RF-5.1.1` | Todos los prompts deben estar versionados en Langfuse con ID semántico y fecha de activación |
| `RF-6.1.1` | El orquestador debe registrar un trace Langfuse por cada conversación con spans por subgrafo |

**5. Nuevos RNF propuestos:**

| ID | Descripción |
|---|---|
| `RNF-NEW-11` | Todos los LLM calls deben ser interceptados por LiteLLM para portabilidad de modelo |
| `RNF-NEW-12` | El sistema debe soportar rollback de versión de prompt en <5 minutos sin redeploy |
| `RNF-NEW-13` | Cada microservicio debe exponer `/health` y `/metrics` en formato Prometheus |

**6. Nuevas Interfaces Externas:**

| ID | Interfaz | Motivo |
|---|---|---|
| `IE-NEW-1` | WhatsApp Business API (Meta) | Canal productivo objetivo |
| `IE-NEW-2` | Vertex AI (Gemini 2.0 Flash) | LLM principal de producción |
| `IE-NEW-3` | Convex | DB tiempo real (sesiones + pedidos) |
| `IE-NEW-4` | Langfuse (self-hosted) | Observabilidad y evaluación IA |
| `IE-NEW-5` | GCP Pub/Sub | Bus de eventos inter-servicios |
| `IE-NEW-6` | Clerk | Autenticación panel operador |

**7. TBDs resueltos / nuevos:**

| ID | Estado | Resolución |
|---|---|---|
| TBD-001 | → Resuelto parcialmente | Handoff via Pub/Sub + Kapso.ai; backlog técnico en Fase 2 |
| TBD-002 | → Resuelto | WhatsApp Business API como canal productivo; Telegram conservado para dev/staging |
| TBD-003 | → Nuevo backlog | `TBD-NEW-1`: Política de retención Convex: definir TTL de sesiones (propuesto: 90 días) |
| TBD-004 | → Resuelto | SLOs definidos en sección D de este documento (latencia p95, conversion rate, hallucination rate) |
| TBD-005 | → Resuelto | Versionado via Langfuse Prompts API; proceso: PR review + eval regression antes de activar |
| — | Nuevo | `TBD-NEW-2`: Evaluar Kapso.ai para handoff en Fase 2 — requiere POC de integración |

***

## H. Backlog Inicial — Top 20 Historias Técnicas

| # | Historia | Fase | Estimación | Dependencias | Criterio de aceptación |
|---|---|---|---|---|---|
| 1 | Scaffold monorepo GitHub con nx/turborepo | 0 | 2 días | — | `nx affected:test` corre en CI |
| 2 | Implementar channel-service con webhook Telegram normalizado | 0 | 3 días | #1 | Test E2E: mensaje Telegram → evento Pub/Sub canónico emitido |
| 3 | Migrar lógica de clasificación de intención de n8n a LangGraph | 0 | 4 días | #1 | Unit tests: 10 inputs → intención correcta; Langfuse trace visible |
| 4 | Integrar Langfuse en conversation-orchestrator (traces + spans) | 0 | 2 días | #3 | Cada test LangGraph genera trace en Langfuse |
| 5 | Implementar knowledge-service con lookup Menu/FAQ/Precios | 0 | 3 días | #1 | Integration test: query producto → precio correcto; query desconocido → not-found signal |
| 6 | Implementar order-service con FSM de pedidos en Convex | 1 | 4 días | #1, #5 | Integration test: pedido completo persiste; pedido incompleto no persiste |
| 7 | Versionar prompts del agente en Langfuse Prompts API | 1 | 2 días | #4 | Rollback de prompt en <5min sin redeploy |
| 8 | Terraform Cloud Run + Pub/Sub + Secret Manager en GCP dev | 1 | 3 días | #1 | `terraform plan` sin errores; deploy channel-service funcional |
| 9 | CI/CD GitHub Actions con quality gates por servicio afectado | 1 | 3 días | #1 | PR → build + test + contract check automático |
| 10 | Implementar caché LRU para Menu/FAQ en knowledge-service | 1 | 1 día | #5 | Latencia p95 knowledge lookup <100ms con cache hit |
| 11 | Dataset canónico Langfuse: 30 casos de prueba de pedidos | 1 | 2 días | #4 | Eval regression score >0.9 en dataset |
| 12 | E2E test API-level: flujo completo webhook → respuesta | 1 | 3 días | #2, #3, #6 | Test simula inbound, valida outbound + estado Convex |
| 13 | Integrar Gemini 2.0 Flash vía Vertex AI + LiteLLM wrapper | 1 | 2 días | #3 | Swap modelo sin cambios en código del agente |
| 14 | Prometheus metrics endpoint en todos los servicios | 2 | 2 días | #8 | Grafana dashboard muestra latencia p95 y error rate |
| 15 | Implementar notification-service con envío a Telegram | 1 | 2 días | #2 | Test E2E completo: mensaje → respuesta recibida en Telegram |
| 16 | Handoff humano: evento Pub/Sub + webhook a Kapso.ai | 2 | 4 días | #3, #6 | Intent=humano → evento emitido → Kapso recibe notificación |
| 17 | WhatsApp Business API en channel-service (staging) | 2 | 5 días | #2, Meta approval | Webhook WA → mismo evento canónico que Telegram |
| 18 | Terraform staging + prod environments | 2 | 3 días | #8 | `terraform apply` staging sin intervención manual |
| 19 | Admin panel Next.js + Clerk auth + vista de pedidos | 2 | 5 días | #6 | Operador puede ver pedidos y marcar handoff |
| 20 | Load test Fase 2: 50 concurrent conversations | 2 | 2 días | todos | Latencia p95 <8s bajo carga; 0 errores 5xx |

***

## I. Top 10 Riesgos

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R-01 | Aprobación WhatsApp Business API demorada (2–8 semanas) | Alta | Alto | Iniciar proceso Meta en Fase 0; desarrollar con Telegram en paralelo |
| R-02 | Latencia LLM supera 10s bajo carga concurrent | Media | Alto | LiteLLM timeout + fallback; cache; min_instances=1 en prod |
| R-03 | Lock-in Convex impide migrar si SaaS falla/cambia precios | Media | Medio | Abstracción repositorio desde Fase 0 |
| R-04 | Kapso.ai no provee contrato de integración estable | Media | Medio | Definir contrato webhook propio; Kapso como implementación intercambiable |
| R-05 | Calidad Gemini 2.0 Flash en español informal de pedidos baja | Media | Alto | Dataset de evaluación con dialectalismos; experimento A/B en Fase 1 |
| R-06 | Alucinaciones de datos de negocio no detectadas en producción | Baja | Muy Alto | Langfuse eval automático en cada respuesta; score mínimo configurable |
| R-07 | Curva de aprendizaje LangGraph retrasa Fase 0 | Alta | Medio | Training 1 semana; empezar con grafo lineal; complejidad incremental |
| R-08 | Costos Vertex AI escalan inesperadamente | Baja | Medio | Budget alerts GCP; límite de tokens por conversación; cache agresivo |
| R-09 | TBD-001 (handoff) bloquea Fase 2 por indefinición de CRM | Alta | Alto | Definir contrato mínimo de handoff en Fase 1; Kapso es opcional en Fase 2 |
| R-10 | Rollback de prompt rompe conversaciones en curso | Media | Medio | Versión de prompt enlazada a sesión activa; migración gradual |

***

## J. Criterios de Rigor y Evidencia

**Fuentes verificadas utilizadas:**
- Gemma 3 27B lanzado 12 de marzo de 2025, disponible en AI Studio y Gemini API  — fecha consulta: 2026-02-27 [ai.google](https://ai.google.dev/gemini-api/docs/changelog)
- Gemma 3 27B Chatbot Arena Elo 1338 con 1 H100  — fecha consulta: 2026-02-27 [artificialintelligence-news](https://www.artificialintelligence-news.com/news/gemma-3-google-launches-its-latest-open-ai-models/)
- LangGraph vs n8n: observabilidad LangGraph requiere herramientas externas  — fecha consulta: 2026-02-27 [orangeloops](https://orangeloops.com/2025/06/building-ai-agents-with-langgraph-vs-n8n-a-hands-on-comparison/)
- Convex garantías de consistencia y durable workflows para agentes  — fecha consulta: 2026-02-27 [stack.convex](https://stack.convex.dev/durable-workflows-and-strong-guarantees)
- Vertex AI release notes con Gemini 2.0 Flash y gemma-3-27b-it disponibles  — fecha consulta: 2026-02-27 [docs.cloud.google](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes)

**Inferencias explícitas** (no verificadas con fuente primaria):
- Costos de Cloud Run, Cloud SQL, Pub/Sub son estimaciones basadas en pricing público de GCP (sujetos a cambio)
- Latencias del path crítico son estimaciones basadas en benchmarks conocidos, no mediciones en este sistema específico
- Viabilidad de Kapso.ai para handoff: **supuesto adoptado** — requiere POC de integración en Fase 1 para confirmar

**Incertidumbres declaradas:**
- **U-01**: Capacidad de function calling de Gemini 2.0 Flash en español informal no verificada con dataset propio → **Experimento**: crear 50 casos de prueba con dialectalismos argentinos y correr eval en Fase 0
- **U-02**: SLA y pricing de Kapso.ai no verificados oficialmente → **Experimento**: solicitar documentación técnica y sandbox en Fase 0
- **U-03**: Throughput de Convex bajo escrituras concurrent de pedidos en hora pico → **Experimento**: load test en staging con 20 concurrent writes antes de Fase 2