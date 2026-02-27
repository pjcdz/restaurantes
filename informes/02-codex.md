# Informe Tecnico de Evolucion de Plataforma

Fecha de referencia: 2026-02-27  
Estado del producto: pre-produccion (sin implementacion productiva activa a preservar)

---

## A) Resumen ejecutivo

**Decision recomendada:** **Adoptar parcial**

### Justificacion
- [INFERENCIA] Conviene industrializar por etapas, sin big-bang, porque hoy el sistema es MVP/prototipo.
- [HECHO VERIFICADO] Cloud Run + Cloud Run Jobs + Cloud Tasks permiten APIs, workers y batch con bajo overhead operativo.  
  Fuente oficial: https://docs.cloud.google.com/run/quotas ; https://docs.cloud.google.com/run/docs/create-jobs ; https://docs.cloud.google.com/tasks/docs/comp-pub-sub  
  Fecha consulta: 2026-02-27
- [HECHO VERIFICADO] LangGraph aporta durable execution y pausa/reanudacion para human-in-the-loop.  
  Fuente oficial: https://docs.langchain.com/oss/python/langgraph/durable-execution  
  Fecha consulta: 2026-02-27
- [HECHO VERIFICADO] LangSmith Studio ofrece interfaz visual de grafo, trazas y debugging (incluyendo time-travel).  
  Fuente oficial: https://docs.langchain.com/langsmith/studio ; https://docs.langchain.com/langgraph-platform/observability-studio  
  Fecha consulta: 2026-02-27
- [HECHO VERIFICADO] Langfuse cubre traces, sessions, prompts, evals, datasets, experiments, feedback, costos y latencia.  
  Fuente oficial: https://langfuse.com/docs  
  Fecha consulta: 2026-02-27
- [HECHO VERIFICADO] Gemma 27B esta disponible en Vertex AI Model Garden (Gemma 3 27B / Gemma 2 27B).  
  Fuente oficial: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/open-models/use-gemma  
  Fecha consulta: 2026-02-27
- [HECHO VERIFICADO] AI Studio esta orientado a prototipado/experimentacion de prompts.  
  Fuente oficial: https://ai.google.dev/gemini-api/docs/ai-studio-quickstart  
  Fecha consulta: 2026-02-27
- [INFERENCIA] Para produccion en este caso, conviene Vertex AI como runtime principal y AI Studio para discovery.

### Respuesta corta a las 15 preguntas criticas
| # | Respuesta |
|---|---|
| 1 | [INFERENCIA] Microservicios ligeros event-driven en Cloud Run + Tasks/PubSub + Convex para estado. |
| 2 | [INFERENCIA] Monorepo con `apps/services/packages/contracts/infra/docs`. |
| 3 | [INFERENCIA] Blueprint Terraform basado en Foundation Toolkit + modulos propios por dominio. |
| 4 | [INFERENCIA] APIs en Cloud Run; workers con Cloud Tasks; fan-out async con Pub/Sub; batch con Run Jobs. |
| 5 | [INFERENCIA] SLO/SLI por capa (canal, orquestador, IA, estado de pedido) + alertas burn-rate. |
| 6 | [INFERENCIA] Langfuse end-to-end: traces, sessions, prompt versions, evals y control de costo. |
| 7 | [INFERENCIA] Si, LangChain+LangGraph reemplaza n8n sin perder productividad si se complementa con Studio + SDK + plantillas. |
| 8 | [INFERENCIA] Herramienta visual concreta: LangSmith Studio. |
| 9 | [INFERENCIA] Gemma 27B en AI Studio no es la ruta principal recomendada para produccion. |
| 10 | [INFERENCIA] Alternativa oficial recomendada: Gemini 2.5 Flash para operacion + Gemma 3 27B en Vertex para casos puntuales. |
| 11 | [INFERENCIA] Convex puede cubrir memoria/pedidos/catalogo; mitigar lock-in con contratos y export de eventos. |
| 12 | [INFERENCIA] Latencia <=10s via time-budget por etapa, cache, timeouts y respuestas escalonadas. |
| 13 | [INFERENCIA] Transicion por Fase 0-3, sin cutover inmediato; dual-run/shadow desde Fase 2. |
| 14 | [INFERENCIA] Lock-in principal en Convex/Kapso/proveedor LLM; mitigar con adapters, contratos y pruebas de portabilidad. |
| 15 | [INFERENCIA] Costos por fase entre ~USD 0.3k y ~USD 40k/mes segun volumen y uso IA. |

