# Especificación de Requisitos de Software (SRS) v4 — Matriz de Trazabilidad Auditable

**Versión:** 4.4 (actualizada post-rerun global ampliado)  
**Fecha:** 2026-03-09  
**Propósito operativo:** reflejar el estado real de implementación, pruebas automatizadas y evidencia de ejecución (judge runtime), con criterio auditable.

---

## Índice de contenido

1. Introducción  
   1.1 Propósito del documento de requisitos  
   1.2 Alcance del proyecto  
   1.3 Definiciones, acrónimos y abreviaturas  
   1.4 Resumen del resto del documento  
   1.5 Referencias y fuentes de evidencia  
2. Descripción General  
   2.1 Perspectiva del producto  
   2.2 Funciones del producto (resumen)  
   2.3 Características de los usuarios  
   2.4 Limitaciones generales  
   2.5 Suposiciones y dependencias  
3. Requisitos Específicos  
   3.1 Requisitos funcionales (RF)  
   3.2 Requisitos no funcionales (RNF)  
   3.3 Criterios de aceptación (CA)  
   3.4 Consistencia y contradicciones de especificación  
4. Apéndices  
   4.1 Verificación explícita de duplicado runtime  
   4.2 Estado global de cobertura y calidad observada  
   4.3 Clústeres bloqueantes y recomendación de gate de release  
   4.4 Riesgos abiertos y ambigüedades no resueltas  
   4.5 Conclusión auditada  
5. Índice

---

## 1. Introducción

### 1.1 Propósito del documento de requisitos
Este documento SRS define y audita los requisitos del sistema de atención conversacional para restaurantes, con trazabilidad explícita entre:
1) implementación en código,  
2) pruebas automatizadas, y  
3) evidencia de ejecución runtime mediante AI Judge.

### 1.2 Alcance del proyecto
El alcance cubre requisitos funcionales (RF), no funcionales (RNF) y criterios de aceptación (CA) del sistema actual, con evaluación de estado por requisito (`cumplido`, `parcial`, `no cumplido`, `en regresión`) y calidad de evidencia (`ok`, `weak evidence`, `no evidence`, `contradictory evidence`).

### 1.3 Definiciones, acrónimos y abreviaturas
- **SRS / ERS:** Especificación de Requisitos de Software.
- **RF:** Requisito Funcional.
- **RNF:** Requisito No Funcional.
- **CA:** Criterio de Aceptación.
- **Sev:** Severidad (`Crítica`, `Alta`, `Media`, `Baja`).
- **Prio:** Prioridad (`P0`–`P3`).
- **Grado de necesidad (IEEE):** `P0-P1 = Esencial`, `P2 = Condicional`, `P3 = Optativo`.
- **Judge runtime:** Evidencia observada en ejecución de batería de pruebas conversacionales.
- **Tríada de evidencia:** código + tests automatizados + runtime judge.

### 1.4 Resumen del resto del documento
- La sección 2 presenta contexto de producto, funciones, usuarios, limitaciones y dependencias.
- La sección 3 contiene la especificación normativa completa (RF, RNF y CA) con trazabilidad.
- La sección 4 documenta evidencia consolidada, riesgos y criterio de liberación.
- La sección 5 provee índice rápido de referencias internas.

### 1.5 Referencias y fuentes de evidencia
Fuentes usadas (únicamente):
- Base de requerimientos e IDs: [`SRS-v4.md`](SRS-v4.md)
- Evidencia runtime principal (Judge runner): [`test_output.txt`](test_output.txt:1)
- Evidencia runtime Langfuse (eval platform): [`test_output_langfuse.txt`](test_output_langfuse.txt:1)
- Implementación y tests: [`apps/restaurant-hours-api/src/**/*.ts`](apps/restaurant-hours-api/src/app.ts:1), [`apps/restaurant-hours-api/src/**/*.test.ts`](apps/restaurant-hours-api/src/app.test.ts:1)

---

## 2. Descripción General

### 2.1 Perspectiva del producto
El sistema procesa mensajes de clientes (canal Telegram), gestiona contexto conversacional y pedidos, responde FAQ, soporta operaciones de pago y permite operación administrativa/handoff. Está instrumentado con pruebas automatizadas y evaluación AI Judge.

### 2.2 Funciones del producto (resumen)
El producto contempla, entre otras, las siguientes capacidades:
- Recepción de mensajes, identificación de sesión y memoria conversacional.
- Enrutamiento por intención (greeting/faq/order/complaint/payment).
- Flujo de pedido con carrito, cálculo de total, seguimiento de faltantes y confirmación.
- Flujo de pagos pre-MVP cash-only, con validación de montos y vuelto.
- Derivación a operador humano (handoff) y herramientas administrativas.
- Trazabilidad y observabilidad por pruebas y ejecución judge.

### 2.3 Características de los usuarios
- **Cliente final:** interactúa por chat y espera respuestas claras, correctas y consistentes.
- **Operador humano:** requiere visibilidad operativa para handoff, seguimiento y reactivación.
- **Equipo técnico (desarrollo/QA):** necesita trazabilidad requisito→código→test→runtime.
- **Stakeholders de release:** consumen criterios de gate y riesgos para decisión GO/NO-GO.

### 2.4 Limitaciones generales
- La batería judge actual es principalmente conversacional; no reemplaza pruebas HTTP técnicas de seguridad/admin.
- El resultado textual de `fc /b` no quedó persistido en un archivo del repositorio.
- El reporte judge ya expone P95 y el consolidado actual ya muestra tokens SUT visibles (`0` cuando no hay consumo de modelo en el sistema bajo prueba).
- La batería judge sigue siendo principalmente conversacional; no sustituye evidencia operativa manual de panel/admin ni pruebas HTTP duras de seguridad.

### 2.5 Suposiciones y dependencias
- Se asume equivalencia de evidencia entre [`test_output.txt`](test_output.txt:1) y [`test_output copy.txt`](test_output copy.txt:1).
- La trazabilidad por anclas de línea se considera válida para el estado actual del repositorio.
- La calidad de cierre de varios requisitos depende de incorporar cobertura E2E adicional (webhook, admin/handoff, seguridad HTTP, métricas SLO).

---

## 3. Requisitos Específicos

### 3.1 Requisitos funcionales (RF-001..RF-049)

