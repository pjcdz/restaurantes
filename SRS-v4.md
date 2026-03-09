# Especificación de Requisitos de Software (SRS) v4 — Matriz de Trazabilidad Auditable

**Versión:** 4.2 (reconstrucción matrix-first)  
**Fecha:** 2026-03-08  
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
- Flujo de pagos (efectivo/transferencia) con validación de montos y vuelto.
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
- El reporte judge no expone P95 de latencia de forma explícita.
- El consolidado actual muestra `System Under Test: N/A` para tokens en el resumen de uso.

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
| RF-008 | Debe enrutar FAQ al subflujo correspondiente | [`routeByIntent()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:517), [`faq_handler`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:297) | [`faq-focus`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:348) | FAQ 4/5, falla F1 [`FAQ`](test_output.txt:136) | contradictory evidence | parcial | Alta | P1 | Respuesta informativa puede desviarse | Prioridad FAQ inconsistente en caso horario | Endurecer prioridad FAQ explícita | F1 >=75 sin menú colateral |
| RF-009 | Debe enrutar intenciones de compra a order | [`resolve_order_request`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:300) | [`builds an order draft...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:465) | Single/Multi 100% [`Single Orders`](test_output.txt:144), [`Multi-Item`](test_output.txt:140) | ok | cumplido | Alta | P1 | Core de ventas | - | Mantener | O1..O4 y MO1..MO3 >=75 |
| RF-010 | Debe derivar a humano ante queja | [`complaintHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:556) | [`handoff tests`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:159) | 4/4 handoff [`HANDOFF-01..04`](test_output.txt:463) | ok | cumplido | Alta | P1 | Manejo de incidentes sensibles | - | Mantener | HANDOFF 4/4 en 2 corridas |
| RF-011 | Debe consultar `Menu`/`FAQ` según intención | [`faqHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:727) | [`answers menu questions...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:288), [`answers horario...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:322) | Menu 4/4 y FAQ parcial [`Menu`](test_output.txt:139), [`FAQ`](test_output.txt:136) | ok | cumplido | Media | P2 | Consulta informativa principal | - | Mantener | M1..M4 >=75 y FAQ >=4/5 |
| RF-012 | Ante consulta compuesta, debe usar múltiples fuentes | [`buildRequestedActions()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:706) | Cobertura indirecta en flujos [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:703) | Sin caso judge explícito multi-fuente | weak evidence | parcial | Media | P2 | Calidad de respuestas mixtas | Falta caso dedicado | Agregar test judge compuesto | Caso compuesto >=75 en 2 corridas |
| RF-013 | Si no hay datos, retornar “no encontrado” sin inventar | [`fallback FAQ`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:755) | [`suggests available menu...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:846) | E5 seguro [`E5`](test_output.txt:409) | ok | cumplido | Media | P2 | Evita alucinación | - | Mantener | E5 >=75 sin datos inventados |
| RF-014 | Debe informar **solo efectivo** ante consultas de pago | Especificación en conflicto con implementación multi-método [`generatePaymentMethodsResponse()`](apps/restaurant-hours-api/src/services/payment-handler.ts:110) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:135) | Runtime ofrece transferencia/MP [`F2`](test_output.txt:211), [`F5`](test_output.txt:238) | contradictory evidence | no cumplido | Media | P2 | Requisito inconsistente con producto actual | Requisito quedó obsoleto vs RF-031/RF-035 | Resolver contradicción de especificación | RF-014 redefinido o removido con acta de cambio |
| RF-015 | FAQ no debe listar menú innecesariamente | [`faqHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:727) | [`keeps FAQ answers focused...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:348) | Falla grave en horario [`F1`](test_output.txt:202) | contradictory evidence | en regresión | Alta | P1 | Desvía intención del usuario | Prioridad/route FAQ no robusta en runtime | Hard rule FAQ-first para intents explícitos | F1 >=75 en 2 corridas |
| RF-016 | Debe construir estado acumulado de pedido | [`orderHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:795), [`applyCartAction()`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:245) | [`merges new structured items...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1003) | O/MO 100%; workflow con deuda [`W1..W3`](test_output.txt:346) | ok | parcial | Alta | P1 | Flujo venta multi-turno | Cierre workflow incompleto | Reforzar resumen final y coherencia de estado | W1..W3 >=85 sin omisiones |
| RF-017 | Debe validar productos contra `Precios` con validación estricta | [`findMatchingPriceEntry` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:765), [`order-schema-v2` Zod](apps/restaurant-hours-api/src/services/order-schema-v2.ts:66) | [`order-schema-v2.test.ts`](apps/restaurant-hours-api/src/services/order-schema-v2.test.ts:33) | E1/E4 pasan al umbral [`E1`](test_output.txt:373), [`E4`](test_output.txt:400) | weak evidence | parcial | Alta | P1 | Evita pedidos inválidos | Validación mezclada (lookup + Zod), cobertura parcial | Unificar validación estructural end-to-end | Casos inválidos >=85 con sugerencia completa |
| RF-018 | Debe inferir pickup cuando detecta intención retiro | [`isOrderFollowUpMessage()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1387) | [`continues pickup workflow...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:760) | Workflow pickup pasa mínimo [`W2`](test_output.txt:355) | ok | cumplido | Media | P2 | Completa logística pickup | - | Mantener | W2 >=85 y sin repregunta redundante |
| RF-019 | Si no se indica cantidad, asumir 1 | Comportamiento de extracción/order reply [`buildOrderReply()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1102) | [`O1` test interno](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:283) | O1 correcto [`O1`](test_output.txt:283) | ok | cumplido | Media | P2 | UX natural | - | Mantener | Casos qty implícita >=95 en unit |
| RF-020 | Debe calcular total = precio x cantidad | [`recalculateOrderTool()` invocado](apps/restaurant-hours-api/src/services/conversation-assistant.ts:890) | [`builds an order draft...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:485) | O2/MO2 correctos [`O2`](test_output.txt:292), [`MO2`](test_output.txt:328) | ok | cumplido | Alta | P1 | Correctitud económica | - | Mantener | O2/MO2 >=95 |
| RF-021 | Debe marcar pedido `completo/incompleto/error_producto` | [`orderDraft.estado`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:873), [`determineOrderStatus()` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:891) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:750) | Workflows completan con matices [`Workflows`](test_output.txt:145) | ok | cumplido | Alta | P1 | Control de ciclo de pedido | - | Mantener | Estado coherente en 2 corridas workflow |
| RF-022 | Debe identificar campos faltantes y solicitarlos | [`buildOrderFollowUp()` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1020) | [`completes an order...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:703) | W1/W2/W3 con deuda de completitud [`W1`](test_output.txt:346), [`W2`](test_output.txt:355) | contradictory evidence | parcial | Alta | P1 | Riesgo de cierre incompleto | Preguntas redundantes/omisiones en cierre | Regla de checklist obligatoria antes de confirmar | 0 omisiones de pago/nombre en workflows |
| RF-023 | Solo con pedido `completo` debe persistir en `Pedidos` | Persistencia ocurre también incompleto [`upsertOrderForSession`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:893) | Tests guardan estados incompletos [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:488) | Runtime no valida condición de persistencia | contradictory evidence | no cumplido | Alta | P1 | Semántica de persistencia ambigua | Implementación persiste borradores | Definir `pedido_borrador` separado o condicionar persistencia final | Ninguna escritura en `Pedidos` para estado incompleto |
| RF-024 | Debe soportar add/remove/replace/clear | [`detectCartAction()`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:111), [`applyCartAction()`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:245) | [`order-schema-v2.test.ts`](apps/restaurant-hours-api/src/services/order-schema-v2.test.ts:161) | Runtime visible add/clear; remove/replace no directos [`MO3`](test_output.txt:337), [`E2`](test_output.txt:382) | weak evidence | parcial | Media | P2 | Edición avanzada de carrito | Judge no cubre todas acciones explícitamente | Añadir casos judge para remove/replace | 4 acciones >=75 cada una |
| RF-025 | Debe resumir carrito al cliente | [`buildOrderReply()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1075), [`buildOrderTotalReply` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:904) | [`shows current order total...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:817) | O/MO altos, workflow parcial [`O1`](test_output.txt:283), [`W3`](test_output.txt:364) | weak evidence | parcial | Media | P2 | Transparencia de pedido | Resumen no siempre aparece en cierre | Forzar resumen final obligatorio | 100% workflows con resumen completo |
| RF-026 | Debe solicitar tipo de entrega delivery/pickup | [`buildOrderFollowUp()` path](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1176) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:792) | Se observa pregunta estándar [`O1`](test_output.txt:288) | ok | cumplido | Alta | P1 | Habilita logística | - | Mantener | 2 corridas O/MO sin omitir pregunta |
| RF-027 | Si es delivery, debe solicitar dirección | [`updateOrderDraftWithMessage()` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:889) | [`completes an order...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:742) | Workflow delivery pasa [`W1`](test_output.txt:346) | ok | cumplido | Alta | P1 | Evita pedidos sin entrega | - | Mantener | W1/W3 con dirección capturada |
| RF-028 | Debe calcular costo de envío cuando aplique | No hay cálculo explícito en flujo order/payment actual (solo FAQ informativa) [`faq response delivery`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:750) | Sin test de cálculo de envío en order flow | Runtime no muestra costo de envío integrado al total | no evidence | no cumplido | Media | P2 | Total final puede subestimar costo | Requisito no implementado en cálculo transaccional | Incorporar regla de envío al total | Caso delivery con envío aplicado y auditado |
| RF-029 | Debe informar métodos de pago disponibles | [`paymentHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:963), [`generatePaymentMethodsResponse()`](apps/restaurant-hours-api/src/services/payment-handler.ts:110) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:117) | FAQ pago bien pero payment flow falla [`F2`](test_output.txt:211), [`PAY-04`](test_output.txt:445) | contradictory evidence | en regresión | Crítica | P0 | Bloquea cierre transaccional confiable | Enrutamiento no resuelve intención de pago en contexto | Separar FAQ pago vs pago transaccional por estado | PAY-04 >=75 en 2 corridas |
| RF-030 | Debe aceptar pagos en efectivo | [`payment_amount` path](apps/restaurant-hours-api/src/services/conversation-assistant.ts:988) | [`validatePaymentAmount`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:82) | 0/5 payment; falla exacto/vuelto [`PAY-01`](test_output.txt:418), [`PAY-05`](test_output.txt:454) | contradictory evidence | en regresión | Crítica | P0 | Riesgo de cobro incorrecto | Parsing/contexto de pago no aplicado en runtime judge | Corregir prioridad de intent y estado de cobro | PAY-01/02/05 >=75 |
| RF-031 | Debe aceptar transferencias bancarias | [`generatePaymentMethodsResponse()`](apps/restaurant-hours-api/src/services/payment-handler.ts:134) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:229) | Evidencia FAQ positiva [`F2`](test_output.txt:211), sin cierre transaccional dedicado | weak evidence | parcial | Alta | P1 | Método alternativo de cobro | Falta prueba E2E de transferencia completa | Agregar flujo judge dedicado transferencia | Caso transferencia completo >=75 |
| RF-032 | Debe preguntar “con cuánto paga” cuando corresponde | [`El total... ¿Con cuanto vas a pagar?`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:971) | [`pickup workflow`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:798) | Runtime observa repregunta redundante [`W2`](test_output.txt:362) | contradictory evidence | parcial | Alta | P1 | Fricción UX en checkout | Falta control de ya-informado | Evitar repreguntas si monto ya provisto | 0 repreguntas redundantes en workflows |
| RF-033 | Debe validar `montoAbono >= total` | [`if (paymentAmount < orderDraft.total)`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:997) | [`validatePaymentAmount`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:95) | Fallos críticos de validación contextual [`PAY-02`](test_output.txt:427), [`PAY-05`](test_output.txt:454) | contradictory evidence | en regresión | Crítica | P0 | Riesgo financiero | La rama no se activa en conversaciones evaluadas | Corregir detección de intención y turno de pago | PAY-02/PAY-05 >=75 con diferencia explícita |
| RF-034 | Debe calcular vuelto = monto - total | [`generateChangeResponse()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1013), [`generateChangeResponse()`](apps/restaurant-hours-api/src/services/payment-handler.ts:157) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:157) | Fallo directo judge [`PAY-01`](test_output.txt:418), [`PAY-02`](test_output.txt:427) | contradictory evidence | en regresión | Crítica | P0 | Caja y operación comprometidas | Flujo transaccional no toma monto provisto | Disparar cálculo en mismo turno de pago | PAY-01/02/05 >=75 con vuelto correcto |
| RF-035 | Debe proporcionar datos bancarios (banco/alias/CBU) | [`transferenciaBanco/Alias/CBU`](apps/restaurant-hours-api/src/services/payment-handler.ts:135) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:149) | Runtime FAQ pago no evidencia campos completos [`F2`](test_output.txt:216) | weak evidence | parcial | Alta | P1 | Transferencias incompletas generan fricción | Plantilla runtime no siempre expone todos campos | Forzar plantilla mínima obligatoria | Respuesta transferencia incluye banco+alias+CBU |
| RF-036 | Debe transformar salida técnica en texto legible | [`formatResponseNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1031) | [`app.test.ts`](apps/restaurant-hours-api/src/app.test.ts:58) | Respuestas comprensibles en categorías múltiples [`DETAILED RESULTS`](test_output.txt:173) | ok | cumplido | Media | P2 | UX textual | - | Mantener | 0 respuestas vacías salvo handed_off |
| RF-037 | Redacción debe respetar instrucciones del agente de control | [`composeResponse` integración](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1063) | [`does not let the composer rewrite transactional replies`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1198) | Calidad heterogénea (tono/FAQ) [`F1`](test_output.txt:202) | weak evidence | parcial | Media | P2 | Consistencia de redacción | Reglas de estilo/precedencia incompletas | Añadir validación lexical + políticas de prioridad | 0 violaciones de estilo críticas |
| RF-038 | Debe responder al mismo chat de origen | [`processTelegramUpdate()`](apps/restaurant-hours-api/src/routes/telegram-webhook.ts:205), [`/message` retorna chatId](apps/restaurant-hours-api/src/routes/message.ts:63) | [`telegram-webhook.test.ts`](apps/restaurant-hours-api/src/telegram-webhook.test.ts:39), [`app.test.ts`](apps/restaurant-hours-api/src/app.test.ts:21) | Judge usa chat por test sin desvíos [`generateChatId()`](apps/restaurant-hours-api/src/judge/test-runner.ts:87) | ok | cumplido | Alta | P1 | Trazabilidad de conversación | - | Mantener | 100% respuestas con chatId consistente |
| RF-039 | Debe usar tono profesional sin “Che” | No existe filtro léxico bloqueante; respuestas directas bypass composer [`formatResponseNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1053) | Tests unit priorizan foco FAQ, no bloqueo léxico global [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:348) | Violación explícita [`G3`](test_output.txt:198), [`F1`](test_output.txt:207), [`M1`](test_output.txt:252) | contradictory evidence | no cumplido | Media | P2 | Riesgo reputacional UX | Falta guardrail de estilo en rutas directas | Filtro de términos prohibidos + test de regresión | 0 ocurrencias de “Che” en judge |
| RF-040 | Debe integrar inbox de handoff en `/admin` | Existen endpoints propios handoff [`/admin/handoffs`](apps/restaurant-hours-api/src/routes/admin.ts:306) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:224) | Judge no cubre UI/admin integration | no evidence | no cumplido | Alta | P1 | Operación humana no validada end-to-end | Integración external inbox no evidenciada en código revisado | Documentar/implementar integración real | Prueba E2E operador sobre inbox integrado |
| RF-041 | Operadores deben ver historial completo de conversaciones derivadas | Se listan sesiones handoff, no historial completo de mensajes [`getHandedOffSessions()`](apps/restaurant-hours-api/src/services/convex-admin-repository.ts:141) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:112) | Sin evidencia runtime de historial completo | weak evidence | no cumplido | Alta | P1 | Atención operativa incompleta | Modelo expone sesiones, no timeline detallado | Añadir endpoint/historial conversacional | Vista historial completo por chatId |
| RF-042 | Operadores deben poder reactivar IA tras handoff | [`POST /admin/handoffs/:chatId/reactivate`](apps/restaurant-hours-api/src/routes/admin.ts:319), [`reactivateSession()`](apps/restaurant-hours-api/src/services/convex-admin-repository.ts:188) | Cobertura indirecta repo/admin [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:224) | Sin evidencia judge de reactivación admin | weak evidence | parcial | Media | P2 | Recuperación operativa tras escalamiento | Falta prueba E2E operador | Agregar test integración de reactivación | Reactivación visible + bot responde nuevamente |
| RF-043 | Admin debe gestionar productos (CRUD) | [`/admin/products`](apps/restaurant-hours-api/src/routes/admin.ts:217), [`/admin/products/delete`](apps/restaurant-hours-api/src/routes/admin.ts:244) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:278), [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:308) | Sin cobertura judge (fuera de scope) [`46 tests`](test_output.txt:119) | ok | cumplido | Media | P2 | Operación de catálogo | - | Mantener + E2E opcional | CRUD productos 100% unit/integration |
| RF-044 | Admin debe gestionar FAQ (CRUD) | [`/admin/faq`](apps/restaurant-hours-api/src/routes/admin.ts:263), [`/admin/faq/delete`](apps/restaurant-hours-api/src/routes/admin.ts:286) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:324), [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:346) | Sin cobertura judge | ok | cumplido | Media | P2 | Mantenibilidad del conocimiento | - | Mantener | CRUD FAQ 100% unit/integration |
| RF-045 | Debe manejar cancelaciones de pedido | [`detectOrderCancellation()`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:146), [`orderHandlerNode()` clear](apps/restaurant-hours-api/src/services/conversation-assistant.ts:812) | [`order-schema-v2.test.ts`](apps/restaurant-hours-api/src/services/order-schema-v2.test.ts:61) | Cancelación pasa al umbral [`E2`](test_output.txt:382) | ok | parcial | Media | P2 | Control de reversión de pedido | Cobertura runtime mínima (75) | Añadir casos con pedido activo | E2-like >=85 y con pedido activo |
| RF-046 | Debe manejar errores técnicos con mensajes distintos | Fallbacks variados en degradación/error [`CircuitOpen fallback`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:451), [`unexpected_error fallback`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:484) | [`graceful-degradation.test.ts`](apps/restaurant-hours-api/src/resilience/graceful-degradation.test.ts:62) | Mensajes de fallback repetitivos en SEC/RES [`SEC-02`](test_output.txt:513), [`RES-02`](test_output.txt:558) | weak evidence | parcial | Media | P2 | Puede percibirse “robot” ante fallos | Plantillas genéricas repetidas | Introducir variación controlada de errores | >=3 variantes por clase de error |
| RF-047 | Debe derivar a humano tras 3+ errores | No se evidencia contador de errores consecutivos en flujo actual | Sin test dedicado de “3 errores” | Sin evidencia runtime dedicada | no evidence | no cumplido | Alta | P1 | Escalamiento tardío ante frustración | Regla no implementada/validada explícitamente | Implementar contador y threshold | Caso 3 errores => handoff automático |
| RF-048 | Debe aclarar ambigüedades | Mensajes de clarificación en order reply [`buildOrderReply()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1141) | [`asks for specific burger variant...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:892) | E4 pasa mínimo [`E4`](test_output.txt:400) | ok | parcial | Media | P2 | Reduce confusión | Clarificación incompleta (opciones parciales) | Listar opciones completas por categoría | E4 >=85 con lista completa |
| RF-049 | Debe confirmar cambio de tema con pedido activo | No se observa rama explícita de confirmación de cambio de tema | Sin test dedicado | Sin evidencia judge dedicada | no evidence | no cumplido | Media | P2 | Riesgo de pérdida de contexto | Escenario no instrumentado | Agregar intención y test específico | Caso topic-switch >=75 con decisión explícita |

