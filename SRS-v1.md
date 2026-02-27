# SRS - Sistema de Asistente Conversacional para Restaurantes

**Versión:** 1.0 (No extendida)  
**Fecha:** 2026-02-27  
**Estado:** Borrador para validación

---

## 1. Introducción

### 1.1 Propósito
Este documento especifica los requerimientos de software para un **asistente conversacional automatizado** orientado a restaurantes de comida rápida. El sistema permite atender consultas, gestionar pedidos y mantener contexto conversacional con clientes a través de mensajería (Telegram).

### 1.2 Alcance
El sistema cubre:
- Atención automatizada de consultas frecuentes (menú, horarios, métodos de pago)
- Toma y validación de pedidos por chat
- Mantenimiento de contexto conversacional por cliente
- Derivación a operador humano cuando sea necesario

**Fuera del alcance actual:**
- Integración con WhatsApp (roadmap)
- Sistema de voz en producción (roadmap)
- CRM externo completo para handoff humano

### 1.3 Definiciones y Acrónimos
| Término | Definición |
|---------|------------|
| SRS/ERS | Especificación de Requerimientos de Software |
| RF | Requerimiento Funcional |
| RNF | Requerimiento No Funcional |
| TBD | To Be Defined (por definir) |
| Handoff | Derivación de conversación a humano |

### 1.4 Referencias
- IEEE Std 610.12-1990 (definición de requerimientos)
- `libro.txt` - Criterios de ingeniería de requerimientos
- `transcript.txt` - Objetivos de negocio y contexto
- Flujos n8n: `MVP copy-2.json`, `Apertura-2.json`, `Preguntas.json`

---

## 2. Descripción General

### 2.1 Perspectiva del Sistema
El sistema es un **bot de mensajería** que opera sobre n8n con orquestación de agentes de IA:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Cliente        │────▶│  Flujo Principal │────▶│  Clasificador   │
│  Telegram       │     │  MVP             │     │  de Intención   │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                         │
                        ┌────────────────────────────────┼────────────────────────────────┐
                        │                                │                                │
                        ▼                                ▼                                ▼
               ┌────────────────┐              ┌────────────────┐              ┌────────────────┐
               │  Subflujo      │              │  Subflujo      │              │  Derivación    │
               │  Preguntas     │              │  Apertura      │              │  Humano        │
               │  (FAQ/Menu)    │              │  (Pedidos)     │              │  (TBD)         │
               └───────┬────────┘              └───────┬────────┘              └───────┬────────┘
                       │                               │                               │
                       └───────────────────────────────┴───────────────────────────────┘
                                                       │
                                                       ▼
                                              ┌────────────────┐
                                              │  Redactor      │
                                              │  (Respuesta)   │
                                              └───────┬────────┘
                                                      │
                                                      ▼
                                              ┌────────────────┐
                                              │  Cliente       │
                                              │  Telegram      │
                                              └────────────────┘
