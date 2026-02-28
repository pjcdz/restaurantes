# SRS - Sistema de Asistente Conversacional para Restaurantes (Version Codex)

**Version:** 2.0-codex  
**Fecha:** 2026-02-28  
**Estado:** Borrador operativo para ejecucion de Fase 0 + Fase 1

---

## 1. Introduccion

### 1.1 Proposito
Este documento define una **SRS v2** orientada a ejecucion incremental, tomando como base:
- el formato y alcance de `SRS-v1.md`,
- los lineamientos de industrializacion de `informes/03-gemini-deepsearch.md`,
- el estado real implementado en `apps/restaurant-hours-api`.

El objetivo principal es planificar la construccion progresiva hasta MVP final, priorizando en esta etapa inicial:
1. inicio de la conversacion,
2. apertura (estado abierto/cerrado),
3. toma de pedido,
4. integracion de Convex.

### 1.2 Alcance
**En alcance inmediato (esta etapa):**
- Implementar Fase 0 + Fase 1 sobre el stack actual (Node.js + Express + Telegram webhook).
- Integrar Convex como base de estado conversacional y pedidos.
- Mantener canal Telegram como entorno de desarrollo/piloto tecnico.

**Fuera de alcance inmediato:**
- Migracion a WhatsApp/Kapso.
- Handoff humano productivo end-to-end.
- Cloud Run/Terraform/arquitectura completa de produccion.
- Observabilidad avanzada (Langfuse, Prometheus/Grafana) como requisito bloqueante.

### 1.3 Definiciones y Acronomos
| Termino | Definicion |
|---|---|
| SRS/ERS | Especificacion de Requerimientos de Software |
| MVP | Producto Minimo Viable |
| POC | Proof of Concept |
| RF | Requerimiento Funcional |
| RNF | Requerimiento No Funcional |
| BR | Regla de Negocio |

### 1.4 Referencias
- `SRS-v1.md`
- `informes/03-gemini-deepsearch.md`
- `apps/restaurant-hours-api/src/routes/telegram-webhook.ts`
- `apps/restaurant-hours-api/src/services/restaurant-hours.ts`
- `apps/restaurant-hours-api/src/scripts/set-telegram-webhook.ts`
- `apps/restaurant-hours-api/README.md`

---

## 2. Descripcion General

### 2.1 Estado actual (AS-IS, 2026-02-28)
Estado implementado en `apps/restaurant-hours-api`:
- API Express con `POST /message` y `POST /telegram/webhook`.
- Respuesta actual basada en horario (`abierto` / `cerrado`) usando reglas de `config.ts`.
- Envio de respuesta a Telegram via `sendMessage`.
- Flujo Docker + ngrok para exponer webhook y registrar URL dinamica.
- Suite de tests unitarios/integracion para rutas, servicios y utilidades de webhook.
- Dependencia `convex` instalada y variables en `.env.local`, pero **sin schema ni funciones de negocio** (solo `convex/_generated`).

### 2.2 Vision objetivo (TO-BE MVP final)
Construir un asistente conversacional capaz de:
- iniciar y sostener conversacion por sesion,
- captar pedidos por turnos, validar catalogo y calcular total,
- persistir estado en Convex de forma consistente,
- evolucionar luego a handoff humano, observabilidad avanzada y canal productivo final.

### 2.3 Usuarios y Stakeholders
| Stakeholder | Descripcion |
|---|---|
| Cliente final | Usuario que conversa por Telegram/WhatsApp |
| Operador del restaurante | Recibe pedidos confirmados |
| Dueno/administrador | Busca conversion, velocidad y menor friccion |
| Equipo de desarrollo | Implementa backend, reglas y roadmap |

### 2.4 Supuestos y Dependencias
- El sistema sigue en pre-produccion.
- Telegram Bot API permanece como canal de trabajo en Fase 0-1.
- Convex estara disponible para persistencia de sesiones y pedidos.
- El catalogo inicial de productos/precios existira en Convex.

### 2.5 Restricciones
- Evitar expansion prematura de arquitectura (microservicios, multi-canal, IaC completa).
- Mantener compatibilidad con el webhook actual.
- Priorizar consistencia de estado y trazabilidad funcional antes de escalar infraestructura.

---

## 3. Requerimientos Funcionales (RF)

### 3.1 Fase 0 - Inicio de conversacion y apertura
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-201 | El sistema debe recibir updates de Telegram y extraer `chat_id`, `text` y `update_id`. | Alta |
| RF-202 | Debe crear o recuperar una sesion conversacional en Convex por `chat_id`. | Alta |
| RF-203 | Debe persistir cada mensaje entrante en Convex como evento de conversacion. | Alta |
| RF-204 | Ante saludo/inicio, debe responder bienvenida + estado actual de apertura. | Alta |
| RF-205 | Ante consulta de horario/apertura, debe responder con logica determinista de horario. | Alta |
| RF-206 | Debe persistir la respuesta saliente del asistente en Convex. | Alta |

