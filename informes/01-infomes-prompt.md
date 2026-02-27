Quiero que actues como Principal Architect + Staff Platform Engineer + AI Systems Engineer + Product/Requirements Analyst, y realices una investigacion tecnica profunda para definir la evolucion de mi producto.

Fecha de referencia del analisis: 2026-02-27.
No asumas hechos no verificados fuera de este prompt.
Puedes consultar fuentes oficiales/primarias para validar afirmaciones criticas y debes citarlas.
Estado del producto: **pre-produccion**. Actualmente estamos en fase de definicion y validacion tecnica; **no existe una implementacion productiva activa que deba preservarse**.

================================================================
1) OBJETIVO DEL ENCARGO
================================================================
Necesito una recomendacion concreta y accionable para evolucionar un asistente conversacional de restaurantes desde un MVP/prototipo centrado en Telegram+n8n hacia una plataforma de produccion escalable, con microservicios, monorepo, DevOps solido, observabilidad completa (infra + IA), y ejecucion incremental por etapas.

Quiero que evalues viabilidad tecnica, riesgos, costos, trade-offs y plan de implementacion realista para un equipo pequeno/mediano.

Importante:
- Trata los flujos actuales como base funcional de referencia, no como sistema productivo consolidado.
- El resultado debe minimizar riesgo de diseno temprano y evitar decisiones irreversibles prematuras.

================================================================
1) CONTEXTO DE NEGOCIO Y PRODUCTO
================================================================
Producto:
- Asistente conversacional para restaurantes de comida rapida.
- Funcion principal: atender consultas y convertir conversaciones en pedidos confirmados.
- Canal conversacional actual: Telegram (MVP/prototipo).
- Objetivo final de canal: WhatsApp en produccion.

Objetivos de negocio (SMART):
1. Reducir friccion en la toma de pedidos por chat (menos mensajes hasta completar pedido).
2. Aumentar conversion de consulta -> pedido.
3. Estandarizar respuestas con datos reales (sin invencion/alucinaciones).
4. Mantener trazabilidad del estado de pedido por cliente.

Stakeholders:
- Cliente final: usuario que consulta y compra por chat.
- Operador del restaurante: recibe pedidos validados para preparacion.
- Dueno/administrador: busca mayor conversion y eficiencia operativa.
- Equipo de desarrollo: mantiene logica conversacional, integraciones y operacion.

================================================================
2) ESTADO ACTUAL (BASE SRS v1.0)
================================================================
Documento base:
- SRS v1.0 (borrador validacion), fecha 2026-02-27.
- Estructura siguiendo enfoque de ingenieria de requerimientos (estilo IEEE).

Alcance actual:
- Consultas automaticas (menu, horarios, pagos).
- Toma y validacion de pedidos por chat.
- Memoria conversacional por cliente.
- Derivacion a humano cuando corresponde (todavia incompleta end-to-end).

Fuera de alcance en v1.0:
- WhatsApp productivo.
- CRM externo completo para handoff humano.

Supuestos y dependencias actuales (seccion 2.4):
1. n8n operativo con credenciales configuradas.
2. OpenAI API disponible (GPT-4o/4.1).
3. Telegram Bot API configurado.
4. Tablas actualizadas: Pedidos, Precios, Menu, FAQ.
5. Base Postgres para memoria conversacional.

Restricciones actuales:
- Calidad depende de prompts y datos.
- Handoff humano incompleto.
- Canal actual: solo Telegram.

================================================================
3) ARQUITECTURA ACTUAL (LOGICA FUNCIONAL)
================================================================
Orquestacion actual:
- Flujo principal MVP.
- Clasificador de intencion.
- Subflujo Preguntas (FAQ/Menu).
- Subflujo Apertura (Pedidos).
- Nodo/flujo de derivacion humano (TBD).
- Redactor final para respuesta.

Referencias de flujos actuales:
- n8n/MVP copy-2.json
- n8n/Apertura-2.json
- n8n/Preguntas.json

Interfaces externas actuales:
- Telegram Bot API
- OpenAI Chat Models
- Google Gemini (auxiliar opcional en estado actual)
- PostgreSQL
- n8n Data Tables (Pedidos, Precios, Menu, FAQ)

================================================================
4) REQUISITOS FUNCIONALES CLAVE ACTUALES (RF)
================================================================
Recepcion y contexto:
- Recibir mensaje entrante.
- Extraer identificador de cliente (telcliente/chat_id) y texto.
- Buscar pedido existente por cliente.
- Crear registro inicial si no existe.
- Mantener memoria por sesion cliente.

Orquestacion:
- Clasificar intencion: FAQ / pedido / derivacion humano.
- Invocar subflujo correcto segun intencion.
- Derivar a humano ante queja/enojo/solicitud explicita.

Consultas:
- Leer Menu y FAQ.
- Resolver consultas compuestas multi-fuente.
- Si no hay datos, retornar senal controlada de no encontrado (sin inventar).