### 3.2 Requisitos no funcionales (RNF-001..RNF-018)

| ID | Requisito normativo (testable) | Implementación (código) | Evidencia automatizada | Evidencia runtime | Calidad | Estado | Sev | Prio | Impacto funcional | Causa probable | Acción pendiente | Criterio de cierre |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RNF-001 | No exponer credenciales API en respuestas | Validación firma/JWT y errores controlados [`validateTelegramSignature()`](apps/restaurant-hours-api/src/routes/telegram-webhook.ts:41), [`JwtAuthMiddleware`](apps/restaurant-hours-api/src/middleware/jwt-auth.ts:364) | [`jwt-auth.test.ts`](apps/restaurant-hours-api/src/middleware/jwt-auth.test.ts:174), [`telegram-webhook.test.ts`](apps/restaurant-hours-api/src/telegram-webhook.test.ts:207) | No hay fuga visible en runtime judge [`DETAILED RESULTS`](test_output.txt:173) | weak evidence | cumplido | Alta | P1 | Seguridad básica | - | Monitoreo | 0 secretos en respuestas/logs de release |
| RNF-002 | Minimizar exposición de datos personales | Manejo de respuesta centrado en pedido y sin PII sensible en output estándar [`message route`](apps/restaurant-hours-api/src/routes/message.ts:63) | Cobertura indirecta en tests de rutas [`app.test.ts`](apps/restaurant-hours-api/src/app.test.ts:6) | Judge no evalúa privacidad explícita | weak evidence | parcial | Alta | P1 | Cumplimiento privacidad | Falta suite de privacidad dedicada | Añadir tests de redacción/PII | 0 PII sensible en outputs evaluados |
| RNF-003 | No filtrar estructura interna en respuestas | Fallbacks de negocio sin detalles internos [`faq fallback`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:755) | [`graceful-degradation.test.ts`](apps/restaurant-hours-api/src/resilience/graceful-degradation.test.ts:62) | SEC casos sin leak interno [`SEC-02`](test_output.txt:508) | ok | cumplido | Alta | P1 | Endurece superficie de ataque | - | Mantener | SEC-02/03/04 >=75 sostenido |
| RNF-004 | No inventar productos/precios/horarios | Lookup catálogo/precios [`findMatchingPriceEntry` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:765) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:846) | E1/E5 bien; F1 deficiente en foco horario [`E1`](test_output.txt:373), [`F1`](test_output.txt:202) | weak evidence | parcial | Alta | P1 | Calidad factual | Mezcla foco FAQ/menu en F1 | Reforzar reglas FAQ horario | F1>=75 sin desvío, E1/E5 >=75 |
| RNF-005 | Respuestas consistentes con datos Convex | Catálogo y precios vía repo [`getCatalogSnapshot()`](apps/restaurant-hours-api/src/services/convex-conversation-repository.ts:101) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:288) | Mayormente consistente; payment inconsistente en contexto [`PAY-04`](test_output.txt:445) | weak evidence | parcial | Alta | P1 | Integridad de negocio | Context-switch rompe consistencia transaccional | Ajustar routing por estado de pedido | 0 contradicciones factuales en payment |
| RNF-006 | Validación estricta (Zod) para evitar alucinaciones | Esquemas Zod en order schema [`orderExtractionSchemaV2`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:66) | [`order-schema-v2.test.ts`](apps/restaurant-hours-api/src/services/order-schema-v2.test.ts:18) | Runtime no demuestra cobertura total de validación | weak evidence | parcial | Media | P2 | Robustez de parsing | Validación no uniformemente end-to-end | Cobertura judge para inputs malformados | >=90% casos inválidos manejados |
| RNF-007 | Tiempo de respuesta P95 <= 10s | Métricas por request disponibles [`callMessageApi()`](apps/restaurant-hours-api/src/judge/test-runner.ts:26) | Tests de infraestructura/perf indirectos | Runtime reporta promedio por categoría, no P95 [`CATEGORY BREAKDOWN`](test_output.txt:133) | contradictory evidence | no cumplido | Alta | P1 | SLO no auditable | Reporte judge no publica P95 | Publicar P95 global y por categoría | P95 <=10s en 2 corridas release |
| RNF-008 | Tolerar mensajes consecutivos sin corromper estado | Dedupe y checkpoint [`isDuplicateMessage()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1232) | [`dedupe window test`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1281) | Workflows pasan con deuda [`W1..W3`](test_output.txt:346) | ok | parcial | Alta | P1 | Estabilidad conversacional | Cierre aún inconsistente | Afinar transitions finales | W1..W3 >=85 sin inconsistencias |
| RNF-009 | Checkpoints frecuentes para preservar contexto | Checkpointer compilado [`compile({ checkpointer })`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:363) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:507), [`convex-conversation-repository.test.ts`](apps/restaurant-hours-api/src/services/convex-conversation-repository.test.ts:43) | Runtime no expone frecuencia de checkpoint explícita | weak evidence | parcial | Media | P2 | Recuperación de contexto | Telemetría de checkpoint insuficiente | Exponer contador/frecuencia en reporte | Métrica checkpoint por sesión visible |
| RNF-010 | Prompts versionados en Git | Artefactos de prompt/código en repo (evidencia estructural) | Sin test de versionado explícito | No hay señal runtime de versión prompt | weak evidence | parcial | Baja | P3 | Trazabilidad de cambios | Falta convención/verificación automática | Añadir control CI de versionado prompts | CI falla si prompt sin versión |
| RNF-011 | Requisitos trazables hasta pruebas | Esta matriz + pruebas vinculadas por ID | Evidencia documental en este SRS y suites [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts:40) | Runtime enlazado por IDs judge [`FAILED TESTS`](test_output.txt:147) | ok | cumplido | Media | P2 | Auditoría end-to-end | - | Mantener | 100% IDs RF/RNF/CA con anclas |
| RNF-012 | Tests automatizados con AI Judge | Runner judge [`runTest()`](apps/restaurant-hours-api/src/judge/test-runner.ts:119), batería [`generateTestBattery()`](apps/restaurant-hours-api/src/judge/test-battery.ts:8) | [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts:49) | Corrida completa registrada [`AI-as-a-Judge Test Report`](test_output.txt:116) | ok | cumplido | Media | P2 | Gate de calidad automático | - | Mantener | Ejecución judge en pipeline por release |
| RNF-013 | Trazas Langfuse si está configurado | Entorno de trazas [`createConversationTraceContext()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:368), [`setTraceEnvironment()`](apps/restaurant-hours-api/src/services/conversation-tracing.ts:275) | [`langfuse.test.ts`](apps/restaurant-hours-api/src/services/langfuse.test.ts:105) | Diagnóstico activo [`Langfuse tracing enabled: true`](test_output.txt:8), [`Flush completed`](test_output.txt:603) | ok | cumplido | Media | P2 | Observabilidad operacional | - | Mantener | Trazas + flush presentes en cada corrida |
| RNF-014 | Métricas de latencia y tokens visibles | API expone tokens detallados [`metrics.tokens`](apps/restaurant-hours-api/src/routes/message.ts:68) | [`app.test.ts`](apps/restaurant-hours-api/src/app.test.ts:58) | Judge tokens visibles; SUT N/A [`TOKEN USAGE`](test_output.txt:127) | contradictory evidence | parcial | Alta | P1 | Costeo y performance incompletos | Runner no consolida tokens SUT | Corregir instrumentación SUT en resumen | Tokens SUT/Judge completos por corrida |
| RNF-015 | Cada traza debe incluir `langfuse.environment` | Aplicación de atributo [`applyTraceEnvironment()`](apps/restaurant-hours-api/src/services/conversation-tracing.ts:186), [`normalizeTraceEnvironment()`](apps/restaurant-hours-api/src/services/conversation-tracing.ts:167) | [`app.test.ts` tracing env](apps/restaurant-hours-api/src/app.test.ts:142) | Runtime no muestra atributo por traza en log | weak evidence | parcial | Media | P2 | Segmentación dev/prod/judge | Evidencia runtime de atributo no expuesta | Exportar atributo en reporte de trazas | 100% trazas con `langfuse.environment` |
| RNF-016 | Tono profesional sin informalidades excesivas | Sin guardrail global bloqueante en paths directos [`formatResponseNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1053) | Sin test léxico global | Violaciones explícitas [`G3`](test_output.txt:198), [`F1`](test_output.txt:207), [`M1`](test_output.txt:252) | contradictory evidence | no cumplido | Media | P2 | Percepción de marca | Falta filtro post-procesado | Añadir lint léxico y prueba automática | 0 informalidades prohibidas |
| RNF-017 | FAQ no debe incluir menú innecesario | Ruta FAQ existe [`faqHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:727) | [`faq-focus test`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:348) | F1 contradice requisito [`F1`](test_output.txt:202) | contradictory evidence | no cumplido | Alta | P1 | Precisión conversacional | Precedencia FAQ no estable | Endurecer reglas por intent explícito | F1>=75 sin listado menú |
| RNF-018 | Mensajes de error deben variar (no robot) | Fallbacks múltiples disponibles [`graceful-degradation`](apps/restaurant-hours-api/src/resilience/graceful-degradation.ts:1) | [`graceful-degradation.test.ts`](apps/restaurant-hours-api/src/resilience/graceful-degradation.test.ts:62) | Repetición de mensaje en SEC/RES [`SEC-02`](test_output.txt:513), [`RES-02`](test_output.txt:558) | weak evidence | parcial | Media | P2 | UX ante error | Predominio de plantilla genérica | Introducir variación controlada | 3+ variantes por tipo de error |

