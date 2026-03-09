import type { CatalogSnapshot } from "../services/conversation-assistant.js";
import type { TestCase, TestBatteryGenerator, TestCategory } from "./judge-types.js";

/**
 * Generate a test battery based on the current catalog
 * Tests are dynamically generated using actual product names and FAQ entries
 */
export const generateTestBattery: TestBatteryGenerator = (catalog: CatalogSnapshot): Array<TestCase> => {
  const tests: Array<TestCase> = [];
  const products = catalog.menu.filter((p) => p.disponible);
  const productNames = products.map((p) => p.item);
  const faqTopics = catalog.faq.map((f) => f.tema);

  // Greeting tests - always the same
  tests.push(...generateGreetingTests());

  // FAQ tests - based on actual FAQ entries
  tests.push(...generateFaqTests(faqTopics));

  // Menu tests - based on available products
  tests.push(...generateMenuTests(products));

  // Single order tests - use random product names
  tests.push(...generateSingleOrderTests(productNames));

  // Multi-item order tests - combinations of products
  tests.push(...generateMultiOrderTests(productNames));

  // Workflow tests - complete order flows
  tests.push(...generateWorkflowTests(productNames));

  // Edge cases - error handling
  tests.push(...generateEdgeCaseTests(productNames));

  // Payment tests - payment and change calculation
  tests.push(...generatePaymentTests(productNames));

  // Handoff tests - human agent escalation
  tests.push(...generateHandoffTests());

  // Security tests - authentication and validation
  tests.push(...generateSecurityTests());

  // Resilience tests - circuit breaker and fallback
  tests.push(...generateResilienceTests());

  return tests;
};

/**
 * Greeting test cases
 */
function generateGreetingTests(): Array<TestCase> {
  return [
    {
      id: "G1",
      category: "greeting",
      description: "Simple greeting",
      messages: ["Hola"],
      expectedBehavior: "Return a friendly greeting and offer help with menu, hours, or ordering"
    },
    {
      id: "G2",
      category: "greeting",
      description: "Afternoon greeting",
      messages: ["Buenas tardes"],
      expectedBehavior: "Return a friendly greeting and offer help"
    },
    {
      id: "G3",
      category: "greeting",
      description: "Casual greeting",
      messages: ["Hey, que tal?"],
      expectedBehavior: "Return a friendly greeting and offer help"
    }
  ];
}

/**
 * FAQ test cases based on actual FAQ topics
 */
function generateFaqTests(faqTopics: Array<string>): Array<TestCase> {
  const tests: Array<TestCase> = [];

  // Standard FAQ questions
  const standardQuestions: Array<{ question: string; topic: string; expected: string }> = [
    {
      question: "Cual es el horario?",
      topic: "horario",
      expected: "Provide the restaurant hours from the FAQ"
    },
    {
      question: "Aceptan mercado pago?",
      topic: "pago",
      expected: "Explain that only cash is accepted for now"
    },
    {
      question: "Donde estan ubicados?",
      topic: "ubicacion",
      expected: "Provide location information"
    },
    {
      question: "Hacen delivery?",
      topic: "delivery",
      expected: "Explain delivery options"
    },
    {
      question: "Como puedo pagar?",
      topic: "pago",
      expected: "Explain that only cash is accepted for now"
    }
  ];

  standardQuestions.forEach((q, index) => {
    tests.push({
      id: `F${index + 1}`,
      category: "faq",
      description: `FAQ question about ${q.topic}`,
      messages: [q.question],
      expectedBehavior: q.expected
    });
  });

  tests.push({
    id: "F6",
    category: "faq",
    description: "Combined FAQ and menu question",
    messages: ["Cual es el horario y que tienen?"],
    expectedBehavior: "Answer the horario FAQ first and also list menu options without losing the FAQ focus"
  });

  return tests;
}

/**
 * Menu test cases based on available products
 */