---

## B) Arquitectura objetivo

### Diagrama logico textual E2E
[INFERENCIA]

`WhatsApp/Kapso Webhook -> Channel Gateway -> Conversation Orchestrator (LangGraph) -> Tool Services (Catalog, Order, Handoff, Policy) -> Convex + Langfuse + Prometheus -> Response Composer -> WhatsApp sender`

### Catalogo de microservicios
| Microservicio | Responsabilidad | API/Eventos | Storage | Owner |
|---|---|---|---|---|
| `channel-gateway` | Inbound/outbound de canal, idempotencia | Webhook + `message.received` | Convex (inbox) | Platform |
| `conversation-orchestrator` | Flujo LangGraph (FAQ/pedido/handoff) | HTTP/gRPC interno | Convex + cache | AI Eng |
| `catalog-service` | Menu/FAQ/precios versionados | `GET /menu`, `GET /faq` | Convex | Product Eng |
| `order-service` | Estado pedido, validaciones y total | REST + `order.updated` | Convex | Product Eng |
| `handoff-service` | Escalamiento humano y CRM hooks | `handoff.requested` | Convex + CRM metadata | Ops Eng |
| `policy-guardrail-service` | No alucinacion, PII y cumplimiento | API interna | Reglas versionadas | AI Eng |
| `operator-console` (Next.js) | Operacion humana, trazas y acciones | BFF interno | Convex queries | Product Eng |

### Estrategia de consistencia y memoria conversacional
- [HECHO VERIFICADO] Convex ejecuta mutaciones transaccionales y usa OCC serializable.  
  Fuente oficial: https://docs.convex.dev/functions ; https://docs.convex.dev/database/advanced/occ  
  Fecha consulta: 2026-02-27
- [INFERENCIA] Modelo `estado actual + event log`.
- [INFERENCIA] Clave de idempotencia por `channel_message_id` y `conversation_id`.
- [INFERENCIA] Solo `order-service` confirma estado `completo` (write-fence).
- [INFERENCIA] Export diario de eventos para analytics y mitigacion lock-in.

---

## C) Diseno de plataforma

### Estructura monorepo propuesta
```text
/apps
  /operator-console-next
  /ops-admin
/services
  /channel-gateway
  /conversation-orchestrator
  /catalog-service
  /order-service
  /handoff-service
/packages
  /domain-contracts
  /api-clients
  /prompt-schemas
  /observability-sdk
  /test-fixtures
/contracts
  /openapi
  /asyncapi
  /json-schemas
/infra
  /terraform
    /envs/{dev,stg,prod}
    /modules/{network,run,tasks,pubsub,secrets,obs,iam}
/docs
  /srs
  /adr
  /runbooks
```

### CI/CD con quality gates
[INFERENCIA]
1. Lint + typecheck + unit.
2. Contract tests (OpenAPI/AsyncAPI).
3. Integration tests (Convex + webhooks mockeados).
4. E2E API-level (inbound webhook -> outbound + estado persistido).
5. Eval gates de IA (dataset minimo + threshold).
6. Security gates (SAST, secret scan, IaC scan).
7. Deploy progresivo (dev -> stg -> prod, con feature flags).

### Terraform en GCP
- [HECHO VERIFICADO] Foundation Toolkit ofrece blueprints/modulos Terraform para GCP.  
  Fuente oficial: https://cloud.google.com/foundation-toolkit  
  Fecha consulta: 2026-02-27
- [INFERENCIA] Modulos minimos: networking, cloud-run, tasks/pubsub, secrets, observability, iam, artifact-registry, ci-cd identity.

### Seguridad: IAM, secretos y auditoria
- [HECHO VERIFICADO] Best practices IAM: cuentas de servicio por proposito y evitar claves permanentes.  
  Fuente oficial: https://cloud.google.com/iam/docs/best-practices-service-accounts  
  Fecha consulta: 2026-02-27
