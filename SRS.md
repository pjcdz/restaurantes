# SRS - Asistente Conversacional para Restaurantes

Version: 0.1 (borrador inicial)
Fecha: 2026-02-27
Estado: Draft para validacion con stakeholders

## 1. Introduccion

### 1.1 Proposito
Este documento define los requerimientos de software (SRS/ERS) para un asistente conversacional orientado a restaurantes. El sistema actual opera sobre flujos de n8n y permite:
- Responder consultas frecuentes (menu, horarios, metodos de pago, etc.).
- Guiar y registrar pedidos.
- Mantener contexto conversacional por cliente.

### 1.2 Alcance
El alcance de esta version cubre lo que existe hoy en el repositorio:
- Workflows n8n:
  - `n8n/MVP copy-2.json`
  - `n8n/Apertura-2.json`
  - `n8n/Preguntas.json`
- Documentacion base y criterios de ingenieria de requerimientos tomados de `libro.txt`.
- Contexto funcional y pendientes identificados en `transcript.txt`.

Fuera de alcance en esta version:
- Cualquier contenido dentro de `qdrant_storage`.
- Implementacion completa de CRM externo para handoff humano (queda como TBD).
- Implementacion de agentes de voz en produccion (queda como roadmap).

### 1.3 Definiciones y abreviaturas
- SRS/ERS: Software Requirements Specification / Especificacion de Requerimientos de Software.
- RF: Requerimiento funcional.
- RNF: Requerimiento no funcional.
- TBD: To Be Defined.
- Handoff humano: Derivacion de conversacion del bot a una persona.

### 1.4 Referencias
- `libro.txt` (estructura SRS, trazabilidad, validacion, criterios de calidad).
- `transcript.txt` (objetivos de negocio, decisiones y pendientes funcionales).
- `n8n/*.json` (comportamiento implementado).

## 2. Descripcion general del sistema

### 2.1 Perspectiva del sistema
El sistema es un asistente de mensajeria que usa un flujo orquestador y subflujos:
- Flujo principal (`MVP copy`): recibe mensaje por Telegram, enruta intencion y redacta respuesta final.
- Subflujo `Preguntas`: consulta base de Menu y FAQ para responder informacion.
- Subflujo `Apertura`: valida y consolida pedido en curso, calcula total y actualiza estado.

### 2.2 Usuarios y stakeholders
- Cliente final del restaurante (usuario de mensajeria).
- Operador del restaurante (quien recibe pedidos validados).
- Administrador/dueno del restaurante (objetivo comercial y calidad de atencion).
- Equipo de desarrollo/automatizacion (mantenimiento de flujos y prompts).

### 2.3 Objetivos de negocio
- Reducir friccion en toma de pedidos por chat.
- Aumentar conversion de consultas a pedidos.
- Estandarizar respuestas de menu/FAQ sin inventar datos.
- Mantener trazabilidad minima del estado de pedido por telefono/chat.

### 2.4 Supuestos y dependencias
- n8n disponible y operativo.
- Credenciales de OpenAI, Telegram y Postgres configuradas en entorno.
- Tablas de datos existentes y actualizadas: `Pedidos`, `Precios`, `Menu`, `FAQ`.
- Canal actual de ejecucion: Telegram (WhatsApp aparece como objetivo futuro/TBD).

### 2.5 Restricciones
- Respuestas dependen de calidad de prompts y de tablas de datos.
- Derivacion a humano no esta cerrada end-to-end en esta version.
- El sistema debe operar con informacion estructurada estricta para evitar errores de parseo.

## 3. Requerimientos funcionales (RF)

### 3.1 Recepcion y contexto
- RF-001: El sistema debe recibir mensajes entrantes desde Telegram.
- RF-002: El sistema debe extraer identificador del cliente (`telcliente`) y contenido (`mensajecliente`).
- RF-003: El sistema debe buscar un pedido existente por telefono/chat id.
- RF-004: Si no existe pedido para el cliente, el sistema debe crear un registro inicial.
- RF-005: El sistema debe mantener memoria conversacional por cliente (session key por telefono).

### 3.2 Orquestacion de intenciones
- RF-006: El sistema debe clasificar la consulta en al menos estas rutas: preguntas frecuentes, gestion de pedido, derivacion a humano.
- RF-007: El sistema debe invocar subworkflow `Preguntas` para menu/FAQ/saludos/info general.
- RF-008: El sistema debe invocar subworkflow `Apertura` cuando exista intencion de compra o avance de pedido.
- RF-009: El sistema debe invocar flujo de derivacion humana cuando se detecte queja, enojo o solicitud explicita de atencion humana (TBD tecnico parcial).

### 3.3 Preguntas frecuentes
- RF-010: El subworkflow `Preguntas` debe consultar herramientas de datos `Menu` y/o `FAQ` segun la intencion.
- RF-011: Ante consulta compuesta (ej. precio + horario), el sistema debe poder consultar ambas fuentes.
- RF-012: Si no hay datos para responder, el sistema debe devolver una senal de no encontrado (`DATO_NO_ENCONTRADO`) sin inventar contenido.

### 3.4 Gestion de pedidos
- RF-013: El subworkflow `Apertura` debe construir estado acumulado del pedido combinando historial + ultimo mensaje.
- RF-014: El sistema debe validar producto contra la tabla `Precios`.
- RF-015: El sistema debe inferir `Retiro en sucursal` cuando detecte intenciones de pickup/retiro.
- RF-016: Si no se especifica cantidad, el sistema debe asumir cantidad = 1.
- RF-017: El sistema debe calcular total como `precio_unitario * cantidad`.
- RF-018: El sistema debe marcar pedido `completo`, `incompleto` o `error_producto`.
- RF-019: El sistema debe identificar campos faltantes y solicitarlos al cliente.
- RF-020: Solo cuando el estado sea `completo`, el sistema debe actualizar tabla `Pedidos` con direccion, pedido y total.