function generateMenuTests(
  products: Array<{ item: string; categoria: string; disponible: boolean }>
): Array<TestCase> {
  const tests: Array<TestCase> = [];

  // General menu request
  tests.push({
    id: "M1",
    category: "menu",
    description: "Ask for recommendations",
    messages: ["Que me recomendas?"],
    expectedBehavior: "List available products with prices"
  });

  // Show full menu
  tests.push({
    id: "M2",
    category: "menu",
    description: "Request full menu",
    messages: ["Muéstrame el menú"],
    expectedBehavior: "List all available products with descriptions and prices"
  });

  // Category filter
  const categories = [...new Set(products.map((p) => p.categoria))];
  if (categories.length > 0) {
    tests.push({
      id: "M3",
      category: "menu",
      description: `Filter by category: ${categories[0]}`,
      messages: [`Qué ${categories[0]} tienen?`],
      expectedBehavior: `List available ${categories[0]} options`
    });
  }

  // Vegetarian options
  tests.push({
    id: "M4",
    category: "menu",
    description: "Ask for vegetarian options",
    messages: ["Tienen opciones vegetarianas?"],
    expectedBehavior: "List vegetarian products or explain availability"
  });

  return tests;
}

/**
 * Single order test cases using actual product names
 */
function generateSingleOrderTests(productNames: Array<string>): Array<TestCase> {
  const tests: Array<TestCase> = [];

  if (productNames.length === 0) {
    return tests;
  }

  // Order single product by full name
  const product1 = productNames[0];
  tests.push({
    id: "O1",
    category: "single_order",
    description: `Order one ${product1}`,
    messages: [`Quiero una ${product1.toLowerCase()}`],
    expectedBehavior: `Add ${product1} to order and ask for delivery/pickup`
  });

  // Order multiple of same product
  if (productNames.length >= 1) {
    tests.push({
      id: "O2",
      category: "single_order",
      description: `Order two ${product1}`,
      messages: [`Mándame dos ${product1.toLowerCase()}`],
      expectedBehavior: `Add 2x ${product1} to order with correct total`
    });
  }

  // Order using alias or partial name
  if (productNames.length >= 2) {
    const product2 = productNames[1];
    const shortName = product2.split(" ")[0].toLowerCase();
    tests.push({
      id: "O3",
      category: "single_order",
      description: `Order using partial name: ${shortName}`,
      messages: [`Quiero un ${shortName}`],
      expectedBehavior: `Resolve to ${product2} and add to order`
    });
  }

  // Order third product if available
  if (productNames.length >= 3) {
    const product3 = productNames[2];
    tests.push({
      id: "O4",
      category: "single_order",
      description: `Add ${product3} to order`,
      messages: [`Agrégame una ${product3.toLowerCase()}`],
      expectedBehavior: `Add ${product3} to order`
    });
  }

  return tests;
}

/**
 * Multi-item order test cases
 */
function generateMultiOrderTests(productNames: Array<string>): Array<TestCase> {
  const tests: Array<TestCase> = [];

  if (productNames.length < 2) {
    return tests;
  }

  const p1 = productNames[0];
  const p2 = productNames[1];

  // Order two different items
  tests.push({
    id: "MO1",
    category: "multi_order",
    description: "Order two different products",
    messages: [`Quiero una ${p1.toLowerCase()} y una ${p2.toLowerCase()}`],
    expectedBehavior: `Add both ${p1} and ${p2} to order with correct total`
  });

  // Order multiple quantities
  if (productNames.length >= 2) {
    tests.push({
      id: "MO2",
      category: "multi_order",
      description: "Order multiple quantities of different products",
      messages: [`Mándame dos ${p1.toLowerCase()} y un ${p2.toLowerCase()}`],
      expectedBehavior: "Add all items with correct quantities and total"
    });
  }

  // Add more to existing order
  tests.push({
    id: "MO3",
    category: "multi_order",
    description: "Add another item to order",
    messages: [
      `Quiero una ${p1.toLowerCase()}`,
      `Agrégame otra ${p1.toLowerCase()} más`
    ],
    expectedBehavior: "Increment quantity of existing item"
  });

  tests.push({
    id: "MO4",
    category: "multi_order",
    description: "Remove an item from an active order",
    messages: [
      `Quiero una ${p1.toLowerCase()} y una ${p2.toLowerCase()}`,
      `Sacame la ${p2.toLowerCase()}`
    ],
    expectedBehavior: `Remove ${p2} from the active order and keep ${p1}`
  });

  tests.push({
    id: "MO5",
    category: "multi_order",
    description: "Replace the active order",
    messages: [
      `Quiero una ${p1.toLowerCase()}`,
      `Cambiame por una ${p2.toLowerCase()}`
    ],
    expectedBehavior: `Replace the active cart with ${p2} and show the updated total`
  });

  return tests;
}

