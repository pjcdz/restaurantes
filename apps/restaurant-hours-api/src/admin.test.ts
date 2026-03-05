import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";

function buildAdminRepository() {
  return {
    getAdminData: vi.fn().mockResolvedValue({
      products: [],
      faq: []
    }),
    getHandedOffSessions: vi.fn().mockResolvedValue([]),
    reactivateSession: vi.fn().mockResolvedValue(undefined),
    upsertCatalogItem: vi.fn().mockResolvedValue(undefined),
    deleteCatalogItem: vi.fn().mockResolvedValue(undefined),
    upsertFaqEntry: vi.fn().mockResolvedValue(undefined),
    deleteFaqEntry: vi.fn().mockResolvedValue(undefined)
  };
}

describe("admin catalog routes", () => {
  it("renders a unified products section and faq section", async () => {
    const adminRepository = buildAdminRepository();
    adminRepository.getAdminData.mockResolvedValue({
      products: [
        {
          item: "Bacon King",
          descripcion: "Triple carne, triple cheddar",
          precio: 11200,
          categoria: "principal",
          disponible: true,
          aliases: ["bacon", "bk"]
        }
      ],
      faq: [
        {
          tema: "Horarios",
          pregunta: "hora, abierto, cierran",
          respuesta: "Abrimos de Martes a Domingo."
        }
      ]
    });
    // Skip auth for testing
    const app = createApp({ adminRepository, skipAuth: true });

    const response = await request(app).get("/admin");

    expect(response.status).toBe(200);
    expect(response.type).toMatch(/html/);
    expect(response.text).toContain("Panel interno de catalogo");
    expect(response.text).toContain("<h2>Productos</h2>");
    expect(response.text).toContain("Bacon King");
    expect(response.text).toContain("Triple carne, triple cheddar");
    expect(response.text).toContain("bacon, bk");
    expect(response.text).toContain('action="/admin/products"');
    expect(response.text).toContain('action="/admin/products/delete"');
    expect(response.text).not.toContain("Precios y aliases");
    expect(response.text).toContain("<h2>FAQ</h2>");
    expect(response.text).toContain("Horarios");
    expect(response.text).toContain('action="/admin/faq"');
    expect(response.text).toContain('action="/admin/faq/delete"');
    expect(response.text).toContain("return confirm(");
    expect(response.text).toContain("closeAllEditors");
    expect(adminRepository.getAdminData).toHaveBeenCalledTimes(1);
  });

  it("renders flash feedback when the admin page receives a success message", async () => {
    const adminRepository = buildAdminRepository();
    const app = createApp({ adminRepository, skipAuth: true });

    const response = await request(app)
      .get("/admin")
      .query({
        status: "success",
        message: "Producto guardado."
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain('class="flash flash-success"');
    expect(response.text).toContain("Producto guardado.");
  });

  it("renders flash feedback when the admin page receives an error message", async () => {
    const adminRepository = buildAdminRepository();
    const app = createApp({ adminRepository, skipAuth: true });

    const response = await request(app)
      .get("/admin")
      .query({
        status: "error",
        message: "No se pudo guardar."
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain('class="flash flash-error"');
    expect(response.text).toContain("No se pudo guardar.");
  });

  it("renders hardened client-side escaping and CSRF header for handoff actions", async () => {
    const adminRepository = buildAdminRepository();
    const app = createApp({ adminRepository, skipAuth: true });

    const response = await request(app).get("/admin");

    expect(response.status).toBe(200);
    expect(response.text).toContain('replaceAll("&", "&amp;")');
    expect(response.text).toContain('replaceAll("<", "&lt;")');
    expect(response.text).toContain('"X-CSRF-Token": csrfToken');
  });

  it("renders an inline product editor with aliases", async () => {
    const adminRepository = buildAdminRepository();
    adminRepository.getAdminData.mockResolvedValue({
      products: [
        {
          item: "Veggie Power",
          descripcion: "Medallon vegetal",
          precio: 9500,
          categoria: "principal",
          disponible: true,
          aliases: ["veggie", "veggie power"]
        }
      ],
      faq: []
    });
    const app = createApp({ adminRepository, skipAuth: true });

    const response = await request(app).get("/admin");

    expect(response.status).toBe(200);
    expect(response.text).toContain('id="product-edit-0"');
    expect(response.text).toContain('data-edit-target="product-edit-0"');
    expect(response.text).toContain('value="Veggie Power"');
    expect(response.text).toContain(">Medallon vegetal</textarea>");
    expect(response.text).toContain('value="9500"');
    expect(response.text).toContain('value="principal"');
    expect(response.text).toContain('value="veggie, veggie power"');
    expect(response.text).toContain('name="disponible" checked');
    expect(response.text).toContain("Guardar cambios");
  });

  it("defaults new product items to available in the create form", async () => {
    const adminRepository = buildAdminRepository();
    const app = createApp({ adminRepository, skipAuth: true });

    const response = await request(app).get("/admin");

    expect(response.status).toBe(200);
    expect(response.text).toContain('id="product-create-disponible"');
    expect(response.text).toContain('id="product-create-disponible" type="checkbox" name="disponible" checked');
  });

  it("upserts unified products from a form submission", async () => {
    const adminRepository = buildAdminRepository();
    const app = createApp({ adminRepository, skipAuth: true });

    const response = await request(app)
      .post("/admin/products")
      .type("form")
      .send({
        originalItem: "",
        item: "Super Pollon",
        descripcion: "Mucho pollo",
        precio: "4200",
        categoria: "polloburger",
        aliases: "super pollon, pollon",
        disponible: "on"
      });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/admin?status=success&message=Producto+guardado.");
    expect(adminRepository.upsertCatalogItem).toHaveBeenCalledWith({
      originalItem: null,
      item: "Super Pollon",
      descripcion: "Mucho pollo",
      precio: 4200,
      categoria: "polloburger",
      disponible: true,
      aliases: ["super pollon", "pollon"]
    });
  });

  it("deletes unified products from the admin page", async () => {
    const adminRepository = buildAdminRepository();
    const app = createApp({ adminRepository, skipAuth: true });

    const response = await request(app)
      .post("/admin/products/delete")
      .type("form")
      .send({
        item: "Super Pollon"
      });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/admin?status=success&message=Producto+borrado.");
    expect(adminRepository.deleteCatalogItem).toHaveBeenCalledWith("Super Pollon");
  });

  it("upserts faq entries from a form submission", async () => {
    const adminRepository = buildAdminRepository();
    const app = createApp({ adminRepository, skipAuth: true });

    const response = await request(app)
      .post("/admin/faq")
      .type("form")
      .send({
        tema: "Pagos",
        pregunta: "efectivo, mercado pago",
        respuesta: "Aceptamos efectivo y Mercado Pago."
      });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/admin?status=success&message=FAQ+guardada.");
    expect(adminRepository.upsertFaqEntry).toHaveBeenCalledWith({
      tema: "Pagos",
      pregunta: "efectivo, mercado pago",
      respuesta: "Aceptamos efectivo y Mercado Pago."
    });
  });

  it("deletes faq entries from the admin page", async () => {
    const adminRepository = buildAdminRepository();
    const app = createApp({ adminRepository, skipAuth: true });

    const response = await request(app)
      .post("/admin/faq/delete")
      .type("form")
      .send({
        tema: "Pagos"
      });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/admin?status=success&message=FAQ+borrada.");
    expect(adminRepository.deleteFaqEntry).toHaveBeenCalledWith("Pagos");
  });

  it("redirects back to the admin page with an error flash when saving a product fails", async () => {
    const adminRepository = buildAdminRepository();
    adminRepository.upsertCatalogItem.mockRejectedValue(new Error("boom"));
    const app = createApp({ adminRepository, skipAuth: true });

    const response = await request(app)
      .post("/admin/products")
      .type("form")
      .send({
        originalItem: "",
        item: "Super Pollon",
        descripcion: "Mucho pollo",
        precio: "4200",
        categoria: "polloburger",
        aliases: "super pollon, pollon",
        disponible: "on"
      });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/admin?status=error&message=No+se+pudo+guardar+el+producto.");
  });
});