| ID | Requisito normativo (testable) | Implementación (código) | Evidencia automatizada | Evidencia runtime | Calidad | Estado | Sev | Prio | Impacto funcional | Causa probable (si aplica) | Acción pendiente | Criterio de cierre (medible) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RF-001 | Debe recibir mensajes entrantes desde Telegram webhook | [`createTelegramWebhookRouter()`](apps/restaurant-hours-api/src/routes/telegram-webhook.ts:119) | [`telegram-webhook.test.ts`](apps/restaurant-hours-api/src/telegram-webhook.test.ts:7) | Sin caso judge HTTP-webhook directo; scope conversacional [`46 tests`](test_output.txt:119) | weak evidence | parcial | Media | P2 | Canal Telegram depende de capa webhook | Judge no ejerce endpoint webhook | Agregar escenario E2E webhook firmado | 2 corridas E2E webhook 200/401 según firma |
| RF-002 | Debe extraer `chat_id` del update Telegram | [`chatId = update.message?.chat?.id`](apps/restaurant-hours-api/src/routes/telegram-webhook.ts:161) | [`telegram-webhook.test.ts`](apps/restaurant-hours-api/src/telegram-webhook.test.ts:34) | Sin evidencia judge específica de extracción webhook [`46 tests`](test_output.txt:119) | weak evidence | parcial | Media | P2 | Identificación de conversación por usuario | Judge no cubre ruta webhook | Incluir test judge/meta HTTP | 100% pass en casos con `chat.id` válido/inválido |
| RF-003 | Debe buscar sesión por `chatId` en Convex | [`upsertSessionByChatId()`](apps/restaurant-hours-api/src/services/convex-conversation-repository.ts:66), [`loadSessionNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:585) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:130) | Flujo judge completo operativo [`40/46`](test_output.txt:124) | ok | cumplido | Alta | P1 | Persistencia de contexto por cliente | - | Monitoreo | 2 corridas judge sin pérdida de sesión |
| RF-004 | Si no existe sesión, debe crear registro inicial | [`upsertSessionByChatId()`](apps/restaurant-hours-api/src/services/convex-conversation-repository.ts:66) | [`createMemoryRepository()`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:39) | Sin evidencia runtime explícita de alta inicial | weak evidence | parcial | Media | P2 | Alta automática evita errores de primer contacto | Falta traza runtime específica | Agregar caso inicial en judge | Caso “primer mensaje” con estado creado y score >=75 |
| RF-005 | Debe mantener memoria conversacional por checkpoints | [`checkpointer`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:273), [`parsePersistedConversationState()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1181) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:507), [`convex-conversation-repository.test.ts`](apps/restaurant-hours-api/src/services/convex-conversation-repository.test.ts:43) | Workflows pasan aunque con deuda [`W1/W2/W3`](test_output.txt:346) | ok | cumplido | Alta | P1 | Mantiene continuidad multi-turno | - | Monitoreo de regresión | W1..W3 >=85 en 2 corridas |
| RF-006 | Si sesión `handed_off`, bot debe ignorar mensaje | [`checkHandedOffNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:535), [`silence_handoff`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:328) | [`stops sending automated replies...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:243) | Handoff estable [`HANDOFF-01..04`](test_output.txt:463) | ok | cumplido | Alta | P1 | Evita interferencia con operador humano | - | Mantener | 2 corridas handoff 4/4 |
| RF-007 | Debe clasificar intención (greeting/faq/order/complaint/payment) | [`analyzeMessageNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:608) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:322) | Cobertura de categorías judge [`CATEGORY BREAKDOWN`](test_output.txt:133) | ok | cumplido | Alta | P1 | Enrutamiento correcto | - | Mantener | Todas categorías activas sin caída total |
| RF-008 | Debe enrutar FAQ al subflujo correspondiente | [`routeByIntent()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:517), [`faq_handler`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:297) | [`faq-focus`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:348) | Rerun judge global 2026-03-09: FAQ `6/6`, `F1=95`, `F6=85` | ok | cumplido | Alta | P1 | Respuesta informativa ya prioriza FAQ correctamente | - | Monitoreo | FAQ >=75 sin menú colateral |
| RF-009 | Debe enrutar intenciones de compra a order | [`resolve_order_request`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:300) | [`builds an order draft...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:465) | Single/Multi 100% [`Single Orders`](test_output.txt:144), [`Multi-Item`](test_output.txt:140) | ok | cumplido | Alta | P1 | Core de ventas | - | Mantener | O1..O4 y MO1..MO3 >=75 |
| RF-010 | Debe derivar a humano ante queja | [`complaintHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:556) | [`handoff tests`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:159) | 4/4 handoff [`HANDOFF-01..04`](test_output.txt:463) | ok | cumplido | Alta | P1 | Manejo de incidentes sensibles | - | Mantener | HANDOFF 4/4 en 2 corridas |
| RF-011 | Debe consultar `Menu`/`FAQ` según intención | [`faqHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:727) | [`answers menu questions...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:288), [`answers horario...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:322) | Menu 4/4 y FAQ parcial [`Menu`](test_output.txt:139), [`FAQ`](test_output.txt:136) | ok | cumplido | Media | P2 | Consulta informativa principal | - | Mantener | M1..M4 >=75 y FAQ >=4/5 |
| RF-012 | Ante consulta compuesta, debe usar múltiples fuentes | [`buildRequestedActions()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:706) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:703), [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts) | Rerun judge global 2026-03-09: `F6=85` | ok | cumplido | Media | P2 | Respuesta compuesta validada live | - | Monitoreo | Caso compuesto >=75 |
| RF-013 | Si no hay datos, retornar “no encontrado” sin inventar | [`fallback FAQ`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:755) | [`suggests available menu...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:846) | E5 seguro [`E5`](test_output.txt:409) | ok | cumplido | Media | P2 | Evita alucinación | - | Mantener | E5 >=75 sin datos inventados |
| RF-014 | Debe informar **solo efectivo** ante consultas de pago | Flujo pre-MVP alineado en [`payment-handler.ts`](apps/restaurant-hours-api/src/services/payment-handler.ts) y [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts), [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts) | Los artefactos runtime versionados (`test_output*.txt`) quedaron desactualizados respecto del código actual | stale runtime evidence | cumplido | Media | P2 | Define correctamente el alcance pre-MVP | La evidencia judge live no fue regenerada después del cambio a cash-only | Reejecutar judge live y actualizar artefactos | FAQ/judge live responden "solo efectivo" en 2 corridas |
| RF-015 | FAQ no debe listar menú innecesariamente | [`faqHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:727) | [`keeps FAQ answers focused...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:348) | Rerun judge global 2026-03-09: `F1=95` y FAQ `6/6` | ok | cumplido | Alta | P1 | El foco FAQ quedó estabilizado en runtime | - | Monitoreo | F1 >=75 en 2 corridas |
| RF-016 | Debe construir estado acumulado de pedido | [`orderHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:795), [`applyCartAction()`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:245) | [`merges new structured items...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1003), [`reports the accumulated total...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1120) | Rerun judge global 2026-03-09: `MO1..MO5 100%`, `W1..W3 100%` | ok | cumplido | Alta | P1 | Estado acumulado validado en add/remove/replace y workflow | - | Monitoreo | W/MO >=75 sin omisiones |
| RF-017 | Debe validar productos contra `Precios` con validación estricta | [`findMatchingPriceEntry` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:765), [`order-schema-v2` Zod](apps/restaurant-hours-api/src/services/order-schema-v2.ts:66) | [`order-schema-v2.test.ts`](apps/restaurant-hours-api/src/services/order-schema-v2.test.ts:33) | E1/E4 pasan al umbral [`E1`](test_output.txt:373), [`E4`](test_output.txt:400) | weak evidence | parcial | Alta | P1 | Evita pedidos inválidos | Validación mezclada (lookup + Zod), cobertura parcial | Unificar validación estructural end-to-end | Casos inválidos >=85 con sugerencia completa |
| RF-018 | Debe inferir pickup cuando detecta intención retiro | [`isOrderFollowUpMessage()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1387) | [`continues pickup workflow...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:760) | Workflow pickup pasa mínimo [`W2`](test_output.txt:355) | ok | cumplido | Media | P2 | Completa logística pickup | - | Mantener | W2 >=85 y sin repregunta redundante |
| RF-019 | Si no se indica cantidad, asumir 1 | Comportamiento de extracción/order reply [`buildOrderReply()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1102) | [`O1` test interno](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:283) | O1 correcto [`O1`](test_output.txt:283) | ok | cumplido | Media | P2 | UX natural | - | Mantener | Casos qty implícita >=95 en unit |
| RF-020 | Debe calcular total = precio x cantidad | [`recalculateOrderTool()` invocado](apps/restaurant-hours-api/src/services/conversation-assistant.ts:890) | [`builds an order draft...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:485) | O2/MO2 correctos [`O2`](test_output.txt:292), [`MO2`](test_output.txt:328) | ok | cumplido | Alta | P1 | Correctitud económica | - | Mantener | O2/MO2 >=95 |
| RF-021 | Debe marcar pedido `completo/incompleto/error_producto` | [`orderDraft.estado`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:873), [`determineOrderStatus()` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:891) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:750) | Workflows completan con matices [`Workflows`](test_output.txt:145) | ok | cumplido | Alta | P1 | Control de ciclo de pedido | - | Mantener | Estado coherente en 2 corridas workflow |
| RF-022 | Debe identificar campos faltantes y solicitarlos | [`buildOrderFollowUp()` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1020) | [`completes an order...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:703) | Rerun judge global 2026-03-09: workflows `3/3`, `W1=85`, `W2=90`, `W3=90` | ok | cumplido | Alta | P1 | Checklist conversacional cubre faltantes críticos | - | Monitoreo | Workflows >=75 sin omisiones críticas |
| RF-023 | Solo con pedido `completo` debe persistir en `Pedidos` | Persistencia condicionada en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) con borrado de incompletos vía `deleteOrderForSession` | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1003) | Flujo live sin contradicción observada; borradores quedan en checkpoints | ok | cumplido | Alta | P1 | Semántica de persistencia ya separa borrador vs pedido final | - | Monitoreo | Ninguna escritura final para estado incompleto |
| RF-024 | Debe soportar add/remove/replace/clear | [`detectCartAction()`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:111), [`applyCartAction()`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:245) | [`order-schema-v2.test.ts`](apps/restaurant-hours-api/src/services/order-schema-v2.test.ts:161), [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1174) | Rerun judge global 2026-03-09: `MO3/MO4/MO5` y `E2/E6` >=75 | ok | cumplido | Media | P2 | Edición de carrito ya validada live | - | Monitoreo | 4 acciones >=75 |
| RF-025 | Debe resumir carrito al cliente | [`buildOrderReply()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1075), [`buildOrderTotalReply` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:904) | [`shows current order total...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:817) | Rerun judge global 2026-03-09: `single_order 4/4`, `multi_order 5/5`, `edge_case E3=75` | ok | cumplido | Media | P2 | Transparencia del carrito validada en runtime | - | Monitoreo | O/MO/E3 >=75 |
| RF-026 | Debe solicitar tipo de entrega delivery/pickup | [`buildOrderFollowUp()` path](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1176) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:792) | Se observa pregunta estándar [`O1`](test_output.txt:288) | ok | cumplido | Alta | P1 | Habilita logística | - | Mantener | 2 corridas O/MO sin omitir pregunta |
| RF-027 | Si es delivery, debe solicitar dirección | [`updateOrderDraftWithMessage()` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:889) | [`completes an order...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:742) | Workflow delivery pasa [`W1`](test_output.txt:346) | ok | cumplido | Alta | P1 | Evita pedidos sin entrega | - | Mantener | W1/W3 con dirección capturada |
| RF-028 | Debe calcular costo de envío cuando aplique | Integrado en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) usando FAQ de delivery cuando explicita monto | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts) | Sin rerun judge live posterior al cambio | weak evidence | cumplido | Media | P2 | Evita subestimar el total final | Falta refrescar evidencia runtime versionada | Reejecutar judge con caso delivery actualizado | Caso delivery judge refleja total con envío |
| RF-029 | Debe informar métodos de pago disponibles | FAQ y flujo transaccional cash-only en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) y [`payment-handler.ts`](apps/restaurant-hours-api/src/services/payment-handler.ts) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts), [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts), [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts) | Rerun judge `payment` 2026-03-09: `PAY-04=90`, categoría `5/5` | ok | cumplido | Crítica | P0 | Permite cerrar checkout dentro del alcance pre-MVP | La evidencia histórica completa sigue vieja, pero payment quedó revalidado live | Regenerar artefacto report si se quiere consolidado global | Payment methods >=75 en judge live |
| RF-030 | Debe aceptar pagos en efectivo | Captura de método, monto y cierre en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts), [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts) | Rerun judge `payment` 2026-03-09: `PAY-01/02/03/05 >=85` | ok | cumplido | Crítica | P0 | Cobro cash-only operativo | Falta consolidado global regenerado, no el bloque payment | Mantener | Payment cash-only 4 casos transaccionales >=85 |
| RF-031 | Debe aceptar transferencias bancarias | La base técnica futura existe en [`payment-handler.ts`](apps/restaurant-hours-api/src/services/payment-handler.ts:134) pero el flujo activo pre-MVP está alineado a cash-only | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:229) | El rerun live global 2026-03-09 responde cash-only de forma consistente | n/a pre-MVP | fuera de alcance pre-MVP | Alta | P1 | No bloquea el pre-MVP actual | Alcance producto definido como solo efectivo | Reabrir en fase posterior | No aplica en pre-MVP |
| RF-032 | Debe preguntar “con cuánto paga” cuando corresponde | Solicitud contextual en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts) | Judge `payment` 2026-03-09 pasa `5/5`; workflows previos ya verdes | ok | cumplido | Alta | P1 | Reduce fricción y completa checkout cash-only | Queda pendiente solo consolidado global actualizado | Mantener | Payment/Workflow sin repregunta crítica |
| RF-033 | Debe validar `montoAbono >= total` | Validación en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) y [`payment-handler.ts`](apps/restaurant-hours-api/src/services/payment-handler.ts) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts), [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts) | Judge `payment` 2026-03-09: `PAY-03=85` | ok | cumplido | Crítica | P0 | Evita cobro insuficiente | Sin bloqueo abierto en payment | Mantener | Caso de monto insuficiente >=75 live |
| RF-034 | Debe calcular vuelto = monto - total | Cálculo y resumen final en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) y [`payment-handler.ts`](apps/restaurant-hours-api/src/services/payment-handler.ts) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts), [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts) | Judge `payment` 2026-03-09: `PAY-05=85` | ok | cumplido | Crítica | P0 | Cierre de caja correcto | Sin bloqueo abierto en payment | Mantener | Cambio/vuelto >=75 live |
| RF-035 | Debe proporcionar datos bancarios (banco/alias/CBU) | La configuración futura existe en [`payment-handler.ts`](apps/restaurant-hours-api/src/services/payment-handler.ts:135) pero no forma parte del checkout activo pre-MVP | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:149) | El rerun live global 2026-03-09 valida cash-only | n/a pre-MVP | fuera de alcance pre-MVP | Alta | P1 | No bloquea el checkout pre-MVP | Alcance producto actual no usa transferencia | Reabrir en fase posterior | No aplica en pre-MVP |
| RF-036 | Debe transformar salida técnica en texto legible | [`formatResponseNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1031) | [`app.test.ts`](apps/restaurant-hours-api/src/app.test.ts:58) | Respuestas comprensibles en categorías múltiples [`DETAILED RESULTS`](test_output.txt:173) | ok | cumplido | Media | P2 | UX textual | - | Mantener | 0 respuestas vacías salvo handed_off |
| RF-037 | Redacción debe respetar instrucciones del agente de control | [`composeResponse` integración](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1063) | [`does not let the composer rewrite transactional replies`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1198) | Calidad heterogénea (tono/FAQ) [`F1`](test_output.txt:202) | weak evidence | parcial | Media | P2 | Consistencia de redacción | Reglas de estilo/precedencia incompletas | Añadir validación lexical + políticas de prioridad | 0 violaciones de estilo críticas |
| RF-038 | Debe responder al mismo chat de origen | [`processTelegramUpdate()`](apps/restaurant-hours-api/src/routes/telegram-webhook.ts:205), [`/message` retorna chatId](apps/restaurant-hours-api/src/routes/message.ts:63) | [`telegram-webhook.test.ts`](apps/restaurant-hours-api/src/telegram-webhook.test.ts:39), [`app.test.ts`](apps/restaurant-hours-api/src/app.test.ts:21) | Judge usa chat por test sin desvíos [`generateChatId()`](apps/restaurant-hours-api/src/judge/test-runner.ts:87) | ok | cumplido | Alta | P1 | Trazabilidad de conversación | - | Mantener | 100% respuestas con chatId consistente |
| RF-039 | Debe usar tono profesional sin “Che” | Filtro léxico aplicado en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts) | Los logs judge versionados son previos al guardrail | stale runtime evidence | cumplido | Media | P2 | Reduce riesgo reputacional | Falta rerun judge live para reemplazar artefactos viejos | Regenerar evidencia runtime | 0 ocurrencias de "Che" en nueva corrida judge |
| RF-040 | Debe integrar inbox de handoff en `/admin` | Existen endpoints propios handoff [`/admin/handoffs`](apps/restaurant-hours-api/src/routes/admin.ts:306) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:224) | Sigue sin evidencia operativa manual fuera del judge conversacional | weak evidence | parcial | Alta | P1 | Operación humana base existe, falta smoke manual del panel | Falta validación operador real sobre UI/admin | Ejecutar smoke operativo con operador | Historial + reactivación manual sin errores |
| RF-041 | Operadores deben ver historial completo de conversaciones derivadas | Historial expuesto por [`convex/conversations.ts`](apps/restaurant-hours-api/convex/conversations.ts), [`convex-admin-repository.ts`](apps/restaurant-hours-api/src/services/convex-admin-repository.ts) y [`admin.ts`](apps/restaurant-hours-api/src/routes/admin.ts) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts), [`convex-admin-repository.test.ts`](apps/restaurant-hours-api/src/services/convex-admin-repository.test.ts) | Sin evidencia E2E operador fuera de tests HTTP | weak evidence | cumplido | Alta | P1 | Mejora atención operativa | Falta evidencia manual/runtime del panel en producción | Validar con prueba E2E o smoke manual | Historial por `chatId` visible y completo |
| RF-042 | Operadores deben poder reactivar IA tras handoff | Reactivación implementada en [`admin.ts`](apps/restaurant-hours-api/src/routes/admin.ts) y [`convex-admin-repository.ts`](apps/restaurant-hours-api/src/services/convex-admin-repository.ts) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts) | Sin evidencia judge/admin live | weak evidence | cumplido | Media | P2 | Recuperación operativa tras escalamiento | Falta rerun E2E/admin live | Ejecutar smoke admin | Reactivación visible y bot vuelve a responder |
| RF-043 | Admin debe gestionar productos (CRUD) | [`/admin/products`](apps/restaurant-hours-api/src/routes/admin.ts:217), [`/admin/products/delete`](apps/restaurant-hours-api/src/routes/admin.ts:244) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:278), [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:308) | Sin cobertura judge (fuera de scope) [`46 tests`](test_output.txt:119) | ok | cumplido | Media | P2 | Operación de catálogo | - | Mantener + E2E opcional | CRUD productos 100% unit/integration |
| RF-044 | Admin debe gestionar FAQ (CRUD) | [`/admin/faq`](apps/restaurant-hours-api/src/routes/admin.ts:263), [`/admin/faq/delete`](apps/restaurant-hours-api/src/routes/admin.ts:286) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:324), [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:346) | Sin cobertura judge | ok | cumplido | Media | P2 | Mantenibilidad del conocimiento | - | Mantener | CRUD FAQ 100% unit/integration |
| RF-045 | Debe manejar cancelaciones de pedido | [`detectOrderCancellation()`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:146), [`orderHandlerNode()` clear](apps/restaurant-hours-api/src/services/conversation-assistant.ts:812) | [`order-schema-v2.test.ts`](apps/restaurant-hours-api/src/services/order-schema-v2.test.ts:61), [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1221) | Rerun judge global 2026-03-09: `E2=75`, `E6=85` | ok | cumplido | Media | P2 | Cancelación ya cubierta sin romper el flujo | - | Monitoreo | Cancelación con y sin pedido activo >=75 |
| RF-046 | Debe manejar errores técnicos con mensajes distintos | Fallbacks variados en degradación/error [`CircuitOpen fallback`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:451), [`unexpected_error fallback`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:484) | [`graceful-degradation.test.ts`](apps/restaurant-hours-api/src/resilience/graceful-degradation.test.ts:62) | Mensajes de fallback repetitivos en SEC/RES [`SEC-02`](test_output.txt:513), [`RES-02`](test_output.txt:558) | weak evidence | parcial | Media | P2 | Puede percibirse “robot” ante fallos | Plantillas genéricas repetidas | Introducir variación controlada de errores | >=3 variantes por clase de error |
| RF-047 | Debe derivar a humano tras 3+ errores | Contador y threshold en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1466), [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts) | Rerun judge global 2026-03-09: `HANDOFF-05=90` | ok | cumplido | Alta | P1 | Escalamiento automático validado en runtime | - | Monitoreo | Caso 3 errores => handoff automático |
| RF-048 | Debe aclarar ambigüedades | Mensajes de clarificación en order reply [`buildOrderReply()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1141) | [`asks for specific burger variant...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:892) | E4 pasa mínimo [`E4`](test_output.txt:400) | ok | parcial | Media | P2 | Reduce confusión | Clarificación incompleta (opciones parciales) | Listar opciones completas por categoría | E4 >=85 con lista completa |
| RF-049 | Debe confirmar cambio de tema con pedido activo | Rama explícita en [`buildTopicSwitchPrompt()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:881), [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts) | Rerun judge global 2026-03-09: `E7=75` | ok | cumplido | Media | P2 | Cambio de tema ya queda explícito sin perder el pedido | - | Monitoreo | Topic-switch >=75 |