```

### 2.2 Usuarios y Stakeholders
| Stakeholder | Descripción |
|-------------|-------------|
| Cliente final | Usuario de Telegram que consulta y realiza pedidos |
| Operador del restaurante | Recibe pedidos validados para preparación |
| Dueño/administrador | Objetivo comercial: aumentar conversiones |
| Equipo de desarrollo | Mantiene flujos n8n y prompts |

### 2.3 Objetivos de Negocio (SMART)
1. **Reducir fricción** en toma de pedidos por chat (medible: menos mensajes para completar pedido)
2. **Aumentar conversión** de consultas a pedidos concretos
3. **Estandarizar respuestas** usando datos reales sin invención
4. **Mantener trazabilidad** del estado de pedidos por teléfono/chat

### 2.4 Supuestos y Dependencias
- n8n operativo con credenciales configuradas
- OpenAI API disponible (modelo GPT-4o/4.1)
- Telegram Bot API configurado
- Tablas de datos actualizadas: `Pedidos`, `Precios`, `Menu`, `FAQ`
- Base de datos Postgres para memoria conversacional

### 2.5 Restricciones
- Calidad de respuestas depende de prompts y datos
- Handoff humano no implementado end-to-end
- Canal actual: solo Telegram

---

## 3. Requerimientos Funcionales (RF)

### 3.1 Recepción y Contexto
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| RF-001 | El sistema debe recibir mensajes entrantes desde Telegram | Alta |
| RF-002 | El sistema debe extraer identificador del cliente (`telcliente`) y contenido del mensaje | Alta |
| RF-003 | El sistema debe buscar pedidos existentes por teléfono/chat_id | Alta |
| RF-004 | Si no existe pedido, el sistema debe crear registro inicial | Alta |
| RF-005 | El sistema debe mantener memoria conversacional por cliente (session key = teléfono) | Alta |

### 3.2 Orquestación de Intenciones
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| RF-006 | El sistema debe clasificar la consulta en: FAQ, gestión de pedido, derivación humana | Alta |
| RF-007 | El sistema debe invocar subworkflow `Preguntas` para menú/FAQ/saludos | Alta |
| RF-008 | El sistema debe invocar subworkflow `Apertura` para intenciones de compra | Alta |
| RF-009 | El sistema debe derivar a humano ante queja, enojo o solicitud explícita | Media |

### 3.3 Consultas (Subflujo Preguntas)
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| RF-010 | El sistema debe consultar tablas `Menu` y `FAQ` según la intención | Alta |
| RF-011 | Ante consulta compuesta, debe poder consultar múltiples fuentes | Media |
| RF-012 | Si no hay datos, debe retornar señal `DATO_NO_ENCONTRADO` sin inventar | Alta |

### 3.4 Gestión de Pedidos (Subflujo Apertura)
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| RF-013 | El sistema debe construir estado acumulado del pedido (historial + mensaje actual) | Alta |
| RF-014 | El sistema debe validar productos contra tabla `Precios` | Alta |
| RF-015 | El sistema debe inferir "Retiro en sucursal" cuando detecte intención pickup | Media |
| RF-016 | Si no se especifica cantidad, asumir cantidad = 1 | Media |
| RF-017 | El sistema debe calcular total = precio_unitario × cantidad | Alta |
| RF-018 | El sistema debe marcar pedido como `completo`, `incompleto` o `error_producto` | Alta |
| RF-019 | El sistema debe identificar campos faltantes y solicitarlos | Alta |
| RF-020 | Solo con estado `completo`, actualizar tabla `Pedidos` con dirección, pedido y total | Alta |

### 3.5 Redacción y Respuesta
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| RF-021 | El sistema debe transformar salida técnica en respuesta legible para el cliente | Alta |
| RF-022 | La redacción debe respetar instrucciones del agente de control | Alta |
| RF-023 | El sistema debe enviar respuesta al mismo chat de origen | Alta |

### 3.6 Gestión de Errores
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| RF-024 | El sistema debe manejar errores de parseo sin detener el flujo | Alta |
| RF-025 | Ante inconsistencias, retornar mensaje controlado para continuar conversación | Media |

---

## 4. Requerimientos No Funcionales (RNF)

### 4.1 Seguridad y Privacidad
| ID | Requerimiento | Clasificación |
|----|---------------|---------------|
| RNF-001 | Las credenciales API no deben exponerse en respuestas al usuario | Restricción Externa |
| RNF-002 | Minimizar exposición de datos personales (principio de menor privilegio) | Restricción Externa |
| RNF-003 | Las respuestas no deben filtrar estructura interna, IDs o detalles de infraestructura | Restricción del Producto |

### 4.2 Calidad de Información
| ID | Requerimiento | Clasificación |
|----|---------------|---------------|
| RNF-004 | El sistema NO debe inventar productos, precios, horarios ni políticas | Restricción del Producto |
| RNF-005 | Las respuestas deben ser consistentes con datos de `Menu`, `FAQ` y `Precios` | Restricción del Producto |
| RNF-006 | Mantener formato estructurado intermedio para interoperabilidad entre nodos | Restricción Organizacional |

### 4.3 Rendimiento y Disponibilidad
| ID | Requerimiento | Clasificación |
|----|---------------|---------------|
| RNF-007 | Tiempo de respuesta apto para chat conversacional (objetivo: ≤10s) | Restricción del Producto |
| RNF-008 | Tolerar mensajes consecutivos del mismo cliente sin corromper estado | Restricción del Producto |

### 4.4 Mantenibilidad
| ID | Requerimiento | Clasificación |
|----|---------------|---------------|
| RNF-009 | Prompts y reglas de negocio deben poder versionarse y auditarse | Restricción Organizacional |
| RNF-010 | Requerimientos trazables desde objetivo de negocio hasta flujo y prueba | Restricción Organizacional |

---

## 5. Reglas de Negocio

| ID | Regla |
|----|-------|
| RN-001 | Un pedido es `completo` solo si tiene: producto válido, cantidad > 0, dirección o retiro, método de pago, nombre del cliente |
| RN-002 | Si el usuario corrige un dato, se sobrescribe el valor previo |
| RN-003 | Si el usuario no menciona un campo en el nuevo mensaje, se conserva el valor previo en memoria |
| RN-004 | Si el producto no matchea con `Precios`, se marca `error_producto` y se solicita corrección |

---

## 6. Modelo de Datos (Conceptual)

### 6.1 Entidades Principales

**PEDIDO**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| Hora | string | Timestamp del pedido |
| Fase | string | Estado actual del pedido |
| Direccion | string | Dirección de entrega |
| Telefono | string (PK) | Identificador del cliente |
| Pedido | string | Descripción de items |
| TotalPedido | float | Monto total |
| Despacho | string | Tipo de despacho |
| Comprobante | string | ID de comprobante |

**PRECIOS**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| producto | string (PK) | Nombre del producto |
| precio_unitario | float | Precio individual |

**MENU**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| item | string | Nombre del item |
| descripcion | string | Descripción detallada |
| precio | float | Precio |

**FAQ**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| tema | string | Tema de la pregunta |
| respuesta | string | Respuesta estándar |

### 6.2 Claves Lógicas
- Clave de sesión de chat/memoria: `Telefono` (chat id en Telegram)
- La actualización de pedido se realiza filtrando por `Telefono`

---

## 7. Interfaces Externas

| ID | Interfaz | Descripción |
|----|----------|-------------|
| IE-001 | Telegram Bot API | Trigger y envío de mensajes |
| IE-002 | OpenAI Chat Models | Agente de control, parser/redactor |
| IE-003 | Google Gemini | Modelo auxiliar (opcional) |
| IE-004 | PostgreSQL | Memoria conversacional |
| IE-005 | n8n Data Tables | `Pedidos`, `Precios`, `Menu`, `FAQ` |

---

## 8. Criterios de Aceptación

| ID | Criterio |
|----|----------|
| CA-001 | Dada consulta de menú, el bot responde con items/precios reales sin inventar |
| CA-002 | Dado pedido parcial, el bot solicita exactamente los campos faltantes |
| CA-003 | Dado pedido completo, el bot confirma y persiste en `Pedidos` |
| CA-004 | Dada pregunta fuera de base de conocimiento, responde con "no encontrado" o deriva |
| CA-005 | Dada queja o solicitud de humano, inicia flujo de handoff |

---

## 9. Matriz de Trazabilidad (Mínima)

| Objetivo de Negocio | RF Relacionados | Evidencia |
|---------------------|-----------------|-----------|
| Responder consultas automáticamente | RF-006, RF-007, RF-010, RF-011 | `n8n/Preguntas.json` |
| Convertir conversaciones en pedidos | RF-008, RF-013 a RF-020 | `n8n/Apertura-2.json` |
| Mantener contexto por cliente | RF-005, RF-013 | `n8n/MVP copy-2.json` |
| Escalar a handoff humano | RF-009 | `transcript.txt` |

---

## 10. Pendientes y TBD

| ID | Descripción |
|----|-------------|
| TBD-001 | Implementación final de `Derivar Humano` con integración CRM |
| TBD-002 | Definir canal objetivo final (Telegram vs Telegram + WhatsApp) |
| TBD-003 | Políticas de seguridad, retención y anonimizado de datos |
| TBD-004 | SLAs medibles (latencia, disponibilidad, tasa de error) |
| TBD-005 | Versionado formal de prompts y proceso de aprobación |

---

## 11. Próximas Extensiones (Versiones Futuras)

- **v1.1**: Casos de uso detallados con escenarios alternativos y de error
- **v1.2**: Matriz de trazabilidad completa (RF → pruebas → nodos n8n)
- **v1.3**: Plan de validación con checklist de calidad SRS
- **v1.4**: Diagramas de secuencia y especificación de APIs

---

## 12. Control de Versiones

| Versión | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 1.0 | 2026-02-27 | Equipo | Versión inicial no extendida |

---

*Este documento sigue la estructura IEEE recomendada para SRS y cubre los elementos esenciales: introducción, descripción general, requerimientos funcionales y no funcionales, reglas de negocio, modelo de datos, interfaces, criterios de aceptación y trazabilidad básica.*
