# Multi-Item Order Agent Design

**Goal**

Evolve the current single-item conversational order flow into a production-oriented multi-item workflow that uses structured AI extraction, smaller specialized agents, and deterministic validation against Convex.

**Context**

The current implementation supports one extracted order line at a time and relies on rule-based parsing. The historical n8n reference (`n8n/Apertura-2.json`) used an AI agent with a structured output parser to update order state. This design ports that idea into code while keeping robust backend validation and state transitions inside LangGraph.

**Chosen Approach**

Use a hybrid architecture:
- AI interprets user intent and extracts structured order lines.
- Deterministic tools validate, merge, and persist state.
- Valid order lines are kept even when some lines are invalid.
- Invalid lines trigger clarification without losing valid progress.

This keeps the flexibility of natural-language understanding while preserving production safety.

**Architecture**

The workflow will introduce:
- An `intent router` agent that classifies the message into menu/faq/order/complaint and flags mixed intents.
- An `order extraction` agent that returns a structured list of requested lines: product text, quantity, and optional notes.
- Deterministic tools/functions that:
  - validate extracted lines against Convex aliases/products
  - merge new valid items into the current order draft
  - track invalid lines separately
  - recompute totals and missing fields
  - generate clarification prompts when needed

The conversation state will evolve from a single `orderDraft` focus to include:
- `requestedActions`
- `extractedOrderLines`
- `validatedItems`
- `invalidOrderLines`
- `orderDraft`

**Operational Rules**

- If all extracted items are valid, all are merged into the draft.
- If some are valid and some invalid, valid ones are merged and the reply asks only about invalid lines.
- If no items are valid, the system asks for clarification and does not mutate the order.
- If a product already exists in the draft, quantities are summed.
- Menu or FAQ queries during an active order do not erase the existing draft.

**Production Safety**

- The AI never writes directly to persistence.
- Convex-backed catalog validation is mandatory before mutating orders.
- Structured output is schema-constrained and treated as advisory until validated.
- Ambiguous/invalid extraction never causes destructive overwrites.

**Testing Strategy**

The implementation must cover:
- multiple products in one message
- incremental additions across separate messages
- same-product quantity accumulation
- partial-valid / partial-invalid extraction
- menu-plus-order mixed utterances
- full order completion after multi-item extraction