### 3.2 Requisitos no funcionales (RNF-001..RNF-018)

| ID | Requisito normativo (testable) | Implementación (código) | Evidencia automatizada | Evidencia runtime | Calidad | Estado | Sev | Prio | Impacto funcional | Causa probable | Acción pendiente | Criterio de cierre |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RNF-001 | No exponer credenciales API en respuestas | Validación firma/JWT y errores controlados [`validateTelegramSignature()`](apps/restaurant-hours-api/src/routes/telegram-webhook.ts:41), [`JwtAuthMiddleware`](apps/restaurant-hours-api/src/middleware/jwt-auth.ts:364) | [`jwt-auth.test.ts`](apps/restaurant-hours-api/src/middleware/jwt-auth.test.ts:174), [`telegram-webhook.test.ts`](apps/restaurant-hours-api/src/telegram-webhook.test.ts:207) | No hay fuga visible en runtime judge [`DETAILED RESULTS`](test_output.txt:173) | weak evidence | cumplido | Alta | P1 | Seguridad básica | - | Monitoreo | 0 secretos en respuestas/logs de release |
| RNF-002 | Minimizar exposición de datos personales | Manejo de respuesta centrado en pedido y sin PII sensible en output estándar [`message route`](apps/restaurant-hours-api/src/routes/message.ts:63) | Cobertura indirecta en tests de rutas [`app.test.ts`](apps/restaurant-hours-api/src/app.test.ts:6) | Judge no evalúa privacidad explícita | weak evidence | parcial | Alta | P1 | Cumplimiento privacidad | Falta suite de privacidad dedicada | Añadir tests de redacción/PII | 0 PII sensible en outputs evaluados |
| RNF-003 | No filtrar estructura interna en respuestas | Fallbacks de negocio sin detalles internos [`faq fallback`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:755) | [`graceful-degradation.test.ts`](apps/restaurant-hours-api/src/resilience/graceful-degradation.test.ts:62) | SEC casos sin leak interno [`SEC-02`](test_output.txt:508) | ok | cumplido | Alta | P1 | Endurece superficie de ataque | - | Mantener | SEC-02/03/04 >=75 sostenido |
| RNF-004 | No inventar productos/precios/horarios | Lookup catálogo/precios [`findMatchingPriceEntry` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:765) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:846) | Rerun judge global 2026-03-09: FAQ `6/6`, edge `7/7`, sin contradicciones factuales observadas | ok | cumplido | Alta | P1 | Calidad factual estabilizada para el pre-MVP | - | Monitoreo | F1/E1/E5 >=75 sin datos inventados |
| RNF-005 | Respuestas consistentes con datos Convex | Catálogo y precios vía repo [`getCatalogSnapshot()`](apps/restaurant-hours-api/src/services/convex-conversation-repository.ts:101) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts) | Rerun judge global 2026-03-09 sobre catálogo live: `52/52`, payment `5/5`, FAQ `6/6` | ok | cumplido | Alta | P1 | Consistencia live confirmada con datos actuales de Convex | - | Monitoreo | 0 contradicciones factuales en corridas release |
| RNF-006 | Validación estricta (Zod) para evitar alucinaciones | Esquemas Zod en order schema [`orderExtractionSchemaV2`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:66) | [`order-schema-v2.test.ts`](apps/restaurant-hours-api/src/services/order-schema-v2.test.ts:18) | Runtime no demuestra cobertura total de validación | weak evidence | parcial | Media | P2 | Robustez de parsing | Validación no uniformemente end-to-end | Cobertura judge para inputs malformados | >=90% casos inválidos manejados |
| RNF-007 | Tiempo de respuesta P95 <= 10s | Métricas y agregado P95 en [`test-runner.ts`](apps/restaurant-hours-api/src/judge/test-runner.ts) y [`report-generator.ts`](apps/restaurant-hours-api/src/judge/report-generator.ts) | [`report-generator.test.ts`](apps/restaurant-hours-api/src/judge/report-generator.test.ts) | Rerun judge global 2026-03-09: `P95=25.5s` | ok | no cumplido | Alta | P1 | El SLO está medido y hoy no se cumple | Latencia judge/SUT multi-turno sigue alta, sobre todo en `workflow` | Optimizar latencia o relajar SLO por entorno | P95 visible y <=10s en release |
| RNF-008 | Tolerar mensajes consecutivos sin corromper estado | Dedupe y checkpoint [`isDuplicateMessage()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1232) | [`dedupe window test`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1281) | Workflows pasan con deuda [`W1..W3`](test_output.txt:346) | ok | parcial | Alta | P1 | Estabilidad conversacional | Cierre aún inconsistente | Afinar transitions finales | W1..W3 >=85 sin inconsistencias |
| RNF-009 | Checkpoints frecuentes para preservar contexto | Checkpointer compilado [`compile({ checkpointer })`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:363) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:507), [`convex-conversation-repository.test.ts`](apps/restaurant-hours-api/src/services/convex-conversation-repository.test.ts:43) | Runtime no expone frecuencia de checkpoint explícita | weak evidence | parcial | Media | P2 | Recuperación de contexto | Telemetría de checkpoint insuficiente | Exponer contador/frecuencia en reporte | Métrica checkpoint por sesión visible |
| RNF-010 | Prompts versionados en Git | Artefactos de prompt/código en repo (evidencia estructural) | Sin test de versionado explícito | No hay señal runtime de versión prompt | weak evidence | parcial | Baja | P3 | Trazabilidad de cambios | Falta convención/verificación automática | Añadir control CI de versionado prompts | CI falla si prompt sin versión |
| RNF-011 | Requisitos trazables hasta pruebas | Esta matriz + pruebas vinculadas por ID | Evidencia documental en este SRS y suites [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts:40) | Runtime enlazado por IDs judge [`FAILED TESTS`](test_output.txt:147) | ok | cumplido | Media | P2 | Auditoría end-to-end | - | Mantener | 100% IDs RF/RNF/CA con anclas |
| RNF-012 | Tests automatizados con AI Judge | Runner judge [`runTest()`](apps/restaurant-hours-api/src/judge/test-runner.ts:119), batería [`generateTestBattery()`](apps/restaurant-hours-api/src/judge/test-battery.ts:8) | [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts:49) | Corrida completa registrada [`AI-as-a-Judge Test Report`](test_output.txt:116) | ok | cumplido | Media | P2 | Gate de calidad automático | - | Mantener | Ejecución judge en pipeline por release |
| RNF-013 | Trazas Langfuse si está configurado | Entorno de trazas [`createConversationTraceContext()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:368), [`setTraceEnvironment()`](apps/restaurant-hours-api/src/services/conversation-tracing.ts:275) | [`langfuse.test.ts`](apps/restaurant-hours-api/src/services/langfuse.test.ts:105) | Diagnóstico activo [`Langfuse tracing enabled: true`](test_output.txt:8), [`Flush completed`](test_output.txt:603) | ok | cumplido | Media | P2 | Observabilidad operacional | - | Mantener | Trazas + flush presentes en cada corrida |
| RNF-014 | Métricas de latencia y tokens visibles | API expone tokens detallados [`metrics.tokens`](apps/restaurant-hours-api/src/routes/message.ts:68) | [`app.test.ts`](apps/restaurant-hours-api/src/app.test.ts:58), [`report-generator.test.ts`](apps/restaurant-hours-api/src/judge/report-generator.test.ts) | Rerun judge global 2026-03-09: tokens visibles, `System Under Test: 0 (0 prompt + 0 completion)` | ok | cumplido | Alta | P1 | Costeo y métricas ya son visibles aunque el SUT no consuma modelo | - | Monitoreo | Tokens SUT/Judge visibles por corrida |
| RNF-015 | Cada traza debe incluir `langfuse.environment` | Aplicación de atributo [`applyTraceEnvironment()`](apps/restaurant-hours-api/src/services/conversation-tracing.ts:186), [`normalizeTraceEnvironment()`](apps/restaurant-hours-api/src/services/conversation-tracing.ts:167) | [`app.test.ts` tracing env](apps/restaurant-hours-api/src/app.test.ts:142) | Runtime no muestra atributo por traza en log | weak evidence | parcial | Media | P2 | Segmentación dev/prod/judge | Evidencia runtime de atributo no expuesta | Exportar atributo en reporte de trazas | 100% trazas con `langfuse.environment` |
| RNF-016 | Tono profesional sin informalidades excesivas | Guardrail léxico y sanitización en [`formatResponseNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1053) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts) | Rerun judge global 2026-03-09 ya no muestra `Che`, pero persisten giros coloquiales aceptables (`qué tal`, `dale`) | weak evidence | parcial | Media | P2 | Riesgo reputacional bajó, pero el tono todavía es más casual que formal | Estilo conversacional sigue amigable/cercano | Endurecer guía de estilo si se busca tono más sobrio | 0 informalidades bloqueadas y tono consistente |
| RNF-017 | FAQ no debe incluir menú innecesario | Ruta FAQ existe [`faqHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:727) | [`faq-focus test`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:348) | Rerun judge global 2026-03-09: `F1=95` y FAQ `6/6`; menú solo aparece en caso compuesto `F6` | ok | cumplido | Alta | P1 | Precedencia FAQ estabilizada | - | Monitoreo | F1>=75 sin listado menú |
| RNF-018 | Mensajes de error deben variar (no robot) | Fallbacks múltiples disponibles [`graceful-degradation`](apps/restaurant-hours-api/src/resilience/graceful-degradation.ts:1) | [`graceful-degradation.test.ts`](apps/restaurant-hours-api/src/resilience/graceful-degradation.test.ts:62) | Repetición de mensaje en SEC/RES [`SEC-02`](test_output.txt:513), [`RES-02`](test_output.txt:558) | weak evidence | parcial | Media | P2 | UX ante error | Predominio de plantilla genérica | Introducir variación controlada | 3+ variantes por tipo de error |

