import { type Response, Router } from "express";
import { createHash, randomBytes } from "crypto";

import { getConvexUrl, getJwtSecret } from "../config.js";
import {
  JwtAuthMiddleware,
  type AuthenticatedRequest
} from "../middleware/jwt-auth.js";
import { authRateLimiter } from "../middleware/rate-limiter.js";
import {
  ConvexAdminRepository,
  type CatalogAdminRepository,
  type HandoffAdminRepository,
  type HandedOffSession
} from "../services/convex-admin-repository.js";

// ============================================================================
// CSRF Protection
// ============================================================================

/**
 * CSRF token expiration time in milliseconds (1 hour)
 */
const CSRF_TOKEN_EXPIRATION_MS = 60 * 60 * 1000;

/**
 * Generates a CSRF token tied to the user's session.
 * The token includes a timestamp for expiration checking.
 *
 * @param sessionId - Unique identifier for the session (typically user ID from JWT)
 * @returns CSRF token string in format: timestamp:random:hash
 */
function generateCsrfToken(sessionId: string): string {
  const secret = getJwtSecret();
  const timestamp = Date.now().toString();
  const random = randomBytes(16).toString("hex");
  const data = `${sessionId}:${timestamp}:${random}:${secret}`;
  const hash = createHash("sha256").update(data).digest("hex");
  return `${timestamp}:${random}:${hash}`;
}

/**
 * Validates a CSRF token against the expected session.
 *
 * @param token - The CSRF token to validate (can be unknown from form body)
 * @param sessionId - The session ID to validate against
 * @returns true if token is valid and not expired, false otherwise
 */
function validateCsrfToken(token: unknown, sessionId: string): boolean {
  if (typeof token !== "string" || token.trim() === "") {
    return false;
  }

  const parts = token.split(":");
  if (parts.length !== 3) {
    return false;
  }

  const [timestampStr, random, providedHash] = parts;
  const timestamp = parseInt(timestampStr, 10);

  // Check if timestamp is valid
  if (isNaN(timestamp)) {
    return false;
  }

  // Check if token has expired
  if (Date.now() - timestamp > CSRF_TOKEN_EXPIRATION_MS) {
    return false;
  }

  // Regenerate the hash and compare
  const secret = getJwtSecret();
  const data = `${sessionId}:${timestampStr}:${random}:${secret}`;
  const expectedHash = createHash("sha256").update(data).digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEquals(providedHash, expectedHash);
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export type AdminRouteOptions = {
  adminRepository?: CatalogAdminRepository & HandoffAdminRepository;
  /** Skip JWT authentication (for testing purposes only) */
  skipAuth?: boolean;
  /** Skip CSRF validation (for testing purposes only) */
  skipCsrf?: boolean;
};

type ProductFormBody = {
  _csrf?: unknown;
  originalItem?: unknown;
  item?: unknown;
  descripcion?: unknown;
  precio?: unknown;
  categoria?: unknown;
  disponible?: unknown;
  aliases?: unknown;
};

type FaqFormBody = {
  _csrf?: unknown;
  tema?: unknown;
  pregunta?: unknown;
  respuesta?: unknown;
};

type AdminFlash = {
  kind: "error" | "success";
  message: string;
} | null;

const ADMIN_PAGE_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'"
].join(";");

/**
 * Creates the admin router with JWT authentication protection.
 *
 * All routes require a valid JWT token with `isAdmin: true` in the payload.
 * The token should be provided in the Authorization header as `Bearer <token>`.
 *
 * @param options - Configuration options including optional repository and auth skip
 * @returns Configured Express router with protected admin routes
 *
 * @example
 * ```typescript
 * // Access protected route with JWT
 * fetch('/admin/data', {
 *   headers: { 'Authorization': 'Bearer <your-jwt-token>' }
 * })
 * ```
 */