Pedidos:
- Construir estado acumulado (historial + mensaje actual).
- Validar productos contra Precios.
- Inferir retiro si hay intencion pickup.
- Asumir cantidad=1 si no se especifica.
- Calcular total.
- Marcar estado: completo / incompleto / error_producto.
- Pedir datos faltantes.
- Persistir solo si estado completo.

Redaccion y respuesta:
- Transformar salida tecnica en texto legible.
- Respetar instrucciones del agente de control.
- Responder al chat de origen.

Errores:
- No detener flujo por parse errors.
- Mensajes de recuperacion controlados ante inconsistencias.

================================================================
5) REQUISITOS NO FUNCIONALES Y REGLAS DE NEGOCIO
================================================================
RNF criticos:
1. No exponer credenciales.
2. Minimizar exposicion de datos personales.
3. No filtrar estructura interna/IDs de infraestructura.
4. No alucinar datos de negocio.
5. Consistencia estricta con Menu/FAQ/Precios.
6. Mantener formato estructurado intermedio.
7. Latencia objetivo chat <=10s.
8. Tolerar mensajes consecutivos sin corrupcion de estado.
9. Prompts/reglas versionables y auditables.
10. Trazabilidad de requerimientos a implementacion y pruebas.

Reglas de negocio:
1. Pedido completo exige producto valido, cantidad>0, direccion o retiro, metodo de pago y nombre cliente.
2. Correccion de usuario sobrescribe valor previo.
3. Campo no mencionado conserva valor previo en memoria.
4. Producto invalido -> error_producto y solicitar correccion.

================================================================
6) MODELO DE DATOS ACTUAL (CONCEPTUAL)
================================================================
Entidades:
- PEDIDO(Hora, Fase, Direccion, Telefono PK, Pedido, TotalPedido, Despacho, Comprobante)
- PRECIOS(producto PK, precio_unitario)
- MENU(item, descripcion, precio)
- FAQ(tema, respuesta)

Clave logica:
- Session key principal = Telefono (hoy asociado a chat_id Telegram).

================================================================
7) PENDIENTES ABIERTOS DEL SRS
================================================================
- TBD-001: Implementacion final de Derivar Humano + CRM.
- TBD-002: Canal final (Telegram vs WhatsApp).
- TBD-003: Politicas de seguridad/retencion/anonimizado.
- TBD-004: SLAs medibles.
- TBD-005: Versionado formal de prompts + proceso aprobacion.

================================================================
8) CAMBIOS OBJETIVO A INVESTIGAR (TARGET VISION)
================================================================
Evaluar:
1. Canal productivo: WhatsApp (en lugar de Telegram).
2. Handoff/CRM: Clerk + Convex + Next.js + Kapso.ai.
3. Orquestacion IA: LangChain + LangGraph (en lugar de n8n).
4. Interfaz visual de workflows/conexiones/debugging equivalente o superior a n8n.
5. LLM/API: Google AI Studio con Gemma 27B (si no aplica, alternativa oficial equivalente).
6. Base de datos principal: Convex (vs Postgres/Supabase).

Y vision de plataforma:
7. Arquitectura de microservicios.
8. Monorepo unico en GitHub.
9. Despliegues con Terraform en Google Cloud.
10. Observabilidad infra-app con Prometheus + Grafana.
11. Observabilidad/evaluacion IA con Langfuse (usar capacidades relevantes).

================================================================
9) REQUISITOS DE INGENIERIA DE LA EVOLUCION
================================================================
Mandatorio:
1. Enfoque SRS-first y trazabilidad total.
2. TDD pragmatico: tests con valor funcional real.
3. Cero tests cosmeticos.

Definicion de tests reales:
- Si RF dice usuario envia mensaje y bot responde, la prueba debe simular inbound por webhook/API y validar outbound + estado persistido.
- No se requiere UI real de WhatsApp para testear; usar API/contrato equivalente.
- Cada test debe mapear explicitamente a RF/RNF.

Capas de testing:
- Unit (logica critica)
- Contract (entre microservicios)
- Integration (DB, mensajeria, APIs)
- E2E API-level (escenarios realistas)

================================================================
10) FILOSOFIA DE IMPLEMENTACION
================================================================
La recomendacion debe seguir evolucion incremental inspirada en:
Chapter 10. AI Engineering Architecture and User Feedback (Chip Huyen), con foco en:
1. Iteraciones cortas y medibles.
2. Feedback loops de usuarios reales.
3. Instrumentacion para calidad de respuestas y salud operativa.
4. Reduccion de riesgo por etapas (sin big-bang).
5. Experimentacion controlada y rollback claro.

Nota de contexto:
- Como no hay operacion productiva activa, define la transicion como roadmap de industrializacion (de prototipo a produccion), no como migracion de trafico en vivo.
- Aun asi, disena mecanismos de convivencia temporal (dual-run/canary/shadow) para cuando exista trafico real.

