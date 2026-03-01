import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

const sessionValidator = v.object({
  id: v.id("sessions"),
  chatId: v.string(),
  phoneNumber: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  status: v.union(
    v.literal("active"),
    v.literal("handed_off"),
    v.literal("paused")
  )
});

const checkpointValidator = v.object({
  id: v.id("checkpoints"),
  sessionId: v.id("sessions"),
  threadId: v.string(),
  checkpoint: v.string(),
  createdAt: v.number()
});

const orderItemValidator = v.object({
  producto: v.string(),
  cantidad: v.number(),
  precioUnitario: v.number()
});

const pedidoValidator = v.object({
  id: v.id("pedidos"),
  sessionId: v.id("sessions"),
  telefono: v.string(),
  items: v.array(orderItemValidator),
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
  createdAt: v.number(),
  updatedAt: v.number()
});

const menuValidator = v.object({
  id: v.id("menu"),
  item: v.string(),
  descripcion: v.string(),
  precio: v.number(),
  categoria: v.string(),
  disponible: v.boolean()
});

const faqValidator = v.object({
  id: v.id("faq"),
  tema: v.string(),
  pregunta: v.string(),
  respuesta: v.string()
});

const priceValidator = v.object({
  id: v.id("precios"),
  producto: v.string(),
  precioUnitario: v.number(),
  aliases: v.array(v.string())
});

export const upsertSessionByChatId = mutation({
  args: {
    chatId: v.string()
  },
  returns: sessionValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "active",
        updatedAt: now
      });

      return {
        id: existing._id,
        chatId: existing.chatId,
        phoneNumber: existing.phoneNumber,
        createdAt: existing.createdAt,
        updatedAt: now,
        status: "active" as const
      };
    }

    const id = await ctx.db.insert("sessions", {
      chatId: args.chatId,
      phoneNumber: null,
      createdAt: now,
      updatedAt: now,
      status: "active"
    });

    return {
      id,
      chatId: args.chatId,
      phoneNumber: null,
      createdAt: now,
      updatedAt: now,
      status: "active" as const
    };
  }
});

export const getLatestCheckpointBySessionId = query({
  args: {
    sessionId: v.id("sessions")
  },
  returns: v.union(checkpointValidator, v.null()),
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("checkpoints")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(1);
    const checkpoint = latest[0];

    if (!checkpoint) {
      return null;
    }

    return {
      id: checkpoint._id,
      sessionId: checkpoint.sessionId,
      threadId: checkpoint.threadId,
      checkpoint: checkpoint.checkpoint,
      createdAt: checkpoint.createdAt
    };
  }
});

export const saveCheckpoint = mutation({
  args: {
    sessionId: v.id("sessions"),
    threadId: v.string(),
    checkpoint: v.string(),
    createdAt: v.number()
  },
  returns: checkpointValidator,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("checkpoints", {
      sessionId: args.sessionId,
      threadId: args.threadId,
      checkpoint: args.checkpoint,
      createdAt: args.createdAt
    });

    return {
      id,
      sessionId: args.sessionId,
      threadId: args.threadId,
      checkpoint: args.checkpoint,
      createdAt: args.createdAt
    };
  }
});

export const upsertPedidoForSession = mutation({
  args: {
    sessionId: v.id("sessions"),
    telefono: v.string(),
    items: v.array(orderItemValidator),
    direccion: v.union(v.string(), v.null()),
    tipoEntrega: v.union(v.literal("delivery"), v.literal("pickup"), v.null()),
    metodoPago: v.union(v.string(), v.null()),
    nombreCliente: v.union(v.string(), v.null()),
    total: v.number(),
    estado: v.union(
      v.literal("completo"),
      v.literal("error_producto"),
      v.literal("incompleto")
    )
  },
  returns: pedidoValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pedidos")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        telefono: args.telefono,
        items: args.items,
        direccion: args.direccion,
        tipoEntrega: args.tipoEntrega,
        metodoPago: args.metodoPago,
        nombreCliente: args.nombreCliente,
        total: args.total,
        estado: args.estado,
        updatedAt: now
      });

      return {
        id: existing._id,
        sessionId: args.sessionId,
        telefono: args.telefono,
        items: args.items,
        direccion: args.direccion,
        tipoEntrega: args.tipoEntrega,
        metodoPago: args.metodoPago,
        nombreCliente: args.nombreCliente,
        total: args.total,
        estado: args.estado,
        createdAt: existing.createdAt,
        updatedAt: now
      };
    }

    const id = await ctx.db.insert("pedidos", {
      sessionId: args.sessionId,
      telefono: args.telefono,
      items: args.items,
      direccion: args.direccion,
      tipoEntrega: args.tipoEntrega,
      metodoPago: args.metodoPago,
      nombreCliente: args.nombreCliente,
      total: args.total,
      estado: args.estado,
      createdAt: now,
      updatedAt: now
    });

    return {
      id,
      sessionId: args.sessionId,
      telefono: args.telefono,
      items: args.items,
      direccion: args.direccion,
      tipoEntrega: args.tipoEntrega,
      metodoPago: args.metodoPago,
      nombreCliente: args.nombreCliente,
      total: args.total,
      estado: args.estado,
      createdAt: now,
      updatedAt: now
    };
  }
});

