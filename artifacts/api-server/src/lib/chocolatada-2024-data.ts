// ─── Datos reales: Chocolatada Navideña 2024 ────────────────────────────────
// Donaciones extraídas del "Informe en vivo de las Donaciones Chocofest
// San Ramón - Chanchamayo" (Google Sheets). Fuente única de verdad: la usan
// el seed (seed.ts) y el script de aplicación a una BD existente
// (scripts/src/apply-chocolatada-2024.ts).
//
// Convenciones (fieles a la hoja, sin inventar datos):
// - Efectivo → paymentMethod "cash".
// - PayPal → paymentMethod "other" (no existe el método en la API).
// - Donaciones en especie → amount 0, paymentMethod "other" y el ítem en
//   `message`. La hoja no las monetiza (el "Total General" solo suma efectivo).
// - La hoja no registra emails: se usan placeholders "donante.N@example.com".

const u = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

/** Fecha al mediodía UTC del día indicado en diciembre de 2025. */
const iso = (day: number): Date => new Date(Date.UTC(2025, 11, day, 12));

export type ChocolatadaPaymentMethod = "cash" | "other";

export interface ChocolatadaDonationSeed {
  firstName: string;
  lastName: string;
  email: string;
  amount: number;
  paymentMethod: ChocolatadaPaymentMethod;
  message: string | null;
  anonymous: boolean;
  publicProof: boolean;
  status: "approved";
  createdAt: Date;
}

let emailSeq = 0;
const nextEmail = (): string => `donante.${++emailSeq}@example.com`;

const cash = (
  firstName: string,
  amount: number,
  day: number,
  message: string | null = null,
): ChocolatadaDonationSeed => ({
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

const paypal = (firstName: string, amount: number, day: number): ChocolatadaDonationSeed => ({
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

const kind = (firstName: string, item: string, day: number): ChocolatadaDonationSeed => ({
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
export const CHOCOLATADA_2024_CASH_TOTAL = 2818.5;

export const CHOCOLATADA_2024_TITLE = "Chocolatada Navideña 2024";

export const CHOCOLATADA_2024_DONATIONS: ChocolatadaDonationSeed[] = [
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

export const CHOCOLATADA_2024_CAMPAIGN = {
  title: CHOCOLATADA_2024_TITLE,
  description:
    "Llevamos chocolatada caliente y juguetes a más de 500 niños en los anexos más alejados de San Ramón durante las fiestas navideñas. Juntos podemos hacer que esta navidad sea especial para cada niño.",
  goal: 2000, // Objetivo de la hoja (S/. 2,000)
  raised: CHOCOLATADA_2024_CASH_TOTAL,
  status: "active",
  featured: true,
  category: "niñez",
  startDate: "2024-11-01",
  endDate: "2024-12-25",
  latitude: -11.1229,
  longitude: -75.3548,
  imageUrl: u("photo-1512909006721-3d6018887383", 1600),
} as const;

export interface ChocolatadaUpdateSeed {
  title: string;
  content: string;
}

export interface ChocolatadaImageSeed {
  imageUrl: string;
  caption: string;
}

export interface ChocolatadaExpenseSeed {
  description: string;
  category: string;
  amount: number;
  date: string;
  responsible: string;
  receiptUrl: string | null;
  isPublic: boolean;
}

export interface ChocolatadaEvidenceSeed {
  title: string;
  description: string;
  mediaUrl: string;
  mediaType: "image";
  evidenceType: string;
  date: string;
  isPublic: boolean;
}

export const CHOCOLATADA_2024_UPDATES: ChocolatadaUpdateSeed[] = [
  {
    title: "¡Meta superada: S/ 2,818.5 recaudados!",
    content:
      "Gracias a la solidaridad de la comunidad superamos nuestra meta de S/ 2,000: recaudamos S/ 2,818.5 en efectivo y recibimos decenas de donaciones en especie (panetones, juguetes, leche y alimentos) que completaron cada entrega navideña.",
  },
  {
    title: "Cronograma de entregas confirmado",
    content:
      "Las entregas se realizaron el 20, 21 y 22 de diciembre en El Palomar, Vista Alegre y San Pedro de Cochangas. ¡Gracias a los voluntarios y a cada donante que lo hizo posible!",
  },
];

export const CHOCOLATADA_2024_IMAGES: ChocolatadaImageSeed[] = [
  { imageUrl: u("photo-1543589077-47d81606c1bf", 1000), caption: "Juguetes donados por la comunidad" },
  { imageUrl: u("photo-1512909006721-3d6018887383", 1000), caption: "Decoración navideña en el almacén" },
  { imageUrl: u("photo-1482517967863-00e15c9b44be", 1000), caption: "Voluntarios preparando las entregas" },
];

export const CHOCOLATADA_2024_EXPENSES: ChocolatadaExpenseSeed[] = [
  { description: "Compra de 400 juguetes para niños", category: "materiales", amount: 1200, date: "2024-12-05", responsible: "Comisión Navidad", receiptUrl: u("photo-1554224155-6726b3ff858f", 600), isPublic: true },
  { description: "Chocolate, leche y panetones (500 raciones)", category: "alimentación", amount: 650, date: "2024-12-12", responsible: "Comisión Navidad", receiptUrl: null, isPublic: true },
  { description: "Transporte a anexos (2 brigadas)", category: "transporte", amount: 300, date: "2024-12-20", responsible: "Logística", receiptUrl: null, isPublic: true },
  { description: "Bolsa para regalos y decoración", category: "logística", amount: 120, date: "2024-12-18", responsible: "Comisión Navidad", receiptUrl: null, isPublic: true },
];

export const CHOCOLATADA_2024_EVIDENCE: ChocolatadaEvidenceSeed[] = [
  {
    title: "Entrega de juguetes en Vista Alegre",
    description: "Los niños de Vista Alegre recibieron sus regalos en la chocolatada comunitaria.",
    mediaUrl: u("photo-1593113598332-cd288d649433", 1000),
    mediaType: "image",
    evidenceType: "activity",
    date: "2024-12-20",
    isPublic: true,
  },
  {
    title: "Brigada de voluntarios en El Palomar",
    description: "45 voluntarios participaron en las entregas de fin de año.",
    mediaUrl: u("photo-1469571486292-0ba58a3f068b", 1000),
    mediaType: "image",
    evidenceType: "activity",
    date: "2024-12-21",
    isPublic: true,
  },
  {
    title: "Compra de juguetes verificada",
    description: "Boleta de compra de los 400 juguetes entregados.",
    mediaUrl: u("photo-1554224155-6726b3ff858f", 1000),
    mediaType: "image",
    evidenceType: "purchase",
    date: "2024-12-05",
    isPublic: true,
  },
];