### 3.3 Criterios de aceptación (CA-001..CA-019)

| ID | Criterio de aceptación (normativo) | Implementación (código) | Evidencia automatizada | Evidencia runtime | Calidad | Estado | Sev | Prio | Impacto funcional | Causa probable | Acción pendiente | Criterio de cierre |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CA-001 | Menú responde items/precios reales sin inventar | [`faqHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:731) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:288) | Menu 4/4 [`M1..M4`](test_output.txt:247) | ok | cumplido | Media | P2 | Confianza catálogo | - | Mantener | M1..M4 >=75 sostenido |
| CA-002 | Pedido parcial solicita exactamente campos faltantes | [`buildOrderFollowUp()` uso](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1176) | [`completes an order...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:703) | W2 evidencia redundancia [`W2`](test_output.txt:362) | contradictory evidence | parcial | Alta | P1 | Cierre eficiente de pedido | Lógica de faltantes no idempotente | Evitar repreguntas si dato presente | 0 repreguntas en workflows |
| CA-003 | Pedido completo confirma y persiste | [`upsertOrderForSession()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:1007) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:747) | Workflows pasan [`W1..W3`](test_output.txt:346) | ok | cumplido | Alta | P1 | Confirmación operativa | - | Mantener | 100% completos con confirmación |
| CA-004 | Pregunta fuera de base => “no encontrado” | [`faq fallback`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:755) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:846) | E5 correcto [`E5`](test_output.txt:409) | ok | cumplido | Media | P2 | Respuesta segura | - | Mantener | E5 >=75 |
| CA-005 | Queja/solicitud humano inicia handoff | [`complaintHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:556) | [`conversation-assistant.test.ts`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:159) | HANDOFF 4/4 [`HANDOFF-01..04`](test_output.txt:463) | ok | cumplido | Alta | P1 | Escalamiento humano | - | Mantener | HANDOFF 4/4 por 2 corridas |
| CA-006 | Calcula vuelto correctamente en efectivo | [`generateChangeResponse()`](apps/restaurant-hours-api/src/services/payment-handler.ts:157) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:157) | Fallo total payment [`PAY-01/02/05`](test_output.txt:418) | contradictory evidence | no cumplido | Crítica | P0 | Riesgo caja | Flujo runtime no activa cálculo | Corregir routing y estado pago | PAY-01/02/05 >=75 |
| CA-007 | Rechaza montos menores al total | [`paymentAmount < total`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:997) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:95) | Fallos payment [`PAY-02`](test_output.txt:427), [`PAY-03`](test_output.txt:436) | contradictory evidence | no cumplido | Crítica | P0 | Riesgo cobro insuficiente | Contexto de pago no reconocido en runtime | Endurecer parser + estado cobro | PAY-02/PAY-03 >=75 |
| CA-008 | AI Judge valida flujos antes de deploy | [`runTest()`](apps/restaurant-hours-api/src/judge/test-runner.ts:119) | [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts:49) | Reporte judge completo [`AI-as-a-Judge Test Report`](test_output.txt:116) | ok | cumplido | Media | P2 | Calidad pre-release | - | Mantener | Corrida judge obligatoria por release |
| CA-009 | Handoff permite operadores ver y responder conversaciones | Listado handoffs [`/admin/handoffs`](apps/restaurant-hours-api/src/routes/admin.ts:306) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:224) | Sin evidencia runtime de respuesta operador | weak evidence | parcial | Alta | P1 | Operación humana incompleta | Falta prueba E2E operador | Implementar/cubrir ciclo operador-respuesta | Prueba E2E operador cerrada |
| CA-010 | Admin activa/desactiva productos en tiempo real | CRUD admin productos [`admin.ts`](apps/restaurant-hours-api/src/routes/admin.ts:217) | [`admin.test.ts`](apps/restaurant-hours-api/src/admin.test.ts:278) | Sin scope judge admin | ok | cumplido | Media | P2 | Gestión catálogo | - | Mantener | CRUD admin 100% verde |
| CA-011 | Carrito se acumula entre mensajes | [`applyCartAction(add)`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:253) | [`merges new structured items...`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:1003) | Multi-order 100% [`MO1..MO3`](test_output.txt:319) | ok | cumplido | Alta | P1 | Continuidad de venta | - | Mantener | MO1..MO3 >=95 |
| CA-012 | Soporta add/remove/replace/clear | [`detectCartAction()`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:111) | [`order-schema-v2.test.ts`](apps/restaurant-hours-api/src/services/order-schema-v2.test.ts:33) | Runtime no cubre explícito remove/replace | weak evidence | parcial | Media | P2 | Edición flexible | Cobertura judge incompleta | Añadir casos remove/replace | 4 acciones con evidencia runtime |
| CA-013 | Informa métodos de pago disponibles | [`paymentHandlerNode()`](apps/restaurant-hours-api/src/services/conversation-assistant.ts:963) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:117) | Contraste F2/F5 vs PAY-04 [`F2`](test_output.txt:211), [`PAY-04`](test_output.txt:445) | contradictory evidence | en regresión | Crítica | P0 | Bloqueo checkout | Inconsistencia de enrutamiento | Rutas separadas FAQ/transacción | PAY-04 >=75 |
| CA-014 | Proporciona datos bancarios para transferencia | [`generatePaymentMethodsResponse()`](apps/restaurant-hours-api/src/services/payment-handler.ts:135) | [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:149) | Runtime FAQ no muestra siempre CBU completo [`F2`](test_output.txt:216) | weak evidence | parcial | Alta | P1 | Fricción en pago | Plantilla no forzada en runtime | Forzar campos mínimos banco+alias+CBU | 100% respuestas transferencia completas |
| CA-015 | Maneja cancelaciones de pedidos | [`detectOrderCancellation()`](apps/restaurant-hours-api/src/services/order-schema-v2.ts:146) | [`order-schema-v2.test.ts`](apps/restaurant-hours-api/src/services/order-schema-v2.test.ts:61) | E2=75 [`E2`](test_output.txt:382) | ok | parcial | Media | P2 | Control de reversión | Cobertura mínima | Mejorar escenarios cancelación con pedido activo | E2-like >=85 |
| CA-016 | Deriva a humano tras 3+ errores | Sin contador explícito en flujo | Sin test dedicado | Sin evidencia runtime | no evidence | no cumplido | Alta | P1 | Escalamiento automático ausente | Requisito no instrumentado | Implementar regla 3 errores + test | Caso dedicado >=75 |
| CA-017 | Tono profesional sin “Che” | Sin filtro lexicográfico global | Sin test lexical global | Violación explícita [`G3`](test_output.txt:198), [`F1`](test_output.txt:207), [`M1`](test_output.txt:252) | contradictory evidence | no cumplido | Media | P2 | Reputación | Guardrail de estilo ausente | Añadir bloqueador lexical | 0 ocurrencias de “Che” |
| CA-018 | 40+ tests AI Judge aprobados (87%+) | Runner y batería activos [`test-runner.ts`](apps/restaurant-hours-api/src/judge/test-runner.ts:119) | [`test-battery.test.ts`](apps/restaurant-hours-api/src/judge/test-battery.test.ts:69) | Cumple 40/46 y 87% [`Pass Rate`](test_output.txt:124) | ok | cumplido | Media | P2 | Gate cuantitativo mínimo | - | Mantener | >=40 y >=87% en 2 corridas |
| CA-019 | 44+ tests AI Judge aprobados (96%+) | Infra existe pero objetivo no alcanzado | No test de objetivo hard 96% | Gap 4 tests [`40/46`](test_output.txt:124) | ok | no cumplido | Alta | P1 | Objetivo release avanzado no alcanzado | Regresión en payment + F1 | Corregir 6 fallos actuales | >=44/46 en 2 corridas |

