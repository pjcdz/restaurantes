# **Reporte de Investigación Técnica: Industrialización Arquitectónica y Plataforma de Producción para Asistente Conversacional**

## **Resumen Ejecutivo**

El presente reporte define la estrategia de industrialización y evolución técnica para un asistente conversacional orientado al sector gastronómico de comida rápida. Partiendo de la premisa fundamental de que el sistema actual es un prototipo (MVP) en fase de pre-producción basado en Telegram y flujos visuales (n8n), se requiere una transición estructural hacia una plataforma de producción empresarial, escalable, segura y completamente observable. La decisión ejecutiva recomendada es **Adoptar** la arquitectura objetivo propuesta en su totalidad, abandonando el paradigma de automatización puramente visual en favor de un enfoque de ingeniería de software orientado a código para la orquestación de agentes de inteligencia artificial.

La justificación técnica para esta adopción radica en la naturaleza del problema de negocio. La toma de pedidos no es un proceso lineal determinista; requiere bucles de razonamiento dinámicos, manejo de excepciones (ej. productos no encontrados), persistencia de memoria a largo plazo y transiciones condicionales. Las herramientas visuales como n8n son excepcionales para la integración de sistemas basados en flujos de datos unidireccionales, pero carecen de las primitivas necesarias, como el "checkpointing" nativo, para manejar la complejidad cíclica de los agentes autónomos de manera robusta.1 La adopción de LangGraph proporciona el control granular necesario sobre el estado del agente, mientras que LangGraph Studio suple la necesidad de una interfaz de depuración visual, permitiendo inspeccionar el estado en cualquier punto del tiempo y modificar la trayectoria del agente sin perder la reproducibilidad del código.4

Desde la perspectiva del negocio y el tiempo de comercialización (time-to-market), la transición del canal de Telegram a WhatsApp se acelera drásticamente mediante la integración de Kapso.ai. Esta plataforma proporciona una infraestructura gestionada para la API de WhatsApp Cloud, resolviendo simultáneamente la necesidad de un CRM ligero para la derivación a humanos (handoff) mediante su interfaz de bandeja de entrada (Inbox) nativa y sus nodos de pausa de flujo.5 Esto evita incurrir en los costos y riesgos de desarrollar una interfaz de chat personalizada desde cero.

En términos de costos y riesgos de infraestructura, la evolución hacia un modelo serverless con Google Cloud Run minimiza el gasto operativo al escalar a cero cuando no hay tráfico, eliminando la sobrecarga de gestión de clústeres requerida por alternativas como Kubernetes.8 Simultáneamente, la adopción del modelo Gemini 3 Flash de Google (lanzado en febrero de 2026\) garantiza un cumplimiento estricto del requisito de latencia inferior a 10 segundos, superando a modelos locales como Gemma 27B tanto en velocidad de inferencia como en eficiencia de costos.9 El riesgo de bloqueo tecnológico (lock-in) se mitiga utilizando estándares de contenedores, frameworks de orquestación de código abierto (LangChain) y bases de datos con capacidades de exportación de distribución abierta.12

## **Arquitectura Objetivo y Modelado del Sistema**

La arquitectura transiciona de un modelo monolítico basado en flujos visuales hacia una arquitectura de microservicios distribuida, o más precisamente, un monolito modular optimizado para la cadencia operativa de un equipo pequeño a mediano. Este diseño separa claramente las responsabilidades de enrutamiento, razonamiento algorítmico y persistencia de datos transaccionales.

### **Diagrama Lógico Textual E2E**

El flujo end-to-end de la información y el control del sistema se estructura a través de las siguientes interacciones:

1. El usuario final envía un mensaje de texto o nota de voz a través de su cliente de WhatsApp.  
2. Kapso.ai recibe el mensaje, gestiona la sesión de WhatsApp, normaliza el contenido y emite un Webhook estructurado con el identificador del cliente (número de teléfono).  
3. Un API Gateway (Google Cloud Global Load Balancer) recibe el Webhook, verifica las firmas de seguridad y lo enruta al servicio de entrada en Google Cloud Run.  
4. El microservicio de Orquestación, construido sobre LangGraph, inicializa el grafo del agente o reanuda un estado previo utilizando la memoria persistida.  
5. LangGraph interactúa con la base de datos reactiva Convex para recuperar el estado histórico del carrito de compras del usuario y los metadatos de la sesión.  
6. El nodo clasificador de LangGraph envía el contexto al modelo de lenguaje (Gemini 3 Flash) para determinar la intención del usuario (Pregunta FAQ, Adición a Pedido, Queja).  
7. Si la intención requiere datos adicionales (ej. validación de precios o lectura del menú), LangGraph invoca funciones de consulta deterministas en Convex, evitando alucinaciones del modelo.  
8. Si se detecta un patrón de frustración, una intención de queja, o el usuario solicita explícitamente asistencia humana, LangGraph emite un comando al HandoffNode de la API de Kapso, el cual detiene la automatización de forma asíncrona y transfiere la sesión a la bandeja de entrada (Inbox) de los operadores del restaurante.6  
9. Tras completar el razonamiento y las validaciones de reglas de negocio, el agente sintetiza una respuesta estructurada que se envía de regreso a la API de Kapso.ai para su entrega inmediata en WhatsApp.  
10. En paralelo, de forma no bloqueante, los callbacks de Langfuse registran la traza completa, las latencias parciales, los costos por token y las evaluaciones de calidad del ciclo conversacional.15

### **Catálogo de Microservicios y Diseño de Componentes**

La fragmentación excesiva en docenas de microservicios es un antipatrón perjudicial para equipos pequeños. En respuesta a la interrogante sobre la arquitectura recomendada, se propone un diseño basado en tres servicios lógicos principales desplegados en Google Cloud Run, garantizando independencia de fallos y escalabilidad granular.

| Servicio Lógico | Responsabilidad Principal | Interfaz de Comunicación / Eventos | Propiedad de Almacenamiento (Storage) |
| :---- | :---- | :---- | :---- |
| **Webhook Gateway & Router** | Recepción de eventos de Kapso, validación criptográfica de firmas, limitación de tasa (rate limiting) y enrutamiento inicial. | API REST (Inbound Webhooks HTTP) | Ninguna (Completamente Stateless) |
| **Agent Orchestrator** | Ejecución de la lógica conversacional de LangGraph, invocación de LLM, generación aumentada por recuperación (RAG) sobre FAQ/Menú, y formateo de respuestas. | gRPC / REST (Interno) | Convex (Memoria de estado y Checkpoints) |
| **Order & Catalog Manager** | Gestión del ciclo de vida transaccional del pedido, validación de inventario en tiempo real, y operaciones CRUD (ABM) de menú y precios. | Mutaciones y Queries nativas de Convex | Convex (Colecciones: Pedidos, Precios, Menú) |

### **Estrategia de Consistencia de Datos y Memoria Conversacional**

En respuesta a la viabilidad de reemplazar PostgreSQL por Convex para cubrir la memoria conversacional, los pedidos y el catálogo, el análisis concluye que Convex no solo es viable, sino superior para este modelo operativo. El manejo del estado acumulado de un pedido conversacional exige garantías transaccionales estrictas para evitar condiciones de carrera cuando múltiples mensajes llegan en milisegundos.17

