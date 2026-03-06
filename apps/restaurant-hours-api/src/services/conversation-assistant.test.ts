import { describe, expect, it, vi } from "vitest";

import {
  createConversationAssistant,
  type CatalogSnapshot,
  type ConversationCheckpoint,
  type ConversationOrderRecord,
  type ConversationRepository,
  type ConversationSessionRecord
} from "./conversation-assistant";

type MemoryRepositoryState = {
  sessions: Array<ConversationSessionRecord>;
  checkpoints: Array<ConversationCheckpoint>;
  orders: Array<ConversationOrderRecord>;
  catalog: CatalogSnapshot;
};

function createMemoryRepository(
  catalogOverrides: Partial<CatalogSnapshot> = {}
): {
  repository: ConversationRepository;
  state: MemoryRepositoryState;
} {
  const state: MemoryRepositoryState = {
    sessions: [],
    checkpoints: [],
    orders: [],
    catalog: {
      menu: [],
      faq: [],
      prices: [],
      ...catalogOverrides
    }
  };

  const repository: ConversationRepository = {
    async upsertSessionByChatId(chatId) {
      const existing = state.sessions.find((session) => session.chatId === chatId);
      const now = Date.now();

      if (existing) {
        existing.updatedAt = now;
        return existing;
      }

      const created: ConversationSessionRecord = {
        id: `session-${state.sessions.length + 1}`,
        chatId,
        phoneNumber: null,
        createdAt: now,
        updatedAt: now,
        status: "active"
      };

      state.sessions.push(created);

      return created;
    },
    async getLatestCheckpoint(sessionId) {
      const matches = state.checkpoints.filter(
        (checkpoint) => checkpoint.sessionId === sessionId
      );

      return matches.at(-1) ?? null;
    },
    async saveCheckpoint(checkpoint) {
      const saved: ConversationCheckpoint = {
        id: `checkpoint-${state.checkpoints.length + 1}`,
        ...checkpoint
      };

      state.checkpoints.push(saved);

      return saved;
    },
    async getCatalogSnapshot() {
      return state.catalog;
    },
    async upsertOrderForSession(orderInput) {
      const existingIndex = state.orders.findIndex(
        (order) => order.sessionId === orderInput.sessionId
      );
      const now = Date.now();
      const nextRecord: ConversationOrderRecord = {
        id:
          existingIndex >= 0
            ? state.orders[existingIndex].id
            : `order-${state.orders.length + 1}`,
        createdAt:
          existingIndex >= 0 ? state.orders[existingIndex].createdAt : now,
        updatedAt: now,
        ...orderInput
      };

      if (existingIndex >= 0) {
        state.orders[existingIndex] = nextRecord;
      } else {
        state.orders.push(nextRecord);
      }

      return nextRecord;
    }
  };

  return {
    repository,
    state
  };
}

