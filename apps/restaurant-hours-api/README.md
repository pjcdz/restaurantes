# Restaurant Hours API

## Stack actual (Fase 0 + Fase 1)

- Express sigue siendo el webhook gateway para Telegram.
- Convex persiste sesiones, checkpoints, catalogo y pedidos.
- LangGraph orquesta la clasificacion de intenciones y los subflujos FAQ/pedidos.
- Gemma 3 usa `google("gemma-3-27b-it")` con `GOOGLE_GENERATIVE_AI_API_KEY`.
- Langfuse corre self-hosted en Docker Compose y recibe las trazas del LLM.

## Variables de entorno

1. Usa `.env` para secretos del canal y del LLM.
2. Usa `.env.local` para los valores de Convex (`CONVEX_URL`, `CONVEX_DEPLOYMENT`, `CONVEX_SITE_URL`).
3. Si necesitas una base, parte de `.env.example`.

## Docker Compose local

1. Levanta todo el stack:

```bash
npm run docker:up
```

2. Registra el webhook actual de Telegram:

```bash
npm run docker:webhook:set
```

3. URLs locales:

```text
Langfuse UI: http://localhost:3000
API Express: http://localhost:3001
ngrok admin: http://localhost:4040
MinIO (Langfuse uploads): http://localhost:9090
```

4. Baja el stack:

```bash
npm run docker:down
```

## Notas

- `docker-compose.yml` ahora levanta `api`, `ngrok` y el stack self-hosted de Langfuse (`langfuse-web`, `langfuse-worker`, `postgres`, `redis`, `clickhouse`, `minio`).
- La API apunta por defecto al proyecto local de Langfuse con claves bootstrap (`pk-lf-local-public-key` y `sk-lf-local-secret-key`). Cambialas antes de exponer el entorno fuera de desarrollo.
- `npm run docker:webhook:set` sigue leyendo la URL publica desde el admin API de `ngrok`.
- El webhook que se registra sigue siendo `<ngrok-https-url>/telegram/webhook`.
- El SRS queda cubierto con persistencia base en Convex, memoria conversacional por checkpoints, FAQ/menu/pedidos, uso de Gemma 3 y observabilidad en Langfuse.