### 3.4 Consistencia y contradicciones de especificación

| ID | Contradicción | Evidencia spec | Evidencia código/tests | Evidencia runtime | Impacto | Acción |
|---|---|---|---|---|---|---|
| C-01 | RF-014 (“solo efectivo”) contradice RF-031/RF-035 (transferencia) y comportamiento actual | Definiciones internas RF conflictivas en SRS previo | Multi-método implementado [`generatePaymentMethodsResponse()`](apps/restaurant-hours-api/src/services/payment-handler.ts:110) | F2/F5 mencionan transferencia/MP [`F2`](test_output.txt:211) | Ambigüedad contractual | Emitir RFC de cambio y normalizar requisitos de pago |
| C-02 | Unit tests de FAQ focalizado vs fallo runtime F1 | Requisito de foco FAQ | Test focalizado pasa [`faq-focus`](apps/restaurant-hours-api/src/services/conversation-assistant.test.ts:348) | F1 responde menú e informalidad [`F1`](test_output.txt:202) | Riesgo de falsa confianza por test local | Agregar tests de integración/judge para horario |
| C-03 | Payment implementado y unit-tested vs runtime 0/5 | RF-029..035 y CA-006/007/013/014 | Tests de payment verdes [`payment-handler.test.ts`](apps/restaurant-hours-api/src/services/payment-handler.test.ts:157) | Category payment 0/5 [`Payment`](test_output.txt:141) | Bloqueo release transaccional | Depurar routing de intención y estado de pago |
| C-04 | RNF-007 exige P95<=10s, reporte judge entrega promedio categoría | RNF-007 | Runner agrega latencias por test/categoría [`calculateCategoryStats()`](apps/restaurant-hours-api/src/judge/test-runner.ts:240) | Solo promedio visible [`CATEGORY BREAKDOWN`](test_output.txt:133) | No auditabilidad SLO | Publicar P95 explícito en reporte estándar |
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

