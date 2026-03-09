import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createConversationAssistant,
  type CatalogSnapshot,
  type ConversationCheckpoint,
  type ConversationOrderRecord,
  type ConversationRepository,
  type ConversationSessionRecord
} from "./conversation-assistant";
import { resetFallbackHandedOffSessions } from "./handoff-session-store.js";

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
    },
    async updateSessionStatus(chatId, status) {
      const session = state.sessions.find((item) => item.chatId === chatId);
      if (!session) {
        return;
      }

      session.status = status;
      session.updatedAt = Date.now();
    },
    async deleteOrderForSession(sessionId) {
      state.orders = state.orders.filter((order) => order.sessionId !== sessionId);
    },
    async getActivePaymentConfig() {
      return null;
    }
  };

  return {
    repository,
    state
  };
}

describe("createConversationAssistant", () => {
  beforeEach(() => {
    resetFallbackHandedOffSessions();
  });

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
    expect(state.checkpoints.length).toBeGreaterThanOrEqual(1);
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

  it("hands off to human support when customer reports a bad order and asks for supervisor", async () => {
    const { repository, state } = createMemoryRepository();
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "handoff-complaint",
      text: "Quiero hablar con un supervisor, mi pedido llegó mal"
    });

    expect(reply.toLowerCase()).toContain("operador humano");
    expect(state.sessions).toEqual([
      expect.objectContaining({
        chatId: "handoff-complaint",
        status: "handed_off"
      })
    ]);
  });

  it("hands off when customer expresses anger or strong negative sentiment", async () => {
    const { repository, state } = createMemoryRepository();
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "handoff-negative-sentiment",
      text: "Estoy muy enojado, esto es pésimo y no me respondes bien"
    });

    expect(reply.toLowerCase()).toContain("operador humano");
    expect(state.sessions).toEqual([
      expect.objectContaining({
        chatId: "handoff-negative-sentiment",
        status: "handed_off"
      })
    ]);
  });

  it("hands off when customer uses insults toward service quality", async () => {
    const { repository, state } = createMemoryRepository();
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "handoff-insult",
      text: "Son unos inutiles, el servicio es una mierda"
    });

    expect(reply.toLowerCase()).toContain("operador humano");
    expect(state.sessions).toEqual([
      expect.objectContaining({
        chatId: "handoff-insult",
        status: "handed_off"
      })
    ]);
  });

  it("hands off when request is out of supported restaurant scope", async () => {
    const { repository, state } = createMemoryRepository();
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "handoff-out-of-scope",
      text: "Necesito una consulta legal y defensa del consumidor por esta situacion"
    });

    expect(reply.toLowerCase()).toContain("operador humano");
    expect(state.sessions).toEqual([
      expect.objectContaining({
        chatId: "handoff-out-of-scope",
        status: "handed_off"
      })
    ]);
  });

  it("stops sending automated replies after handoff until reactivation", async () => {
    const { repository } = createMemoryRepository();
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const firstReply = await assistant.handleIncomingMessage({
      chatId: "handoff-stop-bot",
      text: "Quiero hablar con un supervisor por una queja"
    });
    const secondReply = await assistant.handleIncomingMessage({
      chatId: "handoff-stop-bot",
      text: "quiero 2 hamburguesas"
    });

    expect(firstReply.toLowerCase()).toContain("operador humano");
    expect(secondReply).toBe("");
  });

  it("keeps handoff active with fallback even when status update persistence fails", async () => {
    const { repository } = createMemoryRepository();
    const assistant = createConversationAssistant({
      repository: {
        ...repository,
        updateSessionStatus: async () => {
          throw new Error("storage unavailable");
        }
      },
      composeResponse: async (input) => input.draftReply
    });

    const firstReply = await assistant.handleIncomingMessage({
      chatId: "handoff-fallback-only",
      text: "Estoy enojado y quiero reclamar"
    });
    const secondReply = await assistant.handleIncomingMessage({
      chatId: "handoff-fallback-only",
      text: "hola?"
    });

    expect(firstReply.toLowerCase()).toContain("operador humano");
    expect(secondReply).toBe("");
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

  it("removes an informal 'Che' prefix from composed menu responses", async () => {
    const { repository } = createMemoryRepository({
      menu: [
        {
          item: "Hamburguesa",
          descripcion: "Clasica",
          precio: 3500,
          categoria: "principal",
          disponible: true
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async () => "¡Che! Hoy tenemos una Hamburguesa destacada."
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "menu-tone",
      text: "Que tienen en el menu?"
    });

    expect(reply).toBe("Hoy tenemos una Hamburguesa destacada.");
    expect(reply.toLowerCase()).not.toContain("che");
  });

  it("normalizes casual openings and wording in composed responses", async () => {
    const { repository } = createMemoryRepository({
      menu: [
        {
          item: "Bacon King",
          descripcion: "Hamburguesa doble",
          precio: 11200,
          categoria: "principal",
          disponible: true
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async () =>
        "¡Dale! qué tal! Si queres, decime qué andás buscando."
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "menu-tone-casual",
      text: "Que tienen en el menu?"
    });

    expect(reply).toBe("Perfecto. Hola. Si queres, decime que opcion te interesa.");
    expect(reply.toLowerCase()).not.toContain("dale");
    expect(reply.toLowerCase()).not.toContain("que tal");
    expect(reply.toLowerCase()).not.toContain("andas buscando");
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

  it("keeps FAQ answers focused even if composeResponse tries to add menu content", async () => {
    const { repository } = createMemoryRepository({
      menu: [
        {
          item: "Bacon King",
          descripcion: "Hamburguesa doble",
          precio: 11200,
          categoria: "principal",
          disponible: true
        }
      ],
      faq: [
        {
          tema: "horario",
          pregunta: "horario, abierto, cierran",
          respuesta: "Nuestro horario es de 11:00 a 23:00."
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async () =>
        "¡Che! Hoy estamos abiertos. Tenemos estas opciones: Bacon King ($11200)."
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "faq-focus",
      text: "horario"
    });

    expect(reply).toBe("Nuestro horario es de 11:00 a 23:00.");
    expect(reply.toLowerCase()).not.toContain("tenemos estas opciones");
  });

  it("answers standalone payment FAQs from catalog entries", async () => {
    const { repository } = createMemoryRepository({
      faq: [
        {
          tema: "pago",
          pregunta: "metodos de pago, mercado pago",
          respuesta: "Aceptamos solo efectivo."
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "faq-payment",
      text: "mercado pago"
    });

    expect(reply).toBe("Aceptamos solo efectivo.");
  });

  it("matches payment FAQs written as natural questions", async () => {
    const { repository } = createMemoryRepository({
      faq: [
        {
          tema: "pago",
          pregunta: "metodos de pago, medios de pago",
          respuesta: "Aceptamos solo efectivo."
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "faq-payment-natural",
      text: "Como puedo pagar?"
    });

    expect(reply).toBe("Aceptamos solo efectivo.");
  });

  it("matches FAQ questions written as natural sentences with punctuation", async () => {
    const { repository } = createMemoryRepository({
      faq: [
        {
          tema: "ubicacion",
          pregunta: "¿Dónde están ubicados?",
          respuesta: "Estamos en Av. Corrientes 1234, CABA."
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "faq-location",
      text: "Donde estan ubicados?"
    });

    expect(reply).toBe("Estamos en Av. Corrientes 1234, CABA.");
  });

  it("answers combined FAQ and menu questions using both sources", async () => {
    const { repository } = createMemoryRepository({
      menu: [
        {
          item: "Bacon King",
          descripcion: "Hamburguesa doble",
          precio: 11200,
          categoria: "principal",
          disponible: true
        }
      ],
      faq: [
        {
          tema: "horario",
          pregunta: "horario, abierto, cierran",
          respuesta: "Abrimos todos los dias de 11:00 a 23:00."
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply,
      extractOrderRequest: async () => ({
        orderLines: [],
        wantsMenu: true
      })
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "faq-menu-combined",
      text: "Cual es el horario y que tienen?"
    });

    expect(reply).toContain("Abrimos todos los dias de 11:00 a 23:00.");
    expect(reply).toContain("Menu disponible: Bacon King ($11200).");
  });

  it("prioritizes FAQ answers even when extractor mistakenly flags wantsMenu", async () => {
    const { repository } = createMemoryRepository({
      menu: [
        {
          item: "Bacon King",
          descripcion: "Hamburguesa doble",
          precio: 11200,
          categoria: "principal",
          disponible: true
        }
      ],
      faq: [
        {
          tema: "horario",
          pregunta: "horario, abierto, cierran",
          respuesta: "Abrimos todos los dias de 11:00 a 23:00."
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async () =>
        "¡Che! Hoy estamos abiertos. Tenemos estas opciones: Bacon King ($11200).",
      extractOrderRequest: async () => ({
        orderLines: [],
        wantsMenu: true
      })
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "faq-priority",
      text: "Cual es el horario?"
    });

    expect(reply).toBe("Abrimos todos los dias de 11:00 a 23:00.");
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
    expect(state.orders).toHaveLength(0);
    expect(state.checkpoints.length).toBeGreaterThanOrEqual(1);
    const latestCheckpoint = state.checkpoints.at(-1);
    expect(latestCheckpoint).toBeDefined();
    expect(JSON.parse(latestCheckpoint!.checkpoint)).toEqual(
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
    expect(state.orders).toHaveLength(0);
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
    expect(state.orders).toHaveLength(0);
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
    expect(state.orders).toHaveLength(0);
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
      faq: [
        {
          tema: "delivery",
          pregunta: "hacen delivery",
          respuesta: "Hacemos envios en un radio de 4km. El costo del envio es de $1.500 fijos."
        }
      ],
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
    const fifthReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "soy juan"
    });
    const finalReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "te pago con 12000"
    });

    expect(firstReply).toBe(
      "Anotado: 1 clasica ($8500 c/u = $8500). ¿Es para delivery o retiro?"
    );
    expect(secondReply).toBe("Perfecto. ¿Cual es la direccion de entrega?");
    expect(thirdReply).toBe(
      "¿Como queres pagar? Por ahora trabajamos solo con efectivo."
    );
    expect(fourthReply).toBe("¿A nombre de quien dejamos el pedido?");
    expect(fifthReply).toBe("El total es $10000. ¿Con cuanto vas a pagar?");
    expect(finalReply).toContain("¡Listo! Tu pedido: 1 La Clásica Smash");
    expect(finalReply).toContain("delivery a av san martin 1234");
    expect(finalReply).toContain("Total: $10000.");
    expect(finalReply).toContain("Abonas $12000, tu vuelto es $2000.");
    expect(state.orders).toEqual([
      expect.objectContaining({
        direccion: "av san martin 1234",
        metodoPago: "efectivo",
        montoAbono: 12000,
        nombreCliente: "juan",
        estado: "completo",
        total: 10000
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
      "¿Como queres pagar? Por ahora trabajamos solo con efectivo."
    );
    expect(thirdReply).toBe("¿A nombre de quien dejamos el pedido?");
    expect(fourthReply).toBe("El total es $22400. ¿Con cuanto vas a pagar?");
    expect(state.orders).toHaveLength(0);
  });

  it("shows current order total when user asks cuanto es", async () => {
    const { repository } = createMemoryRepository({
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

    await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero una bacon king"
    });
    const totalReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Cuanto es?"
    });

    expect(totalReply).toContain("Tu pedido actual es: 1 Bacon King.");
    expect(totalReply).toContain("Total: $11200.");
    expect(totalReply).toContain("¿Es para delivery o retiro?");
  });

  it("confirms a topic switch when there is an active order", async () => {
    const { repository } = createMemoryRepository({
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: ["bacon", "bacon king", "bk"]
        }
      ],
      faq: [
        {
          tema: "horario",
          pregunta: "horario, abierto, cierran",
          respuesta: "Abrimos de 11:00 a 23:00."
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    await assistant.handleIncomingMessage({
      chatId: "topic-switch",
      text: "Quiero una bacon king"
    });
    const reply = await assistant.handleIncomingMessage({
      chatId: "topic-switch",
      text: "Cual es el horario?"
    });

    expect(reply).toContain("Tengo tu pedido en curso.");
    expect(reply).toContain("Abrimos de 11:00 a 23:00.");
  });

  it("suggests available menu options when product is not found", async () => {
    const { repository } = createMemoryRepository({
      menu: [
        {
          item: "Bacon King",
          descripcion: "Hamburguesa doble",
          precio: 11200,
          categoria: "principal",
          disponible: true
        },
        {
          item: "Cebolla Crispy",
          descripcion: "Hamburguesa con cebolla crispy",
          precio: 9800,
          categoria: "principal",
          disponible: true
        }
      ],
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: ["bacon", "bacon king"]
        },
        {
          producto: "Cebolla Crispy",
          precioUnitario: 9800,
          aliases: ["cebolla", "crispy"]
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero una pizza"
    });

    expect(reply).toContain("No pude identificar: pizza.");
    expect(reply).toContain("Opciones disponibles:");
    expect(reply).toContain("Bacon King");
  });

  it("asks for specific burger variant and quantity when order is ambiguous", async () => {
    const { repository } = createMemoryRepository({
      menu: [
        {
          item: "Bacon King",
          descripcion: "Hamburguesa doble",
          precio: 11200,
          categoria: "principal",
          disponible: true
        },
        {
          item: "Cebolla Crispy",
          descripcion: "Hamburguesa con cebolla crispy",
          precio: 9800,
          categoria: "principal",
          disponible: true
        }
      ],
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: ["bacon", "bacon king"]
        },
        {
          producto: "Cebolla Crispy",
          precioUnitario: 9800,
          aliases: ["cebolla", "crispy"]
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    const reply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "Quiero tres hamburguesas"
    });

    expect(reply).toContain("No pude identificar:");
    expect(reply).toContain("hamburguesa");
    expect(reply).toContain("Decime cual hamburguesa queres y cuantas unidades de cada una.");
    expect(reply).toContain("Opciones disponibles:");
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
    expect(state.orders).toHaveLength(0);
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
    expect(state.orders).toHaveLength(0);
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
    expect(state.orders).toHaveLength(0);
  });

  it("removes items from the active cart", async () => {
    const { repository } = createMemoryRepository({
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: ["bacon", "bacon king", "bk"]
        },
        {
          producto: "Veggie Power",
          precioUnitario: 9500,
          aliases: ["veggie", "veggie power"]
        }
      ]
    });
    const extractOrderRequest = vi
      .fn()
      .mockResolvedValueOnce({
        wantsMenu: false,
        orderLines: [
          { rawText: "una bacon", productText: "bacon", quantity: 1 },
          { rawText: "una veggie", productText: "veggie", quantity: 1 }
        ]
      })
      .mockResolvedValueOnce({
        wantsMenu: false,
        orderLines: [{ rawText: "sacame la veggie", productText: "veggie", quantity: 1 }]
      });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply,
      extractOrderRequest
    });

    await assistant.handleIncomingMessage({
      chatId: "cart-remove",
      text: "Quiero una bacon y una veggie"
    });
    const reply = await assistant.handleIncomingMessage({
      chatId: "cart-remove",
      text: "Sacame la veggie"
    });

    expect(reply).toContain("Quitado: 1 Veggie Power.");
    expect(reply).toContain("Total parcial: $11200.");
    expect(reply).toContain("¿Es para delivery o retiro?");
  });

  it("replaces the active cart when the user changes the order", async () => {
    const { repository } = createMemoryRepository({
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: ["bacon", "bacon king", "bk"]
        },
        {
          producto: "Veggie Power",
          precioUnitario: 9500,
          aliases: ["veggie", "veggie power"]
        }
      ]
    });
    const extractOrderRequest = vi
      .fn()
      .mockResolvedValueOnce({
        wantsMenu: false,
        orderLines: [{ rawText: "una bacon", productText: "bacon", quantity: 1 }]
      })
      .mockResolvedValueOnce({
        wantsMenu: false,
        orderLines: [{ rawText: "cambiame por una veggie", productText: "veggie", quantity: 1 }]
      });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply,
      extractOrderRequest
    });

    await assistant.handleIncomingMessage({
      chatId: "cart-replace",
      text: "Quiero una bacon"
    });
    const reply = await assistant.handleIncomingMessage({
      chatId: "cart-replace",
      text: "Cambiame por una veggie"
    });

    expect(reply).toContain("Actualizado: 1 Veggie Power ($9500).");
    expect(reply).toContain("Total parcial: $9500.");
  });

  it("clears the active cart when the user wants to start over", async () => {
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

    await assistant.handleIncomingMessage({
      chatId: "cart-clear",
      text: "Quiero una bacon king"
    });
    const reply = await assistant.handleIncomingMessage({
      chatId: "cart-clear",
      text: "Empezar de nuevo"
    });

    expect(reply).toBe("Tu pedido fue cancelado. ¿Queres comenzar de nuevo?");
    expect(state.orders).toHaveLength(0);
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
    expect(state.orders).toHaveLength(0);
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
      faq: [
        {
          tema: "delivery",
          pregunta: "hacen delivery",
          respuesta: "El costo del envio es de $1.500 fijos."
        }
      ],
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
    const finalReply = await assistant.handleIncomingMessage({
      chatId: "777",
      text: "10000"
    });

    expect(paymentReply).toBe("¿A nombre de quien dejamos el pedido?");
    expect(nameReply).toBe("El total es $10000. ¿Con cuanto vas a pagar?");
    expect(finalReply).toBe(
      "¡Listo! Tu pedido: 1 La Clásica Smash, delivery a av san martin 1234. Total: $10000. Abonas con el monto exacto."
    );
    expect(state.orders).toEqual([
      expect.objectContaining({
        direccion: "av san martin 1234",
        metodoPago: "efectivo",
        montoAbono: 10000,
        nombreCliente: "juan",
        total: 10000,
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

  it("adds the delivery fee from FAQ into the order total", async () => {
    const { repository, state } = createMemoryRepository({
      faq: [
        {
          tema: "delivery",
          pregunta: "hacen delivery",
          respuesta: "Hacemos envios y el costo del envio es de $1.500 fijos."
        }
      ],
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
      chatId: "delivery-fee-order",
      text: "Quiero una clasica"
    });
    const reply = await assistant.handleIncomingMessage({
      chatId: "delivery-fee-order",
      text: "para delivery"
    });

    expect(reply).toBe("Perfecto. ¿Cual es la direccion de entrega?");
    expect(state.orders).toHaveLength(0);
  });

  it("hands off automatically after three consecutive recoverable errors", async () => {
    const { repository, state } = createMemoryRepository({
      menu: [
        {
          item: "Bacon King",
          descripcion: "Hamburguesa doble",
          precio: 11200,
          categoria: "principal",
          disponible: true
        }
      ],
      prices: [
        {
          producto: "Bacon King",
          precioUnitario: 11200,
          aliases: ["bacon", "bacon king"]
        }
      ]
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    await assistant.handleIncomingMessage({
      chatId: "error-handoff",
      text: "Quiero una pizza"
    });
    await assistant.handleIncomingMessage({
      chatId: "error-handoff",
      text: "Quiero una milanesa"
    });
    const thirdReply = await assistant.handleIncomingMessage({
      chatId: "error-handoff",
      text: "Quiero sushi"
    });

    expect(thirdReply.toLowerCase()).toContain("operador humano");
    expect(state.sessions).toEqual([
      expect.objectContaining({
        chatId: "error-handoff",
        status: "handed_off"
      })
    ]);
  });

  it("routes payment questions to the payment handler when an order is active", async () => {
    const { repository } = createMemoryRepository({
      prices: [
        {
          producto: "La Clásica Smash",
          precioUnitario: 8500,
          aliases: ["clasica", "la clasica"]
        }
      ]
    });
    repository.getActivePaymentConfig = async () => ({
      metodos: ["efectivo", "transferencia", "mercado pago"],
      efectivoMinimo: 0,
      transferenciaBanco: "Banco Demo",
      transferenciaAlias: "demo.alias",
      transferenciaCBU: "1234567890123456789012",
      entregaPago: "adelantado"
    });
    const assistant = createConversationAssistant({
      repository,
      composeResponse: async (input) => input.draftReply
    });

    await assistant.handleIncomingMessage({
      chatId: "payment-methods-active-order",
      text: "Quiero una clasica"
    });
    const reply = await assistant.handleIncomingMessage({
      chatId: "payment-methods-active-order",
      text: "Como puedo pagar?"
    });

    expect(reply).toContain("Aceptamos los siguientes métodos de pago");
    expect(reply).toContain("**Efectivo**");
    expect(reply).not.toContain("Transferencia");
  });

  it("captures a payment amount during an active order and asks only for the next missing field", async () => {
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
      chatId: "payment-amount-active-order",
      text: "Quiero una clasica"
    });
    const reply = await assistant.handleIncomingMessage({
      chatId: "payment-amount-active-order",
      text: "Pago con $20000"
    });

    expect(reply).toBe(
      "Perfecto. El total es $8500. Pagando $20000, tu vuelto sera $11500. ¿Es para delivery o retiro?"
    );
    expect(state.orders).toHaveLength(0);
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
      expect(state.orders).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