/**
 * Complete workflow test cases
 */
function generateWorkflowTests(productNames: Array<string>): Array<TestCase> {
  const tests: Array<TestCase> = [];

  if (productNames.length === 0) {
    return tests;
  }

  const product = productNames[0];

  // Complete delivery workflow
  tests.push({
    id: "W1",
    category: "workflow",
    description: "Complete delivery order workflow",
    messages: [
      `Quiero una ${product.toLowerCase()}`,
      "Para delivery",
      "Mi dirección es Av. Corrientes 1234",
      "Pago en efectivo",
      "Me llamo Juan",
      "Pago con 10000"
    ],
    expectedBehavior: "Complete a cash-only order with delivery, address, customer name, and payment amount"
  });

  // Complete pickup workflow
  tests.push({
    id: "W2",
    category: "workflow",
    description: "Complete pickup order workflow",
    messages: [
      `Mándame dos ${product.toLowerCase()}`,
      "Para retirar",
      "Te pago con efectivo",
      "Soy María",
      "Pago con 20000"
    ],
    expectedBehavior: "Complete a cash-only pickup order with payment and customer name"
  });

  // Multi-step order with additions
  if (productNames.length >= 2) {
    const product2 = productNames[1];
    tests.push({
      id: "W3",
      category: "workflow",
      description: "Order with additions workflow",
      messages: [
        `Quiero una ${product.toLowerCase()}`,
        `Agrégame una ${product2.toLowerCase()}`,
        "Para delivery",
        "Calle Florida 500",
        "Pago en efectivo",
        "Soy Juan",
        "Pago con 20000"
      ],
      expectedBehavior: "Handle multiple additions and complete a cash-only order"
    });
  }

  return tests;
}

/**
 * Edge case test cases
 */
function generateEdgeCaseTests(productNames: Array<string>): Array<TestCase> {
  const tests: Array<TestCase> = [];

  // Non-existent product
  tests.push({
    id: "E1",
    category: "edge_case",
    description: "Order non-existent product",
    messages: ["Quiero una pizza"],
    expectedBehavior: "Explain product not available and suggest alternatives from menu"
  });

  // Cancel order
  tests.push({
    id: "E2",
    category: "edge_case",
    description: "Cancel order request",
    messages: ["Cancelar todo"],
    expectedBehavior: "Acknowledge cancellation and clear order"
  });

  if (productNames.length >= 1) {
    tests.push({
      id: "E6",
      category: "edge_case",
      description: "Cancel an active order",
      messages: [
        `Quiero una ${productNames[0].toLowerCase()}`,
        "Cancelar todo"
      ],
      expectedBehavior: "Cancel the active order and confirm that the cart was cleared"
    });

    tests.push({
      id: "E7",
      category: "edge_case",
      description: "Topic switch during an active order",
      messages: [
        `Quiero una ${productNames[0].toLowerCase()}`,
        "Cual es el horario?"
      ],
      expectedBehavior: "Acknowledge the active order, answer the FAQ, and make clear the order can be resumed"
    });
  }

  // Check total
  if (productNames.length >= 1) {
    tests.push({
      id: "E3",
      category: "edge_case",
      description: "Check order total",
      messages: [`Quiero una ${productNames[0].toLowerCase()}`, "Cuánto es?"],
      expectedBehavior: "Show current order total with breakdown"
    });
  }

  // Ambiguous order
  tests.push({
    id: "E4",
    category: "edge_case",
    description: "Ambiguous order without specifying product",
    messages: ["Quiero tres hamburguesas"],
    expectedBehavior: "Ask for clarification on which specific product"
  });

  // Empty/gibberish message
  tests.push({
    id: "E5",
    category: "edge_case",
    description: "Unclear message",
    messages: ["asdfghjkl"],
    expectedBehavior: "Ask for clarification or offer help"
  });

  return tests;
}