#### 4.2.1 Runtime judge (observado)
- 46 tests totales: [`Total Tests: 46`](test_output.txt:119)
- 40 aprobados / 6 fallidos: [`Pass Rate 87%`](test_output.txt:124)
- Score promedio 80%: [`Average Score: 80%`](test_output.txt:123)
- Categoría crítica fallida: [`Payment 0/5`](test_output.txt:141)
- Fallos explícitos: [`F1`](test_output.txt:149), [`PAY-01..PAY-05`](test_output.txt:153)

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

#### 4.2.2 Consolidado por estado (RF+RNF+CA)
- **cumplido:** 31/86
- **parcial:** 33/86
- **no cumplido:** 16/86
- **en regresión:** 6/86
- *Nota:* Langfuse eval ([`test_output_langfuse.txt`](test_output_langfuse.txt:1)) confirma resultados similares - 40/46 pass (87%), Payment sigue siendo categoría bloqueante con 0/5.

#### 4.2.3 Señales de calidad transversal
- Fragilidad por umbral mínimo (muchos casos en 75): ejemplos [`W2=75`](test_output.txt:357), [`E1=75`](test_output.txt:375), [`SEC-01=75`](test_output.txt:501), [`RES-01=75`](test_output.txt:546)
- Tono no profesional observado: [`G3`](test_output.txt:198), [`F1`](test_output.txt:207), [`M1`](test_output.txt:252)
- Observabilidad incompleta de tokens SUT: [`System Under Test: N/A`](test_output.txt:129)
- *Nota Langfuse eval:* Mismos patrones observados - Payment scored 30-65/100, FAQ "horario" scored 35/100 con relevancia 10.