Convex reemplaza la necesidad de bases de datos relacionales tradicionales, ORMs complejos y sistemas de caché externos (como Redis) al ofrecer una base de datos documental reactiva con soporte nativo de TypeScript.13 Cada función en el backend de Convex opera como una transacción ACID. Si el agente infiere que el cliente desea "dos hamburguesas adicionales", LangGraph invoca una mutación en Convex. Esta mutación verifica el inventario y actualiza el documento del pedido de manera atómica.17 Si hay un conflicto, la transacción se reintenta automáticamente. La memoria conversacional se aborda almacenando los "checkpoints" de LangGraph como documentos dentro de Convex, utilizando el número de teléfono extraído del payload de Kapso.ai como la clave de partición lógica (Session Key principal). Este enfoque asegura que el LLM siempre lea un estado de la base de datos que es consistentemente preciso, eliminando discrepancias entre la memoria temporal del chat y la tabla formal de pedidos.

## **Diseño de Plataforma y Prácticas DevOps**

La industrialización del prototipo exige una base de ingeniería (platform engineering) que soporte iteraciones de desarrollo continuas, pruebas automatizadas y despliegues predecibles.

### **Estructura del Monorepo GitHub**

Respondiendo a la pregunta sobre la estructuración del repositorio unificado, se recomienda la adopción de **Turborepo** en lugar de herramientas más complejas como Nx. Nx es potente para configuraciones empresariales masivas, pero Turborepo proporciona una simplicidad de configuración (a menudo en menos de 20 líneas) y un almacenamiento en caché remoto y local que reduce los tiempos de compilación de minutos a segundos.13 Esto es un factor crítico de productividad para equipos pequeños.

La topología del monorepo en GitHub debe seguir una separación estricta de dominios, agrupando aplicaciones, paquetes compartidos e infraestructura:

* /apps/agent-orchestrator: Contiene el código Python o TypeScript de la lógica del grafo de LangChain/LangGraph.  
* /apps/webhook-gateway: Aplicación ligera (ej. Node.js/Express o FastAPI) para ingesta de eventos HTTP.  
* /packages/convex-db: Concentra las definiciones de esquemas, mutaciones y consultas de Convex, actuando como la fuente única de verdad para los tipos de datos en TypeScript.  
* /packages/shared-contracts: Tipos e interfaces comunes que aseguran que el Gateway y el Orchestrator hablen el mismo lenguaje, previniendo errores de integración de APIs.  
* /infra/terraform: Directorio exclusivo para los manifiestos de infraestructura como código (IaC).  
* .github/workflows: Definiciones del pipeline de integración y despliegue continuo (CI/CD).

### **Blueprint Terraform en Google Cloud Platform (GCP)**

Para garantizar un entorno de producción seguro y auditable, se recomienda utilizar el *Google Cloud Enterprise Foundations Blueprint* a través de los módulos oficiales de Terraform (terraform-google-modules).22 El aprovisionamiento debe cubrir cinco pilares fundamentales:

1. **Networking:** Despliegue de una Virtual Private Cloud (VPC) con subredes privadas. Esto previene la exposición directa de servicios internos al internet público.  
2. **Compute:** Uso del módulo terraform-google-cloud-run para desplegar las imágenes de contenedores en Cloud Run (Gen 2), configurando mapeos de dominio y políticas de autoescalado.24  
3. **Data Egress:** Para comunicar Cloud Run con la base de datos hospedada Convex de forma segura, se configurará un *Serverless VPC Access Connector* acoplado a un Cloud NAT, garantizando que todo el tráfico de salida provenga de un conjunto de direcciones IP estáticas conocidas, facilitando las listas de permitidos (allowlists) en bases de datos de terceros.22  
4. **Seguridad y Secretos (IAM):** Todo el sistema se basará en el principio de mínimo privilegio. Se crearán Service Accounts específicas para cada microservicio. Los secretos (claves de API de Kapso, OpenAI, Langfuse) nunca se almacenarán en el estado de Terraform ni en variables de entorno en texto plano; se provisionarán en *Google Secret Manager* y se inyectarán dinámicamente en tiempo de ejecución.27 Para el acceso del CI/CD de GitHub Actions a GCP, se evitarán las claves descargadas utilizando *Workload Identity Federation* para obtener tokens de corta duración.22  
5. **Observability:** Habilitación automática de las APIs de Cloud Logging y Cloud Monitoring mediante Terraform.

### **Selección del Entorno de Ejecución (Runtime GCP)**

La recomendación del runtime recae inequívocamente en **Google Cloud Run** frente a Google Kubernetes Engine (GKE). Cloud Run es una plataforma serverless que gestiona de manera transparente el aprovisionamiento de infraestructura, escalando las instancias a cero durante períodos de inactividad, lo que resulta en una optimización drástica de los costos para productos en etapas tempranas.8 Dado que la arquitectura dicta que todos los contenedores deben ser apátridas (stateless), relegando el almacenamiento de estado a Convex, la complejidad operativa de administrar clústeres, nodos, y planos de control en GKE no justifica el esfuerzo para un equipo de tamaño reducido.8 Cloud Run soporta paralelismo nativo, permitiendo manejar múltiples webhooks entrantes de WhatsApp simultáneamente dentro de la misma instancia de contenedor sin degradación perceptible de la latencia de red.

### **Integración Continua y Quality Gates (CI/CD)**

El flujo automatizado asegurará que ningún código llegue a producción sin validación. Al generar un Pull Request, el pipeline ejecutará reglas estáticas de linting y formateo. Posteriormente, se ejecutarán las pruebas unitarias y de contratos entre paquetes del monorepo. La puerta de calidad (quality gate) más crítica será la ejecución de la fase de pruebas API-level, simulando webhooks de Kapso. Adicionalmente, el pipeline ejecutará un terraform plan para evaluar y visualizar los cambios en la infraestructura antes de permitir la fusión con la rama principal, aplicando los cambios (terraform apply) únicamente tras la aprobación de un ingeniero.28

## **Evaluaciones Tecnológicas y Decisiones Algorítmicas**

La orquestación y el razonamiento representan el núcleo del asistente conversacional. Las decisiones tomadas en esta capa dictan la robustez del sistema frente a interacciones humanas no predecibles.

### **LangChain y LangGraph vs. Automatización Visual (n8n)**

En respuesta a si LangChain y LangGraph pueden reemplazar a n8n sin perder productividad, la evidencia indica que no solo lo reemplazan, sino que son obligatorios para el nivel de complejidad requerido. Herramientas de flujo visual como n8n destacan en escenarios lineales y predecibles (ej. mover un dato de un CRM a un correo electrónico), pero su arquitectura interna sufre cuando se trata de razonamiento de agentes autónomos.1 Un agente conversacional que toma pedidos necesita iterar, corregir errores si el usuario cambia de opinión repentinamente, y mantener un historial de contexto. N8n requiere ensamblar la memoria modularmente de manera fragmentada, sin soporte nativo para hacer "checkpoints" del estado del agente en medio del flujo.2