export function createAdminRouter(options: AdminRouteOptions = {}) {
  const router = Router();
  const resolveRepository: () => CatalogAdminRepository & HandoffAdminRepository =
    options.adminRepository === undefined
      ? () => new ConvexAdminRepository(getConvexUrl())
      : () => options.adminRepository as CatalogAdminRepository & HandoffAdminRepository;

  // SEC-02: JWT Authentication middleware for all admin routes
  // SEC-3: Rate limiter to protect against brute-force attacks on authentication
  if (!options.skipAuth) {
    const authMiddleware = new JwtAuthMiddleware();
    router.use(authRateLimiter);
    router.use(authMiddleware.authenticate.bind(authMiddleware));
  }

  // Helper to check CSRF when not skipped
  // When skipAuth is true, also skip CSRF for testing convenience
  const shouldValidateCsrf = !options.skipCsrf && !options.skipAuth;

  router.get("/", async (request, response, next) => {
    try {
      const adminData = await resolveRepository().getAdminData();
      const flash = resolveAdminFlash(request.query);
      response.setHeader("Content-Security-Policy", ADMIN_PAGE_CONTENT_SECURITY_POLICY);

      // Generate CSRF token for the authenticated user
      const authenticatedReq = request as AuthenticatedRequest;
      const userId = authenticatedReq.user?.sub ?? "anonymous";
      const csrfToken = shouldValidateCsrf ? generateCsrfToken(userId) : "test-csrf-token";

      return response.status(200).send(renderAdminPage(adminData, flash, csrfToken));
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
      const authenticatedReq = request as AuthenticatedRequest;
      const userId = authenticatedReq.user?.sub ?? "anonymous";
      const body = request.body as ProductFormBody;

      // CSRF validation (skip in test mode)
      if (shouldValidateCsrf && !validateCsrfToken(body._csrf, userId)) {
        return response.status(403).send("Invalid CSRF token");
      }

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
      const authenticatedReq = request as AuthenticatedRequest;
      const userId = authenticatedReq.user?.sub ?? "anonymous";
      const body = request.body as ProductFormBody;

      // CSRF validation (skip in test mode)
      if (shouldValidateCsrf && !validateCsrfToken(body._csrf, userId)) {
        return response.status(403).send("Invalid CSRF token");
      }

      await resolveRepository().deleteCatalogItem(requiredField(body.item));

      return redirectToAdmin(response, "success", "Producto borrado.");
    } catch (_error) {
      return redirectToAdmin(response, "error", "No se pudo borrar el producto.");
    }
  });

  router.post("/faq", async (request, response) => {
    try {
      const authenticatedReq = request as AuthenticatedRequest;
      const userId = authenticatedReq.user?.sub ?? "anonymous";
      const body = request.body as FaqFormBody;

      // CSRF validation (skip in test mode)
      if (shouldValidateCsrf && !validateCsrfToken(body._csrf, userId)) {
        return response.status(403).send("Invalid CSRF token");
      }

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
      const authenticatedReq = request as AuthenticatedRequest;
      const userId = authenticatedReq.user?.sub ?? "anonymous";
      const body = request.body as FaqFormBody;

      // CSRF validation (skip in test mode)
      if (shouldValidateCsrf && !validateCsrfToken(body._csrf, userId)) {
        return response.status(403).send("Invalid CSRF token");
      }

      await resolveRepository().deleteFaqEntry(requiredField(body.tema));

      return redirectToAdmin(response, "success", "FAQ borrada.");
    } catch (_error) {
      return redirectToAdmin(response, "error", "No se pudo borrar la FAQ.");
    }
  });

  // Handoff management routes
  router.get("/handoffs", async (request, response, next) => {
    try {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Pragma", "no-cache");
      response.setHeader("Expires", "0");
      const sessions = await resolveRepository().getHandedOffSessions();

      return response.status(200).json(sessions);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/handoffs/:chatId/reactivate", async (request, response, next) => {
    try {
      const authenticatedReq = request as AuthenticatedRequest;
      const userId = authenticatedReq.user?.sub ?? "anonymous";
      const csrfToken = request.header("X-CSRF-Token");

      if (shouldValidateCsrf && !validateCsrfToken(csrfToken, userId)) {
        return response.status(403).json({ success: false, message: "Invalid CSRF token" });
      }

      const chatId = request.params.chatId;

      await resolveRepository().reactivateSession(chatId);

      return response.status(200).json({ success: true, message: "Session reactivated" });
    } catch (error) {
      return next(error);
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
  flash: AdminFlash,
  csrfToken: string
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
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
              <input type="hidden" name="item" value="${escapeHtml(product.item)}" />
              <button type="submit" class="button-danger">Borrar</button>
            </form>
          </td>
        </tr>
        <tr id="product-edit-${index}" class="editor-row" hidden>
          <td colspan="7">
            <form method="post" action="/admin/products" class="row-editor">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
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
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
              <input type="hidden" name="tema" value="${escapeHtml(entry.tema)}" />
              <button type="submit" class="button-danger">Borrar</button>
            </form>
          </td>
        </tr>
        <tr id="faq-edit-${index}" class="editor-row" hidden>
          <td colspan="4">
            <form method="post" action="/admin/faq" class="row-editor">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
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
      .handoff-notice {
        margin: 0 0 12px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid #e3b04b;
        background: #fff4d6;
        color: #5d4300;
        font-weight: 600;
      }
      .handoff-notice[hidden] {
        display: none;
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
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
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
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
            <label>Tema<input name="tema" required /></label>
            <label>Keywords o pregunta<textarea name="pregunta" required></textarea></label>
            <label>Respuesta<textarea name="respuesta" required></textarea></label>
            <button type="submit">Agregar FAQ</button>
            </form>
          </section>
          <section class="card" id="handoffs-section">
            <h2>Conversaciones Derivadas</h2>
            <p class="hint">Conversaciones donde la IA fue desactivada para atencion humana.</p>
            <p id="handoffs-notice" class="handoff-notice" role="status" aria-live="polite" hidden>
              Nuevas derivaciones pendientes: <span id="handoffs-notice-count">0</span>
            </p>
            <table>
              <thead>
                <tr>
                  <th>Chat ID</th>
                  <th>Telefono</th>
                  <th>Derivado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody id="handoffs-tbody">
                <tr id="handoffs-loading">
                  <td colspan="4" style="text-align: center;">Cargando...</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </main>
      <script>
        const csrfToken = "${escapeHtml(csrfToken)}";
        const handoffNotice = document.getElementById("handoffs-notice");
        const handoffNoticeCount = document.getElementById("handoffs-notice-count");
        const knownHandoffUpdateByChatId = new Map();
        const notifiedHandoffChatIds = new Set();
        let hasLoadedHandoffs = false;
        let handoffsRequestInFlight = false;

        function updateHandoffNotice(pendingCount) {
          if (!(handoffNotice instanceof HTMLElement) || !(handoffNoticeCount instanceof HTMLElement)) {
            return;
          }

          if (pendingCount <= 0) {
            handoffNotice.hidden = true;
            handoffNoticeCount.textContent = "0";
            return;
          }

          handoffNotice.hidden = false;
          handoffNoticeCount.textContent = String(pendingCount);
        }

        function syncHandoffNotifications(sessions, shouldTrackNew) {
          const activeChatIds = new Set();

          for (const session of sessions) {
            const chatId = String(session.chatId);
            const updatedAt = Number(session.updatedAt);
            const normalizedUpdatedAt = Number.isFinite(updatedAt) ? updatedAt : Date.now();
            const previousUpdatedAt = knownHandoffUpdateByChatId.get(chatId);

            activeChatIds.add(chatId);
            knownHandoffUpdateByChatId.set(chatId, normalizedUpdatedAt);

            if (
              shouldTrackNew &&
              hasLoadedHandoffs &&
              (previousUpdatedAt === undefined || normalizedUpdatedAt > previousUpdatedAt)
            ) {
              notifiedHandoffChatIds.add(chatId);
            }
          }

          for (const trackedChatId of Array.from(notifiedHandoffChatIds)) {
            if (!activeChatIds.has(trackedChatId)) {
              notifiedHandoffChatIds.delete(trackedChatId);
            }
          }

          hasLoadedHandoffs = true;
          updateHandoffNotice(notifiedHandoffChatIds.size);
        }

        // Handoffs management
        async function loadHandoffs(trackNotifications = false) {
          const tbody = document.getElementById("handoffs-tbody");
          if (!tbody) return;

          if (handoffsRequestInFlight) {
            return;
          }

          handoffsRequestInFlight = true;
  
          try {
            const response = await fetch("/admin/handoffs", { cache: "no-store" });
            if (!response.ok) throw new Error("Failed to load handoffs");
            const sessions = await response.json();
            syncHandoffNotifications(sessions, trackNotifications);
  
            if (sessions.length === 0) {
              tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #6f5c47;">No hay conversaciones derivadas</td></tr>';
              return;
            }
  
            tbody.innerHTML = sessions.map(session => {
              const date = new Date(session.updatedAt);
              const formattedDate = date.toLocaleString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              });
              return '<tr>' +
                '<td><code>' + escapeHtml(session.chatId) + '</code></td>' +
                '<td>' + (session.phoneNumber ? escapeHtml(session.phoneNumber) : '-') + '</td>' +
                '<td>' + formattedDate + '</td>' +
                '<td class="actions">' +
                  '<button type="button" class="button-secondary" onclick="reactivateSession(\\'' + escapeHtml(session.chatId) + '\\')">Reactivar IA</button>' +
                '</td>' +
              '</tr>';
            }).join("");
          } catch (error) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #8a2f24;">Error al cargar conversaciones derivadas</td></tr>';
          } finally {
            handoffsRequestInFlight = false;
          }
        }
  
        async function reactivateSession(chatId) {
          if (!confirm("Seguro que quieres reactivar la IA para esta conversacion?")) return;
  
          try {
            const response = await fetch("/admin/handoffs/" + encodeURIComponent(chatId) + "/reactivate", {
              method: "POST",
              headers: {
                "X-CSRF-Token": csrfToken
              }
            });
            if (!response.ok) throw new Error("Failed to reactivate");
            await loadHandoffs(false);
          } catch (error) {
            alert("Error al reactivar la conversacion");
          }
        }
  
        function escapeHtml(value) {
          return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
        }
  
        // Load handoffs on page load
        void loadHandoffs();
        setInterval(() => {
          void loadHandoffs(true);
        }, 2000);
  
        // Existing editor functionality
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