### 4.3 Clústeres bloqueantes y recomendación de gate de release

#### 4.3.1 Clústeres bloqueantes
1. **Pago transaccional roto (P0):** RF-029/030/033/034 y CA-006/007/013 en regresión/no cumplimiento.  
   Evidencia: [`Payment 0/5`](test_output.txt:141), [`PAY fails`](test_output.txt:153) | Langfuse eval confirma: [`Payment 0/5`](test_output_langfuse.txt:1)
2. **Desalineación FAQ/tono (P1-P2):** F1 falla foco + estilo.  
   Evidencia: [`F1`](test_output.txt:202), [`G3`](test_output.txt:198), [`M1`](test_output.txt:252) | Langfuse eval: FAQ "horario" scored 35/100
3. **Brecha de auditabilidad RNF (P1):** P95 ausente y tokens SUT N/A.  
   Evidencia: [`TOKEN USAGE`](test_output.txt:127), [`CATEGORY BREAKDOWN`](test_output.txt:133) | Langfuse muestra judge tokens: ~27,841 total

#### 4.3.2 Recomendación de gate
- **Recomendación:** **NO-GO** para release que incluya cobro real.
- **Condición mínima para GO:**
  - Payment >= 4/5 con score >=75 por caso, sin fallos críticos de contexto.
  - F1 >=75 sin desvío a menú.
  - Reporte con P95 y tokens SUT completos.