Al forzar flujos cíclicos en n8n, se genera un "código espagueti" visual que se vuelve imposible de mantener, versionar en Git de forma semántica, y depurar en caso de fallas.1 LangGraph, al estar fundamentado en código puro (Python o TypeScript), permite a los ingenieros de software aplicar patrones de diseño sólidos, definir los nodos como funciones deterministas y establecer los bordes (edges) como lógica condicional estricta.

Para mitigar la preocupación sobre la pérdida de visibilidad operativa (la ventaja principal de n8n), la plataforma adoptará **LangGraph Studio** y los principios emergentes en herramientas como Google Antigravity. LangGraph Studio actúa como el primer Entorno de Desarrollo Integrado (IDE) para agentes. Proporciona una interfaz visual dinámica que grafica la arquitectura del agente y, más críticamente, permite interactuar y manipular el estado de la aplicación en tiempo real.4 Durante la depuración, un desarrollador puede utilizar el "viaje en el tiempo" (time travel) para retroceder a un paso específico donde el agente tomó una decisión incorrecta, modificar el prompt o la respuesta de la base de datos, y reanudar la ejecución desde ese punto.4 Esto provee una experiencia superior a la simple visualización de registros de red en n8n, uniendo la robustez del código con la facilidad de la interfaz gráfica.

### **Viabilidad de Modelos de Lenguaje (Gemma 27B vs. Alternativas Oficiales)**

Se planteó la interrogante sobre la viabilidad de usar Gemma 27B en Google AI Studio para un entorno de producción. El análisis técnico determina que, aunque Gemma 27B es un modelo abierto excepcionalmente capaz en tareas de razonamiento 9, **no es la opción recomendada para este sistema**. Su adopción introduce sobrecargas de alojamiento si se opta por infraestructura propia, o cuellos de botella de inferencia que comprometen el requerimiento no funcional estricto de latencia de chat inferior a 10 segundos en escenarios de alto volumen.

Como alternativa oficial y nativa dentro del ecosistema de Google Cloud, la plataforma debe estandarizarse sobre **Gemini 3 Flash**, lanzado en febrero de 2026\. Esta decisión se fundamenta en un análisis de costo y rendimiento (benchmarks). Gemini 3 Flash ofrece un nivel de inteligencia de "grado Pro" con una latencia extremadamente baja (procesando más de 200 tokens por segundo), lo cual permite interacciones conversacionales que se perciben instantáneas para el usuario final.10 A nivel económico, Gemini 3 Flash presenta una estructura de precios disruptiva, costando $0.50 por millón de tokens de entrada y $3.00 por millón de salida.33 Esto representa una reducción sustancial de los costos operativos en comparación con las variantes Pro de la misma generación (Gemini 3.1 Pro cuesta $2.00 de entrada y $12.00 de salida).34 Para las tareas de enrutamiento inicial, clasificación de intenciones y generación de respuestas de pedidos estándar, la velocidad y la eficiencia de costos de Gemini 3 Flash lo posicionan como la solución técnica superior.

## **Observabilidad Integral**

La observabilidad en sistemas deterministas es directa; en sistemas basados en modelos probabilísticos, se convierte en un pilar esencial para la confianza del producto. La estrategia divide la observabilidad en capas de infraestructura y de inteligencia artificial.

### **Métricas de Infraestructura con Prometheus y Grafana**

Aunque los servicios operarán en una plataforma administrada (Cloud Run), el equipo necesita visibilidad profunda sobre la salud de la red y el cómputo. Google Cloud Managed Service for Prometheus se utilizará para recolectar métricas clave que se visualizarán en dashboards de Grafana.

El monitoreo se centrará en la implementación de Service Level Indicators (SLIs) vinculados a Service Level Objectives (SLOs) de negocio 36:

* **Latencia (P95 y P99):** El tiempo transcurrido desde que el gateway recibe el evento de Kapso hasta que la respuesta de texto es devuelta a la API. El SLO exige que el 95% de las transacciones completen el ciclo en menos de 10 segundos.37 Si el P95 excede este umbral, se disparan alertas a los canales del equipo técnico (runbooks).  
* **Tasas de Error HTTP (5xx y 4xx):** Se debe medir la proporción de solicitudes fallidas atribuibles a caídas internas o tiempos de espera agotados en servicios externos (ej. fallos temporales en Convex o Vertex AI).  
* **Saturación:** Frecuencia de invocaciones simultáneas para detectar ráfagas inusuales de tráfico que puedan desencadenar limitaciones de cuotas (rate limits) imprevistas en los proveedores del LLM.

### **Evaluación y Visibilidad IA con Langfuse**

Langfuse será el eje central de las operaciones de ingeniería de IA, abarcando desde la instrumentación técnica hasta la optimización del negocio y la prevención de alucinaciones.16 Los módulos de la plataforma se aplicarán de la siguiente manera:

1. **Traces y Spans (Instrumentación):** La integración nativa mediante "callbacks" de LangChain asegura que cada nodo del grafo y cada invocación al LLM genere una traza asíncrona.16 El equipo podrá inspeccionar el prompt exacto inyectado en Gemini, la temperatura utilizada, el desglose de tokens y la latencia específica de esa llamada de inferencia, sin afectar el rendimiento del usuario final.  
2. **Sessions (Rastreo Multiturno):** Utilizando el número de teléfono del cliente como session\_id, Langfuse agrupará secuencialmente todas las trazas de una conversación a lo largo del tiempo.15 Esto es vital para depurar fallos de contexto a largo plazo (por ejemplo, cuando un usuario intenta modificar una orden creada hace 20 minutos).  
3. **Costos (Economía Unitaria):** Langfuse agregará el consumo de tokens y calculará el costo real en dólares por interacción y por sesión, permitiendo proyecciones financieras precisas y detectando si un agente está atrapado en un bucle costoso.39  
4. **Evaluaciones en Vivo (Scores):** Para mantener la calidad en producción, se implementarán evaluadores automatizados bajo el patrón "LLM-as-a-judge".15 Periódicamente (ej. muestreando el 5% del tráfico en vivo), un modelo paralelo analizará la respuesta del agente conversacional comparándola con las directrices del restaurante, asignando una puntuación binaria a la "Ausencia de Alucinación" y la "Relevancia de la Respuesta".15 Si la puntuación cae, la traza se etiqueta para revisión humana.  
5. **Datasets y Feedback Loops:** Los fallos identificados en producción (a través de evaluaciones deficientes o cuando la IA deriva abruptamente a un humano) se extraerán y guardarán en conjuntos de datos (Datasets) dentro de Langfuse. Estos escenarios fallidos se convierten en la base para el desarrollo iterativo.39 Antes de desplegar un cambio en la lógica del grafo o en un prompt, el sistema ejecutará experimentos (Experiments) automáticos contra estos datasets para asegurar que el problema original se resolvió sin causar nuevas regresiones.

## **Estrategia de Testing y TDD Pragmático**

El testing en aplicaciones de IA a menudo recae en evaluaciones cosméticas manuales que son insostenibles. Para este proyecto, el Desarrollo Guiado por Pruebas (TDD) se abordará mediante un paradigma pragmático de caja negra, enfocado en el valor funcional y los límites de la API.42