- [HECHO VERIFICADO] Best practices Secret Manager: versionado y menor exposicion en runtime.  
  Fuente oficial: https://cloud.google.com/secret-manager/docs/best-practices  
  Fecha consulta: 2026-02-27
- [INFERENCIA] Mascaras de PII en logs/trazas + auditoria de acceso a secretos y acciones de handoff.

---

## D) Observabilidad

### Plan Prometheus + Grafana
- [HECHO VERIFICADO] Managed Service for Prometheus es compatible con PromQL/Grafana y provee retencion extendida.  
  Fuente oficial: https://docs.cloud.google.com/stackdriver/docs/managed-prometheus  
  Fecha consulta: 2026-02-27

[INFERENCIA] SLIs:
- `webhook_ack_latency_p95`
- `turn_latency_p95`
- `order_completion_rate`
- `fallback_rate`
- `delivery_success_rate`
- `state_conflict_rate`

[INFERENCIA] SLO iniciales:
- API availability: 99.5%
- E2E p95: <=10s
- Pedido correcto sin error de negocio: >=97%

[INFERENCIA] Alertas:
- Burn-rate 1h/6h
- Latencia >2x baseline
- Degradacion de proveedor LLM
- Saturacion de colas

### Plan Langfuse end-to-end
- [HECHO VERIFICADO] Langfuse incluye observabilidad, prompt management y evaluaciones (datasets/experimentos/scores).  
  Fuente oficial: https://langfuse.com/docs  
  Fecha consulta: 2026-02-27

[INFERENCIA] Implementacion:
1. 1 trace por turno.
2. Session por cliente/conversacion.
3. Version de prompt por release.
4. Datasets de regresion por RF criticos.
5. Experimentos por modelo/prompt.
6. Feedback humano desde consola.
7. Spend alerts y tracking de costo por sesion.

---

## E) Testing / TDD pragmatico

### Matriz RF/RNF -> pruebas
| RF/RNF | Prueba real | Tipo |
|---|---|---|
| RF-001/002/023 | Simular inbound webhook y validar outbound al mismo origen | E2E API |
| RF-003/004/005 | Cliente nuevo crea sesion/pedido inicial y persistencia correcta | Integracion |
| RF-006/007/008 | Clasificador enruta al subflujo correcto | Unit + Contract |
| RF-012 + RNF-004/005 | Sin dato -> `NO_ENCONTRADO` sin inventar | E2E API |
| RF-014/017/018/019/020 | Validacion de producto, total, faltantes y persistencia solo completo | Integracion |
| RF-024/025 | Parse error no corta flujo; mensaje de recuperacion | E2E API |
| RNF-001/002/003 | No fuga de secretos/PII/infra IDs | Security test |
| RNF-007 | p95 <=10s bajo carga objetivo | Performance |
| RNF-008 | Mensajes consecutivos no corrompen estado | Concurrency |
| RNF-009/010 | Prompt/version y trazabilidad completa | Contract + Audit |

### Casos API-level realistas
[INFERENCIA]
1. `TC-E2E-ORDER-001`: pedido completo multi-item con confirmacion final.
2. `TC-E2E-FAQ-002`: consulta compuesta (horario + pago + menu).
3. `TC-E2E-HANDOFF-003`: queja explicita y handoff a humano.
4. `TC-E2E-RACE-004`: rafaga de 3 mensajes en 2s, estado consistente.
5. `TC-E2E-GUARD-005`: intento de prompt injection sin fuga de internals.

### Anti-flaky + evidencia minima por PR
[INFERENCIA]
- Seeds y fixtures deterministas.
- Timeouts controlados por reloj simulado.
- Retries solo donde aplica (dependencias externas).
- Evidencia PR: trazas E2E, diff de contratos, cobertura RF tocados, score eval IA.

---

## F) Roadmap incremental

### Objetivo del roadmap
[INFERENCIA] Construir la plataforma completa en 4 fases, manteniendo decisiones reversibles, evidencia de calidad por cada release y sin requerir cutover productivo inmediato.

