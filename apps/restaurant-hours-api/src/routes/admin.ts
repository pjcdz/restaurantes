import { type Response, Router } from "express";

import { getConvexUrl } from "../config.js";
import {
  ConvexAdminRepository,
  type CatalogAdminRepository
} from "../services/convex-admin-repository.js";

export type AdminRouteOptions = {
  adminRepository?: CatalogAdminRepository;
};

type ProductFormBody = {
  originalItem?: unknown;
  item?: unknown;
  descripcion?: unknown;
  precio?: unknown;
  categoria?: unknown;
  disponible?: unknown;
  aliases?: unknown;
};

type FaqFormBody = {
  tema?: unknown;
  pregunta?: unknown;
  respuesta?: unknown;
};

type AdminFlash = {
  kind: "error" | "success";
  message: string;
} | null;

export function createAdminRouter(options: AdminRouteOptions = {}) {
  const router = Router();
  const resolveRepository: () => CatalogAdminRepository =
    options.adminRepository === undefined
      ? () => new ConvexAdminRepository(getConvexUrl())
      : () => options.adminRepository as CatalogAdminRepository;

  router.get("/", async (request, response, next) => {
    try {
      const adminData = await resolveRepository().getAdminData();
      const flash = resolveAdminFlash(request.query);

      return response.status(200).send(renderAdminPage(adminData, flash));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/data", async (request, response, next) => {
    try {
      const adminData = await resolveRepository().getAdminData();
      const catalogSnapshot = {
        menu: adminData.products.map((p) => ({
          item: p.item,
          descripcion: p.descripcion,
          precio: p.precio,
          categoria: p.categoria,
          disponible: p.disponible
        })),
        faq: adminData.faq,
        prices: adminData.products.map((p) => ({
          producto: p.item,
          precioUnitario: p.precio,
          aliases: p.aliases
        }))
      };

      return response.status(200).json(catalogSnapshot);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/products", async (request, response) => {
    try {
      const body = request.body as ProductFormBody;

      await resolveRepository().upsertCatalogItem({
        originalItem: optionalNullableField(body.originalItem),
        item: requiredField(body.item),
        descripcion: requiredField(body.descripcion),
        precio: requiredNumber(body.precio, "precio"),
        categoria: requiredField(body.categoria),
        disponible: body.disponible === "on",
        aliases: normalizeAliases(body.aliases)
      });

      return redirectToAdmin(response, "success", "Producto guardado.");
    } catch (_error) {
      return redirectToAdmin(response, "error", "No se pudo guardar el producto.");
    }
  });

  router.post("/products/delete", async (request, response) => {
    try {
      const body = request.body as ProductFormBody;

      await resolveRepository().deleteCatalogItem(requiredField(body.item));

      return redirectToAdmin(response, "success", "Producto borrado.");
    } catch (_error) {
      return redirectToAdmin(response, "error", "No se pudo borrar el producto.");
    }
  });

  router.post("/faq", async (request, response) => {
    try {
      const body = request.body as FaqFormBody;

      await resolveRepository().upsertFaqEntry({
        tema: requiredField(body.tema),
        pregunta: requiredField(body.pregunta),
        respuesta: requiredField(body.respuesta)
      });

      return redirectToAdmin(response, "success", "FAQ guardada.");
    } catch (_error) {
      return redirectToAdmin(response, "error", "No se pudo guardar la FAQ.");
    }
  });

  router.post("/faq/delete", async (request, response) => {
    try {
      const body = request.body as FaqFormBody;

      await resolveRepository().deleteFaqEntry(requiredField(body.tema));

      return redirectToAdmin(response, "success", "FAQ borrada.");
    } catch (_error) {
      return redirectToAdmin(response, "error", "No se pudo borrar la FAQ.");
    }
  });

  return router;
}

function requiredField(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("A required form field is missing.");
  }

  return value.trim();
}

function optionalNullableField(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue === "" ? null : normalizedValue;
}

function requiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be present.`);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  return parsed;
}

function normalizeAliases(value: unknown): Array<string> {
  if (typeof value !== "string") {
    return [];
  }

  const uniqueAliases = new Set<string>();

  for (const alias of value.split(",")) {
    const normalizedAlias = alias.trim();

    if (!normalizedAlias) {
      continue;
    }

    uniqueAliases.add(normalizedAlias);
  }

  return Array.from(uniqueAliases);
}

function resolveAdminFlash(query: Record<string, unknown>): AdminFlash {
  const status = query.status;
  const message = query.message;

  if (
    typeof message !== "string" ||
    message.trim() === "" ||
    (status !== "success" && status !== "error")
  ) {
    return null;
  }

  return {
    kind: status,
    message: message.trim()
  };
}

function renderAdminPage(
  adminData: Awaited<ReturnType<CatalogAdminRepository["getAdminData"]>>,
  flash: AdminFlash
): string {
  const productRows = adminData.products
    .map(
      (product, index) => `
        <tr>
          <td>${escapeHtml(product.item)}</td>
          <td>${escapeHtml(product.descripcion)}</td>
          <td>$${product.precio}</td>
          <td>${escapeHtml(product.categoria)}</td>
          <td>${product.disponible ? "Si" : "No"}</td>
          <td>${escapeHtml(product.aliases.join(", "))}</td>
          <td class="actions">
            <button type="button" class="button-secondary" data-edit-target="product-edit-${index}">Editar</button>
            <form method="post" action="/admin/products/delete" class="inline-form" onsubmit="return confirm('Seguro que quieres borrar este registro?')">
              <input type="hidden" name="item" value="${escapeHtml(product.item)}" />
              <button type="submit" class="button-danger">Borrar</button>
            </form>
          </td>
        </tr>
        <tr id="product-edit-${index}" class="editor-row" hidden>
          <td colspan="7">
            <form method="post" action="/admin/products" class="row-editor">
              <input type="hidden" name="originalItem" value="${escapeHtml(product.item)}" />
              <label>Nombre del item<input name="item" value="${escapeHtml(product.item)}" required /></label>
              <label>Descripcion<textarea name="descripcion" required>${escapeHtml(product.descripcion)}</textarea></label>
              <label>Precio<input name="precio" value="${product.precio}" inputmode="numeric" required /></label>
              <label>Categoria<input name="categoria" value="${escapeHtml(product.categoria)}" required /></label>
              <label>Aliases (separados por coma)<input name="aliases" value="${escapeHtml(product.aliases.join(", "))}" /></label>
              <label class="checkbox"><input type="checkbox" name="disponible" ${product.disponible ? "checked" : ""} />Disponible</label>
              <div class="editor-actions">
                <button type="submit">Guardar cambios</button>
                <button type="button" class="button-muted" data-close-target="product-edit-${index}">Cancelar</button>
              </div>
            </form>
          </td>
        </tr>`
    )
    .join("");
  const faqRows = adminData.faq
    .map(
      (entry, index) => `
        <tr>
          <td>${escapeHtml(entry.tema)}</td>
          <td>${escapeHtml(entry.pregunta)}</td>
          <td>${escapeHtml(entry.respuesta)}</td>
          <td class="actions">
            <button type="button" class="button-secondary" data-edit-target="faq-edit-${index}">Editar</button>
            <form method="post" action="/admin/faq/delete" class="inline-form" onsubmit="return confirm('Seguro que quieres borrar este registro?')">
              <input type="hidden" name="tema" value="${escapeHtml(entry.tema)}" />
              <button type="submit" class="button-danger">Borrar</button>
            </form>
          </td>
        </tr>
        <tr id="faq-edit-${index}" class="editor-row" hidden>
          <td colspan="4">
            <form method="post" action="/admin/faq" class="row-editor">
              <label>Tema<input name="tema" value="${escapeHtml(entry.tema)}" required /></label>
              <label>Keywords o pregunta<textarea name="pregunta" required>${escapeHtml(entry.pregunta)}</textarea></label>
              <label>Respuesta<textarea name="respuesta" required>${escapeHtml(entry.respuesta)}</textarea></label>
              <div class="editor-actions">
                <button type="submit">Guardar cambios</button>
                <button type="button" class="button-muted" data-close-target="faq-edit-${index}">Cancelar</button>
              </div>
            </form>
          </td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Admin catalogo</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        background: #f4f1ea;
        color: #2b1f16;
      }
      main {
        max-width: 1080px;
        margin: 0 auto;
        padding: 24px;
      }
      h1, h2, h3 {
        margin: 0 0 12px;
      }
      .grid {
        display: grid;
        gap: 24px;
      }
      .card {
        background: #fffdf8;
        border: 1px solid #d8cfc2;
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 8px 24px rgba(43, 31, 22, 0.08);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 16px;
      }
      .editor-row[hidden] {
        display: none;
      }
      th, td {
        text-align: left;
        padding: 8px;
        border-bottom: 1px solid #e8dfd3;
        vertical-align: top;
      }
      form {
        display: grid;
        gap: 12px;
      }
      .inline-form {
        display: inline-flex;
        margin: 0;
      }
      .row-editor {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        align-items: end;
      }
      label {
        display: grid;
        gap: 6px;
        font-size: 14px;
      }
      input, textarea {
        width: 100%;
        border: 1px solid #cabda9;
        border-radius: 8px;
        padding: 10px 12px;
        font: inherit;
        box-sizing: border-box;
      }
      textarea {
        min-height: 84px;
        resize: vertical;
      }
      .checkbox {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .checkbox input {
        width: auto;
      }
      button {
        width: fit-content;
        border: 0;
        border-radius: 999px;
        padding: 10px 16px;
        background: #c44e24;
        color: #fff;
        font: inherit;
        cursor: pointer;
      }
      .button-secondary {
        background: #7c5d3b;
      }
      .button-danger {
        background: #8f2f23;
      }
      .button-muted {
        background: #b9a996;
        color: #2b1f16;
      }
      .hint {
        margin: 0 0 12px;
        color: #6f5c47;
      }
      .flash {
        margin: 0 0 18px;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid transparent;
      }
      .flash-success {
        background: #e6f4ea;
        border-color: #a7d7b3;
        color: #1f5b32;
      }
      .flash-error {
        background: #fdeceb;
        border-color: #e8b4af;
        color: #8a2f24;
      }
      .actions {
        white-space: nowrap;
      }
      .actions form + form {
        margin-left: 8px;
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .editor-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Panel interno de catalogo</h1>
      <p class="hint">Usalo para ajustar productos y FAQ. Los cambios se reflejan automaticamente en el chatbot.</p>
      ${flash === null ? "" : `<p class="flash flash-${flash.kind}">${escapeHtml(flash.message)}</p>`}
      <div class="grid">
        <section class="card">
          <h2>Productos</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Descripcion</th>
                <th>Precio</th>
                <th>Categoria</th>
                <th>Disponible</th>
                <th>Aliases</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>${productRows}</tbody>
          </table>
          <div class="toolbar">
            <h3>Agregar producto</h3>
          </div>
          <form method="post" action="/admin/products">
            <input type="hidden" name="originalItem" value="" />
            <label>Nombre del item<input name="item" required /></label>
            <label>Descripcion<textarea name="descripcion" required></textarea></label>
            <label>Precio<input name="precio" inputmode="numeric" required /></label>
            <label>Categoria<input name="categoria" required /></label>
            <label>Aliases (separados por coma)<input name="aliases" /></label>
            <label class="checkbox"><input id="product-create-disponible" type="checkbox" name="disponible" checked />Disponible</label>
            <button type="submit">Agregar producto</button>
          </form>
        </section>
        <section class="card">
          <h2>FAQ</h2>
          <table>
            <thead>
              <tr>
                <th>Tema</th>
                <th>Keywords</th>
                <th>Respuesta</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>${faqRows}</tbody>
          </table>
          <div class="toolbar">
            <h3>Agregar FAQ</h3>
          </div>
          <form method="post" action="/admin/faq">
            <label>Tema<input name="tema" required /></label>
            <label>Keywords o pregunta<textarea name="pregunta" required></textarea></label>
            <label>Respuesta<textarea name="respuesta" required></textarea></label>
            <button type="submit">Agregar FAQ</button>
          </form>
        </section>
      </div>
    </main>
    <script>
      function closeAllEditors() {
        for (const row of document.querySelectorAll(".editor-row")) {
          if (row instanceof HTMLTableRowElement) {
            row.hidden = true;
          }
        }
      }

      document.addEventListener("click", (event) => {
        const target = event.target;

        if (!(target instanceof HTMLElement)) {
          return;
        }

        const trigger = target.closest("[data-edit-target], [data-close-target]");

        if (!(trigger instanceof HTMLElement)) {
          return;
        }

        const targetId =
          trigger.getAttribute("data-edit-target") ??
          trigger.getAttribute("data-close-target");

        if (!targetId) {
          return;
        }

        const row = document.getElementById(targetId);

        if (!(row instanceof HTMLTableRowElement)) {
          return;
        }

        if (trigger.hasAttribute("data-edit-target")) {
          const shouldOpen = row.hidden;
          closeAllEditors();
          row.hidden = !shouldOpen;
          return;
        }

        row.hidden = true;
      });
    </script>
  </body>
</html>`;
}

function redirectToAdmin(
  response: Response,
  status: "error" | "success",
  message: string
) {
  const params = new URLSearchParams({
    status,
    message
  });

  return response.redirect(`/admin?${params.toString()}`);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
