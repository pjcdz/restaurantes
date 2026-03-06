import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    chatId: v.string(),
    phoneNumber: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("handed_off"),
      v.literal("paused")
    ),
    // SRS v4: Campos para handoff
    handedOffAt: v.optional(v.number()),
    handedOffReason: v.optional(
      v.union(
        v.literal("user_requested"),
        v.literal("frustration_detected"),
        v.literal("error_repetition"),
        v.literal("complaint")
      )
    )
  })
    .index("by_chatId", ["chatId"])
    .index("by_status", ["status"]),
  checkpoints: defineTable({
    sessionId: v.id("sessions"),
    threadId: v.string(),
    checkpoint: v.string(),
    // SRS v4: Mejoras para checkpointer V2
    versions: v.optional(v.string()),
    versionsSeen: v.optional(v.string()),
    metadata: v.optional(v.string()),
    ts: v.string(),
    namespace: v.string(),
    createdAt: v.number()
  }).index("by_sessionId", ["sessionId"]),
  pedidos: defineTable({
    sessionId: v.id("sessions"),
    telefono: v.string(),
    items: v.array(
      v.object({
        producto: v.string(),
        cantidad: v.number(),
        precioUnitario: v.number()
      })
    ),
    direccion: v.union(v.string(), v.null()),
    tipoEntrega: v.union(v.literal("delivery"), v.literal("pickup"), v.null()),
    metodoPago: v.union(v.string(), v.null()),
    nombreCliente: v.union(v.string(), v.null()),
    total: v.number(),
    estado: v.union(
      v.literal("completo"),
      v.literal("error_producto"),
      v.literal("incompleto")
    ),
    paymentAmount: v.optional(v.number()),
    change: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_telefono", ["telefono"]),
  menu: defineTable({
    item: v.string(),
    descripcion: v.string(),
    precio: v.number(),
    categoria: v.string(),
    disponible: v.boolean()
  })
    .index("by_categoria", ["categoria"])
    .index("by_item", ["item"]),
  precios: defineTable({
    producto: v.string(),
    precioUnitario: v.number(),
    aliases: v.optional(v.array(v.string()))
  }).index("by_producto", ["producto"]),
  faq: defineTable({
    tema: v.string(),
    pregunta: v.string(),
    respuesta: v.string()
  }).index("by_tema", ["tema"]),
  tokenVersions: defineTable({
    userId: v.string(),
    version: v.number(),
    updatedAt: v.number()
  }).index("by_userId", ["userId"]),
  // SRS v4: Configuración de pagos
  payment_config: defineTable({
    metodos: v.array(v.string()),
    efectivoMinimo: v.number(),
    transferenciaBanco: v.string(),
    transferenciaAlias: v.string(),
    transferenciaCBU: v.string(),
    transferenciaCUIT: v.optional(v.string()),
    entregaPago: v.union(
      v.literal("con_entrega"),
      v.literal("adelantado")
    ),
    activo: v.boolean()
  }).index("by_activo", ["activo"])
});