### Horizonte estimado y dedicacion
[INFERENCIA]
- Duracion total objetivo: 5 a 8 meses.
- Equipo recomendado: 6 a 9 personas.
- Composicion tipo: 1 Tech Lead/Architect, 2-3 Backend/Platform, 1 AI Engineer, 1 QA Automation, 1 Product Engineer (operador console), 0.5-1 SRE compartido.

### Modo de trabajo comun para todas las fases
[INFERENCIA]
1. Cadencia quincenal con planning, demo y retro.
2. Gate semanal de arquitectura (ADR), seguridad y costo.
3. Todo cambio relevante debe mapear a RF/RNF y test asociado.
4. Release notes con: impacto funcional, riesgo, rollback, costo estimado.
5. Ninguna fase se cierra sin metricas minimas y evidencia de pruebas E2E.

### Mapa de fases (resumen)
| Fase | Objetivo principal | Entregable clave | Gate de salida | Esfuerzo (persona-semana) |
|---|---|---|---|---|
| Fase 0 (POC) | Validar arquitectura y flujo critico | Flujo pedido E2E en stack objetivo | P95 y exactitud funcional aceptables | 6-8 |
| Fase 1 (Piloto) | Validar producto con usuarios controlados | Piloto controlado con WhatsApp sandbox | Conversion y calidad IA estables | 10-14 |
| Fase 2 (Prod parcial) | Endurecer operacion y confiabilidad | Servicios core con SLO y seguridad | Error budget y operacion estable | 12-16 |
| Fase 3 (Go-Live) | Escalar negocio y operacion continua | Operacion formal + optimizacion costo | KPI negocio y margen sostenibles | 8-12 |

### Desarrollo completo por etapa

#### Fase 0 (POC tecnico guiado por riesgo)
[INFERENCIA]
- Objetivo: confirmar viabilidad tecnica del stack objetivo (canal, orquestacion, estado, observabilidad) con 1 flujo completo de pedido.
- Alcance funcional:
  - Inbound/outbound de mensajes por contrato API.
  - FAQ basica y pedido simple (1-2 productos).
  - Persistencia de estado conversacional y total de pedido.
- Alcance de plataforma:
  - Monorepo base, contratos API, CI minima.
  - Infra dev via Terraform.
  - Trazas tecnicas + trazas IA + dashboard base.
- Entregables:
  - ADRs iniciales (runtime, storage, modelo IA, handoff).
  - Primeros 5 tests E2E API-level.
  - Dashboard de latencia y errores.
- Riesgos principales:
  - Sobrediseno de microservicios demasiado temprano.
  - Latencia del loop conversacional por encima de objetivo.
- Mitigacion:
  - Limitar a servicios minimos (`channel-gateway`, `orchestrator`, `order-service`, `catalog-service`).
  - Time-budget por paso del flujo.
- Criterios de salida:
  - Flujo pedido E2E estable en ambiente dev/stg.
  - P95 de turno conversacional en umbral acordado para POC.
  - Evidencia de trazabilidad RF -> test -> trace.
- No-Go de fase:
  - No pasar a Fase 1 si no hay consistencia de estado o si los tests E2E base son inestables.
- Rollback:
  - Mantener referencia ejecutable del prototipo n8n para comparacion funcional.

#### Fase 1 (Piloto controlado con usuarios reales)
[INFERENCIA]
- Objetivo: validar valor de negocio y calidad conversacional en entorno controlado.
- Alcance funcional:
  - Cobertura de casos frecuentes de FAQ/menu/pedido.
  - Handoff humano basico end-to-end.
  - Politicas de respuesta sin alucinacion para datos de negocio.
- Alcance operativo:
  - Runbooks iniciales de incidentes.
  - Alertas de errores, latencia y gasto IA.
  - Registro de feedback humano por conversacion.
- Entregables:
  - Dataset de evaluacion v1 con casos reales anonimizados.
  - Prompts versionados con proceso de aprobacion.
  - Dashboard de conversion consulta -> pedido.
- Riesgos principales:
  - Variabilidad de calidad de respuesta.
  - Friccion en handoff humano.