### 3.3 Criterios de aceptación (CA-001..CA-019)

| ID | Criterio de aceptación (normativo) | Implementación (código) | Evidencia automatizada | Evidencia runtime | Calidad | Estado | Sev | Prio | Impacto funcional | Causa probable | Acción pendiente | Criterio de cierre |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CA-001 | Menú responde items/precios reales sin inventar | [`faqHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:731) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:288) | Menu 4/4 [`M1..M4`](test_output.txt:247) | ok | cumplido | Media | P2 | Confianza catálogo | - | Mantener | M1..M4 >=75 sostenido |
| CA-002 | Pedido parcial solicita exactamente campos faltantes | [`buildOrderFollowUp()` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1176) | [`completes an order...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:703) | Rerun judge global 2026-03-09: workflows `3/3`, `W1=85`, `W2=90`, `W3=90` | ok | cumplido | Alta | P1 | Cierre de faltantes validado para delivery/pickup/payment/name | - | Monitoreo | Workflows >=75 sin repreguntas críticas |
| CA-003 | Pedido completo confirma y persiste | [`upsertOrderForSession()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1007) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:747) | Workflows pasan [`W1..W3`](test_output.txt:346) | ok | cumplido | Alta | P1 | Confirmación operativa | - | Mantener | 100% completos con confirmación |
| CA-004 | Pregunta fuera de base => “no encontrado” | [`faq fallback`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:755) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:846) | E5 correcto [`E5`](test_output.txt:409) | ok | cumplido | Media | P2 | Respuesta segura | - | Mantener | E5 >=75 |
| CA-005 | Queja/solicitud humano inicia handoff | [`complaintHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:556) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:159) | HANDOFF 4/4 [`HANDOFF-01..04`](test_output.txt:463) | ok | cumplido | Alta | P1 | Escalamiento humano | - | Mantener | HANDOFF 4/4 por 2 corridas |
| CA-006 | Calcula vuelto correctamente en efectivo | Cálculo y cierre final en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) y [`payment-handler.ts`](apps/restaurant-hours-api/src/services/payment-handler.ts) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts), [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts) | Judge `payment` 2026-03-09: `PAY-05=85` | ok | cumplido | Crítica | P0 | Riesgo caja mitigado en código actual | Sin bloqueo abierto en payment | Mantener | Vuelto correcto >=75 live |
| CA-007 | Rechaza montos menores al total | Validación en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) y [`payment-handler.ts`](apps/restaurant-hours-api/src/services/payment-handler.ts) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts), [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts) | Judge `payment` 2026-03-09: `PAY-03=85` | ok | cumplido | Crítica | P0 | Riesgo de cobro insuficiente mitigado | Sin bloqueo abierto en payment | Mantener | Monto insuficiente >=75 live |
| CA-008 | AI Judge valida flujos antes de deploy | [`runTest()`](apps/restaurant-hours-api/src/judge/test-runner.ts:119) | [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts:49) | Reporte judge completo [`AI-as-a-Judge Test Report`](test_output.txt:116) | ok | cumplido | Media | P2 | Calidad pre-release | - | Mantener | Corrida judge obligatoria por release |
| CA-009 | Handoff permite operadores ver y responder conversaciones | Listado, historial y reactivación en [`admin.ts`](apps/restaurant-hours-api/src/routes/admin.ts) y [`convex-admin-repository.ts`](apps/restaurant-hours-api/src/services/convex-admin-repository.ts) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts), [`convex-admin-repository.test.ts`](apps/restaurant-hours-api/src/services/convex-admin-repository.test.ts) | Sigue faltando smoke operativo manual del panel con un operador real | weak evidence | parcial | Alta | P1 | La base técnica está; la evidencia manual todavía no | Falta E2E operativo del panel | Ejecutar smoke operativo con operador | Operador consulta historial y reactiva sesión sin errores |
| CA-010 | Admin activa/desactiva productos en tiempo real | CRUD admin productos [`admin.ts`](apps/restaurant-hours-api/src/routes/admin.ts:217) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:278) | Sin scope judge admin | ok | cumplido | Media | P2 | Gestión catálogo | - | Mantener | CRUD admin 100% verde |
| CA-011 | Carrito se acumula entre mensajes | [`applyCartAction(add)`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:253) | [`merges new structured items...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1003) | Multi-order 100% [`MO1..MO3`](test_output.txt:319) | ok | cumplido | Alta | P1 | Continuidad de venta | - | Mantener | MO1..MO3 >=95 |
| CA-012 | Soporta add/remove/replace/clear | [`detectCartAction()`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:111) | [`order-schema-v2.test.ts`](apps/restaurant-hours-api/src/services/order-schema-v2.test.ts:33), [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts) | Rerun judge global 2026-03-09: `MO3/MO4/MO5` y `E2/E6` >=75 | ok | cumplido | Media | P2 | Edición flexible validada live | - | Monitoreo | 4 acciones con evidencia runtime |
| CA-013 | Informa métodos de pago disponibles | FAQ y flujo cash-only alineados en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) y [`payment-handler.ts`](apps/restaurant-hours-api/src/services/payment-handler.ts) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts), [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts), [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts) | Judge `payment` 2026-03-09: `PAY-04=90`, categoría `5/5`; FAQ live actualizada a cash-only en Convex | ok | cumplido | Crítica | P0 | Checkout informativo consistente para pre-MVP | Solo falta artefacto global consolidado nuevo | Mantener | Payment methods >=75 live |
| CA-014 | Proporciona datos bancarios para transferencia | La configuración futura existe en [`payment-handler.ts`](apps/restaurant-hours-api/src/services/payment-handler.ts:135) pero el pre-MVP quedó definido como cash-only | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:149) | Rerun live global 2026-03-09 valida cash-only consistente | n/a pre-MVP | fuera de alcance pre-MVP | Alta | P1 | No bloquea el alcance actual | Alcance funcional actual excluye transferencia | Reabrir en fase posterior | No aplica en pre-MVP |
| CA-015 | Maneja cancelaciones de pedidos | [`detectOrderCancellation()`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:146) | [`order-schema-v2.test.ts`](apps/restaurant-hours-api/src/services/order-schema-v2.test.ts:61) | Rerun judge global 2026-03-09: `E2=75`, `E6=85` | ok | cumplido | Media | P2 | Cancelación ya validada con y sin pedido activo | - | Monitoreo | Cancelación >=75 |
| CA-016 | Deriva a humano tras 3+ errores | Contador y escalamiento automático en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts), [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts) | Rerun judge global 2026-03-09: `HANDOFF-05=90` | ok | cumplido | Alta | P1 | Escalamiento automático validado live | - | Monitoreo | Caso 3 errores deriva a handoff |
| CA-017 | Tono profesional sin “Che” | Guardrail aplicado en [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts) | Rerun judge global 2026-03-09 sin ocurrencias de `Che` | ok | cumplido | Media | P2 | Riesgo reputacional crítico mitigado | - | Monitoreo | 0 ocurrencias de "Che" |
| CA-018 | 40+ tests AI Judge aprobados (87%+) | Runner y batería activos [`test-runner.ts`](apps/restaurant-hours-api/src/judge/test-runner.ts:119) | [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts:69) | Cumple 40/46 y 87% [`Pass Rate`](test_output.txt:124) | ok | cumplido | Media | P2 | Gate cuantitativo mínimo | - | Mantener | >=40 y >=87% en 2 corridas |
| CA-019 | 44+ tests AI Judge aprobados (96%+) | Runner y batería ampliada en [`test-runner.ts`](apps/restaurant-hours-api/src/judge/test-runner.ts:119) y [`test-battery.ts`](apps/restaurant-hours-api/src/judge/test-battery.ts:8) | [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts:49) | Rerun judge global 2026-03-09: `52/52` aprobados, `100%` pass rate | ok | cumplido | Alta | P1 | Objetivo cuantitativo superado | - | Monitoreo | >=44 aprobados y >=96% pass rate |

### 3.4 Consistencia y contradicciones de especificación

| ID | Contradicción | Evidencia spec | Evidencia código/tests | Evidencia runtime | Impacto | Acción |
|---|---|---|---|---|---|---|
| C-01 | La especificación previa mezclaba alcance pre-MVP cash-only con requisitos de transferencia de fases posteriores | SRS v3 deja explícito el alcance “solo efectivo” del MVP | Código actual pre-MVP quedó alineado en [`payment-handler.ts`](apps/restaurant-hours-api/src/services/payment-handler.ts) y [`conversation-assistant.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.ts) | Rerun global 2026-03-09 responde cash-only de forma consistente | Contradicción resuelta en código, tests y runtime | Mantener RF/CA de transferencia fuera de alcance hasta fase posterior |
| C-02 | Unit tests de FAQ focalizado vs fallo runtime F1 | Requisito de foco FAQ | Test focalizado pasa [`faq-focus`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:348) | Rerun global 2026-03-09: `F1=95` y `F6=85` | Contradicción cerrada con evidencia live nueva | Mantener caso judge compuesto y FAQ horario en la batería |
| C-03 | Los artefactos runtime versionados de payment quedaron desfasados respecto del código y tests actuales | RF-029..035 y CA-006/007/013/014 | Suite local verde para pagos y flujo conversacional | Rerun global 2026-03-09: payment `5/5` | Contradicción cerrada a nivel live; el archivo histórico queda solo como referencia previa | Si se quiere artefacto versionado nuevo, exportar la última corrida |
| C-04 | RNF-007 exigía P95<=10s y el reporte histórico solo mostraba promedio | RNF-007 | Runner y reporte ya publican P95 en [`test-runner.ts`](apps/restaurant-hours-api/src/judge/test-runner.ts) y [`report-generator.ts`](apps/restaurant-hours-api/src/judge/report-generator.ts) | Rerun global 2026-03-09: `P95=25.5s` visible | Contradicción de reporte resuelta; queda un incumplimiento real de performance | Optimizar latencia o redefinir SLO por entorno |
| C-05 | Security/Resilience judge usa meta-mensajes conversacionales, no pruebas HTTP duras | CA/RNF de seguridad operativa | Casos meta en batería [`SEC-01..05`](apps/restaurant-hours-api/src/judge/test-battery.ts:546) | Respuestas genéricas aprobadas [`SEC-01`](test_output.txt:500), [`RES-02`](test_output.txt:553) | Riesgo de sobreestimar postura de seguridad | Complementar con pruebas HTTP de firma/JWT/rate-limit |

