export type Category = { id: string; name: string; order: number };

export type Product = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number; // cêntimos
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
  price: number; // cêntimos
  normalPrice: number; // cêntimos
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

export type Order = {
  id: string;
  sessionId: string;
  guestId: string | null; // null = lançado pelo garçom
  author: string;
  createdAt: number;
  status: OrderStatus;
  note: string;
  items: OrderItem[];
};

export type DB = {
  version: number;
  establishment: { name: string };
  categories: Category[];
  products: Product[];
  offers: Offer[];
  tables: Table[];
  sessions: Session[];
  guests: Guest[];
  orders: Order[];
};

export type TableState = "livre" | "ocupada" | "conta" | "chamou";