/**
 * Get a random subset of products for varied testing
 */
export function getRandomProducts(
  products: Array<{ item: string; categoria: string; disponible: boolean }>,
  count: number
): Array<string> {
  const available = products.filter((p) => p.disponible);
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((p) => p.item);
}

/**
 * Payment test cases - payment and change calculation
 */
function generatePaymentTests(productNames: Array<string>): Array<TestCase> {
  const tests: Array<TestCase> = [];

  if (productNames.length === 0) {
    return tests;
  }

  const product = productNames[0];

  // JDG-01: Exact payment calculation
  tests.push({
    id: "PAY-01",
    category: "payment",
    description: "Exact payment calculation",
    messages: [
      `Quiero una ${product.toLowerCase()} de $5000`,
      "Pago con $5000 exactos"
    ],
    expectedBehavior: "Should confirm exact payment, no change needed"
  });

  // JDG-02: Change calculation request
  tests.push({
    id: "PAY-02",
    category: "payment",
    description: "Change calculation request",
    messages: [
      `Quiero 2 ${product.toLowerCase()} de $8000 cada una`,
      "Pago con $20000"
    ],
    expectedBehavior: "Should calculate change of $4000"
  });

  // JDG-03: Insufficient payment handling
  tests.push({
    id: "PAY-03",
    category: "payment",
    description: "Insufficient payment handling",
    messages: [
      `Quiero una ${product.toLowerCase()}`,
      "Tengo $10000 nada más"
    ],
    expectedBehavior: "Should inform customer payment is insufficient and show amount needed"
  });

  // Additional payment scenarios
  tests.push({
    id: "PAY-04",
    category: "payment",
    description: "Payment method selection",
    messages: [
      "¿Cómo puedo pagar?"
    ],
    expectedBehavior: "Should explain that only cash is accepted"
  });

  tests.push({
    id: "PAY-05",
    category: "payment",
    description: "Large bill payment",
    messages: [
      `Quiero una ${product.toLowerCase()} de $3000`,
      "Te pago con $50000"
    ],
    expectedBehavior: "Should calculate and confirm correct change amount"
  });

  return tests;
}

/**
 * Handoff test cases - human agent escalation
 */
function generateHandoffTests(): Array<TestCase> {
  const tests: Array<TestCase> = [];

  // JDG-HANDOFF-01: Complaint triggers handoff
  tests.push({
    id: "HANDOFF-01",
    category: "handoff",
    description: "Complaint triggers handoff",
    messages: [
      "Quiero hablar con un supervisor, mi pedido llegó mal"
    ],
    expectedBehavior: "Should trigger human handoff and inform customer they will be connected to a human agent"
  });

  // JDG-HANDOFF-02: Explicit supervisor request
  tests.push({
    id: "HANDOFF-02",
    category: "handoff",
    description: "Explicit supervisor request",
    messages: [
      "Necesito hablar con un gerente, tuve un problema grave"
    ],
    expectedBehavior: "Should acknowledge request and initiate handoff process"
  });

  // JDG-HANDOFF-03: Frustrated customer
  tests.push({
    id: "HANDOFF-03",
    category: "handoff",
    description: "Frustrated customer triggers handoff",
    messages: [
      "Ya te pregunté 3 veces lo mismo y no me respondes bien",
      "Paso a buscar un humano"
    ],
    expectedBehavior: "Should detect frustration and offer human handoff"
  });

  // JDG-HANDOFF-04: Complex issue beyond bot scope
  tests.push({
    id: "HANDOFF-04",
    category: "handoff",
    description: "Complex issue beyond bot scope",
    messages: [
      "Tengo una queja formal sobre alergias alimentarias y necesito hablar con el responsable"
    ],
    expectedBehavior: "Should escalate to human agent due to serious nature of complaint"
  });

  tests.push({
    id: "HANDOFF-05",
    category: "handoff",
    description: "Automatic handoff after three consecutive recoverable errors",
    messages: [
      "Quiero una pizza",
      "Quiero sushi",
      "Quiero una milanesa"
    ],
    expectedBehavior: "Should automatically transfer the conversation to a human after three consecutive recoverable order errors"
  });

  return tests;
}

