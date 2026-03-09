# Especificacion de Requisitos de Software (SRS) v5
## Implementacion con Kapso.ai sobre baseline v4

**Version:** 5.0  
**Fecha:** 2026-03-09  
**Estado:** Borrador base para implementacion  
**Baseline heredada:** [`SRS-v4.md`](/Users/pjcdz/Documents/GitHub/restaurantes/SRS-v4.md)

---

## 1. Introduccion

### 1.1 Proposito
Este documento especifica los requisitos de la version v5 del sistema de asistente conversacional para restaurantes, cuyo objetivo es evolucionar desde el baseline pre-MVP validado en v4 hacia una implementacion operativa con **Kapso.ai** como capa de canal WhatsApp e inbox de handoff humano.

El documento sigue el criterio de `libro.txt`: separar requerimientos por origen y por tipo, formularlos de manera verificable y mantener trazabilidad entre negocio, usuario, sistema, evidencia y decisiones de alcance.

### 1.2 Alcance
La v5 cubre:
- migracion del canal principal desde Telegram/testing directo hacia WhatsApp mediante Kapso.ai;
- recepcion de webhooks de Kapso.ai;
- continuidad del orquestador conversacional actual;
- persistencia de sesiones, checkpoints y pedidos en Convex;
- operacion humana exclusivamente desde el dashboard e inbox de Kapso.ai, eliminando `/admin`;
- cierre operativo de seguridad, observabilidad y validacion E2E de ese flujo.

La v5 **no** redefine el producto completo desde cero. Parte de la base funcional ya cerrada en v4:
- FAQ y menu;
- toma de pedidos multi-turno;
- carrito acumulativo;
- cash-only pre-MVP;
- handoff por errores o por solicitud del cliente;
- judge conversacional ya estable.

### 1.3 Alcance fuera de esta version
Quedan fuera de alcance de v5 salvo decision posterior de producto:
- pagos por transferencia, links de pago o Mercado Pago;
- OCR de comprobantes;
- integraciones CRM ajenas a Kapso.ai;
- multitenancy para multiples restaurantes;
- automatizaciones de marketing no vinculadas al flujo de pedido.

### 1.4 Definiciones y acronimos
| Termino | Definicion |
|---|---|
| SRS / ERS | Especificacion de Requisitos de Software |
| RN | Requisito de Negocio |
| RU | Requisito de Usuario |
| RF | Requisito Funcional |
| RNF | Requisito No Funcional |
| CA | Criterio de Aceptacion |
| Handoff | Derivacion de la conversacion a operador humano |
| SUT | System Under Test |
| Inbox | Bandeja operativa de conversaciones en Kapso.ai |
| Session Key | Identificador unico de sesion conversacional |

### 1.5 Referencias
- [`libro.txt`](/Users/pjcdz/Documents/GitHub/restaurantes/libro.txt)
- [`SRS-v4.md`](/Users/pjcdz/Documents/GitHub/restaurantes/SRS-v4.md)
- [`SRS-v3-kilo.md`](/Users/pjcdz/Documents/GitHub/restaurantes/SRS-v3-kilo.md)
- [`informes/03-gemini-deepsearch.md`](/Users/pjcdz/Documents/GitHub/restaurantes/informes/03-gemini-deepsearch.md)
- [`apps/restaurant-hours-api/`](/Users/pjcdz/Documents/GitHub/restaurantes/apps/restaurant-hours-api)

---

## 2. Descripcion general

### 2.1 Contexto de producto
La v4 dejo validado el comportamiento conversacional core en un contexto pre-MVP. La v5 cambia el contexto operativo: el sistema ya no se piensa solo como API de pruebas o bot de Telegram, sino como una solucion de atencion por WhatsApp con derivacion humana real mediante Kapso.ai.

### 2.2 Objetivo de negocio de la v5
Implementar un canal operativo de ventas por WhatsApp que:
- mantenga la calidad conversacional ya validada;
- incorpore handoff humano usable por operadores;
- reduzca riesgo de construccion propia de inbox o integracion directa con WhatsApp Cloud API;
- deje al sistema listo para prueba piloto interna y despliegue controlado.

### 2.3 Stakeholders
| Stakeholder | Necesidad principal |
|---|---|
| Cliente final | Pedir por WhatsApp sin friccion ni respuestas ambiguas |
| Operador del restaurante | Recibir handoffs claros, operar desde el dashboard de Kapso.ai y retomar el control |
| Dueño o encargado | Convertir conversaciones en pedidos y no perder ventas por demoras |
| Equipo tecnico | Mantener arquitectura auditable, testeable y extensible |
| QA / Producto | Trazar requisito, implementacion, evidencia y decision de release |

