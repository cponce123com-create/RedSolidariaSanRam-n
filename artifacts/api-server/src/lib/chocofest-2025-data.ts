// ─── Datos reales: Chocofest 2025 (Chocolatada Navideña 2025) ────────────────
// Aportes y gastos extraídos del "Informe en vivo de las Donaciones Chocofest
// San Ramón - Chanchamayo" (Google Sheets → chocolatada2025.csv). Fuente única
// de verdad: la usan el seed (seed.ts) y el script de aplicación a una BD
// existente (scripts/src/apply-chocofest-2025.ts).
//
// Convenciones (fieles a la hoja, sin inventar datos):
// - Efectivo → paymentMethod "cash".
// - PayPal → paymentMethod "other" (no existe el método en la API).
// - Donaciones en especie → amount 0, paymentMethod "other" y el ítem en
//   `message`. La hoja no las monetiza (el "Total General" solo suma efectivo).
// - La hoja no registra emails: se usan placeholders "donante.N@example.com".
// - Las URLs de imagen/boleta son FOTO DEMO (Unsplash): reemplazar por las
//   fotos reales desde el panel admin cuando estén disponibles.

const u = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

// FOTO DEMO — boleta/sustento genérico (reemplazar por la boleta real escaneada).
const RECEIPT_DEMO = u("photo-1554224155-6726b3ff858f", 900);

/** Fecha al mediodía UTC del día indicado en diciembre de 2025. */
const iso = (day: number): Date => new Date(Date.UTC(2025, 11, day, 12));

export type ChocofestPaymentMethod = "cash" | "other";

export interface ChocofestDonationSeed {
  firstName: string;
  lastName: string;
  email: string;
  amount: number;
  paymentMethod: ChocofestPaymentMethod;
  message: string | null;
  anonymous: boolean;
  publicProof: boolean;
  status: "approved";
  createdAt: Date;
}

let emailSeq = 0;
const nextEmail = (): string => `chocofest.donante.${++emailSeq}@example.com`;

const cash = (
  firstName: string,
  amount: number,
  day: number,
  message: string | null = null,
): ChocofestDonationSeed => ({
  firstName,
  lastName: "",
  email: nextEmail(),
  amount,
  paymentMethod: "cash",
  message,
  anonymous: false,
  publicProof: false,
  status: "approved",
  createdAt: iso(day),
});

const paypal = (firstName: string, amount: number, day: number): ChocofestDonationSeed => ({
  firstName,
  lastName: "",
  email: nextEmail(),
  amount,
  paymentMethod: "other",
  message: null,
  anonymous: false,
  publicProof: false,
  status: "approved",
  createdAt: iso(day),
});

const kind = (firstName: string, item: string, day: number): ChocofestDonationSeed => ({
  firstName,
  lastName: "",
  email: nextEmail(),
  amount: 0,
  paymentMethod: "other",
  message: `Donación en especie: ${item}`,
  anonymous: false,
  publicProof: false,
  status: "approved",
  createdAt: iso(day),
});

/** Total en efectivo de la hoja (S/. 2,818.5). */
export const CHOCOLATADA_2025_CASH_TOTAL = 2818.5;

/** Total de gastos rendidos (S/. 2,912.8). */
export const CHOCOLATADA_2025_EXPENSES_TOTAL = 2912.8;

export const CHOCOLATADA_2025_TITLE = "Chocofest 2025";