Se utilizarán pruebas guiadas por dominios, donde los escenarios de negocio dictan la estructura del test. El motor de IA se trata conceptualmente como un "compilador probabilístico", asumiendo que los errores provienen de contextos y restricciones mal formuladas más que del modelo en sí.44

### **Matriz de Pruebas API-Level**

La regla fundamental prohíbe las pruebas puramente estéticas. No se utilizarán interfaces de usuario móviles reales para validación. Las pruebas de integración simularán la llegada de mensajes inyectando JSONs emulados directamente al webhook de entrada, con estructuras idénticas a los contratos definidos por Kapso.ai.

* **Verificación de Respuesta:** Tras inyectar el evento de "mensaje de usuario", la suite de pruebas interceptará la solicitud POST saliente hacia la API de WhatsApp, validando que el formato del texto de respuesta coincida con las instrucciones de control.  
* **Verificación de Estado (Database Assertions):** La validación más crítica ocurre en la capa de datos. Después de que el LLM procesa un "quiero una hamburguesa con papas", la prueba interrogará a la base de datos Convex para afirmar que el campo estado\_carrito refleja las cantidades y asociaciones de productos correctas.17  
* **Estrategia Anti-Flaky:** La imprevisibilidad en los resultados del LLM puede causar pruebas intermitentes (flaky tests). Para combatirlo, durante el entorno de CI/CD, los modelos se instanciarán con una temperatura de 0.0 para forzar un comportamiento cuasi-determinista.15 Para respuestas más libres, se utilizarán afirmaciones semánticas (Semantic Assertions) apoyadas por los evaluadores locales de Langfuse, que puntúan la inclusión de palabras clave en lugar de requerir coincidencias exactas de cadenas de texto.15 Todo Pull Request (PR) en GitHub requerirá, como mínimo, la ejecución exitosa de la batería de pruebas de integración principal, proporcionando un reporte de cobertura como evidencia para permitir el despliegue.

## **Roadmap Incremental de Industrialización**

Dada la directiva explícita de que no existe una implementación operativa productiva que proteger, la transición se enfoca en una estrategia de construcción por fases, priorizando la validación temprana, la mitigación de riesgos de diseño y estableciendo métricas claras antes del lanzamiento a clientes reales. El modelo asume un equipo ágil de tamaño pequeño a mediano (3-4 ingenieros).

### **Fase 0: Fundación Técnica y Prueba de Concepto (POC)**

El objetivo es materializar la arquitectura base, validar las interfaces externas y desechar tecnologías incompatibles.

* **Alcance:** Aprovisionamiento de la infraestructura en GCP mediante módulos de Terraform.22 Configuración del monorepo en Turborepo con despliegue CI/CD hacia Cloud Run.21 Establecimiento del esquema de base de datos inicial en Convex y configuración de cuenta en Kapso.ai.5 El agente en LangGraph solo se configurará para recibir el mensaje, responder como un eco e insertar una traza en Langfuse.  
* **Riesgos:** Curva de aprendizaje escarpada al pasar del desarrollo visual (n8n) al código (LangGraph, TypeScript) e infraestructura como código.  
* **Mitigación:** Capacitación focalizada utilizando plantillas base de código abierto provistas por LangChain y Convex; limitar la complejidad de las integraciones iniciales.  
* **Métricas de Éxito:** Terraform se aplica sin errores; un mensaje enviado por WhatsApp de prueba atraviesa Kapso, activa el servicio en Cloud Run, y el eco se devuelve exitosamente y se visualiza en Langfuse con su cálculo de tokens.16  
* **Esfuerzo Persona-Semana:** 3 a 4 semanas.

### **Fase 1: Piloto Funcional e Implementación de Lógica ("Shadow Run")**

El foco migra hacia la consolidación algorítmica.

* **Alcance:** Transcripción completa de la lógica de negocio actual del MVP de Telegram hacia nodos de LangGraph. Esto incluye el Clasificador de Intenciones, el Subflujo de Preguntas (RAG sobre FAQ y Menú) y la máquina de estados de Pedidos.2 Integración transaccional con mutaciones de Convex para el carrito.17 Se ejecutará un "shadow test", donde el equipo inyectará cientos de transcripciones históricas del prototipo antiguo para asegurar la paridad funcional.  
* **Riesgos:** Pérdida del hilo conversacional o corrupción del estado acumulado al manejar casos de correcciones de usuario ("no, quita las papas, mejor ensalada").  
* **Mitigación:** Utilizar intensivamente LangGraph Studio para la depuración iterativa con el modelo de viaje en el tiempo (time travel) 4; creación de tests de escenarios (Domain-Driven TDD) cubriendo casos extremos.43  
* **Métricas de Éxito:** Ejecución exitosa del 100% de la matriz de pruebas automatizada; evaluación LLM-as-a-judge en Langfuse superior al 95% de precisión en recuperación de menú.15  
* **Esfuerzo Persona-Semana:** 6 a 8 semanas.

### **Fase 2: Producción Parcial (Soft Launch) e Integración Humana**

Preparación del sistema para el entorno real controlando daños potenciales.

* **Alcance:** Finalización e implementación del HandoffNode de Kapso.ai para derivar interacciones complejas, errores o clientes enojados hacia los operadores del restaurante.6 Capacitación de los operadores en el uso de la bandeja de entrada (Inbox) de Kapso.14 Apertura del canal de WhatsApp a un grupo cerrado de clientes (Beta testers / "Friends & Family").  
* **Riesgos:** La IA no detecta adecuadamente los niveles de frustración del usuario, reteniendo conversaciones que requieren atención humana, impactando la experiencia del cliente.14  
* **Mitigación:** Configuración de monitoreo en tiempo real mediante puntuaciones de retroalimentación (Scores) en Langfuse y alertas en canales operativos.15  
* **Mecanismo de Rollback:** En caso de fallas sistémicas del agente, el flujo de enrutamiento puede modificarse con un solo click para puentear a la IA y enviar todos los mensajes entrantes directamente al Inbox humano.6  
* **Esfuerzo Persona-Semana:** 4 semanas.

### **Fase 3: Lanzamiento General (Go-Live) y Optimización**

Estabilización operativa y apertura al público general.

* **Alcance:** Disponibilidad pública del número de WhatsApp empresarial. Puesta a punto de los tableros de rendimiento en Grafana para el seguimiento de los P95 de latencia de Cloud Run.36 Análisis post-lanzamiento en Langfuse para identificar oportunidades de reducción de tokens en los prompts.39  
* **Riesgos:** Incrementos exponenciales de volumen que disparen inesperadamente las facturaciones en los servicios administrados y las APIs de LLM.  
* **Mitigación:** Implementación de límites estrictos de presupuesto (budget caps) en Google Cloud y alertas en Langfuse al superar umbrales de costos por hora. Escalamiento automático de Cloud Run activado para soportar los picos sin configuración manual.  
* **Esfuerzo Persona-Semana:** 3 semanas (fase de hypercare).

### **Estimación Aproximada de Costos por Etapa**

En respuesta a la estimación financiera (Q15), y basándose en modelos de costos de herramientas IA a principios de 2026:

* **Fase 0 y 1 (Desarrollo y Pruebas Internas):**  
  * *Infraestructura (GCP):* $10 \- $20/mes (aprovechando cuotas gratuitas y escalado a cero de Cloud Run).  
  * *Base de Datos (Convex):* $0/mes (capacidad del plan Developer/Free suficiente para desarrollo).  
  * *LLM API (Gemini 3 Flash):* $10 \- $30/mes (volumen bajo exclusivo para validación).  
  * *Observabilidad (Langfuse):* $0 \- $29/mes (plan Hobby/Core).  
  * *WhatsApp (Kapso):* Pruebas gratuitas limitadas.  
* **Fase 2 (Soft Launch):**  
  * *Costos Generales:* Aumento paulatino en facturación de LLM y cuotas de plataforma de mensajería; total estimado $100 \- $250/mes.  
* **Fase 3 (Producción \- Estimando 50k \- 100k Interacciones/Mes):**  
  * *Infraestructura (GCP):* $50 \- $150/mes (según volumen de procesamiento activo y reglas NAT).  
  * *Base de Datos (Convex):* $50 \- $100/mes (paso a plan Pro para mayores garantías de retención).  
  * *LLM API (Gemini 3 Flash):* \~$50 \- $150/mes (debido al bajo costo de $0.50 y $3.00 por millón de tokens entrada/salida).33  
  * *WhatsApp / Kapso.ai:* $100 \- $300/mes (dependiendo fuertemente de las tarifas de conversión de Meta por ventana de atención).47  
  * *Observabilidad (Langfuse):* $199/mes (Plan Pro para acceso a analíticas avanzadas sin límites de volumen).48  
  * **Total Estimado Fase 3:** \~$450 \- $900 mensuales.

## **Delta SRS v1.1 (Especificación de Requisitos de Software)**

La migración de una solución prototipo hacia una infraestructura industrializada implica mutaciones severas en el documento base SRS v1.0. A continuación, el detalle trazable de los cambios:

### **Análisis de Cambios Antes \-\> Después**

| Sección SRS | Estado Anterior (v1.0) | Nuevo Estado Objetivo (v1.1) | Justificación e Impacto del Cambio |
| :---- | :---- | :---- | :---- |
| **1\. Alcance** | Interfaz conversacional vía Telegram; orquestación basada en nodos visuales sin persistencia de estado nativa. Derivación humana en estado "TBD". | Interfaz principal vía WhatsApp Cloud API administrada. Orquestación mediante ejecución de código cíclico (LangGraph). Handoff humano funcional e integrado. | Formalización del producto. Se abandona la prueba de concepto en Telegram por el canal definitivo exigido por el negocio. |
| **2.4 Supuestos y Dependencias** | 1\. n8n operativo. 2\. OpenAI API disponible (GPT-4o). 3\. Base de datos Postgres. | 1\. Google Cloud Run aprovisionado. 2\. Gemini 3 Flash disponible y operante. 3\. Plataforma Kapso.ai activa para enrutamiento. | Se reemplaza la dependencia de un servidor autogestionado (Postgres/n8n) por plataformas administradas de mayor disponibilidad. |
| **3\. Restricciones** | Calidad altamente dependiente del "prompt engineering" estático en bloques de texto; pruebas de regresión cosméticas. | Lógica de negocio codificada bajo estricto tipado (TypeScript). SLA de latencia fijado en \<=10s P95. Integración de observabilidad IA obligatoria. | Garantiza la reproducibilidad, validación determinista y mitigación de latencias excesivas en producción. |

### **Propuesta de Nuevos Identificadores Trazables**

**Nuevos Requisitos Funcionales (RF):**

* **RF-110:** El microservicio orquestador debe inicializar un modelo de máquina de estados (StateGraph de LangGraph) por cada sesión entrante única, recuperando el último punto de control de manera transparente.  
* **RF-111:** El sistema debe persistir el carrito de compras del usuario y las entidades extraídas mediante transacciones atómicas dentro de la base de datos Convex, garantizando consistencia inmediata frente a mutaciones concurrentes.17  
* **RF-112:** Ante la clasificación de una intención de "queja" o "derivación manual", el agente debe invocar la API respectiva (HandoffNode en Kapso.ai) para pausar la automatización y emitir una alerta a la bandeja de entrada humana.6

**Nuevos Requisitos No Funcionales (RNF):**

* **RNF-011:** El tiempo de procesamiento de extremo a extremo, medido desde la ingesta del webhook de Kapso hasta el despacho del POST de respuesta a la red, no debe exceder el percentil 95 (P95) de 10 segundos bajo carga normal.  
* **RNF-012:** Cada invocación algorítmica al modelo de lenguaje debe registrar sus trazas completas, distribución de tokens y costos asociados en la plataforma Langfuse de manera asíncrona (non-blocking).16  
* **RNF-013:** Todos los recursos de infraestructura en la nube deben ser declarados y aprovisionados mediante herramientas de Infraestructura como Código (Terraform), prohibiendo cambios manuales (click-ops) en consolas de producción.22

**Nuevas Interfaces Externas (IE):**

* **IE-006:** Kapso.ai Webhook Interface: Recepción de eventos JSON para mensajes entrantes de WhatsApp y administración del Handoff.  
* **IE-007:** Google Vertex AI API: Interfaz de comunicación para las invocaciones del modelo Gemini 3 Flash y Gemini 3.1 Pro.37

**Revisión y Cierre de Pendientes (TBD):**

* *TBD-001 (Implementación final Handoff+CRM):* Resuelto. Se delega íntegramente a las capacidades de Inbox nativas provistas por Kapso.ai.5  
* *TBD-002 (Canal final de producción):* Resuelto. Despliegue estandarizado en WhatsApp Business a través de proveedor BSP.  
* *TBD-005 (Versionado formal de prompts):* Resuelto. Se aborda mediante el módulo de Prompt Management de Langfuse y el control de versiones estándar de Git en el monorepo.  
* *Nuevo TBD-006:* Definición de protocolos automáticos de purga de datos PII (Identificación Personal) en la memoria histórica guardada en Convex, para cumplimiento de legislaciones de privacidad vigentes.

## **Backlog Inicial Ejecutable**

Este backlog se estructura priorizando el establecimiento de los cimientos (Fase 0\) seguido del desarrollo iterativo funcional (Fase 1), garantizando que las dependencias técnicas críticas se resuelvan primero.

