# Unified Admin Products Design

The admin page should stop treating `menu` and `precios` as two separate manual loads. Staff will manage products from one UI section that includes:

- item name
- description
- price
- category
- availability
- aliases

To keep the chatbot stable, `menu` and `precios` will remain separate Convex tables, but admin writes will become atomic through new Convex functions:

- `listCatalogItemsForAdmin`
- `upsertCatalogItem`
- `deleteCatalogItem`

`upsertCatalogItem` will update both tables in one mutation, so the chatbot always sees synchronized product names, prices, and aliases. `deleteCatalogItem` will remove both records together.

The admin UI will replace the separate `Menu` and `Precios y aliases` sections with a single `Productos` section. FAQ stays as its own section. Because the conversation assistant already reloads catalog data from Convex on every message, changes made in admin will be reflected automatically in the chatbot with no extra sync step.
