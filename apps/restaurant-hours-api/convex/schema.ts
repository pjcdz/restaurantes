import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Sesiones conversacionales
  sessions: defineTable({
    chatId: v.string(),           // Telegram chat_id
    phoneNumber: v.optional(v.string()),
    status: v.string(),           // "active" | "paused" | "handed_off"
  }).index("by_chatId", ["chatId"]),

  // Checkpoints de LangGraph (memoria)
  checkpoints: defineTable({
    sessionId: v.id("sessions"),
    threadId: v.string(),
    checkpoint: v.string(),       // JSON serializado
  }).index("by_session", ["sessionId"]),

  // Pedidos
  pedidos: defineTable({
    sessionId: v.id("sessions"),
    telefono: v.string(),
    items: v.array(v.object({
      producto: v.string(),
      cantidad: v.number(),
      precioUnitario: v.number(),
    })),
    direccion: v.optional(v.string()),
    tipoEntrega: v.string(),      // "delivery" | "pickup"
    metodoPago: v.optional(v.string()),
    nombreCliente: v.optional(v.string()),
    total: v.number(),
    estado: v.string(),           // "incompleto" | "completo" | "confirmado"
  }).index("by_telefono", ["telefono"])
    .index("by_session", ["sessionId"]),

  // Menú
  menu: defineTable({
    item: v.string(),
    descripcion: v.string(),
    precio: v.number(),
    categoria: v.string(),
    disponible: v.boolean(),
  }).index("by_categoria", ["categoria"]),

  // Precios (para validación rápida)
  precios: defineTable({
    producto: v.string(),
    precioUnitario: v.number(),
  }).index("by_producto", ["producto"]),

  // FAQ
  faq: defineTable({
    tema: v.string(),
    pregunta: v.string(),
    respuesta: v.string(),
  }).index("by_tema", ["tema"]),
});