| Prio | ID | Título de Tarea / Historia de Usuario | Criterio de Aceptación y Evidencia Requerida | Estimación (Pts) | Dependencias |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | TECH-01 | Configurar andamiaje Monorepo (Turborepo) | Repositorio estructurado en aplicaciones y paquetes. pnpm build compila concurrentemente con caché activado. | 3 | Ninguna |
| 2 | TECH-02 | Modelado de Esquemas Transaccionales Convex | Definición en TypeScript de tablas pedidos, menu, precios. Validado exitosamente contra el dashboard de Convex. | 5 | TECH-01 |
| 3 | TECH-03 | Bootstrapping GCP vía Terraform Blueprint | Ejecución de terraform apply crea VPC, habilita APIs y crea un servicio base en Cloud Run sin errores manuales. | 5 | Ninguna |
| 4 | TECH-04 | Enlace de cuenta Kapso.ai (Entorno Dev) | Un número virtual activo. Webhooks redirigidos vía túnel (ej. ngrok) a entorno local devolviendo código 200 OK. | 3 | Ninguna |
| 5 | FUNC-01 | Microservicio: Parseo de Webhooks HTTP | Recepción de JSON estándar de Kapso, extracción correcta de contact\_id y body\_text. Cobertura de tests del 90%. | 5 | TECH-01, TECH-04 |
| 6 | TECH-05 | Fundaciones de LangGraph (Grafo Mínimo) | Código en TypeScript/Python ejecuta un grafo de estado básico de dos nodos con transiciones estáticas exitosas. | 3 | TECH-01 |
| 7 | TECH-06 | Puente de Conexión a Gemini 3 Flash | Módulo LangChain instanciado apunta a la API de Vertex; el prompt de prueba retorna una generación válida. | 5 | TECH-05 |
| 8 | TECH-07 | Instrumentación global de Observabilidad (Langfuse) | Las ejecuciones de TECH-06 se reflejan en el dashboard de Langfuse detallando prompts, latencia y tokens utilizados. | 3 | TECH-06 |
| 9 | FUNC-02 | Nodo Algorítmico: Clasificación de Intenciones | El agente categoriza consistentemente 20 entradas predefinidas en clases (FAQ, Pedido, Queja) utilizando *zero-shot* prompts. | 8 | TECH-06 |
| 10 | FUNC-03 | Lógica Conversacional: Módulo FAQ y Menú | El agente recupera descripciones estáticas del catálogo en Convex y sintetiza respuestas basándose exclusivamente en esos datos. | 8 | TECH-02, FUNC-02 |
| 11 | FUNC-04 | Implementación de Checkpoints (Memoria de Sesión) | El StateGraph de LangGraph persiste su historial en Convex. El agente puede referenciar un elemento mencionado tres turnos atrás. | 8 | TECH-02, TECH-05 |
| 12 | FUNC-05 | Lógica Estructural: Extracción y Apertura de Pedidos | El agente identifica el artículo y la cantidad de la entrada del usuario natural, preparando las variables para su inserción. | 13 | FUNC-04 |
| 13 | FUNC-06 | Validación de Entidades vs. Catálogo | Intersección funcional: la extracción del agente en FUNC-05 se verifica contra Convex. Manejo de error si el producto no existe. | 8 | FUNC-05 |
| 14 | FUNC-07 | Motor Determinista de Cálculos y Totales | Funciones tradicionales (no dependientes de IA) escritas para Convex suman correctamente el precio por cantidades y aplican tasas. | 5 | FUNC-05 |
| 15 | FUNC-08 | Activación de Protocolo de Derivación (Handoff) | Cuando FUNC-02 emite "Queja", el servicio invoca el endpoint de Kapso para interrumpir la automatización y derivar al Inbox. | 8 | FUNC-02 |
| 16 | TECH-08 | Implementación de Puertas de Calidad (Quality Gates CI) | Las acciones de GitHub ejecutan linting uniforme, verificación de tipados de TypeScript y pruebas unitarias en todo nuevo PR. | 5 | TECH-01 |
| 17 | TECH-09 | Suite de Evaluaciones Offline (Golden Datasets) | Creación de conjunto de datos semilla en Langfuse. Pruebas iterativas superan la barrera del 95% de precisión sin intervención. | 8 | TECH-07, FUNC-05 |
| 18 | TECH-10 | Contenerización y Despliegue en Cloud Run | Las aplicaciones del monorepo se empaquetan en contenedores Docker eficientes, publicadas en el registro y operando bajo TLS. | 5 | TECH-03, FUNC-01 |
| 19 | TECH-11 | Alarmas y Monitoreo Activo (Prometheus/Grafana) | Dashboard principal refleja la tasa de peticiones y latencia P95. Se disparan alertas simuladas ante tiempos de respuesta \> 10s. | 5 | TECH-10 |
| 20 | FUNC-09 | Prueba Piloto Interna (Shadow/Dual Run) | El equipo ejecuta decenas de pedidos simulados de extremo a extremo vía WhatsApp de desarrollo sin corrupciones de estado observadas. | 13 | Todas |

## **Conclusiones Técnicas, Resolución de Riesgos y Evaluación Final**

La evolución de un asistente conversacional desde un prototipo funcional (MVP) a una aplicación de grado empresarial exige la desmitificación y sustitución de herramientas que, si bien son útiles para el prototipado rápido, introducen debilidades sistemáticas en la fase de industrialización a escala.

### **Síntesis de Riesgos Sistémicos y Planes de Mitigación**

El paso a producción conlleva una matriz de riesgos identificables que la arquitectura propuesta mitiga desde su diseño base:

1. **Riesgo Tecnológico (Arquitectura Frágil):** El intento inicial de acomodar la lógica compleja e indeterminista de los agentes de lenguaje en plataformas de flujos de trabajo estrictamente visuales y genéricos (n8n).  
   * *Impacto:* Código no versionable, nula capacidad de pruebas de regresión, pérdida de estado en interacciones largas, y altos costos de mantenimiento técnico.  
   * *Mitigación:* Migración agresiva a **LangGraph**. Esto consolida el control de estado, transforma la estructura visual en código testeable, y permite el manejo sofisticado de memoria. La adopción de LangGraph Studio rescata el beneficio visual de depuración, permitiendo a los ingenieros viajar a través del historial de decisiones del agente sin sacrificar la madurez del código.2  
2. **Riesgo Operativo (Inconsistencia de Datos):** Pérdida o corrupción del estado de un pedido debido a interacciones concurrentes de un usuario (ej. enviar múltiples mensajes seguidos modificando una orden).  
   * *Impacto:* Procesamiento de pedidos erróneos, insatisfacción del cliente e interrupción de la operación de cocina.  
   * *Mitigación:* Adopción de **Convex** como capa base transaccional. La ejecución atómica de funciones en el servidor (mutaciones) previene las condiciones de carrera que plagarían los modelos relacionales expuestos mediante funciones sin servidor (serverless) tradicionales y ORMs complejos.17  
3. **Riesgo de Experiencia del Usuario (Latencia de Respuesta):** Un asistente de chat no puede emular las demoras de las interfaces web clásicas; la demora en generar respuestas erosiona rápidamente la confianza.  
   * *Impacto:* Abandono del flujo de pedido y quejas por "congelamiento" del sistema.  
   * *Mitigación:* El mandato del P95 \<= 10s. Esto se resuelve descartando modelos gigantes (como Gemma 27B) o modelos Pro costosos computacionalmente, y alineando todo el procesamiento central hacia **Gemini 3 Flash**. La latencia optimizada y velocidad de producción de tokens de este modelo 10, combinada con arquitecturas stateless y la ejecución rápida en Google Cloud Run, asegura respuestas fluidas.29  
4. **Riesgo de Negocio (Integración Handoff):** La incapacidad del asistente IA de resolver el 100% de los conflictos o lidiar con situaciones emocionales delicadas de los clientes sin un plan de contingencia claro.  
   * *Impacto:* Deterioro en las tasas de conversión y crisis de imagen pública.  
   * *Mitigación:* Inclusión temprana del requerimiento humano dentro del esquema en la Fase 2, resuelto tecnológicamente mediante el uso de los endpoints nativos de gestión e interrupción de automatización provistos por **Kapso.ai**. La inteligencia del agente puede entonces configurarse deliberadamente para abortar su bucle algorítmico y abrir un ticket al personal si identifica la más mínima desviación de la intención estándar del pedido.7