export const listMenuItems = query({
  args: {},
  returns: v.array(menuValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query("menu").collect();

    return rows.map((row) => ({
      id: row._id,
      item: row.item,
      descripcion: row.descripcion,
      precio: row.precio,
      categoria: row.categoria,
      disponible: row.disponible
    }));
  }
});

export const listFaqEntries = query({
  args: {},
  returns: v.array(faqValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query("faq").collect();

    return rows.map((row) => ({
      id: row._id,
      tema: row.tema,
      pregunta: row.pregunta,
      respuesta: row.respuesta
    }));
  }
});

export const listPriceEntries = query({
  args: {},
  returns: v.array(priceValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query("precios").collect();

    return rows.map((row) => ({
      id: row._id,
      producto: row.producto,
      precioUnitario: row.precioUnitario,
      aliases: normalizeAliases(row.aliases)
    }));
  }
});

export const upsertMenuItem = mutation({
  args: {
    item: v.string(),
    descripcion: v.string(),
    precio: v.number(),
    categoria: v.string(),
    disponible: v.boolean()
  },
  returns: menuValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("menu")
      .withIndex("by_item", (q) => q.eq("item", args.item))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        descripcion: args.descripcion,
        precio: args.precio,
        categoria: args.categoria,
        disponible: args.disponible
      });

      return {
        id: existing._id,
        item: args.item,
        descripcion: args.descripcion,
        precio: args.precio,
        categoria: args.categoria,
        disponible: args.disponible
      };
    }

    const id = await ctx.db.insert("menu", args);

    return {
      id,
      ...args
    };
  }
});

export const upsertFaqEntry = mutation({
  args: {
    tema: v.string(),
    pregunta: v.string(),
    respuesta: v.string()
  },
  returns: faqValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("faq")
      .withIndex("by_tema", (q) => q.eq("tema", args.tema))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        pregunta: args.pregunta,
        respuesta: args.respuesta
      });

      return {
        id: existing._id,
        tema: args.tema,
        pregunta: args.pregunta,
        respuesta: args.respuesta
      };
    }

    const id = await ctx.db.insert("faq", args);

    return {
      id,
      ...args
    };
  }
});

export const upsertPriceEntry = mutation({
  args: {
    producto: v.string(),
    precioUnitario: v.number(),
    aliases: v.optional(v.array(v.string()))
  },
  returns: priceValidator,
  handler: async (ctx, args) => {
    const aliases = normalizeAliases(args.aliases);
    const existing = await ctx.db
      .query("precios")
      .withIndex("by_producto", (q) => q.eq("producto", args.producto))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        precioUnitario: args.precioUnitario,
        aliases
      });

      return {
        id: existing._id,
        producto: args.producto,
        precioUnitario: args.precioUnitario,
        aliases
      };
    }

    const id = await ctx.db.insert("precios", {
      producto: args.producto,
      precioUnitario: args.precioUnitario,
      aliases
    });

    return {
      id,
      producto: args.producto,
      precioUnitario: args.precioUnitario,
      aliases
    };
  }
});

function normalizeAliases(
  aliases: Array<string> | undefined
): Array<string> {
  const uniqueAliases = new Set<string>();

  for (const alias of aliases ?? []) {
    const normalizedAlias = alias.trim();

    if (!normalizedAlias) {
      continue;
    }

    uniqueAliases.add(normalizedAlias);
  }

  return Array.from(uniqueAliases);
}