### 3.2 Fase 1 - Toma de pedido inicial
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-210 | El sistema debe detectar intencion de pedido y abrir/continuar un `order_draft` por sesion. | Alta |
| RF-211 | Debe extraer items y cantidades del mensaje actual (cantidad por defecto = 1). | Alta |
| RF-212 | Debe validar cada item contra catalogo/precios en Convex. | Alta |
| RF-213 | Si hay item invalido, debe marcar `error_producto` y solicitar correccion. | Alta |
| RF-214 | Debe mantener estado de pedido: `incompleto`, `completo`, `error_producto`. | Alta |
| RF-215 | Debe identificar campos faltantes y preguntar solo lo faltante. | Alta |
| RF-216 | Debe calcular subtotal/total con funciones deterministas (no por LLM). | Alta |
| RF-217 | Debe permitir correcciones del usuario sobrescribiendo el valor previo. | Media |
| RF-218 | Con estado `completo`, debe persistir snapshot final del pedido en Convex. | Alta |
| RF-219 | Debe devolver confirmacion legible del pedido con items y total. | Alta |

### 3.3 Compatibilidad minima del servicio actual
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-220 | Debe conservar respuesta HTTP 200 para updates no procesables (evitar reintentos innecesarios de Telegram). | Alta |
| RF-221 | Debe mantener endpoint de estado basico (`/message`) para pruebas funcionales. | Media |

---

## 4. Requerimientos No Funcionales (RNF)

| ID | Requerimiento | Clasificacion |
|---|---|---|
| RNF-201 | Secretos (`TELEGRAM_BOT_TOKEN`, `CONVEX_*`) no deben exponerse en logs ni respuestas. | Restriccion Externa |
| RNF-202 | El sistema no debe inventar productos, precios ni horarios fuera de datos/configuracion. | Restriccion del Producto |
| RNF-203 | Objetivo de latencia E2E en chat: P95 <= 10s para Fase 0-1. | Restriccion del Producto |
| RNF-204 | El procesamiento debe ser idempotente por `update_id` para evitar duplicados. | Restriccion del Producto |
| RNF-205 | Cada mensaje debe dejar traza minima (session_id, timestamp, estado). | Restriccion Organizacional |
| RNF-206 | Deben existir pruebas API-level con payloads de Telegram para inicio/apertura/pedido. | Restriccion Organizacional |
| RNF-207 | Persistencia de estado de pedido debe ejecutarse en operaciones atomicas de Convex. | Restriccion del Producto |

---

## 5. Reglas de Negocio (BR)

| ID | Regla |
|---|---|
| BR-201 | Clave de sesion conversacional: `chat_id` de Telegram. |
| BR-202 | Si no se especifica cantidad, se asume `1`. |
| BR-203 | Item no encontrado en catalogo => estado `error_producto` y solicitud de correccion. |
| BR-204 | Correccion explicita del usuario reemplaza el dato previo del pedido. |
| BR-205 | Un pedido es `completo` solo si contiene items validos, tipo de entrega, metodo de pago y nombre del cliente; direccion solo si es delivery. |
| BR-206 | Horario de apertura se calcula con timezone/configuracion del servicio. |

---

## 6. Modelo de Datos (Conceptual, Convex)

### 6.1 Entidades principales

**sessions**
| Campo | Tipo | Descripcion |
|---|---|---|
| chatId | string/number | Identificador de sesion |
| status | string | activa/cerrada |
| createdAt | number | timestamp |
| updatedAt | number | timestamp |

**conversation_events**
| Campo | Tipo | Descripcion |
|---|---|---|
| sessionId | ref | Referencia a sesion |
| direction | string | inbound/outbound |
| messageText | string | Texto del mensaje |
| rawPayload | object | Payload original (cuando aplique) |
| createdAt | number | timestamp |

**catalog_items**
| Campo | Tipo | Descripcion |
|---|---|---|
| sku | string | Identificador de item |
| name | string | Nombre comercial |
| price | number | Precio unitario |
| active | boolean | Disponible/no disponible |

**order_drafts**
| Campo | Tipo | Descripcion |
|---|---|---|
| sessionId | ref | Referencia a sesion |
| items | array | Items y cantidades |
| deliveryType | string | delivery/pickup |
| address | string | Direccion si delivery |
| paymentMethod | string | Efectivo/transferencia/etc |
| customerName | string | Nombre cliente |
| status | string | incompleto/completo/error_producto |
| total | number | Total calculado |
| updatedAt | number | timestamp |

