import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Item type for pedido items
const itemValidator = v.object({
  producto: v.string(),
  cantidad: v.number(),
  precioUnitario: v.number(),
});

// ============================================
// Public Queries
// ============================================

/**
 * Get a pedido by ID
 */
export const getById = query({
  args: { pedidoId: v.id("pedidos") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("pedidos"),
      _creationTime: v.number(),
      sessionId: v.id("sessions"),
      telefono: v.string(),
      items: v.array(itemValidator),
      direccion: v.optional(v.string()),
      tipoEntrega: v.string(),
      metodoPago: v.optional(v.string()),
      nombreCliente: v.optional(v.string()),
      total: v.number(),
      estado: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.pedidoId);
  },
});

/**
 * Get pedidos by phone number
 */
export const getByTelefono = query({
  args: { telefono: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("pedidos"),
      _creationTime: v.number(),
      sessionId: v.id("sessions"),
      telefono: v.string(),
      items: v.array(itemValidator),
      direccion: v.optional(v.string()),
      tipoEntrega: v.string(),
      metodoPago: v.optional(v.string()),
      nombreCliente: v.optional(v.string()),
      total: v.number(),
      estado: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pedidos")
      .withIndex("by_telefono", (q) => q.eq("telefono", args.telefono))
      .order("desc")
      .take(20);
  },
});

/**
 * Get the latest incomplete pedido for a session
 */
export const getIncompleteBySession = query({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("pedidos"),
      _creationTime: v.number(),
      sessionId: v.id("sessions"),
      telefono: v.string(),
      items: v.array(itemValidator),
      direccion: v.optional(v.string()),
      tipoEntrega: v.string(),
      metodoPago: v.optional(v.string()),
      nombreCliente: v.optional(v.string()),
      total: v.number(),
      estado: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const pedido = await ctx.db
      .query("pedidos")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.neq(q.field("estado"), "confirmado"))
      .order("desc")
      .first();
    return pedido;
  },
});

// ============================================
// Public Mutations
// ============================================

/**
 * Create a new pedido
 */
export const create = mutation({
  args: {
    sessionId: v.id("sessions"),
    telefono: v.string(),
    items: v.array(itemValidator),
    tipoEntrega: v.string(),
    direccion: v.optional(v.string()),
    metodoPago: v.optional(v.string()),
    nombreCliente: v.optional(v.string()),
    total: v.number(),
    estado: v.string(),
  },
  returns: v.id("pedidos"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("pedidos", {
      sessionId: args.sessionId,
      telefono: args.telefono,
      items: args.items,
      tipoEntrega: args.tipoEntrega,
      direccion: args.direccion,
      metodoPago: args.metodoPago,
      nombreCliente: args.nombreCliente,
      total: args.total,
      estado: args.estado,
    });
  },
});

/**
 * Update pedido items
 */
export const updateItems = mutation({
  args: {
    pedidoId: v.id("pedidos"),
    items: v.array(itemValidator),
    total: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.pedidoId, {
      items: args.items,
      total: args.total,
    });
    return null;
  },
});

/**
 * Update pedido delivery info
 */
export const updateDelivery = mutation({
  args: {
    pedidoId: v.id("pedidos"),
    tipoEntrega: v.string(),
    direccion: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.pedidoId, {
      tipoEntrega: args.tipoEntrega,
      direccion: args.direccion,
    });
    return null;
  },
});

/**
 * Update pedido payment method
 */
export const updatePayment = mutation({
  args: {
    pedidoId: v.id("pedidos"),
    metodoPago: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.pedidoId, { metodoPago: args.metodoPago });
    return null;
  },
});

/**
 * Update pedido customer info
 */
export const updateCustomer = mutation({
  args: {
    pedidoId: v.id("pedidos"),
    nombreCliente: v.string(),
    telefono: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates: { nombreCliente: string; telefono?: string } = {
      nombreCliente: args.nombreCliente,
    };
    if (args.telefono) {
      updates.telefono = args.telefono;
    }
    await ctx.db.patch(args.pedidoId, updates);
    return null;
  },
});

/**
 * Update pedido status
 */
export const updateStatus = mutation({
  args: {
    pedidoId: v.id("pedidos"),
    estado: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.pedidoId, { estado: args.estado });
    return null;
  },
});

// ============================================
// Internal Queries
// ============================================

/**
 * Internal query to get incomplete pedido by session
 */
export const internalGetIncompleteBySession = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("pedidos"),
      _creationTime: v.number(),
      sessionId: v.id("sessions"),
      telefono: v.string(),
      items: v.array(itemValidator),
      direccion: v.optional(v.string()),
      tipoEntrega: v.string(),
      metodoPago: v.optional(v.string()),
      nombreCliente: v.optional(v.string()),
      total: v.number(),
      estado: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const pedido = await ctx.db
      .query("pedidos")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.neq(q.field("estado"), "confirmado"))
      .order("desc")
      .first();
    return pedido;
  },
});

// ============================================
// Internal Mutations
// ============================================

/**
 * Internal mutation to create or update pedido
 */
export const internalCreateOrUpdate = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    telefono: v.string(),
    items: v.array(itemValidator),
    tipoEntrega: v.optional(v.string()),
    direccion: v.optional(v.string()),
    metodoPago: v.optional(v.string()),
    nombreCliente: v.optional(v.string()),
    total: v.number(),
    estado: v.string(),
  },
  returns: v.id("pedidos"),
  handler: async (ctx, args) => {
    // Check for existing incomplete pedido
    const existing = await ctx.db
      .query("pedidos")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("estado"), "incompleto"))
      .first();

    if (existing) {
      // Update existing pedido
      const updates: Record<string, unknown> = {
        items: args.items,
        total: args.total,
        estado: args.estado,
      };
      if (args.tipoEntrega) updates.tipoEntrega = args.tipoEntrega;
      if (args.direccion) updates.direccion = args.direccion;
      if (args.metodoPago) updates.metodoPago = args.metodoPago;
      if (args.nombreCliente) updates.nombreCliente = args.nombreCliente;
      
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    // Create new pedido
    return await ctx.db.insert("pedidos", {
      sessionId: args.sessionId,
      telefono: args.telefono,
      items: args.items,
      tipoEntrega: args.tipoEntrega ?? "delivery",
      direccion: args.direccion,
      metodoPago: args.metodoPago,
      nombreCliente: args.nombreCliente,
      total: args.total,
      estado: args.estado,
    });
  },
});