---

## 4. Apéndices

### 4.1 Verificación explícita de duplicado runtime

#### 4.1.1 Resultado
- Se comprobó igualdad binaria entre artefactos con `fc /b` (sin diferencias).
- Además, ambos logs contienen la misma cabecera de corrida (inicio) y mismo cierre de resultados.

#### 4.1.2 Anclas
- Inicio corrida A: [`test_output.txt`](test_output.txt:1)
- Inicio corrida B: [`test_output copy.txt`](test_output copy.txt:1)
- Cierre corrida A: [`OVERALL PASSED`](test_output.txt:590)
- Cierre corrida B: [`OVERALL PASSED`](test_output copy.txt:590)

#### 4.1.3 Limitación documentada
- El resultado textual de `fc /b` no está persistido en archivo del repositorio; se conserva evidencia anclada por contenido equivalente en ambos logs.

### 4.2 Estado global de cobertura y calidad observada

#### 4.2.1 Runtime judge histórico versionado
- 46 tests totales: [`Total Tests: 46`](test_output.txt:119)
- 40 aprobados / 6 fallidos: [`Pass Rate 87%`](test_output.txt:124)
- Score promedio 80%: [`Average Score: 80%`](test_output.txt:123)
- Ese artefacto queda solo como referencia histórica previa al cierre cash-only y a la ampliación de batería.

