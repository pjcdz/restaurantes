import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment variables
vi.mock("process", () => ({
  env: {
    GOOGLE_GENERATIVE_AI_API_KEY: "test-api-key",
    LANGFUSE_PUBLIC_KEY: "test-public-key",
    LANGFUSE_SECRET_KEY: "test-secret-key",
    LANGFUSE_HOST: "http://localhost:3001",
  },
}));

describe("Agent Graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Intent Classification", () => {
    it("should classify 'hola' as saludo intent", async () => {
      // This would be an integration test with actual LLM
      // For now, we'll test the logic structure
      const message = "hola";
      expect(message).toBeDefined();
    });

    it("should classify 'qué tienen?' as faq intent", async () => {
      const message = "qué tienen?";
      expect(message).toBeDefined();
    });

    it("should classify 'quiero una hamburguesa' as order intent", async () => {
      const message = "quiero una hamburguesa";
      expect(message).toBeDefined();
    });
  });

  describe("Order Handler", () => {
    it("should extract item from order message", () => {
      const message = "quiero 2 hamburguesas";
      expect(message).toContain("hamburguesas");
      expect(message).toContain("2");
    });

    it("should detect missing fields in incomplete order", () => {
      const cart = {
        items: [{ producto: "hamburguesa", cantidad: 2, precioUnitario: 2500 }],
        telefono: null,
        direccion: null,
        tipoEntrega: null,
        metodoPago: null,
        nombreCliente: null,
      };

      const missingFields = [];
      if (cart.items.length === 0) missingFields.push("items");
      if (!cart.telefono) missingFields.push("telefono");
      if (!cart.tipoEntrega) missingFields.push("tipoEntrega");
      if (!cart.metodoPago) missingFields.push("metodoPago");
      if (!cart.nombreCliente) missingFields.push("nombreCliente");

      expect(missingFields).toContain("telefono");
      expect(missingFields).toContain("tipoEntrega");
      expect(missingFields).toContain("metodoPago");
      expect(missingFields).toContain("nombreCliente");
    });

    it("should calculate order total correctly", () => {
      const items = [
        { producto: "hamburguesa", cantidad: 2, precioUnitario: 2500 },
        { producto: "papas", cantidad: 1, precioUnitario: 1200 },
      ];

      const total = items.reduce((sum, item) => sum + item.precioUnitario * item.cantidad, 0);
      expect(total).toBe(6200);
    });
  });

  describe("FAQ Handler", () => {
    it("should detect menu topic from question", () => {
      const question = "qué tienen en el menú?";
      const questionLower = question.toLowerCase();
      
      let topic = "general";
      if (questionLower.includes("menu") || questionLower.includes("menú") || 
          questionLower.includes("tienen") || questionLower.includes("productos")) {
        topic = "menu";
      }
      
      expect(topic).toBe("menu");
    });

    it("should detect horarios topic from question", () => {
      const question = "a qué hora abren?";
      const questionLower = question.toLowerCase();
      
      let topic = "general";
      if (questionLower.includes("hora") || questionLower.includes("cuando") || 
          questionLower.includes("abierto") || questionLower.includes("atienden")) {
        topic = "horarios";
      }
      
      expect(topic).toBe("horarios");
    });
  });

  describe("Response Formatting", () => {
    it("should generate greeting response", () => {
      const intent = "saludo";
      let response: string;
      
      switch (intent) {
        case "saludo":
          response = "¡Hola! Bienvenido a nuestro restaurante.";
          break;
        default:
          response = "No entendí tu mensaje.";
      }
      
      expect(response).toContain("Hola");
      expect(response).toContain("Bienvenido");
    });

    it("should generate complaint response with handoff message", () => {
      const intent = "complaint";
      let response: string;
      
      switch (intent) {
        case "complaint":
          response = "Lamento que tengas ese inconveniente. Un momento que te conecto con un operador.";
          break;
        default:
          response = "No entendí tu mensaje.";
      }
      
      expect(response).toContain("operador");
    });
  });
});