### 2.4 Supuestos
- Se mantiene el alcance **cash-only** heredado de v4.
- Kapso.ai se adopta como proveedor de canal WhatsApp e inbox.
- El dashboard de Kapso.ai pasa a ser la unica interfaz operativa para conversaciones derivadas.
- Convex sigue siendo la fuente de verdad de sesiones, checkpoints, pedidos y catalogo.
- El orquestador conversacional continua en codigo, no en flujos n8n.
- La evidencia de cierre debe incluir pruebas automáticas y al menos una validacion E2E operativa.

### 2.5 Restricciones
- La latencia objetivo sigue condicionada por LLM, red y proveedor de canal.
- La calidad final depende de datos correctos en Convex y configuracion consistente en Kapso.ai.
- No debe reintroducirse soporte de transferencia en esta fase.

---

## 3. Requisitos por origen

### 3.1 Requisitos de negocio
| ID | Requisito | Prioridad | Verificacion esperada |
|---|---|---|---|
| RN-501 | El restaurante debe poder atender pedidos por WhatsApp como canal principal sin depender de Telegram para operacion diaria. | Alta | Piloto operativo sobre WhatsApp con pedidos reales o simulados |
| RN-502 | El negocio debe poder derivar conversaciones complejas o conflictivas a un operador humano sin perder contexto. | Alta | Handoff visible en inbox y continuidad del historial |
| RN-503 | La transicion a WhatsApp debe reutilizar la logica conversacional validada en v4 para reducir retrabajo y riesgo. | Alta | Mapeo de trazabilidad v4 -> v5 y pruebas de no regresion |
| RN-504 | La solucion debe minimizar construccion ad-hoc de herramientas operativas cuando Kapso.ai ya provee esa capacidad. | Media | Decision de arquitectura y eliminacion de backlog duplicado |
| RN-505 | La fase v5 debe dejar una base lista para piloto controlado, no solo una demo tecnica. | Alta | Gate de salida con criterios operativos y evidencia |

### 3.2 Requisitos de usuario
| ID | Requisito | Prioridad | Verificacion esperada |
|---|---|---|---|
| RU-501 | El cliente debe poder iniciar una conversacion desde WhatsApp y recibir respuesta automatica coherente. | Alta | E2E WhatsApp -> webhook -> respuesta |
| RU-502 | El cliente debe poder consultar menu, horarios, delivery y metodos de pago desde WhatsApp. | Alta | Casos FAQ y menu aprobados en entorno Kapso |
| RU-503 | El cliente debe poder construir y editar un pedido en varios mensajes dentro de la misma conversacion. | Alta | Casos multi-turno con mismo telefono |
| RU-504 | El cliente debe poder indicar efectivo y monto de abono, y recibir total o vuelto correcto. | Alta | Casos payment cash-only aprobados |
| RU-505 | El cliente debe poder pedir hablar con una persona cuando el bot no resuelve su necesidad. | Alta | Solicitud explicita termina en handoff |
| RU-506 | El operador debe poder ver la conversacion derivada, responder y reactivar la automatizacion desde el dashboard de Kapso.ai cuando corresponda. | Alta | Smoke operativo en dashboard Kapso |

---

## 4. Requisitos del sistema

### 4.1 Arquitectura objetivo

```text
WhatsApp User
   |
   v
Kapso.ai
   |
   v
Webhook Gateway / Express
   |
   v
Conversation Orchestrator
   |----> Convex (sessions, checkpoints, pedidos, catalogo, faq)
   |----> LLM provider
   |
   v
Kapso.ai reply / handoff inbox
```

### 4.2 Requisitos funcionales