#### 4.2.1a Runtime Langfuse (eval platform - [`test_output_langfuse.txt`](test_output_langfuse.txt:1))
- 46 tests totales (eval platform)
- 40 aprobados / 6 fallidos: Pass Rate 87%
- Score promedio ~79%
- Categoría crítica fallida: Payment 0/5
- Fallos específicos:
  - FAQ: "Cual es el horario?" - score 35/100 (relevance: 10, completeness: 20, actionability: 40)
  - Payment: 5/5 fails - "Te pago con $50000" (30), "Pago con $20000" (30), "Pago con $5000 exactos" (30), "Tengo $10000 nada más" (65), "¿Cómo puedo pagar?" (35)
- Modelo evaluado: gemma-3-27b-it
- Token usage (judge): ~22,834 input / ~5,007 output / ~27,841 total

#### 4.2.1b Rerun live específico `payment` (2026-03-09)
- 5 tests totales, 5 aprobados / 0 fallidos
- Pass Rate 100%, Score promedio 86%
- P95 categoría payment: 16.5s
- Casos aprobados:
  - `PAY-01=85`
  - `PAY-02=85`
  - `PAY-03=85`
  - `PAY-04=90`
  - `PAY-05=85`

#### 4.2.1c Rerun live global ampliado (2026-03-09)
- 52 tests totales, 52 aprobados / 0 fallidos
- Pass Rate 100%, Score promedio 87%
- P95 global: 25.5s
- Tokens visibles:
  - `System Under Test: 0 (0 prompt + 0 completion)`
  - `Judge Agent: 31,715`
