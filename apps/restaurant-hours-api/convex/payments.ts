import { v } from "convex/values";

import { mutation, query } from "./_generated/server.js";

const paymentConfigValidator = v.object({
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
});

/**
 * SRS v4: Obtiene la configuración de pagos activa.
 * @returns La configuración de pagos activa o null si no existe
 */
export const getActivePaymentConfig = query({
  args: {},
  returns: v.union(paymentConfigValidator, v.null()),
  handler: async (ctx) => {
    const config = await ctx.db
      .query("payment_config")
      .withIndex("by_activo", (q) => q.eq("activo", true))
      .unique();

    if (!config) {
      return null;
    }

    return {
      metodos: config.metodos,
      efectivoMinimo: config.efectivoMinimo,
      transferenciaBanco: config.transferenciaBanco,
      transferenciaAlias: config.transferenciaAlias,
      transferenciaCBU: config.transferenciaCBU,
      transferenciaCUIT: config.transferenciaCUIT,
      entregaPago: config.entregaPago,
      activo: config.activo
    };
  }
});

/**
 * SRS v4: Crea o actualiza la configuración de pagos.
 * @returns La configuración de pagos creada o actualizada
 */
export const upsertPaymentConfig = mutation({
  args: {
    metodos: v.array(v.string()),
    efectivoMinimo: v.number(),
    transferenciaBanco: v.string(),
    transferenciaAlias: v.string(),
    transferenciaCBU: v.string(),
    transferenciaCUIT: v.optional(v.string()),
    entregaPago: v.union(
      v.literal("con_entrega"),
      v.literal("adelantado")
    )
  },
  returns: paymentConfigValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("payment_config")
      .withIndex("by_activo", (q) => q.eq("activo", true))
      .unique();

    if (existing) {
      // Si existe una configuración activa, la actualizamos
      await ctx.db.patch(existing._id, {
        metodos: args.metodos,
        efectivoMinimo: args.efectivoMinimo,
        transferenciaBanco: args.transferenciaBanco,
        transferenciaAlias: args.transferenciaAlias,
        transferenciaCBU: args.transferenciaCBU,
        transferenciaCUIT: args.transferenciaCUIT,
        entregaPago: args.entregaPago,
        activo: true
      });

      return {
        metodos: args.metodos,
        efectivoMinimo: args.efectivoMinimo,
        transferenciaBanco: args.transferenciaBanco,
        transferenciaAlias: args.transferenciaAlias,
        transferenciaCBU: args.transferenciaCBU,
        transferenciaCUIT: args.transferenciaCUIT,
        entregaPago: args.entregaPago,
        activo: true
      };
    }

    // Si no existe, creamos una nueva
    await ctx.db.insert("payment_config", {
      metodos: args.metodos,
      efectivoMinimo: args.efectivoMinimo,
      transferenciaBanco: args.transferenciaBanco,
      transferenciaAlias: args.transferenciaAlias,
      transferenciaCBU: args.transferenciaCBU,
      transferenciaCUIT: args.transferenciaCUIT,
      entregaPago: args.entregaPago,
      activo: true
    });

    return {
      metodos: args.metodos,
      efectivoMinimo: args.efectivoMinimo,
      transferenciaBanco: args.transferenciaBanco,
      transferenciaAlias: args.transferenciaAlias,
      transferenciaCBU: args.transferenciaCBU,
      transferenciaCUIT: args.transferenciaCUIT,
      entregaPago: args.entregaPago,
      activo: true
    };
  }
});