### 4.4 Riesgos abiertos y ambigüedades no resueltas

1. **Ambigüedad de requisito RF-014** frente a estrategia de pagos múltiple (conflicto normativo).  
2. **Cobertura judge de seguridad/resiliencia** no sustituye pruebas HTTP de controles técnicos.  
3. **Ausencia de P95** impide afirmar RNF-007 formalmente.  
4. **Tokens SUT en N/A** limita control de costo/eficiencia por release.  
5. **Evidencia runtime incompleta para admin/handoff operator cycle** (fuera de scope judge conversacional).

### 4.5 Conclusión auditada

- La trazabilidad completa RF/RNF/CA está consolidada en esta versión, con estado real y acciones pendientes.
- El sistema muestra desempeño conversacional general aceptable (87%), pero con **bloqueo crítico en pagos** y **contradicciones de especificación/calidad** que impiden un gate de salida seguro para operación transaccional.
- **Validación adicional:** La evaluación Langfuse ([`test_output_langfuse.txt`](test_output_langfuse.txt:1)) confirma resultados consistentes con el runner judge - 40/46 tests aprueban (87%), Payment continúa siendo la categoría más crítica con 0/5 tests aprobados.
- Las limitaciones de evidencia (P95, tokens SUT, cobertura E2E de admin/handoff y seguridad HTTP) quedan registradas explícitamente para cierre en siguiente ciclo.

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