export const CHOCOLATADA_2025_DONATIONS: ChocofestDonationSeed[] = [
  // ── 4/12/2025 ──
  cash("M", 100, 4),
  cash("Jenny", 100, 4),
  kind("Leonardo", "1 caja de panetón", 4),
  cash("El Principe Mestizo", 100, 4),
  cash("Julisa Camavilca", 100, 4),
  // ── 5/12/2025 ──
  cash("Carlos Ponce", 100, 5),
  // ── 6/12/2025 ──
  cash("Eleasif Haurocc", 10, 6),
  // ── 7/12/2025 ──
  cash("Jose Live", 120, 7),
  kind("Elisa Ferreyros", "15 juguetes", 7),
  // ── 8/12/2025 ──
  cash("Rosmery de Tiktok", 40, 8),
  // ── 9/12/2025 ──
  kind("B Marck", "1 caja de panetón", 9),
  kind("B Marck", "1/2 caja de chocolate", 9),
  // ── 10/12/2025 ──
  cash("Sandra Romani", 50, 10),
  paypal("Jazmín Martinez", 332.4, 10),
  // ── 11/12/2025 ──
  kind("Inmobiliaria Diedo Ortiz A", "1 plancha de leche", 11),
  kind("Antojitos Oriel", "10 kg de Arroz", 11),
  kind("Antojitos Oriel", "10 kg de Azucar", 11),
  cash("Jefferson Vienrich", 50, 11),
  // ── 12/12/2025 ──
  kind("Carniceria El Gran Obregon", "1 plancha de leche", 12),
  cash("Abog. Pool Cerna Peña", 100, 12),
  cash("Katy Dominguez", 40, 12),
  cash("Jonas", 20, 12),
  cash("Anni Agurto", 680.9, 12),
  cash("Juan Carlos Vilcapoma", 50, 12),
  cash("Jonas", 20, 12),
  // ── 13/12/2025 ──
  cash("Ing Yuvica", 20, 13),
  cash("Kelvin Ruiz Bravo", 10, 13),
  kind("LABUBU KIDS", "1 caja de panetón", 13),
  kind("Money Club", "1 caja de panetón", 13),
  kind("PDT Peruvian Travel", "1 caja de panetón", 13),
  // ── 15/12/2025 ──
  cash("Jose Ildefonso", 50, 15),
  // ── 17/12/2025 ──
  cash("Joel", 50, 17),
  // ── 18/12/2025 ──
  cash("Erick Hilario y Leydi Mantari", 50, 18),
  cash("Carlos Ponce", 100, 18, "Donó una cargador portatil y se hizo un sorteo"),
  cash("Baños a Vapor: El Edén", 50, 18),
  cash("José Luis y Tina", 100, 18),
  // ── 19/12/2025 ──
  cash("Joy", 30, 19),
  // ── 20/12/2025 ──
  cash("Familia Paredes Vilca", 50, 20),
  kind("Monica", "1 paquete de fideos", 20),
  kind("Paul", "1 caja de panetón", 20),
  cash("Paul", 10, 20),
  kind("Kelvin Huaman", "1 saco de arroz", 20),
  kind("Kelvin Huaman", "1 caja de atun", 20),
  kind("Kelvin Huaman", "20 aceites", 20),
  // ── 21/12/2025 ──
  kind("Joy", "1 bolsa de viveres", 21),
  kind("Elias", "1 caja de panetón", 21),
  // ── 23/12/2025 ──
  cash("Pool Cerna", 100.2, 23),
  cash("Zayda", 50, 23),
  cash("Sarita", 20, 23),
  kind("Sarita", "2 panetones", 23),
  cash("Marlon", 15, 23),
  cash("Fiore", 100, 23),
];

export const CHOCOLATADA_2025_CAMPAIGN = {
  title: CHOCOLATADA_2025_TITLE,
  description:
    "Chocofest 2025: llevamos chocolatada, juguetes y canastas navideñas a los niños y familias de San Ramón. Gracias a la solidaridad de la comunidad superamos la meta y rendimos cada sol gastado con total transparencia.",
  goal: 2000, // Objetivo de la hoja (S/. 2,000)
  raised: CHOCOLATADA_2025_CASH_TOTAL,
  status: "active",
  featured: true,
  category: "niñez",
  startDate: "2025-12-01",
  endDate: "2025-12-23",
  latitude: -11.1229,
  longitude: -75.3548,
  // FOTO DEMO — reemplazar por la foto real de la campaña.
  imageUrl: u("photo-1512909006721-3d6018887383", 1600),
} as const;

export interface ChocofestUpdateSeed {
  title: string;
  content: string;
}

export interface ChocofestImageSeed {
  imageUrl: string;
  caption: string;
}

export interface ChocofestExpenseSeed {
  description: string;
  category: string;
  amount: number;
  date: string;
  responsible: string;
  receiptUrl: string | null;
  isPublic: boolean;
}

export interface ChocofestEvidenceSeed {
  title: string;
  description: string;
  mediaUrl: string;
  mediaType: "image";
  evidenceType: string;
  date: string;
  isPublic: boolean;
}

