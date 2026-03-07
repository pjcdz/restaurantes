# Edge Case Judge Reliability Improvements Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Subir la categoría `edge_case` del AI judge y eliminar fallos en manejo de productos inexistentes, pedidos ambiguos y consulta de total.

**Architecture:** Ajustes focalizados sobre `conversation-assistant.ts` sin cambiar arquitectura: enriquecer respuestas de invalidación de producto con sugerencias de menú, detectar consultas de total sobre pedido activo, y pedir aclaración de variante/cantidad para pedidos genéricos (hamburguesas).

**Tech Stack:** TypeScript, Vitest, LangGraph conversation assistant, AI Judge runner.

---

## Execution Results (2026-03-06)

- Baseline (`/tmp/edge-case-before.json`):
  - `edge_case`: `2/5` passed
  - `passRate`: `40%`
  - `avgScore`: `69`
  - Fallas: `E1=65`, `E3=65`, `E4=65`

- Fixes implementados:
  - Sugerencias de productos disponibles cuando no se identifica un item y no hay carrito activo.
  - Detección de consulta de total (`cuanto es`, `cuanto sale`, `cuanto cuesta`, `total`) durante flujo de pedido.
  - Respuesta específica para ambigüedad de “hamburguesas”: pedir variante + cantidad.
  - Tests nuevos de cobertura para:
    - consulta de total,
    - producto no encontrado con sugerencias,
    - pedido ambiguo de hamburguesas.

- Validación final (`/tmp/edge-case-after2.json`):
  - `edge_case`: `5/5` passed
  - `passRate`: `100%`
  - `avgScore`: `75`
  - Scores: `E1=75`, `E2=75`, `E3=75`, `E4=75`, `E5=75`

- Tests locales:
  - `npm test -- src/services/conversation-assistant.test.ts` ✅