### 3.5 Redaccion y salida
- RF-021: El sistema debe transformar salida tecnica interna en respuesta legible para cliente.
- RF-022: La redaccion final debe respetar la instruccion tecnica del agente de control.
- RF-023: El sistema debe enviar la respuesta final al mismo chat de origen.

### 3.6 Gestion de errores
- RF-024: El sistema debe manejar errores de parseo/salida sin detener completamente el flujo.
- RF-025: En caso de inconsistencia en herramientas, el sistema debe retornar mensaje controlado para continuar la conversacion.

## 4. Requerimientos no funcionales (RNF)

### 4.1 Seguridad y privacidad
- RNF-001: Las credenciales API no deben exponerse en respuestas al usuario.
- RNF-002: El sistema debe minimizar exposicion de datos personales y operar bajo principio de menor privilegio.
- RNF-003: Las respuestas no deben filtrar estructura interna, IDs o detalles sensibles de infraestructura.

### 4.2 Calidad de informacion
- RNF-004: El sistema no debe inventar productos, precios, horarios ni politicas.
- RNF-005: La respuesta debe ser consistente con datos de `Menu`, `FAQ` y `Precios`.
- RNF-006: Debe mantenerse formato estructurado intermedio para interoperabilidad entre nodos.

### 4.3 Rendimiento y disponibilidad
- RNF-007: El tiempo de respuesta percibido al cliente debe ser apto para chat conversacional (objetivo inicial sugerido: <= 10s en condiciones normales; TBD medicion formal).
- RNF-008: El flujo debe tolerar mensajes consecutivos del mismo cliente sin corromper estado.

### 4.4 Mantenibilidad
- RNF-009: Los prompts y reglas de negocio deben poder versionarse y auditarse.
- RNF-010: Los requerimientos deben ser trazables desde objetivo de negocio hasta flujo y prueba.

## 5. Reglas de negocio

- RN-001: Un pedido se considera `completo` solo si tiene: producto valido, cantidad > 0, direccion o retiro, metodo de pago y nombre del cliente.
- RN-002: Si el usuario corrige un dato (ej. cambia metodo de pago), debe sobrescribirse el valor previo.
- RN-003: Si el usuario no menciona un campo en el nuevo mensaje, se conserva el valor previo en memoria.
- RN-004: Si producto no matchea con `Precios`, se marca `error_producto` y se solicita correccion.

## 6. Datos y modelo conceptual minimo

### 6.1 Entidades principales
- Pedido (`Pedidos`): `Hora`, `Fase`, `Direccion`, `Telefono`, `Pedido`, `TotalPedido`, `Despacho`, `Comprobante`.
- Catalogo de precios (`Precios`): producto y precio unitario.
- Menu (`Menu`): descripcion de items para consulta al cliente.
- FAQ (`FAQ`): horarios, metodos de pago, politicas, etc.

### 6.2 Claves logicas
- Clave de sesion de chat/memoria: `Telefono` (chat id en Telegram).
- La actualizacion de pedido se realiza filtrando por `Telefono`.

## 7. Interfaces externas

- IE-001 Telegram Bot API (trigger y envio de mensaje).
- IE-002 OpenAI Chat Models (agente de control, parser/redactor).
- IE-003 Google Gemini (presente en flujo como opcion/modelo auxiliar).
- IE-004 Postgres para memoria conversacional.
- IE-005 Data Tables de n8n (`Pedidos`, `Precios`, `Menu`, `FAQ`).

## 8. Criterios de aceptacion iniciales

- CA-001: Dada una consulta de menu, el bot responde items/precios usando datos reales y sin inventar.
- CA-002: Dado un pedido parcial, el bot solicita exactamente los faltantes detectados.
- CA-003: Dado un pedido completo, el bot confirma y persiste direccion/pedido/total en `Pedidos`.
- CA-004: Dada una pregunta fuera de base de conocimiento, el bot responde con no-encontrado o deriva.
- CA-005: Dada una queja o pedido explicito de humano, el flujo inicia handoff humano (estado actual: aceptacion parcial por TBD de integracion CRM).

## 9. Trazabilidad minima

| Objetivo de negocio | RF relacionados | Evidencia en repo |
|---|---|---|
| Responder consultas de forma automatica | RF-006, RF-007, RF-010, RF-011 | `n8n/MVP copy-2.json`, `n8n/Preguntas.json` |
| Convertir conversaciones en pedidos | RF-008, RF-013..RF-020 | `n8n/MVP copy-2.json`, `n8n/Apertura-2.json` |
| Mantener contexto por cliente | RF-005, RF-013 | `n8n/MVP copy-2.json`, `n8n/Apertura-2.json` |
| Escalar soporte con handoff humano | RF-009 | `n8n/MVP copy-2.json`, `transcript.txt` |

## 10. Riesgos, gaps y TBD

- TBD-001: Definir implementacion final de `Derivar Humano` con switch-off de bot e integracion CRM.
- TBD-002: Definir canal objetivo final (solo Telegram vs Telegram + WhatsApp).
- TBD-003: Definir politicas de seguridad, retencion y anonimizado de datos personales.
- TBD-004: Definir SLAs medibles (latencia, disponibilidad, tasa de error).
- TBD-005: Definir versionado formal de prompts y proceso de aprobacion de cambios.

## 11. Propuesta de siguientes entregables del SRS

- V0.2: Casos de uso detallados + escenarios alternativos y de error.
- V0.3: Matriz de trazabilidad completa (RF -> pruebas -> nodos n8n).
- V0.4: Plan de validacion con checklist de calidad del SRS (correcto, completo, consistente, verificable, trazable).