- Categorías destacadas:
  - FAQ `6/6`, promedio `91%`
  - Multi-order `5/5`, promedio `94%`
  - Handoff `5/5`, promedio `94%`
  - Payment `5/5`, promedio `86%`
  - Workflow `3/3`, promedio `88%`
- Casos añadidos y revalidados en esta corrida:
  - `F6` consulta compuesta FAQ+menú = `85`
  - `MO4` remove = `95`
  - `MO5` replace = `90`
  - `E6` cancelación con pedido activo = `85`
  - `E7` topic switch con pedido activo = `75`
  - `HANDOFF-05` handoff automático por 3 errores = `90`

#### 4.2.2 Consolidado por estado (RF+RNF+CA)
- La matriz de esta versión ya refleja el rerun live global ampliado del 2026-03-09, no solo la evidencia histórica versionada.
- La suite focalizada del repo quedó verde durante este cierre (`conversation-assistant`, `payment-handler`, `test-battery`, `report-generator`, `admin`, `convex-*`, `graceful-degradation`).
- Lo pendiente real ya no está en pagos/FAQ/carrito/handoff conversacional, sino en performance (`P95`) y evidencia operativa manual de admin/webhook.

#### 4.2.3 Señales de calidad transversal
- Persisten varios casos en el umbral mínimo de `75`, sobre todo en `edge_case`, `security` y `resilience`.
- El tono mejoró y ya no aparece `Che` en la nueva corrida, pero siguen respuestas con estilo amigable/casual (`qué tal`, `dale`) más que formal.
- La observabilidad de tokens SUT ya quedó visible; el problema residual es de performance, no de reporte.