export interface ChocofestLeftoverSeed {
  item: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
  isPublic: boolean;
}

export const CHOCOLATADA_2025_UPDATES: ChocofestUpdateSeed[] = [
  {
    title: "¡Meta superada: S/ 2,818.5 recaudados!",
    content:
      "Gracias a la solidaridad de la comunidad superamos la meta de S/ 2,000: recaudamos S/ 2,818.5 en efectivo (141%) y recibimos decenas de donaciones en especie (panetones, juguetes, leche y alimentos) que completaron cada canasta y entrega navideña.",
  },
  {
    title: "Rendición de gastos publicada",
    content:
      "Hemos publicado la rendición completa: S/ 2,912.8 en juguetes, víveres, movilidad y logística del evento. Las boletas y sustentos se encuentran en la sección de evidencias, y los sobrantes, cuando los haya, se publicarán en su propia sección.",
  },
];

// FOTO DEMO — galería reemplazable desde el panel admin.
export const CHOCOLATADA_2025_IMAGES: ChocofestImageSeed[] = [
  { imageUrl: u("photo-1543589077-47d81606c1bf", 1000), caption: "Juguetes donados por la comunidad" },
  { imageUrl: u("photo-1512909006721-3d6018887383", 1000), caption: "Decoración navideña en el punto de acopio" },
  { imageUrl: u("photo-1482517967863-00e15c9b44be", 1000), caption: "Voluntarios preparando las canastas" },
];

export const CHOCOLATADA_2025_EXPENSES: ChocofestExpenseSeed[] = [
  // Nota: la hoja no registra fechas de gastos; las fechas son inferidas del
  // cronograma del evento (juguetes a inicios de mes, víveres a mitad, logística
  // y movilidad los días previos/al evento). Editables desde el panel admin.
  {
    description: "Juguetes para las entregas navideñas",
    category: "materiales",
    amount: 1746.3,
    date: "2025-12-05",
    responsible: "Comisión Navidad",
    receiptUrl: RECEIPT_DEMO, // FOTO DEMO
    isPublic: true,
  },
  {
    description: "Movilidad Abancay - Santa Anita",
    category: "transporte",
    amount: 60,
    date: "2025-12-18",
    responsible: "Logística",
    receiptUrl: null,
    isPublic: true,
  },
  {
    description: "Movilidad Santa Anita - San Luis",
    category: "transporte",
    amount: 40,
    date: "2025-12-18",
    responsible: "Logística",
    receiptUrl: null,
    isPublic: true,
  },
  {
    description: "Traslado Lima - San Ramón",
    category: "transporte",
    amount: 20,
    date: "2025-12-19",
    responsible: "Logística",
    receiptUrl: null,
    isPublic: true,
  },
  {
    description: "Paquete x50 bolsas para canastas",
    category: "logística",
    amount: 13,
    date: "2025-12-10",
    responsible: "Comisión Navidad",
    receiptUrl: null,
    isPublic: true,
  },
  {
    description: "Canela",
    category: "alimentación",
    amount: 13,
    date: "2025-12-15",
    responsible: "Comisión Navidad",
    receiptUrl: null,
    isPublic: true,
  },
  {
    description: "Clavo de olor",
    category: "alimentación",
    amount: 5,
    date: "2025-12-15",
    responsible: "Comisión Navidad",
    receiptUrl: null,
    isPublic: true,
  },
  {
    description: "20 bolsas de galleta de agua",
    category: "alimentación",
    amount: 178,
    date: "2025-12-16",
    responsible: "Comisión Navidad",
    receiptUrl: RECEIPT_DEMO, // FOTO DEMO
    isPublic: true,
  },
  {
    description: "Motocarga traslado de juguetes y víveres al punto de recolección",
    category: "transporte",
    amount: 20,
    date: "2025-12-20",
    responsible: "Logística",
    receiptUrl: null,
    isPublic: true,
  },
  {
    description: "Bolsas para pesar 1kg, 2kg y para panetón",
    category: "logística",
    amount: 10,
    date: "2025-12-15",
    responsible: "Comisión Navidad",
    receiptUrl: null,
    isPublic: true,
  },
  {
    description: "Caja de mermelada en sobre",
    category: "alimentación",
    amount: 20,
    date: "2025-12-16",
    responsible: "Comisión Navidad",
    receiptUrl: null,
    isPublic: true,
  },
  {
    description: "1 caja de panetón",
    category: "alimentación",
    amount: 90,
    date: "2025-12-18",
    responsible: "Comisión Navidad",
    receiptUrl: RECEIPT_DEMO, // FOTO DEMO
    isPublic: true,
  },
  {
    description: "Víveres comprados en Comercial Roy",
    category: "alimentación",
    amount: 447.5,
    date: "2025-12-12",
    responsible: "Comisión Navidad",
    receiptUrl: RECEIPT_DEMO, // FOTO DEMO
    isPublic: true,
  },
  {
    description: "Combustible día del evento (S/ 100 para un auto y S/ 50 para el otro)",
    category: "transporte",
    amount: 150,
    date: "2025-12-20",
    responsible: "Logística",
    receiptUrl: null,
    isPublic: true,
  },
  {
    description:
      "Reparación de llanta en el trayecto (ruta accidentada; se aportó S/ 100)",
    category: "transporte",
    amount: 100,
    date: "2025-12-20",
    responsible: "Logística",
    receiptUrl: null,
    isPublic: true,
  },
];