describe("createConversationAssistant", () => {
  it("creates a session and greets first-time users", async () => {
    const { repository, state } = createMemoryRepository();
    const composeResponse = vi.fn(async (input) => input.draftReply);
    const assistant = createConversationAssistant({
      repository,
      composeResponse
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Hola"
    });

    expect(reply).toBe(
      "¡Hola! Bienvenido a RestauLang. Puedo ayudarte con el menu, horarios o tomar tu pedido."
    );
    expect(state.sessions).toHaveLength(1);
    expect(state.checkpoints).toHaveLength(1);
    expect(state.orders).toHaveLength(0);
    expect(composeResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "777",
        intent: "greeting",
        draftReply:
          "¡Hola! Bienvenido a RestauLang. Puedo ayudarte con el menu, horarios o tomar tu pedido."
      })
    );
  });

  it("answers menu questions using catalog data without inventing", async () => {
    const { repository } = createMemoryRepository({
      menu: [
        {
          item: "Hamburguesa",
          descripcion: "Carne con queso",
          precio: 3500,
          categoria: "principal",
          disponible: true
        },
        {
          item: "Papas",
          descripcion: "Papas fritas",
          precio: 1500,
          categoria: "acompanamiento",
          disponible: true
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Que tienen en el menu?"
    });

    expect(reply).toBe(
      "Hoy tenemos: Hamburguesa ($3500), Papas ($1500). Si queres, puedo ayudarte a armar tu pedido."
    );
  });

  it("answers horario questions from the loaded FAQ catalog", async () => {
    const { repository } = createMemoryRepository({
      faq: [
        {
          tema: "Horarios",
          pregunta: "hora, abierto, cierran, horarios, cuando",
          respuesta:
            "Abrimos de Martes a Domingo de 19:30 a 23:30 hs. Los lunes descansamos."
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "horarios"
    });

    expect(reply).toBe(
      "Abrimos de Martes a Domingo de 19:30 a 23:30 hs. Los lunes descansamos."
    );
  });

  it("builds an order draft and asks for the remaining required fields", async () => {
    const { repository, state } = createMemoryRepository({
      prices: [
        {
          producto: "hamburguesa",
          precioUnitario: 3500,
          aliases: []
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero 2 hamburguesas"
    });

    expect(reply).toBe(
      "Anotado: 2 hamburguesas ($3500 c/u = $7000). ¿Es para delivery o retiro?"
    );
    expect(state.orders).toEqual([
      expect.objectContaining({
        sessionId: "session-1",
        telefono: "777",
        tipoEntrega: null,
        metodoPago: null,
        nombreCliente: null,
        direccion: null,
        total: 7000,
        estado: "incompleto",
        items: [
          {
            producto: "hamburguesa",
            cantidad: 2,
            precioUnitario: 3500
          }
        ]
      })
    ]);
    expect(state.checkpoints).toHaveLength(1);
    expect(JSON.parse(state.checkpoints[0].checkpoint)).toEqual(
      expect.objectContaining({
        intent: "order",
        orderDraft: expect.objectContaining({
          total: 7000,
          estado: "incompleto"
        })
      })
    );
  });

  it("matches orders against multi-word product names", async () => {
    const { repository, state } = createMemoryRepository({
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: []
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero 2 bacon king"
    });

    expect(reply).toBe(
      "Anotado: 2 bacon king ($11200 c/u = $22400). ¿Es para delivery o retiro?"
    );
    expect(state.orders).toEqual([
      expect.objectContaining({
        total: 22400,
        estado: "incompleto",
        items: [
          {
            producto: "Bacon King",
            cantidad: 2,
            precioUnitario: 11200
          }
        ]
      })
    ]);
  });

  it("matches orders using partial product aliases", async () => {
    const { repository, state } = createMemoryRepository({
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: []
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero 1 bacon"
    });

    expect(reply).toBe(
      "Anotado: 1 bacon ($11200 c/u = $11200). ¿Es para delivery o retiro?"
    );
    expect(state.orders).toEqual([
      expect.objectContaining({
        total: 11200,
        estado: "incompleto",
        items: [
          {
            producto: "Bacon King",
            cantidad: 1,
            precioUnitario: 11200
          }
        ]
      })
    ]);
  });

  it("matches orders using explicit aliases stored in the price catalog", async () => {
    const { repository, state } = createMemoryRepository({
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: ["bk", "bacon king", "bacon"]
        } as unknown as CatalogSnapshot["prices"][number]
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero 1 bk"
    });

    expect(reply).toBe(
      "Anotado: 1 bk ($11200 c/u = $11200). ¿Es para delivery o retiro?"
    );
    expect(state.orders).toEqual([
      expect.objectContaining({
        total: 11200,
        estado: "incompleto",
        items: [
          {
            producto: "Bacon King",
            cantidad: 1,
            precioUnitario: 11200
          }
        ]
      })
    ]);
  });

  it("treats recommendation-style questions as menu requests", async () => {
    const { repository } = createMemoryRepository({
      menu: [
        {
          item: "La Clásica Smash",
          descripcion: "Doble carne",
          precio: 8500,
          categoria: "hamburguesas",
          disponible: true
        },
        {
          item: "Veggie Power",
          descripcion: "Medallón vegetal",
          precio: 9500,
          categoria: "hamburguesas",
          disponible: true
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Que me recomendas?"
    });

    expect(reply).toBe(
      "Hoy tenemos: La Clásica Smash ($8500), Veggie Power ($9500). Si queres, puedo ayudarte a armar tu pedido."
    );
  });

  it("treats 'quiero ver el menu' as a menu request instead of an order", async () => {
    const { repository } = createMemoryRepository({
      menu: [
        {
          item: "La Clásica Smash",
          descripcion: "Doble carne",
          precio: 8500,
          categoria: "hamburguesas",
          disponible: true
        },
        {
          item: "Bacon King",
          descripcion: "Triple carne",
          precio: 11200,
          categoria: "hamburguesas",
          disponible: true
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero ver el menu"
    });

    expect(reply).toBe(
      "Hoy tenemos: La Clásica Smash ($8500), Bacon King ($11200). Si queres, puedo ayudarte a armar tu pedido."
    );
  });

  it("completes an order with natural language for delivery, payment, and name", async () => {
    const { repository, state } = createMemoryRepository({
      prices: [
        {
          producto: "La Clásica Smash",
          precioUnitario: 8500,
          aliases: ["clasica", "la clasica", "clasica smash"]
        } as unknown as CatalogSnapshot["prices"][number]
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const firstReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Mandame una clasica"
    });
    const secondReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "para delivery"
    });
    const thirdReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "mi direccion es av san martin 1234"
    });
    const fourthReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "te pago con mercado pago"
    });
    const finalReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "soy juan"
    });

    expect(firstReply).toBe(
      "Anotado: 1 clasica ($8500 c/u = $8500). ¿Es para delivery o retiro?"
    );
    expect(secondReply).toBe("Perfecto. ¿Cual es la direccion de entrega?");
    expect(thirdReply).toBe(
      "¿Como queres pagar? (efectivo/tarjeta/transferencia/mercado pago)"
    );
    expect(fourthReply).toBe("¿A nombre de quien dejamos el pedido?");
    expect(finalReply).toContain("¡Listo! Tu pedido: 1 La Clásica Smash");
    expect(finalReply).toContain("delivery a av san martin 1234");
    expect(finalReply).toContain("Total: $8500.");
    expect(state.orders).toEqual([
      expect.objectContaining({
        direccion: "av san martin 1234",
        metodoPago: "mercado pago",
        nombreCliente: "juan",
        estado: "completo"
      })
    ]);
  });

  it("continues pickup workflow when user says para retirar", async () => {
    const { repository, state } = createMemoryRepository({
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: ["bacon", "bacon king", "bk"]
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const firstReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Mandame dos bacon king"
    });
    const secondReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Para retirar"
    });
    const thirdReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Te pago con efectivo"
    });
    const fourthReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Soy Maria"
    });

    expect(firstReply).toContain("$22400");
    expect(firstReply).toContain("¿Es para delivery o retiro?");
    expect(secondReply).toBe(
      "¿Como queres pagar? (efectivo/tarjeta/transferencia/mercado pago)"
    );
    expect(thirdReply).toBe("¿A nombre de quien dejamos el pedido?");
    expect(fourthReply).toBe("El total es $22400. ¿Con cuanto vas a pagar?");
    expect(state.orders).toEqual([
      expect.objectContaining({
        tipoEntrega: "pickup",
        metodoPago: "efectivo",
        nombreCliente: "maria",
        total: 22400,
        estado: "incompleto",
        items: [
          {
            producto: "Bacon King",
            cantidad: 2,
            precioUnitario: 11200
          }
        ]
      })
    ]);
  });

  it("adds multiple items from a single structured extraction", async () => {
    const { repository, state } = createMemoryRepository({
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: ["bk", "bacon"]
        },
        {
          producto: "Veggie Power",
          precioUnitario: 9500,
          aliases: ["veggie"]
        }
      ]
    });
    const extractOrderRequest = vi.fn(async () => ({
      wantsMenu: false,
      orderLines: [
        {
          rawText: "una bk",
          productText: "bk",
          quantity: 1
        },
        {
          rawText: "dos veggie",
          productText: "veggie",
          quantity: 2
        }
      ]
    }));
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply,
      extractOrderRequest
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Mandame una bk y dos veggie"
    });

    expect(extractOrderRequest).toHaveBeenCalled();
    expect(reply).toBe(
      "Anotado: 1 Bacon King ($11200), 2 Veggie Power ($19000). Total parcial: $30200. ¿Es para delivery o retiro?"
    );
    expect(state.orders).toEqual([
      expect.objectContaining({
        total: 30200,
        items: [
          {
            producto: "Bacon King",
            cantidad: 1,
            precioUnitario: 11200
          },
          {
            producto: "Veggie Power",
            cantidad: 2,
            precioUnitario: 9500
          }
        ]
      })
    ]);
  });

  it("merges new structured items into an existing order across separate messages", async () => {
    const { repository, state } = createMemoryRepository({
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: ["bk", "bacon"]
        },
        {
          producto: "Veggie Power",
          precioUnitario: 9500,
          aliases: ["veggie"]
        }
      ]
    });
    const extractOrderRequest = vi
      .fn()
      .mockResolvedValueOnce({
        wantsMenu: false,
        orderLines: [
          {
            rawText: "una bk",
            productText: "bk",
            quantity: 1
          }
        ]
      })
      .mockResolvedValueOnce({
        wantsMenu: false,
        orderLines: [
          {
            rawText: "otra bk",
            productText: "bk",
            quantity: 1
          },
          {
            rawText: "una veggie",
            productText: "veggie",
            quantity: 1
          }
        ]
      });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply,
      extractOrderRequest
    });

    await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero una bk"
    });
    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Agregame otra bk y una veggie"
    });

    expect(reply).toBe(
      "Anotado: 1 Bacon King ($11200), 1 Veggie Power ($9500). Total parcial: $31900. ¿Es para delivery o retiro?"
    );
    expect(state.orders).toEqual([
      expect.objectContaining({
        total: 31900,
        items: [
          {
            producto: "Bacon King",
            cantidad: 2,
            precioUnitario: 11200
          },
          {
            producto: "Veggie Power",
            cantidad: 1,
            precioUnitario: 9500
          }
        ]
      })
    ]);
  });

  it("reports the accumulated total when adding the same product in a later message", async () => {
    const { repository, state } = createMemoryRepository({
      prices: [
        {
          producto: "La Clásica Smash",
          precioUnitario: 8500,
          aliases: ["clasica", "la clasica"]
        }
      ]
    });
    const extractOrderRequest = vi
      .fn()
      .mockResolvedValueOnce({
        wantsMenu: false,
        orderLines: [
          {
            rawText: "una clasica",
            productText: "clasica",
            quantity: 1
          }
        ]
      })
      .mockResolvedValueOnce({
        wantsMenu: false,
        orderLines: [
          {
            rawText: "otra clasica",
            productText: "clasica",
            quantity: 1
          }
        ]
      });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply,
      extractOrderRequest
    });

    await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero una clasica"
    });
    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Agregame otra clasica"
    });

    expect(reply).toBe(
      "Anotado: +1 La Clásica Smash. Ahora llevas 2 La Clásica Smash. Total parcial: $17000. ¿Es para delivery o retiro?"
    );
    expect(state.orders).toEqual([
      expect.objectContaining({
        total: 17000,
        items: [
          {
            producto: "La Clásica Smash",
            cantidad: 2,
            precioUnitario: 8500
          }
        ]
      })
    ]);
  });

  it("keeps valid extracted items and asks clarification only for invalid ones", async () => {
    const { repository, state } = createMemoryRepository({
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: ["bk", "bacon"]
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply,
      extractOrderRequest: async () => ({
        wantsMenu: false,
        orderLines: [
          {
            rawText: "una bk",
            productText: "bk",
            quantity: 1
          },
          {
            rawText: "un marciano deluxe",
            productText: "marciano deluxe",
            quantity: 1
          }
        ]
      })
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero una bk y un marciano deluxe"
    });

    expect(reply).toBe(
      "Anotado: 1 Bacon King ($11200). No pude identificar: marciano deluxe. Decime a que producto te referis y lo sumo. ¿Es para delivery o retiro?"
    );
    expect(state.orders).toEqual([
      expect.objectContaining({
        total: 11200,
        items: [
          {
            producto: "Bacon King",
            cantidad: 1,
            precioUnitario: 11200
          }
        ]
      })
    ]);
  });

  it("does not let the composer rewrite transactional order replies", async () => {
    const { repository } = createMemoryRepository({
      prices: [
        {
          producto: "hamburguesa",
          precioUnitario: 3500,
          aliases: []
        }
      ]
    });
    const composeResponse = vi.fn(async () => "Respuesta alterada por IA.");
    const assistant = createConversationAssistant({
      repository,
      composeResponse
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero 2 hamburguesas"
    });

    expect(reply).toBe(
      "Anotado: 2 hamburguesas ($3500 c/u = $7000). ¿Es para delivery o retiro?"
    );
    expect(composeResponse).not.toHaveBeenCalled();
  });

  it("accepts a plain name reply when the order is waiting for customer name", async () => {
    const { repository, state } = createMemoryRepository({
      prices: [
        {
          producto: "La Clásica Smash",
          precioUnitario: 8500,
          aliases: ["clasica", "la clasica"]
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero una clasica"
    });
    await assistant.handleIncomingMessage({
      chatId: "777",
      text: "para delivery"
    });
    await assistant.handleIncomingMessage({
      chatId: "777",
      text: "mi direccion es av san martin 1234"
    });
    const paymentReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "mercado pago"
    });
    const nameReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "juan"
    });

    expect(paymentReply).toBe("¿A nombre de quien dejamos el pedido?");
    expect(nameReply).toBe(
      "¡Listo! Tu pedido: 1 La Clásica Smash, delivery a av san martin 1234. Total: $8500."
    );
    expect(state.orders).toEqual([
      expect.objectContaining({
        nombreCliente: "juan",
        total: 8500,
        estado: "completo",
        items: [
          {
            producto: "La Clásica Smash",
            cantidad: 1,
            precioUnitario: 8500
          }
        ]
      })
    ]);
  });

  it("does not apply the same order message twice within a short dedupe window", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
      const { repository, state } = createMemoryRepository({
        prices: [
          {
            producto: "Bacon King",
            precioUnitario: 11200,
            aliases: ["bacon king", "bacon"]
          },
          {
            producto: "Veggie Power",
            precioUnitario: 9500,
            aliases: ["veggie power", "veggie"]
          }
        ]
      });
      const assistant = createConversationAssistant({
        repository,
        composeResponse: async (input) => input.draftReply
      });

      const firstReply = await assistant.handleIncomingMessage({
        chatId: "777",
        text: "quiero una bacon king y una veggie power"
      });

      vi.setSystemTime(new Date("2026-03-01T00:00:03.000Z"));

      const secondReply = await assistant.handleIncomingMessage({
        chatId: "777",
        text: "quiero una bacon king y una veggie power"
      });

      expect(firstReply).toBe(
        "Anotado: 1 Bacon King ($11200), 1 Veggie Power ($9500). Total parcial: $20700. ¿Es para delivery o retiro?"
      );
      expect(secondReply).toBe(firstReply);
      expect(state.orders).toEqual([
        expect.objectContaining({
          total: 20700,
          items: [
            {
              producto: "Bacon King",
              cantidad: 1,
              precioUnitario: 11200
            },
            {
              producto: "Veggie Power",
              cantidad: 1,
              precioUnitario: 9500
            }
          ]
        })
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