### 4.3 Clústeres bloqueantes y recomendación de gate de release

#### 4.3.1 Clústeres bloqueantes
1. **Performance por encima del SLO (P1):** el rerun global deja `P95=25.5s`, muy por encima del objetivo `<=10s`.  
   Evidencia: `workflow` concentra la cola de latencia (`P95=47.7s`).
2. **Evidencia operativa manual pendiente (P1):** admin/handoff panel y webhook firmado siguen sin smoke manual/E2E fuera del judge conversacional.  
   Evidencia: el código y tests HTTP existen, pero no hay validación operativa humana documentada.
3. **Estilo todavía más casual que formal (P2):** ya no hay informalidades prohibidas tipo `Che`, pero quedan giros coloquiales que pueden no cumplir una guía de marca más sobria.  
   Evidencia: `G3`, `M1`, `F6` mantienen tono amistoso.

#### 4.3.2 Recomendación de gate
- **Recomendación funcional:** **GO pre-MVP** para el alcance conversacional cash-only.
- **Reserva explícita:** **NO-GO para un SLO estricto de performance** mientras `P95` siga por encima de `10s`.
- **Condición mínima para cierre total sin reservas:**
  - bajar `P95` global a `<=10s`, o
  - redefinir/documentar el SLO por entorno,
  - y ejecutar smoke manual de admin/handoff + webhook firmado.

### 4.4 Riesgos abiertos y ambigüedades no resueltas

1. **P95 global alto** frente al objetivo formal (`25.5s` vs `<=10s`).  
2. **Cobertura judge de seguridad/resiliencia** no sustituye pruebas HTTP de controles técnicos.  
3. **Evidencia manual incompleta para admin/handoff operator cycle** (fuera de scope judge conversacional).  
4. **Webhook Telegram firmado** sigue sin evidencia E2E manual/runtime específica.

### 4.5 Conclusión auditada

- La trazabilidad completa RF/RNF/CA está consolidada en esta versión, con estado real y acciones pendientes.
- La base actual queda consistente con el pre-MVP cash-only y con el flujo conversacional validado live (`52/52` judge).
- La limitación principal ya no es funcional sino operativa: performance (`P95`) y cobertura manual/E2E de panel admin y webhook.
- Las limitaciones abiertas pasan a ser de performance y operación humana, no de implementación base para el alcance pre-MVP conversacional.

---

## 5. Índice

### 5.1 Índice rápido de matrices
- Matriz RF completa: sección 3.1
- Matriz RNF completa: sección 3.2
- Matriz CA completa: sección 3.3
- Registro de contradicciones: sección 3.4

### 5.2 Índice de términos clave
- `RF`, `RNF`, `CA`, `Sev`, `Prio`, `P95`, `handoff`, `judge runtime`, `trazabilidad`, `NO-GO/GO`.

### 5.3 Criterios de calidad SRS considerados
En línea con el enfoque de calidad SRS del material de referencia, este documento mantiene foco en: **correcto**, **inequívoco**, **completo**, **consistente**, **comprobable**, **modificable** e **identificable**.