- Mitigacion:
  - Evals offline + online por release.
  - Regla de escalamiento temprano ante baja confianza.
- Criterios de salida:
  - Conversaciones piloto con calidad consistente.
  - Handoff con SLA operativo inicial.
  - Sin fuga de datos sensibles en logs/respuestas.
- No-Go de fase:
  - No pasar a Fase 2 si no hay estabilidad de calidad o si el handoff no cierra E2E.
- Rollback:
  - Feature flag para desactivar rutas avanzadas y volver a flujo simplificado.

#### Fase 2 (Produccion parcial y hardening)
[INFERENCIA]
- Objetivo: preparar la plataforma para operacion real parcial con confiabilidad y seguridad.
- Alcance funcional:
  - Catalogo completo, reglas de negocio completas, errores controlados.
  - Idempotencia y manejo de mensajes consecutivos bajo carga.
  - Shadow/dual-run para comparar decisiones de orquestacion.
- Alcance de plataforma:
  - Ambientes dev/stg/prod con pipeline completo.
  - SLO/SLI formalizados y error budget activo.
  - Seguridad reforzada (IAM minimo privilegio, secretos versionados, auditoria).
- Entregables:
  - Contract tests entre servicios y terceros.
  - Reporte de confiabilidad semanal (SLO + incidentes + costo).
  - Matriz de trazabilidad SRS v1.1 completa.
- Riesgos principales:
  - Deuda tecnica por crecer rapido.
  - Costos IA por encima de presupuestado.
- Mitigacion:
  - Quality gates obligatorios antes de merge.
  - Routing de modelos por tipo de tarea y presupuesto por tenant.
- Criterios de salida:
  - SLO cumplidos por ventana acordada.
  - Operacion en prod parcial sin incidentes severos repetitivos.
  - Costo por conversacion dentro de rango objetivo.
- No-Go de fase:
  - No pasar a Fase 3 si hay incumplimiento sostenido de SLO o incidentes de seguridad.
- Rollback:
  - Rollback por servicio (imagen previa) + degradacion funcional definida.

#### Fase 3 (Go-Live y optimizacion continua)
[INFERENCIA]
- Objetivo: operar como producto estable, escalable y rentable.
- Alcance funcional:
  - Cobertura completa de journeys de consulta/pedido/handoff.
  - Operacion humana con tooling y trazabilidad integral.
- Alcance operativo y negocio:
  - Gobernanza formal de cambios de prompt/modelo.
  - Capacidad de planificacion de demanda y costo.
  - Cadencia de mejora continua basada en feedback real.
- Entregables:
  - Runbooks maduros + simulacros de incidentes.
  - Tablero ejecutivo (conversion, latencia, costo, margen).
  - Plan trimestral de optimizacion (calidad + costo + velocidad).
- Riesgos principales:
  - Costo variable en picos de demanda.
  - Lock-in operativo por proveedor.
- Mitigacion:
  - Presupuestos y alertas de gasto con acciones automaticas.
  - Arquitectura por adapters y pruebas de portabilidad programadas.
- Criterios de salida:
  - KPIs de negocio y operacion sostenidos por al menos 1 ciclo mensual.
  - Equipo operativo capaz de sostener incidentes y releases sin dependencia critica externa.
- No-Go de fase:
  - Detener expansion si margen o calidad caen por debajo del umbral definido por negocio.
- Rollback:
  - Modo degradado documentado (respuestas FAQ + handoff prioritario) para proteger operacion.

### Plan de gobernanza y decision entre fases
| Gate | Evidencia obligatoria | Responsable | Decision |
|---|---|---|---|
| Gate F0->F1 | E2E base estable + observabilidad minima + ADRs criticos cerrados | Architect + Product | Go/No-Go piloto |
| Gate F1->F2 | Calidad IA piloto + handoff SLA + sin hallazgos criticos de seguridad | Product + AI Lead + SRE | Go/No-Go prod parcial |
| Gate F2->F3 | Cumplimiento SLO + costos en rango + incidentes controlados | CTO/Owner + Platform | Go/No-Go go-live |
| Gate post F3 | KPI negocio sostenido + runbooks validados | Owner + Ops | Escalar/Optimizar |

