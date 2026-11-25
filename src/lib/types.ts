export type Currency = "BRL" | "EUR";

/** skipKitchen: os produtos desta categoria (ex.: bebidas) não passam pela tela da cozinha. */
export type Category = { id: string; name: string; order: number; skipKitchen?: boolean };

export type Product = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number; // centavos
  emoji: string;
  photo?: string; // data URL enviada pelo dono
  available: boolean; // false = esgotado
};

export type Offer = {
  id: string;
  title: string;
  tag: string;
  emoji: string;
  photo?: string;
  price: number; // centavos
  normalPrice: number; // centavos
  days: number[]; // 0 = domingo ... 6 = sábado
  start: string; // "HH:MM"
  end: string;
  active: boolean;
  order: number;
};

export type Table = {
  id: string;
  name: string;
  token: string;
  billRequestedAt?: number;
  calledAt?: number;
};

export type Session = { id: string; tableId: string; openedAt: number; closedAt?: number };

export type Guest = {
  id: string;
  sessionId: string;
  name: string;
  phone?: string;
  status: "pendente" | "aprovado" | "recusado";
};

export type OrderStatus = "enviado" | "visto" | "entregue";

export type OrderItem = {
  id: string;
  productId: string;
  name: string;
  price: number;
  qty: number;
  cancelled: boolean;
  delivered?: boolean; // entregue à mesa (item a item)
};

/** Estado do pedido na cozinha (só conta quando a loja tem a tela da cozinha ligada). */
export type KitchenStatus = "novo" | "preparo" | "pronto";

export type Order = {
  id: string;
  sessionId: string;
  guestId: string | null; // null = lançado pelo garçom
  author: string;
  createdAt: number;
  status: OrderStatus;
  note: string;
  items: OrderItem[];
  kitchen?: KitchenStatus; // em falta = "novo"
  prepStartedAt?: number;
  readyAt?: number;
};

/** Tela da cozinha: opcional por loja. alertMin = minutos de espera a partir dos quais o pedido fica destacado. */
export type KitchenConfig = { enabled: boolean; alertMin: number };

export type DB = {
  version: number;
  establishment: { name: string; currency?: Currency; kitchen?: KitchenConfig };
  categories: Category[];
  products: Product[];
  offers: Offer[];
  tables: Table[];
  sessions: Session[];
  guests: Guest[];
  orders: Order[];
};

export type TableState = "livre" | "ocupada" | "conta" | "chamou";