================================================================
11) PREGUNTAS CRITICAS QUE DEBES RESPONDER
================================================================
1. Cual es la arquitectura de microservicios recomendada para este caso y por que?
2. Como estructurar monorepo GitHub (apps/services/packages/contracts/infra/shared)?
3. Que blueprint Terraform en GCP conviene (networking, compute, data, secrets, observability)?
4. Que runtime de GCP propones para APIs, workers y pipelines (trade-offs)?
5. Como implementar SLO/SLI y alertado con Prometheus/Grafana?
6. Que modulos/capacidades de Langfuse aplicarias end-to-end (traces, sessions, prompts, evals, datasets, scores, experiments, feedback, costos, latencia)?
7. LangChain+LangGraph reemplaza n8n sin perder productividad y visibilidad operativa?
8. Que herramienta concreta da interfaz visual para flujos/trazas/debug (equivalente a n8n)?
9. Gemma 27B en Google AI Studio es viable para produccion en este caso?
10. Si Gemma 27B exacto no aplica, que alternativa oficial recomiendas y por que?
11. Convex cubre memoria conversacional + pedidos + catalogo con garantias de consistencia y operacion?
12. Como cumplir latencia <=10s en escenarios reales?
13. Cual es la estrategia de transicion por etapas desde prototipo actual hasta produccion, minimizando riesgo de diseno y retrabajo?
14. Que riesgos de lock-in hay y como mitigarlos?
15. Que costos aproximados (infra + IA + observabilidad + operacion) se esperan por etapa?

================================================================
12) ENTREGABLES OBLIGATORIOS
================================================================
A. Resumen ejecutivo:
- Decision recomendada: Adoptar / Adoptar parcial / No adoptar.
- Justificacion tecnica, negocio, costo, riesgo y time-to-market.

B. Arquitectura objetivo:
- Diagrama logico textual E2E.
- Catalogo de microservicios (responsabilidad, API/eventos, storage, ownership).
- Estrategia de consistencia de datos y memoria conversacional.

C. Diseno de plataforma:
- Estructura de monorepo propuesta.
- CI/CD con quality gates.
- Terraform modules en GCP.
- Seguridad: IAM, secretos, auditoria.

D. Observabilidad:
- Plan Prometheus/Grafana (metricas, dashboards, alertas, runbooks).
- Plan Langfuse completo (instrumentacion, evaluacion continua, feedback loops).

E. Testing/TDD:
- Matriz RF/RNF -> pruebas concretas.
- Casos de prueba API-level realistas (webhooks y respuestas del bot).
- Estrategia anti-flaky + evidencia minima por PR.

F. Roadmap incremental:
- Fase 0 (POC), Fase 1 (Piloto), Fase 2 (Produccion parcial), Fase 3 (Go-Live).
- Para cada fase: alcance, riesgos, mitigacion, metricas, rollback, esfuerzo persona-semana.

G. Delta SRS v1.1:
- Cambios Antes->Despues en:
  1) Alcance
  2) Supuestos y dependencias
  3) Restricciones
  4) RF
  5) RNF
  6) Interfaces externas
  7) Criterios de aceptacion
  8) Matriz de trazabilidad
  9) TBD
- Proponer nuevos IDs RF/RNF/IE/TBD.

H. Backlog inicial ejecutable:
- Top 20 historias tecnicas/funcionales priorizadas.
- Dependencias, estimacion y criterio de aceptacion por item.

Formato de salida obligatorio:
- Entregar exactamente en secciones A-H, en ese orden.
- Incluir tablas donde aplique (microservicios, RF/RNF->tests, roadmap por fase, riesgos, costos).
- Toda afirmacion critica debe etiquetarse como `[HECHO VERIFICADO]` o `[INFERENCIA]`.
- Cada `[HECHO VERIFICADO]` debe incluir `fuente oficial` + `fecha de consulta (YYYY-MM-DD)`.

================================================================
13) CRITERIOS DE RIGOR Y EVIDENCIA
================================================================
1. Usar fuentes oficiales/primarias actuales.
2. Incluir links + fecha de consulta en afirmaciones criticas.
3. Marcar explicitamente: hecho verificado vs inferencia.
4. Declarar incertidumbre y proponer experimento para resolverla.
5. Incluir top 10 riesgos (probabilidad, impacto, mitigacion).
6. Evitar respuestas genericas: todo debe ser accionable y trazable a este contexto.
7. Si falta informacion para una decision, explicitar supuesto adoptado y su impacto.

Fin del encargo.
```

## Casos de prueba del prompt (calidad de salida esperada)
1. El analista no debe proponer cutover inmediato ni zero-downtime migration como requisito actual.
2. Debe distinguir claramente hoy prototipo vs futuro productivo.
3. Debe responder las 15 preguntas con decisiones concretas y trade-offs.
4. Debe producir delta SRS v1.1 trazable con IDs nuevos.
5. Debe incluir costos por etapa y riesgos con mitigacion operable.
6. Debe citar fuentes oficiales con fecha.

## Supuestos y defaults aplicados
- Se mantiene idioma espanol tecnico.
- Se mantiene estructura de 13 secciones para continuidad operativa.
- Se conserva Fase 0-3, renombrando su intencion a industrializacion incremental.
- Se mantiene el stack candidato original para evaluacion comparativa (sin predecidir adopcion).