// FOTO DEMO — evidencias de impacto y boletas/sustentos reemplazables desde el
// panel admin (tipos: activity = actividad, purchase = boleta/sustento).
export const CHOCOLATADA_2025_EVIDENCE: ChocofestEvidenceSeed[] = [
  {
    title: "Juguetes y víveres listos en el punto de recolección",
    description: "Canastas armadas con los aportes de la comunidad antes del día del evento.",
    mediaUrl: u("photo-1543589077-47d81606c1bf", 1000),
    mediaType: "image",
    evidenceType: "activity",
    date: "2025-12-19",
    isPublic: true,
  },
  {
    title: "Brigada de voluntarios el día del evento",
    description: "El equipo repartiendo chocolatada y canastas en los anexos.",
    mediaUrl: u("photo-1469571486292-0ba58a3f068b", 1000),
    mediaType: "image",
    evidenceType: "activity",
    date: "2025-12-20",
    isPublic: true,
  },
  {
    title: "Entrega de canastas y juguetes",
    description: "Niños y familias recibiendo los regalos navideños.",
    mediaUrl: u("photo-1593113598332-cd288d649433", 1000),
    mediaType: "image",
    evidenceType: "activity",
    date: "2025-12-20",
    isPublic: true,
  },
  {
    title: "Boleta: compra de juguetes (S/ 1,746.3)",
    description: "Sustento de la compra de juguetes para las entregas navideñas.",
    mediaUrl: RECEIPT_DEMO, // FOTO DEMO
    mediaType: "image",
    evidenceType: "purchase",
    date: "2025-12-05",
    isPublic: true,
  },
  {
    title: "Boleta: víveres en Comercial Roy (S/ 447.5)",
    description: "Sustento de la compra de víveres para las canastas.",
    mediaUrl: RECEIPT_DEMO, // FOTO DEMO
    mediaType: "image",
    evidenceType: "purchase",
    date: "2025-12-12",
    isPublic: true,
  },
  {
    title: "Boleta: 20 bolsas de galleta de agua (S/ 178)",
    description: "Sustento de la compra de galletas para las canastas.",
    mediaUrl: RECEIPT_DEMO, // FOTO DEMO
    mediaType: "image",
    evidenceType: "purchase",
    date: "2025-12-16",
    isPublic: true,
  },
  {
    title: "Boleta: 1 caja de panetón (S/ 90)",
    description: "Sustento de la compra de panetones.",
    mediaUrl: RECEIPT_DEMO, // FOTO DEMO
    mediaType: "image",
    evidenceType: "purchase",
    date: "2025-12-18",
    isPublic: true,
  },
];

// Sin datos aún: la sección se crea vacía y se llena desde el panel admin
// (o con el seed cuando la organización reporte los sobrantes).
export const CHOCOLATADA_2025_LEFTOVERS: ChocofestLeftoverSeed[] = [];
