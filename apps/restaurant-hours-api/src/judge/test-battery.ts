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
      expected: "Explain payment methods including mercado pago"
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
      expected: "List available payment methods"
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
      "Mercado Pago",
      "Me llamo Juan"
    ],
    expectedBehavior: "Complete order with delivery, address, payment, and customer name"
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
      "Soy María"
    ],
    expectedBehavior: "Complete order for pickup with payment and customer name"
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
        "Mercado Pago"
      ],
      expectedBehavior: "Handle multiple additions and complete order"
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