### Costos aproximados por etapa (USD/mes)
[INFERENCIA] (alta variabilidad por volumen, templates WA y consumo de tokens)
| Fase | Infra GCP | IA/LLM | Observabilidad | SaaS (Clerk/Convex/Kapso) | Total aprox |
|---|---:|---:|---:|---:|---:|
| 0 | 100-300 | 100-600 | 0-200 | 0-300 | 300-1,400 |
| 1 | 300-1,000 | 600-2,500 | 100-400 | 200-800 | 1,200-4,700 |
| 2 | 1,000-3,500 | 2,000-8,000 | 300-1,000 | 500-2,000 | 3,800-14,500 |
| 3 | 2,500-8,000 | 6,000-25,000 | 700-2,500 | 1,000-5,000 | 10,200-40,500 |

### Evolucion de costos y capacidad (lectura operativa)
[INFERENCIA]
- Fase 0-1: domina costo de descubrimiento y evaluacion IA.
- Fase 2: crece costo de confiabilidad (observabilidad, seguridad, ambientes).
- Fase 3: domina costo variable por volumen de conversaciones y mensajes de canal.
- Regla recomendada: fijar presupuesto maximo por conversacion y activar politicas de degradacion cuando se supera.

### Top 10 riesgos
| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Lock-in Convex | Media | Alto | contratos de dominio + export de eventos |
| Lock-in proveedor canal | Media | Alto | adapter de canal + pruebas alternas |
| Costo IA impredecible | Alta | Alto | routing modelo + topes por tenant |
| Latencia >10s | Media | Alto | time-budget por nodo + cache |
| Alucinacion de precios/menu | Media | Alto | retrieval tool-first + guardrails |
| Handoff incompleto | Media | Medio | SLA handoff + E2E obligatorios |
| Cambios de API externas | Media | Medio | contract tests diarios |
| Baja trazabilidad SRS->test | Media | Medio | IDs obligatorios en PR |
| Exposicion de secretos/PII | Baja | Alto | Secret Manager + masking + auditoria |
| Sobrecarga de equipo | Alta | Medio | scope por fase y ADRs tempranos |

---

## G) Delta SRS v1.1

### 1) Alcance (Antes -> Despues)
- Antes: Telegram+n8n MVP.
- Despues: [INFERENCIA] plataforma industrializable con objetivo WhatsApp, microservicios y observabilidad integral.

### 2) Supuestos y dependencias nuevos
- `SD-101`: WhatsApp Business Platform habilitada.
- `SD-102`: Runtime LangGraph operativo.
- `SD-103`: Langfuse integrado (traces/evals/prompts).
- `SD-104`: Convex con despliegues dev/stg/prod.

### 3) Restricciones nuevas
- `RST-101`: Sin requisito de migracion en vivo en esta etapa.
- `RST-102`: Decisiones reversibles por contratos/adapters.
- `RST-103`: Sin release sin evidencia RF/RNF.

### 4) RF nuevos propuestos
- `RF-101`: Inbound multicanal via `channel-gateway`.
- `RF-102`: Idempotencia por `message_id`.
- `RF-103`: Orquestacion LangGraph persistente.
- `RF-104`: Handoff humano con estado auditable.
- `RF-105`: Confirmacion de pedido solo tras validacion integral.
- `RF-106`: Reintentos de outbound con backoff.
- `RF-107`: Event log de negocio para trazabilidad.

### 5) RNF nuevos propuestos
- `RNF-101`: SLO disponibilidad API >=99.5%.
- `RNF-102`: p95 E2E <=10s.
- `RNF-103`: Trazabilidad SRS->test->trace obligatoria.
- `RNF-104`: Prompt governance con aprobacion/versionado.
- `RNF-105`: Observabilidad IA de costo/calidad/latencia.
- `RNF-106`: PII masking en logs y trazas.
- `RNF-107`: Backup/export diario de estado critico.