| ID | Requisito funcional verificable | Prioridad | Origen |
|---|---|---|---|
| RF-501 | El sistema debe aceptar webhooks entrantes de Kapso.ai y validar autenticidad segun la configuracion acordada. | P0 | RN-501, RU-501 |
| RF-502 | El sistema debe extraer un `session key` estable desde el payload de Kapso.ai usando el identificador del contacto o numero telefonico. | P0 | RN-501, RU-503 |
| RF-503 | El sistema debe crear o reanudar la sesion conversacional asociada a ese `session key`. | P0 | RN-503, RU-503 |
| RF-504 | El sistema debe reutilizar el estado conversacional existente en Convex para continuar pedidos ya iniciados. | P0 | RN-503, RU-503 |
| RF-505 | El sistema debe procesar desde WhatsApp los mismos intents validados en v4: saludo, FAQ, menu, pedido, pago cash-only, queja y handoff. | P0 | RN-503, RU-501, RU-502, RU-505 |
| RF-506 | El sistema debe responder al cliente a traves de Kapso.ai usando el canal de salida configurado para la conversacion. | P0 | RN-501, RU-501 |
| RF-507 | El sistema debe activar handoff en Kapso.ai cuando el usuario lo solicite, cuando haya queja clara o cuando se acumulen errores recuperables segun la politica vigente. | P0 | RN-502, RU-505 |
| RF-508 | El sistema debe marcar la sesion como derivada para evitar respuestas automaticas mientras el operador tenga el control. | P0 | RN-502, RU-506 |
| RF-509 | El sistema debe permitir reactivar la automatizacion una vez finalizada la atencion humana. | P1 | RN-502, RU-506 |
| RF-510 | El sistema debe persistir en Convex los checkpoints, carrito y datos del pedido de forma consistente entre mensajes consecutivos. | P0 | RN-503, RU-503 |
| RF-511 | El sistema debe mantener el alcance de pago como `solo efectivo` y no ofrecer transferencia ni pasarela en esta fase. | P0 | RN-503, RU-504 |
| RF-512 | El sistema debe responder FAQ criticas usando datos vigentes del catalogo y FAQ almacenados en Convex. | P0 | RN-503, RU-502 |
| RF-513 | El sistema debe registrar eventos suficientes para reconstruir el flujo de un mensaje: recepcion, clasificacion, persistencia, respuesta o handoff. | P1 | RN-505 |
| RF-514 | El sistema debe ofrecer una ruta o mecanismo de healthcheck y readiness para despliegue controlado. | P1 | RN-505 |
| RF-515 | El sistema debe permitir ejecutar pruebas E2E controladas contra el entorno Kapso sin depender de Telegram. | P1 | RN-505 |
| RF-516 | El sistema debe eliminar `/admin` del flujo operativo v5; el handoff, la atencion humana y la reactivacion deben resolverse exclusivamente desde el dashboard de Kapso.ai. | P0 | RN-502, RN-504, RU-506 |

### 4.3 Requisitos no funcionales

| ID | Requisito no funcional | Prioridad | Medicion |
|---|---|---|---|
| RNF-501 | El sistema debe mantener coherencia funcional con la baseline v4 y no introducir regresiones en FAQ, menu, carrito, payment y handoff. | P0 | Suite de regresion y judge especifico |
| RNF-502 | Toda respuesta visible al cliente debe mantener tono profesional y neutro, evitando aperturas casuales o coloquiales no deseadas. | P1 | Tests lexicos y judge por categoria |
| RNF-503 | El sistema debe exponer trazabilidad minima desde mensaje entrante hasta respuesta o handoff. | P1 | Logs estructurados con `session key` y resultado |
| RNF-504 | Los secretos de Kapso.ai, Convex y LLM no deben quedar hardcodeados en codigo ni en artefactos versionados. | P0 | Revision de configuracion y arranque por entorno |
| RNF-505 | El sistema debe rechazar o ignorar payloads invalidos o no autenticados sin comprometer el estado conversacional. | P0 | Tests HTTP 2xx/4xx y no mutacion de estado |
| RNF-506 | El sistema debe sostener un flujo operativo medible en entorno real, diferenciando latencia del SUT y latencia del judge. | P1 | Reporte de tiempos por categoria |
| RNF-507 | El sistema debe dejar evidencia suficiente para auditoria de release: codigo, tests, corrida live y nota de smoke operativo. | P1 | Checklist completo de salida |
| RNF-508 | La identificacion de la sesion debe ser determinista y consistente entre reintentos del mismo webhook. | P0 | Casos idempotentes con mismo payload |

### 4.4 Interfaces externas

| ID | Interfaz | Tipo | Requisito asociado |
|---|---|---|---|
| IE-501 | Kapso.ai inbound webhook | HTTP | RF-501, RF-502 |
| IE-502 | Kapso.ai outbound reply API | HTTP | RF-506 |
| IE-503 | Kapso.ai inbox / handoff API y dashboard operativo | HTTP/UI | RF-507, RF-509, RF-516 |
| IE-504 | Convex queries y mutations | Data/API | RF-503, RF-510, RF-512 |
| IE-505 | Proveedor LLM | AI API | RF-505 |

---

## 5. Criterios de aceptacion

