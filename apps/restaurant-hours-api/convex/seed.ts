import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Seed the database with initial menu, prices, and FAQ data
 * Run this mutation once to populate the database
 */
export const seedDatabase = mutation({
  args: {},
  returns: v.object({
    menuItems: v.number(),
    precios: v.number(),
    faqEntries: v.number(),
  }),
  handler: async (ctx, args) => {
    // Seed menu items
    const menuItems = [
      { item: "Hamburguesa Clásica", descripcion: "Hamburguesa con carne, lechuga, tomate y salsa especial", precio: 2500, categoria: "hamburguesas", disponible: true },
      { item: "Hamburguesa Doble", descripcion: "Doble carne, doble queso, lechuga, tomate y salsa", precio: 3500, categoria: "hamburguesas", disponible: true },
      { item: "Hamburguesa con Queso", descripcion: "Hamburguesa con queso cheddar, lechuga y tomate", precio: 2800, categoria: "hamburguesas", disponible: true },
      { item: "Papas Fritas", descripcion: "Papas fritas crujientes", precio: 1200, categoria: "acompañamientos", disponible: true },
      { item: "Papas con Queso", descripcion: "Papas fritas con salsa de queso", precio: 1500, categoria: "acompañamientos", disponible: true },
      { item: "Coca Cola", descripcion: "Bebida gaseosa 500ml", precio: 800, categoria: "bebidas", disponible: true },
      { item: "Sprite", descripcion: "Bebida gaseosa 500ml", precio: 800, categoria: "bebidas", disponible: true },
      { item: "Agua Mineral", descripcion: "Agua mineral 500ml", precio: 600, categoria: "bebidas", disponible: true },
      { item: "Combo Clásico", descripcion: "Hamburguesa Clásica + Papas Fritas + Bebida", precio: 4000, categoria: "combos", disponible: true },
      { item: "Combo Doble", descripcion: "Hamburguesa Doble + Papas con Queso + Bebida", precio: 5200, categoria: "combos", disponible: true },
    ];

    // Seed prices
    const precios = [
      { producto: "Hamburguesa Clásica", precioUnitario: 2500 },
      { producto: "Hamburguesa Doble", precioUnitario: 3500 },
      { producto: "Hamburguesa con Queso", precioUnitario: 2800 },
      { producto: "Papas Fritas", precioUnitario: 1200 },
      { producto: "Papas con Queso", precioUnitario: 1500 },
      { producto: "Coca Cola", precioUnitario: 800 },
      { producto: "Sprite", precioUnitario: 800 },
      { producto: "Agua Mineral", precioUnitario: 600 },
      { producto: "Combo Clásico", precioUnitario: 4000 },
      { producto: "Combo Doble", precioUnitario: 5200 },
    ];

    // Seed FAQ entries
    const faqEntries = [
      { tema: "horarios", pregunta: "¿Cuáles son los horarios de atención?", respuesta: "Atendemos de Lunes a Viernes de 11:00 a 23:00, y Sábados y Domingos de 12:00 a 00:00." },
      { tema: "ubicacion", pregunta: "¿Dónde están ubicados?", respuesta: "Estamos en Av. Principal 123, en el centro de la ciudad." },
      { tema: "delivery", pregunta: "¿Hacen delivery?", respuesta: "Sí, hacemos delivery en un radio de 3km. El envío es gratis para pedidos mayores a $3000." },
      { tema: "pagos", pregunta: "¿Qué métodos de pago aceptan?", respuesta: "Aceptamos efectivo, tarjetas de crédito/débito (Visa, Mastercard) y MercadoPago." },
      { tema: "reservas", pregunta: "¿Toman reservas?", respuesta: "Sí, puedes reservar llamando al 11-1234-5678 o por este chat con anticipación." },
      { tema: "estacionamiento", pregunta: "¿Tienen estacionamiento?", respuesta: "Sí, contamos con estacionamiento gratuito para clientes." },
    ];

    // Insert menu items
    let menuCount = 0;
    for (const item of menuItems) {
      await ctx.db.insert("menu", item);
      menuCount++;
    }

    // Insert prices
    let preciosCount = 0;
    for (const precio of precios) {
      await ctx.db.insert("precios", precio);
      preciosCount++;
    }

    // Insert FAQ entries
    let faqCount = 0;
    for (const faq of faqEntries) {
      await ctx.db.insert("faq", faq);
      faqCount++;
    }

    return {
      menuItems: menuCount,
      precios: preciosCount,
      faqEntries: faqCount,
    };
  },
});