### 6) Interfaces externas nuevas
- `IE-101`: WhatsApp Cloud API (directa o via Kapso).
- `IE-102`: API de Kapso para handoff/CRM.
- `IE-103`: Vertex AI / Gemini API.
- `IE-104`: Convex runtime/deployment APIs.
- `IE-105`: Langfuse ingestion API.
- `IE-106`: Cloud Tasks y Pub/Sub.

### 7) Criterios de aceptacion v1.1
- `CA-101`: >=95% de casos E2E criticos en verde.
- `CA-102`: p95 <=10s en carga objetivo de fase.
- `CA-103`: 100% de productos invalidos detectados/controlados.
- `CA-104`: Handoff E2E con evidencia de trazas.
- `CA-105`: Costo IA dentro de presupuesto de fase.

### 8) Matriz de trazabilidad (extracto)
| Objetivo negocio | RF/RNF | Test ID | KPI |
|---|---|---|---|
| Reducir friccion | RF-103, RF-105 | TC-E2E-ORDER-001 | mensajes por pedido |
| Aumentar conversion | RF-105, RNF-102 | TC-E2E-ORDER-001 | consulta->pedido |
| No alucinaciones | RNF-105 + guardrails | TC-E2E-GUARD-005 | hallucination score |
| Trazabilidad pedido | RF-107, RNF-103 | TC-E2E-HANDOFF-003 | audit trail completeness |

### 9) TBD actualizados
- `TBD-101`: Politica final de retencion/anonimizacion.
- `TBD-102`: SLA contractual de handoff humano.
- `TBD-103`: Estrategia final de costos de WhatsApp por pais.
- `TBD-104`: Fallback multi-modelo en incidentes.
- `TBD-105`: Criterio de salida de lock-in de datos.

---

## H) Backlog inicial ejecutable (Top 20)

| Pri | Historia | Dependencias | Est. (dias) | Criterio de aceptacion |
|---|---|---|---:|---|
| 1 | Definir contratos `message.received/sent` | - | 2 | Contratos versionados |
| 2 | Implementar webhook inbound `channel-gateway` | 1 | 4 | Ack + idempotencia |
| 3 | Implementar sender outbound con retries | 2 | 3 | Entrega robusta |
| 4 | Implementar `order-service` (RF de pedido) | 1 | 5 | Tests de negocio en verde |
| 5 | Implementar `catalog-service` | 1 | 3 | FAQ/menu/precios consistentes |
| 6 | Implementar orquestador LangGraph base | 4,5 | 5 | Ruteo correcto por intencion |
| 7 | Integrar Langfuse tracing | 6 | 2 | Trace por turno visible |
| 8 | Integrar sesiones Langfuse | 7 | 1 | Session por cliente |
| 9 | Guardrails anti-alucinacion | 6 | 4 | Eval guardrail supera threshold |
| 10 | Implementar `handoff-service` | 2,6 | 4 | Evento handoff funcional |
| 11 | Construir `operator-console` inicial | 10 | 5 | Operador puede tomar casos |
| 12 | Definir schema Convex v1 | 4,5 | 3 | Persistencia estable |
| 13 | Exponer metricas Prometheus app | 2,4,6 | 3 | Dashboard base operativo |
| 14 | Configurar alertas SLO burn-rate | 13 | 2 | Alertas disparan en prueba |
| 15 | Pipeline CI/CD con quality gates | 1..6 | 4 | Bloquea regressions |
| 16 | Suite E2E API-level (5 casos) | 2..10 | 5 | Cobertura RF criticos |
| 17 | Datasets/evals IA v1 | 7,9 | 4 | Baseline de calidad definido |
| 18 | Terraform base dev/stg | - | 5 | Entorno reproducible |
| 19 | Hardening IAM + secretos | 18 | 3 | Auditoria y least privilege |
| 20 | Shadow mode n8n vs LangGraph | 6,16 | 4 | Reporte comparativo automatico |

---

## Nota de incertidumbre explicita
- [INFERENCIA] No se pudo extraer en este entorno evidencia completa y directa de pricing actualizado de WhatsApp desde algunos endpoints de Meta por limitacion temporal de acceso.
- [INFERENCIA] Experimento recomendado: job semanal de verificacion de precios oficiales y simulacion de costo unitario por categoria de mensaje antes de Fase 2.