| ID | Criterio de aceptacion | Tipo de evidencia |
|---|---|---|
| CA-501 | Un mensaje enviado por WhatsApp de prueba llega desde Kapso.ai, se procesa y recibe una respuesta automatica correcta sin intervencion manual. | E2E live |
| CA-502 | Un pedido iniciado en un mensaje y completado en mensajes posteriores conserva carrito, total y faltantes usando la misma identidad de Kapso.ai. | Judge multi-turno + prueba live |
| CA-503 | Una solicitud de handoff o tres errores recuperables llevan la conversacion al inbox de Kapso.ai y silencian al bot. | Judge + smoke operativo |
| CA-504 | Un operador puede ver historial, responder y luego reactivar la automatizacion desde el dashboard de Kapso.ai sin perder continuidad. | Smoke operativo documentado |
| CA-505 | Ninguna respuesta live de payment ofrece transferencia o pasarela; todas permanecen en cash-only. | Judge payment + FAQ live |
| CA-506 | Las categorias core heredadas de v4 mantienen nivel de aprobacion aceptable despues de migrar a Kapso.ai. | Rerun judge global |
| CA-507 | Las pruebas HTTP de autenticacion del webhook distinguen correctamente requests validos e invalidos. | Integration tests |
| CA-508 | Existe una nota de release o apendice que documenta entorno, fecha, evidencia y gaps residuales. | Documento de evidencia |
| CA-509 | El flujo de handoff puede operarse completamente sin `/admin`, usando exclusivamente el dashboard de Kapso.ai. | Smoke operativo documentado |

---

## 6. Trazabilidad v4 -> v5

| Baseline v4 | Decision en v5 |
|---|---|
| FAQ, menu, carrito, payment cash-only, handoff conversacional ya validados | Se preservan como baseline obligatoria |
| Telegram como canal operativo principal del pre-MVP | Se reemplaza por WhatsApp via Kapso.ai |
| Admin/handoff local en `/admin` | Se elimina de la solucion objetivo v5 y se reemplaza por el dashboard de Kapso.ai |
| Handoff por tres errores y por solicitud explicita | Se mantiene y se integra contra API/inbox Kapso |
| Judge conversacional sobre `/message` | Se conserva, pero se agrega evidencia E2E sobre Kapso |
| RNF de performance abiertos en v4 | Se vuelven a medir en entorno Kapso antes de gate final |

---

## 7. Decisiones de alcance

### 7.1 Dentro de alcance
- canal WhatsApp a traves de Kapso.ai;
- webhooks de entrada y respuestas de salida;
- dashboard e inbox de handoff humano de Kapso.ai;
- persistencia conversacional y de pedidos en Convex;
- continuidad del orquestador y la logica ya validada;
- smoke operativo con evidencia documentada.

### 7.2 Fuera de alcance pre-MVP
- transferencia bancaria;
- links de pago;
- OCR;
- automatizaciones comerciales mas alla del pedido;
- rediseño completo del modelo de dominio.

---

## 8. Riesgos y supuestos de implementacion

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| Payload real de Kapso difiere del supuesto inicial | Alto | Capturar payload real y fijar contrato antes de cerrar RF-501/502 |
| La identidad de usuario no es estable entre eventos | Alto | Definir `session key` canonica y testear idempotencia |
| El handoff no silencia correctamente al bot o exige conservar `/admin` | Alto | Validar marca de sesion derivada y smoke completo en dashboard Kapso |
| La configuracion live en Kapso o Convex contradice el alcance cash-only | Medio | Checklist de datos y configuracion antes de judge global |
| La latencia de extremo a extremo sube respecto a v4 | Medio | Medir SUT y canal por separado |

---

## 9. Plan de validacion

### 9.1 Validacion tecnica
1. Tests unitarios y de integracion para webhook Kapso, sesion, persistencia y handoff.
2. Regresion del baseline v4 sobre FAQ, menu, carrito y payment.
3. Casos judge especificos para handoff, multi-turno y cash-only.
4. Rerun judge global sobre el entorno actualizado.

### 9.2 Validacion operativa
1. Enviar mensaje real o simulado desde WhatsApp/Kapso.
2. Verificar respuesta automatica.
3. Provocar handoff.
4. Verificar dashboard Kapso, intervencion humana y reactivacion.
5. Documentar resultado con fecha, entorno y gaps residuales.

---

## 10. Criterio de salida de v5

La v5 se considera lista para piloto si se cumplen simultaneamente estas condiciones:
- RF-501 a RF-512 implementados y verificados;
- RF-516 implementado y verificado;
- CA-501 a CA-506 con evidencia actual;
- CA-509 con evidencia actual;
- cash-only consistente en codigo, datos y respuestas live;
- al menos un smoke operativo de handoff y dashboard Kapso documentado;
- los pendientes residuales quedan clasificados como `posteriores`, no como fallas funcionales bloqueantes.

Si falla autenticacion de webhook, continuidad de sesion, handoff o coherencia cash-only, la salida es **NO-GO**.

---

## 11. Calidad del documento

Siguiendo `libro.txt`, este SRS busca que cada requisito quede:
- claro;
- completo dentro del alcance de v5;
- consistente con v4;
- verificable mediante prueba, corrida live o smoke operativo;
- priorizado;
- trazable a una necesidad de negocio o de usuario.

El siguiente paso recomendado ya no es rediscutir el alcance, sino convertir esta especificacion en backlog de implementacion y matriz de evidencia para el release con Kapso.ai.
