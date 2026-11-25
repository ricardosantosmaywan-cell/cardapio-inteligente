import type { Currency, DB } from "./types";

const now = Date.now();
const min = (m: number) => now - m * 60_000;

export const SEED_VERSION = 1;

export function makeSeed(): DB {
  return {
    version: SEED_VERSION,
    establishment: { name: "Boteco do Largo", currency: "BRL" },
    categories: [
      { id: "c1", name: "Entradas", order: 1 },
      { id: "c2", name: "Pratos", order: 2 },
      { id: "c3", name: "Hambúrgueres", order: 3 },
      { id: "c4", name: "Sobremesas", order: 4 },
      { id: "c5", name: "Bebidas", order: 5 },
    ],
    products: [
      { id: "p1", categoryId: "c1", name: "Pastéis de bacalhau", description: "6 unidades, com migalhas de azeite", price: 650, emoji: "🧆", available: true },
      { id: "p2", categoryId: "c1", name: "Queijo da Serra", description: "Com pão tostado e doce de abóbora", price: 790, emoji: "🧀", available: true },
      { id: "p3", categoryId: "c1", name: "Salada de polvo", description: "Polvo, grão, cebola roxa e coentros", price: 980, emoji: "🥗", available: true },
      { id: "p4", categoryId: "c2", name: "Bacalhau à Brás", description: "Clássico com batata palha e ovo", price: 1450, emoji: "🍳", available: true },
      { id: "p5", categoryId: "c2", name: "Bife à casa", description: "Bife do lombo, ovo estrelado e batata frita", price: 1590, emoji: "🥩", available: true },
      { id: "p6", categoryId: "c2", name: "Arroz de pato", description: "Forno de lenha, chouriço e crosta dourada", price: 1390, emoji: "🍚", available: false },
      { id: "p7", categoryId: "c3", name: "Hambúrguer da Tasca", description: "Novilho 180 g, queijo, bacon e molho da casa", price: 1190, emoji: "🍔", available: true },
      { id: "p8", categoryId: "c3", name: "Hambúrguer vegetariano", description: "Grão, beterraba e maionese de ervas", price: 1090, emoji: "🥬", available: true },
      { id: "p9", categoryId: "c4", name: "Pudim Abade de Priscos", description: "Receita tradicional, textura cremosa", price: 420, emoji: "🍮", available: true },
      { id: "p10", categoryId: "c4", name: "Mousse de chocolate", description: "Chocolate negro 70% e flor de sal", price: 390, emoji: "🍫", available: true },
      { id: "p11", categoryId: "c5", name: "Sagres 33 cl", description: "Imperial gelada", price: 220, emoji: "🍺", available: true },
      { id: "p12", categoryId: "c5", name: "Vinho da casa (jarro)", description: "Tinto ou branco, 50 cl", price: 750, emoji: "🍷", available: true },
      { id: "p13", categoryId: "c5", name: "Água 50 cl", description: "Sem gás ou com gás", price: 150, emoji: "💧", available: true },
      { id: "p14", categoryId: "c5", name: "Café", description: "Expresso", price: 110, emoji: "☕", available: true },
    ],
    offers: [
      { id: "o1", title: "Prato do dia", tag: "Hoje", emoji: "🍲", price: 950, normalPrice: 1350, days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59", active: true, order: 1 },
      { id: "o2", title: "Imperial + petisco", tag: "Happy hour", emoji: "🍻", price: 490, normalPrice: 870, days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59", active: true, order: 2 },
      { id: "o3", title: "Sobremesa + café", tag: "Fim de refeição", emoji: "🍰", price: 480, normalPrice: 640, days: [5, 6], start: "12:00", end: "15:00", active: true, order: 3 },
    ],
    tables: [
      { id: "t1", name: "Mesa 1", token: "demo-mesa-1-4f9a2c71e08b35d6" },
      { id: "t2", name: "Mesa 2", token: "demo-mesa-2-b83d61af90c2e475" },
      { id: "t3", name: "Mesa 3", token: "demo-mesa-3-1ce7a45d0f9b8236" },
      { id: "t4", name: "Mesa 4", token: "demo-mesa-4-7a05f3b9d1c64e82" },
      { id: "t5", name: "Balcão", token: "demo-balcao-5-e2194cd7a8f03b65" },
    ],
    // Mesa 3 já tem uma sessão em curso para o garçom ter algo no tela.
    sessions: [{ id: "s1", tableId: "t3", openedAt: min(42) }],
    guests: [
      { id: "g1", sessionId: "s1", name: "Marta", phone: "912 345 678", status: "aprovado" },
      { id: "g2", sessionId: "s1", name: "João", status: "aprovado" },
    ],
    orders: [
      {
        id: "or1", sessionId: "s1", guestId: "g1", author: "Marta", createdAt: min(38), status: "entregue", note: "",
        items: [
          { id: "i1", productId: "p1", name: "Pastéis de bacalhau", price: 650, qty: 1, cancelled: false },
          { id: "i2", productId: "p11", name: "Sagres 33 cl", price: 220, qty: 2, cancelled: false },
        ],
      },
      {
        id: "or2", sessionId: "s1", guestId: "g2", author: "João", createdAt: min(12), status: "visto", note: "Bife bem passado, por favor",
        items: [
          { id: "i3", productId: "p5", name: "Bife à casa", price: 1590, qty: 1, cancelled: false },
          { id: "i4", productId: "p7", name: "Hambúrguer da Tasca", price: 1190, qty: 1, cancelled: false },
        ],
      },
    ],
  };
}

/**
 * Estado inicial de uma loja nova (criada no /admin): categorias de arranque,
 * sem produtos nem ofertas, e as mesas pedidas com um token cada.
 */
export function makeStoreSeed(opts: { name: string; currency: Currency; tableNames: string[]; tokens: string[] }): DB {
  return {
    version: SEED_VERSION,
    establishment: { name: opts.name, currency: opts.currency },
    categories: ["Lanches", "Porções", "Pratos", "Sobremesas", "Bebidas"].map((name, i) => ({ id: `c${i + 1}`, name, order: i + 1 })),
    products: [],
    offers: [],
    tables: opts.tableNames.map((name, i) => ({ id: `t${i + 1}`, name, token: opts.tokens[i] })),
    sessions: [],
    guests: [],
    orders: [],
  };
}

/**
 * Demonstração para apresentar a clientes (modo local): "Hamburgueria do Zé".
 * Valores fictícios; as fotos vêm de public/demo/hamburgueria-do-ze/.
 * Os ids de categoria batem com makeStoreSeed: c1 Lanches, c2 Porções, c5 Bebidas.
 */
export const DEMO_ZE_SLUG = "hamburgueria-do-ze";
const DEMO_ZE_PHOTO = (f: string) => `/demo/hamburgueria-do-ze/${f}`;
export const DEMO_ZE_PRODUCTS: DB["products"] = [
  { id: "z1", categoryId: "c1", name: "Cheeseburger Clássico", description: "Hambúrguer de 180 g, queijo cheddar, alface, tomate, cebola roxa e molho da casa", price: 2490, emoji: "🍔", photo: DEMO_ZE_PHOTO("cheeseburger-classico.jpg"), available: true },
  { id: "z2", categoryId: "c1", name: "Duplo Cheddar", description: "Dois hambúrgueres de 90 g, dobro de cheddar, picles e cebola fatiada", price: 3290, emoji: "🍔", photo: DEMO_ZE_PHOTO("duplo-cheddar.jpg"), available: true },
  { id: "z3", categoryId: "c1", name: "Bacon Onion", description: "Hambúrguer de 180 g, bacon crocante, anéis de cebola empanados e cheddar", price: 3490, emoji: "🥓", photo: DEMO_ZE_PHOTO("bacon-onion.jpg"), available: true },
  { id: "z4", categoryId: "c1", name: "Frango Crocante", description: "Filé de frango empanado e crocante, cheddar, tomate, alface e maionese da casa", price: 2790, emoji: "🍗", photo: DEMO_ZE_PHOTO("frango-crocante.jpg"), available: true },
  { id: "z5", categoryId: "c2", name: "Batata frita", description: "Porção crocante com sal e ervas, para partilhar", price: 1290, emoji: "🍟", available: true },
  { id: "z6", categoryId: "c2", name: "Anéis de cebola", description: "Anéis de cebola empanados e fritos, com molho barbecue", price: 1490, emoji: "🧅", available: true },
  { id: "z7", categoryId: "c5", name: "Refrigerante lata 350 ml", description: "Gelado, à escolha entre os sabores disponíveis", price: 600, emoji: "🥤", photo: DEMO_ZE_PHOTO("refrigerante.jpg"), available: true },
  { id: "z8", categoryId: "c5", name: "Suco de laranja natural", description: "Feito na hora, copo de 400 ml com gelo", price: 900, emoji: "🍊", photo: DEMO_ZE_PHOTO("suco-laranja.jpg"), available: true },
];