En conclusión, la plataforma objetivo propuesta satisface de manera pragmática y directa los lineamientos de la industria de la Inteligencia Artificial del año 2026\. Al desagregar responsabilidades—Kapso.ai manejando las rigideces de WhatsApp, Cloud Run aportando la elasticidad del procesamiento, LangGraph dirigiendo la cognición con Langfuse proveyendo la observabilidad absoluta de ese proceso 16, y Convex aportando la garantía matemática de los estados 20—el equipo asegura una arquitectura que no solo es resiliente para escalar hasta las decenas de miles de pedidos conversacionales mensuales, sino que proporciona un entorno ergonómico y auditable para su futuro desarrollo y operación continua.

#### **Works cited**

1. LangGraph vs. n8n: The Real Question Isn't "Which?" But "When?" | by Owadokun Tosin Tobi | Jan, 2026 | Medium, accessed on February 27, 2026, [https://medium.com/@tosinowadokun11/langgraph-vs-n8n-the-real-question-isnt-which-but-when-474970642bae](https://medium.com/@tosinowadokun11/langgraph-vs-n8n-the-real-question-isnt-which-but-when-474970642bae)  
2. LangGraph vs n8n: Choosing the Right Framework for Agentic AI \- ZenML Blog, accessed on February 27, 2026, [https://www.zenml.io/blog/langgraph-vs-n8n](https://www.zenml.io/blog/langgraph-vs-n8n)  
3. n8n Native Agents vs LangChain & LangGraph: Enterprise Fit \- Ciphernutz, accessed on February 27, 2026, [https://ciphernutz.com/blog/n8n-ai-agents-vs-langchain-enterprise-architecture](https://ciphernutz.com/blog/n8n-ai-agents-vs-langchain-enterprise-architecture)  
4. LangGraph Studio: The first agent IDE \- LangChain Blog, accessed on February 27, 2026, [https://blog.langchain.com/langgraph-studio-the-first-agent-ide/](https://blog.langchain.com/langgraph-studio-the-first-agent-ide/)  
5. Kapso | WhatsApp for developers, accessed on February 27, 2026, [https://kapso.ai/](https://kapso.ai/)  
6. Handoff node \- Kapso Documentation, accessed on February 27, 2026, [https://docs.kapso.ai/docs/flows/step-types/handoff-node](https://docs.kapso.ai/docs/flows/step-types/handoff-node)  
7. WhatsApp Inbox \- Kapso Documentation, accessed on February 27, 2026, [https://docs.kapso.ai/docs/platform/inbox](https://docs.kapso.ai/docs/platform/inbox)  
8. In Comparison: Cloud Run vs. Google Kubernetes Engine \- happtiq, accessed on February 27, 2026, [https://www.happtiq.com/blog/cloud-run-vs-gke](https://www.happtiq.com/blog/cloud-run-vs-gke)  
9. Gemma 2 27B vs Gemini 1.5 Flash (002) \- Detailed Performance & Feature Comparison, accessed on February 27, 2026, [https://docsbot.ai/models/compare/gemma-2-27b/gemini-1-5-flash-002](https://docsbot.ai/models/compare/gemma-2-27b/gemini-1-5-flash-002)  
10. Gemini 2.5 Flash (Non-reasoning) Intelligence, Performance & Price Analysis, accessed on February 27, 2026, [https://artificialanalysis.ai/models/gemini-2-5-flash](https://artificialanalysis.ai/models/gemini-2-5-flash)  
11. Gemini 3 Flash: Full Guide to Google’s Massive AI Upgrade 2026, accessed on February 27, 2026, [https://www.youtube.com/watch?v=xTKz-ourO1A](https://www.youtube.com/watch?v=xTKz-ourO1A)  
12. Data Import & Export | Convex Developer Hub, accessed on February 27, 2026, [https://docs.convex.dev/database/import-export/](https://docs.convex.dev/database/import-export/)  
13. Convex vs Supabase: Which backend should you choose in 2026? | by Berto Mill \- Medium, accessed on February 27, 2026, [https://medium.com/@bertomill/convex-vs-supabase-which-backend-should-you-choose-in-2026-50d228c517de](https://medium.com/@bertomill/convex-vs-supabase-which-backend-should-you-choose-in-2026-50d228c517de)  
14. How does human handoff work with WhatsApp API? \- Brixxs, accessed on February 27, 2026, [https://brixxs.com/faq/how-does-human-handoff-work-with-whatsapp-api/](https://brixxs.com/faq/how-does-human-handoff-work-with-whatsapp-api/)  
15. LLM-as-a-Judge Evaluation: Complete Guide \- Langfuse, accessed on February 27, 2026, [https://langfuse.com/docs/scores/model-based-evals](https://langfuse.com/docs/scores/model-based-evals)  
16. LLM Observability & Application Tracing (Open Source) \- Langfuse, accessed on February 27, 2026, [https://langfuse.com/docs/observability/overview](https://langfuse.com/docs/observability/overview)  
17. Convex Overview | Convex Developer Hub, accessed on February 27, 2026, [https://docs.convex.dev/understanding/](https://docs.convex.dev/understanding/)  
18. How a “Neutral” Supabase vs Convex Comparison Broke Trust in DevTools, accessed on February 27, 2026, [https://dev.to/sivarampg/how-a-neutral-supabase-vs-convex-comparison-broke-trust-in-devtools-4108](https://dev.to/sivarampg/how-a-neutral-supabase-vs-convex-comparison-broke-trust-in-devtools-4108)  
19. Convex vs Supabase: Which backend should you choose in 2026? | by Robert Mill, accessed on February 27, 2026, [https://bertomill.medium.com/convex-vs-supabase-which-backend-should-you-choose-in-2026-50d228c517de](https://bertomill.medium.com/convex-vs-supabase-which-backend-should-you-choose-in-2026-50d228c517de)  
20. A Guide to Real-Time Databases for Faster, More Responsive Apps \- Stack by Convex, accessed on February 27, 2026, [https://stack.convex.dev/real-time-database](https://stack.convex.dev/real-time-database)  
21. Why I Chose Turborepo Over Nx: Monorepo Performance Without the Complexity \- Dev.to, accessed on February 27, 2026, [https://dev.to/saswatapal/why-i-chose-turborepo-over-nx-monorepo-performance-without-the-complexity-1afp](https://dev.to/saswatapal/why-i-chose-turborepo-over-nx-monorepo-performance-without-the-complexity-1afp)  
22. Terraform Best Practices on Google Cloud: A Practical Guide | by Cuong Truong | Medium, accessed on February 27, 2026, [https://medium.com/@truonghongcuong68/terraform-best-practices-on-google-cloud-a-practical-guide-057f96b19489](https://medium.com/@truonghongcuong68/terraform-best-practices-on-google-cloud-a-practical-guide-057f96b19489)  
23. terraform-google-modules/terraform-example-foundation: Shows how the CFT modules can be composed to build a secure cloud foundation \- GitHub, accessed on February 27, 2026, [https://github.com/terraform-google-modules/terraform-example-foundation](https://github.com/terraform-google-modules/terraform-example-foundation)  
24. GoogleCloudPlatform/terraform-google-cloud-run: Deploys apps to Cloud Run, along with option to map custom domain \- GitHub, accessed on February 27, 2026, [https://github.com/GoogleCloudPlatform/terraform-google-cloud-run](https://github.com/GoogleCloudPlatform/terraform-google-cloud-run)  
25. google\_cloud\_run\_service | Resources | hashicorp/google \- Terraform Registry, accessed on February 27, 2026, [https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/cloud\_run\_service](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/cloud_run_service)  
26. Building a Secure Serverless Microservice on GCP with VPC and Terraform | by Asif Shaikh, accessed on February 27, 2026, [https://medium.com/@asifsource/building-a-secure-serverless-microservice-on-gcp-with-vpc-and-terraform-05a1231fb972](https://medium.com/@asifsource/building-a-secure-serverless-microservice-on-gcp-with-vpc-and-terraform-05a1231fb972)  
27. Deploy a secured serverless architecture using Cloud Run functions, accessed on February 27, 2026, [https://docs.cloud.google.com/architecture/blueprints/serverless-functions-blueprint](https://docs.cloud.google.com/architecture/blueprints/serverless-functions-blueprint)  
28. Best practices for Terraform operations \- Google Cloud Documentation, accessed on February 27, 2026, [https://docs.cloud.google.com/docs/terraform/best-practices/operations](https://docs.cloud.google.com/docs/terraform/best-practices/operations)  
29. GKE versus Cloud Run. Are you a small, medium, or large… | by Mauro Di Pasquale, accessed on February 27, 2026, [https://medium.com/@maurodipa\_23725/gke-versus-cloud-run-522b22633070](https://medium.com/@maurodipa_23725/gke-versus-cloud-run-522b22633070)  
30. When to use GKE vs. Cloud Run for containers | Google Cloud Blog, accessed on February 27, 2026, [https://cloud.google.com/blog/products/containers-kubernetes/when-to-use-google-kubernetes-engine-vs-cloud-run-for-containers](https://cloud.google.com/blog/products/containers-kubernetes/when-to-use-google-kubernetes-engine-vs-cloud-run-for-containers)  
31. LangSmith Studio \- Docs by LangChain, accessed on February 27, 2026, [https://docs.langchain.com/langsmith/studio](https://docs.langchain.com/langsmith/studio)  
32. Gemini 3 Flash: frontier intelligence built for speed \- Google Blog, accessed on February 27, 2026, [https://blog.google/products-and-platforms/products/gemini/gemini-3-flash/](https://blog.google/products-and-platforms/products/gemini/gemini-3-flash/)  
33. Gemini 3 Flash vs. 2.5 Flash (67% Cost Increase), accessed on February 27, 2026, [https://www.reddit.com/r/Bard/comments/1pqyvq1/gemini\_3\_flash\_vs\_25\_flash\_67\_cost\_increase/](https://www.reddit.com/r/Bard/comments/1pqyvq1/gemini_3_flash_vs_25_flash_67_cost_increase/)  
34. Gemini 3 Flash vs Pro: Full Comparison of Speed, Price, and Reasoning \- GlobalGPT, accessed on February 27, 2026, [https://www.glbgpt.com/hub/gemini-3-flash-vs-pro/](https://www.glbgpt.com/hub/gemini-3-flash-vs-pro/)  
35. Gemini 3.1 Pro vs 3.0 Pro Preview Full Comparison: Detailed Breakdown of 9 Key Differences at the Same Price, accessed on February 27, 2026, [https://help.apiyi.com/en/gemini-3-1-pro-vs-3-pro-preview-comparison-guide-en.html](https://help.apiyi.com/en/gemini-3-1-pro-vs-3-pro-preview-comparison-guide-en.html)  
36. Terraform blueprints and modules for Google Cloud, accessed on February 27, 2026, [https://docs.cloud.google.com/docs/terraform/blueprints/terraform-blueprints](https://docs.cloud.google.com/docs/terraform/blueprints/terraform-blueprints)  
37. Google models | Generative AI on Vertex AI, accessed on February 27, 2026, [https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models)  
38. Open Source Observability for LangGraph \- Langfuse, accessed on February 27, 2026, [https://langfuse.com/guides/cookbook/integration\_langgraph](https://langfuse.com/guides/cookbook/integration_langgraph)  
39. AI Agent Observability, Tracing & Evaluation with Langfuse, accessed on February 27, 2026, [https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse](https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse)  
40. Observability in Multi-Step LLM Systems \- Langfuse Blog, accessed on February 27, 2026, [https://langfuse.com/blog/2024-10-observability-in-multi-step-llm-systems](https://langfuse.com/blog/2024-10-observability-in-multi-step-llm-systems)  
41. Evaluating Multi-Turn Conversations \- Langfuse Blog, accessed on February 27, 2026, [https://langfuse.com/blog/2025-10-09-evaluating-multi-turn-conversations](https://langfuse.com/blog/2025-10-09-evaluating-multi-turn-conversations)  
42. Automated structural testing of LLM-based agents: methods, framework, and case studies, accessed on February 27, 2026, [https://arxiv.org/html/2601.18827v1](https://arxiv.org/html/2601.18827v1)  
43. From Scenario to Finished: How to Test AI Agents with Domain-Driven TDD \- LangWatch, accessed on February 27, 2026, [https://langwatch.ai/blog/from-scenario-to-finished-how-to-test-ai-agents-with-domain-driven-tdd](https://langwatch.ai/blog/from-scenario-to-finished-how-to-test-ai-agents-with-domain-driven-tdd)  
44. How to Use LLMs for Coding Without Losing Your Mind: A Pragmatic Guide, accessed on February 27, 2026, [https://dev.to/suckup\_de/how-to-use-llms-for-coding-without-losing-your-mind-a-pragmatic-guide-1dap](https://dev.to/suckup_de/how-to-use-llms-for-coding-without-losing-your-mind-a-pragmatic-guide-1dap)  
45. Advanced Best Practices for Managing a Next.js Monorepo | by Ali Abdiyev \- Medium, accessed on February 27, 2026, [https://medium.com/@abdiev003/advanced-best-practices-for-managing-a-next-js-monorepo-2c505c875d98](https://medium.com/@abdiev003/advanced-best-practices-for-managing-a-next-js-monorepo-2c505c875d98)  
46. Getting started \- Kapso Documentation, accessed on February 27, 2026, [https://docs.kapso.ai/docs/platform/getting-started](https://docs.kapso.ai/docs/platform/getting-started)  
47. Pricing on the WhatsApp Business Platform | Developer ..., accessed on February 27, 2026, [https://developers.facebook.com/docs/whatsapp/pricing](https://developers.facebook.com/docs/whatsapp/pricing)  
48. Pricing \- Langfuse, accessed on February 27, 2026, [https://langfuse.com/pricing](https://langfuse.com/pricing)  
49. Models | Gemini API \- Google AI for Developers, accessed on February 27, 2026, [https://ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models)