**orders**
| Campo | Tipo | Descripcion |
|---|---|---|
| sessionId | ref | Sesion origen |
| draftSnapshot | object | Copia del borrador final |
| status | string | confirmado/cancelado |
| createdAt | number | timestamp |

### 6.2 Claves logicas
- `chatId` como particion principal conversacional.
- 1 sesion activa puede tener 1 `order_draft` activo.
- `orders` se crea solo cuando `order_draft.status = completo`.

---

## 7. Interfaces Externas

| ID | Interfaz | Descripcion |
|---|---|---|
| IE-201 | Telegram Bot API | Recepcion y envio de mensajes |
| IE-202 | Convex | Persistencia de sesion, catalogo y pedidos |
| IE-203 | ngrok (dev) | Exposicion temporal del webhook local |
| IE-204 | Proveedor LLM (opcional Fase 1) | Soporte de parsing/intencion cuando reglas no alcancen |

---

## 8. Criterios de Aceptacion

| ID | Criterio |
|---|---|
| CA-201 | Primer mensaje de un `chat_id` nuevo crea sesion y evento en Convex. |
| CA-202 | Mensaje "hola" retorna bienvenida mas estado de apertura, y se guarda evento outbound. |
| CA-203 | Consulta de horario retorna respuesta consistente con configuracion horaria. |
| CA-204 | Pedido parcial genera preguntas solo de campos faltantes. |
| CA-205 | Producto inexistente dispara `error_producto` y no confirma pedido. |
| CA-206 | Pedido completo persiste snapshot final y retorna confirmacion con total. |
| CA-207 | Reenvio del mismo `update_id` no duplica eventos ni pedidos. |

---

## 9. Matriz de Trazabilidad (Minima)

| Objetivo | RF relacionados | Evidencia actual / futura |
|---|---|---|
| Iniciar conversacion con contexto | RF-201 a RF-206 | `src/routes/telegram-webhook.ts` + Convex (nuevo) |
| Responder apertura/horario | RF-205 | `src/services/restaurant-hours.ts` |
| Tomar pedido incremental | RF-210 a RF-219 | Convex schema + nuevas rutas/servicios |
| Evitar duplicados y corrupcion | RF-220, RNF-204, RNF-207 | tests webhook + tests de mutaciones |

---

## 10. Plan Progresivo hacia MVP Final

| Etapa | Objetivo | Alcance | Criterio de salida |
|---|---|---|---|
| Pre-MVP (actual) | Webhook Telegram operativo | Horario abierto/cerrado + Docker/ngrok + tests base | Webhook estable en local |
| Fase 0 (inicio) | Fundacion conversacional con Convex | Sesiones, eventos, saludo/inicio, apertura persistida | Conversacion inicial end-to-end con estado persistido |
| Fase 1 (pedido) | Toma de pedido inicial | Draft de pedido, validacion catalogo, faltantes, total, confirmacion | Pedido completo guardado y confirmado por chat |
| Fase 2 (siguiente) | Robustez funcional | FAQ/menu mas amplio, correcciones complejas, handoff minimo | Piloto controlado con casos reales |
| Fase 3 (MVP final) | Operacion escalable | Canal productivo final, observabilidad y despliegue industrializado | Go-live con SLAs definidos |

**Decision de esta version (v2-codex):** ejecutar primero **Fase 0 + Fase 1** con el stack actual y Convex, sin ampliar alcance a WhatsApp/Kapso/Cloud Run hasta validar flujo de pedido end-to-end.

---

## 11. Pendientes y TBD

| ID | Descripcion |
|---|---|
| TBD-201 | Definir si parsing de pedido en Fase 1 sera solo reglas o hibrido reglas+LLM. |
| TBD-202 | Definir estrategia de carga inicial y mantenimiento de `catalog_items`. |
| TBD-203 | Definir contrato minimo de handoff humano para Fase 2. |
| TBD-204 | Definir arquitectura de despliegue productivo (Cloud Run/Terraform) cuando Fase 1 este estable. |
| TBD-205 | Definir canal productivo final y plan de migracion Telegram -> canal final. |

---

## 12. Control de Versiones

| Version | Fecha | Autor | Cambios |
|---|---|---|---|
| 1.0 | 2026-02-27 | Equipo | SRS inicial pre-produccion |
| 2.0-codex | 2026-02-28 | Codex + Equipo | Plan incremental hacia MVP final, con foco en Fase 0+1 e integracion Convex |