/**
 * Security test cases - authentication and validation
 * Note: These tests require special setup to validate security behaviors
 */
function generateSecurityTests(): Array<TestCase> {
  const tests: Array<TestCase> = [];

  // JDG-SEC-01: Telegram signature validation
  // This is a meta-test that validates webhook security
  tests.push({
    id: "SEC-01",
    category: "security",
    description: "Telegram signature validation",
    messages: [
      // This test validates that requests without valid signatures are rejected
      // The actual test is performed at the HTTP layer, not via message
      "[META: Webhook security test - validates X-Telegram-Bot-Api-Secret-Token header]"
    ],
    expectedBehavior: "Should reject requests without valid X-Telegram-Bot-Api-Secret-Token header with 401/403"
  });

  // JDG-SEC-02: JWT authentication for admin
  tests.push({
    id: "SEC-02",
    category: "security",
    description: "JWT authentication required for admin",
    messages: [
      "[META: Admin route security test - validates JWT authentication]"
    ],
    expectedBehavior: "Should reject unauthenticated admin requests with 401 Unauthorized"
  });

  // JDG-SEC-03: Input sanitization
  tests.push({
    id: "SEC-03",
    category: "security",
    description: "Input sanitization - XSS prevention",
    messages: [
      "<script>alert('xss')</script> Hola"
    ],
    expectedBehavior: "Should sanitize input and not execute or reflect script tags"
  });

  // JDG-SEC-04: SQL injection prevention
  tests.push({
    id: "SEC-04",
    category: "security",
    description: "SQL injection prevention",
    messages: [
      "'; DROP TABLE users; --"
    ],
    expectedBehavior: "Should safely handle malicious input without database impact"
  });

  // JDG-SEC-05: Rate limiting
  tests.push({
    id: "SEC-05",
    category: "security",
    description: "Rate limiting validation",
    messages: [
      "[META: Rate limiting test - validates request throttling]"
    ],
    expectedBehavior: "Should enforce rate limits and return 429 when exceeded"
  });

  return tests;
}

/**
 * Resilience test cases - circuit breaker and fallback
 * Note: These tests validate system resilience patterns
 */
function generateResilienceTests(): Array<TestCase> {
  const tests: Array<TestCase> = [];

  // JDG-RES-01: Circuit breaker opens on failures
  tests.push({
    id: "RES-01",
    category: "resilience",
    description: "Circuit breaker opens on failures",
    messages: [
      "[META: Circuit breaker test - validates failure threshold handling]"
    ],
    expectedBehavior: "Circuit breaker should open after configured failure threshold and return fallback response"
  });

  // JDG-RES-02: Graceful degradation returns fallback
  tests.push({
    id: "RES-02",
    category: "resilience",
    description: "Graceful degradation returns fallback",
    messages: [
      "[META: Graceful degradation test - validates FAQ-based fallback when Gemini unavailable]"
    ],
    expectedBehavior: "Should return FAQ-based fallback response when Gemini API is unavailable"
  });

  // JDG-RES-03: Circuit breaker recovery (half-open state)
  tests.push({
    id: "RES-03",
    category: "resilience",
    description: "Circuit breaker recovery",
    messages: [
      "[META: Circuit breaker recovery test - validates half-open state transitions]"
    ],
    expectedBehavior: "Circuit breaker should transition to half-open after timeout and allow test requests"
  });

  // JDG-RES-04: Timeout handling
  tests.push({
    id: "RES-04",
    category: "resilience",
    description: "Timeout handling",
    messages: [
      "[META: Timeout test - validates request timeout handling]"
    ],
    expectedBehavior: "Should handle request timeouts gracefully and return appropriate error response"
  });

  // JDG-RES-05: Retry with exponential backoff
  tests.push({
    id: "RES-05",
    category: "resilience",
    description: "Retry with exponential backoff",
    messages: [
      "[META: Retry test - validates exponential backoff on transient failures]"
    ],
    expectedBehavior: "Should retry failed requests with exponential backoff before giving up"
  });

  return tests;
}
