/**
 * Clasificación de datos DEMO (V9.1) — FUNCIONES PURAS.
 *
 * OBJETIVO: decir, registro a registro, si es real, DEMO confirmado, está
 * pendiente de clasificar o está protegido/compartido. La regla que manda es la
 * del enunciado: **no se clasifica como DEMO un registro por pertenecer a una
 * campaña antigua**. Hace falta evidencia positiva:
 *
 *   · DEMO confirmado → la campaña está DECLARADA DEMO (`campaigns.is_demo`, una
 *     afirmación explícita y auditada del superadmin) o el registro lleva una
 *     FIRMA de relleno documentada (medios del servicio de imágenes de ejemplo).
 *   · REAL confirmado → evidencia positiva de autenticidad: donación conciliada
 *     con el banco, o gasto con documento alojado en el almacenamiento PROPIO.
 *   · PROTEGIDO → campaña protegida (ChocoFest 2025/2026, por ID), o registro
 *     compartido con datos reales (un donante con donaciones en varias campañas).
 *   · PENDIENTE → todo lo demás. Requiere decisión humana; la herramienta lo
 *     presenta para que el superadmin seleccione, nunca lo borra por su cuenta.
 *
 * POR QUÉ «UN COMPROBANTE BLOQUEA» ERA INCORRECTO: el seed usa la MISMA foto de
 * relleno (`images.unsplash.com/...`) como comprobante de los gastos DEMO **y** de
 * los de Chocofest 2025 (la campaña real que hay que conservar). Un comprobante
 * alojado en un servicio de imágenes de ejemplo no es un documento: no prueba
 * nada. Lo que sí puede ser una obligación de conservación es un documento subido
 * al almacenamiento propio (Cloudinary de la organización).
 */

/** Servicios de imágenes de EJEMPLO usados por el seed y las demos. */
export const PLACEHOLDER_MEDIA_HOSTS = [
  "images.unsplash.com",
  "source.unsplash.com",
  "picsum.photos",
  "placehold.co",
  "via.placeholder.com",
  "loremflickr.com",
] as const;

/** Ruta de la nube DEMO de Cloudinary: tampoco es un documento propio. */
const CLOUDINARY_DEMO_PREFIX = "res.cloudinary.com/demo/";

/**
 * ¿La URL apunta a un medio de RELLENO (no es un documento)? Puro y testeable.
 *
 * Un medio de relleno NO es una obligación de conservación: lo genera el seed para
 * que la interfaz tenga imágenes. Un documento subido al almacenamiento propio sí
 * puede serlo y por eso se trata distinto.
 */
export function isPlaceholderMedia(url: string | null | undefined): boolean {
  if (typeof url !== "string") return false;
  const value = url.trim().toLowerCase();
  if (value.length === 0) return false;
  if (value.includes(CLOUDINARY_DEMO_PREFIX)) return true;
  return PLACEHOLDER_MEDIA_HOSTS.some((host) => value.includes(host));
}

/** ¿Es un documento propio (posible obligación de conservación)? */
export function isOwnDocument(url: string | null | undefined): boolean {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (value.length === 0) return false;
  return !isPlaceholderMedia(value);
}

// ─── Clasificación ───────────────────────────────────────────────────────────

export const DEMO_CLASSIFICATIONS = ["real", "demo", "pending", "protected"] as const;
export type DemoClassification = (typeof DEMO_CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABEL: Record<DemoClassification, string> = {
  real: "Real confirmado",
  demo: "DEMO confirmado",
  pending: "Pendiente de clasificación",
  protected: "Compartido o protegido",
};

export interface ClassifiedRecord {
  table: string;
  id: number;
  label: string;
  classification: DemoClassification;
  /** Evidencia concreta de la clasificación (nunca intuición). */
  reasons: string[];
  campaignId: number | null;
  amount: number | null;
}

/** Instantánea mínima de la base que alimenta la clasificación. */
export interface DemoWorld {
  campaigns: readonly {
    id: number;
    title: string;
    status: string;
    isDemo: boolean;
    raised: number | null;
  }[];
  donations: readonly {
    id: number;
    campaignId: number | null;
    amount: number;
    status: string;
    email: string;
    reconciledAt: Date | string | null;
    /** Comprobante adjunto (ojo: puede ser un medio de relleno del seed). */
    receiptUrl: string | null;
    createdAt: Date | string | null;
  }[];
  expenses: readonly {
    id: number;
    campaignId: number;
    description: string;
    amount: number;
    date: string;
    receiptUrl: string | null;
  }[];
  movements: readonly {
    id: number;
    campaignId: number;
    kind: string;
    amount: number;
    sourceType: string;
    sourceId: number;
  }[];
  donors: readonly { id: number; name: string; email: string }[];
  pets: readonly { id: number; name: string; status: string; photos: string[] | null }[];
  adoptionRequests: readonly { id: number; petId: number; status: string }[];
  allies: readonly { id: number; name: string; logoUrl: string | null }[];
  news: readonly { id: number; title: string; imageUrl: string | null }[];
  reports: readonly { id: number; title: string; status: string; campaignId: number | null }[];
  certificates: readonly { id: number; code: string; status: string; campaignId: number | null }[];
  volunteers: readonly { id: number; name: string; status: string }[];
  evidence: readonly { id: number; campaignId: number; title: string; mediaUrl: string }[];
  images: readonly { id: number; campaignId: number; imageUrl: string }[];
  /** IDs de campaña protegidos (ChocoFest 2025/2026), resueltos de la base. */
  protectedCampaignIds: readonly number[];
}

export interface DemoInventory {
  records: ClassifiedRecord[];
  /** Recuento por tabla y clasificación. */
  byTable: {
    table: string;
    total: number;
    real: number;
    demo: number;
    pending: number;
    protected: number;
  }[];
  totals: Record<DemoClassification, number>;
  /** Campañas protegidas tal y como se resolvieron. */
  protectedCampaigns: { id: number; title: string }[];
  /** Campañas declaradas DEMO (afirmación explícita del superadmin). */
  declaredDemoCampaigns: { id: number; title: string }[];
}

function byId<T extends { id: number }>(rows: readonly T[]): Map<number, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Clasifica TODA la base. Puro: recibe la instantánea y devuelve el inventario.
 */
export function classifyDemoData(world: DemoWorld): DemoInventory {
  const records: ClassifiedRecord[] = [];
  const campaignById = byId(world.campaigns);
  const protectedIds = new Set(world.protectedCampaignIds);
  const demoCampaignIds = new Set(
    world.campaigns.filter((c) => c.isDemo === true).map((c) => c.id),
  );

  /** ¿La campaña de este registro está declarada DEMO? */
  const inDemoCampaign = (campaignId: number | null): boolean =>
    campaignId !== null && demoCampaignIds.has(campaignId);

  const push = (
    table: string,
    id: number,
    label: string,
    classification: DemoClassification,
    reasons: string[],
    campaignId: number | null = null,
    amount: number | null = null,
  ): void => {
    records.push({ table, id, label, classification, reasons, campaignId, amount });
  };

  // ─── Campañas ──────────────────────────────────────────────────────────────
  // Protegida > DEMO declarada > real (dinero conciliado) > pendiente.
  const reconciledByCampaign = new Map<number, number>();
  for (const donation of world.donations) {
    if (donation.campaignId === null) continue;
    if (donation.status === "reconciled" || donation.reconciledAt !== null) {
      reconciledByCampaign.set(
        donation.campaignId,
        (reconciledByCampaign.get(donation.campaignId) ?? 0) + 1,
      );
    }
  }
  for (const campaign of world.campaigns) {
    if (protectedIds.has(campaign.id)) {
      push("campaigns", campaign.id, campaign.title, "protected", [
        "Campaña protegida por ID: no entra en ninguna purga masiva.",
      ]);
      continue;
    }
    if (campaign.isDemo === true) {
      push("campaigns", campaign.id, campaign.title, "demo", [
        "Declarada DEMO por el superadmin (campaigns.is_demo).",
      ]);
      continue;
    }
    const reconciled = reconciledByCampaign.get(campaign.id) ?? 0;
    if (reconciled > 0) {
      push(
        "campaigns",
        campaign.id,
        campaign.title,
        "real",
        [`Tiene ${reconciled} donación(es) conciliada(s) con el banco: dinero real.`],
      );
      continue;
    }
    push("campaigns", campaign.id, campaign.title, "pending", [
      campaign.status === "archived"
        ? "Archivada y sin donaciones conciliadas: no se clasifica como DEMO por ser antigua."
        : "Sin evidencia de autenticidad ni declaración DEMO: requiere decisión del superadmin.",
    ]);
  }

  // ─── Donaciones ────────────────────────────────────────────────────────────
  for (const donation of world.donations) {
    const label = `Donación #${donation.id} (${donation.email})`;
    if (donation.status === "reconciled" || donation.reconciledAt !== null) {
      push(
        "donations",
        donation.id,
        label,
        "real",
        ["Conciliada con el banco: es dinero real confirmado."],
        donation.campaignId,
        donation.amount,
      );
      continue;
    }
    if (inDemoCampaign(donation.campaignId)) {
      push(
        "donations",
        donation.id,
        label,
        "demo",
        ["Pertenece a una campaña declarada DEMO."],
        donation.campaignId,
        donation.amount,
      );
      continue;
    }
    push(
      "donations",
      donation.id,
      label,
      "pending",
      [
        donation.campaignId === null
          ? "Sin campaña (fondo general): requiere decisión."
          : `Estado «${donation.status}» en una campaña no declarada DEMO.`,
      ],
      donation.campaignId,
      donation.amount,
    );
  }

  // ─── Gastos ────────────────────────────────────────────────────────────────
  for (const expense of world.expenses) {
    const label = `Gasto #${expense.id} (${expense.description})`;
    if (inDemoCampaign(expense.campaignId)) {
      const reasons = ["Pertenece a una campaña declarada DEMO."];
      if (expense.receiptUrl) {
        reasons.push(
          isPlaceholderMedia(expense.receiptUrl)
            ? "Su comprobante es un medio de RELLENO: no es un documento a conservar."
            : "OJO: su comprobante está en el almacenamiento propio y podría ser un documento real.",
        );
      }
      push("campaign_expenses", expense.id, label, "demo", reasons, expense.campaignId, expense.amount);
      continue;
    }
    if (isOwnDocument(expense.receiptUrl)) {
      push(
        "campaign_expenses",
        expense.id,
        label,
        "real",
        ["Comprobante alojado en el almacenamiento propio: posible obligación de conservación."],
        expense.campaignId,
        expense.amount,
      );
      continue;
    }
    push(
      "campaign_expenses",
      expense.id,
      label,
      "pending",
      [
        expense.receiptUrl
          ? "Comprobante de relleno en una campaña no declarada DEMO: requiere decisión."
          : "Sin comprobante en una campaña no declarada DEMO: requiere decisión.",
      ],
      expense.campaignId,
      expense.amount,
    );
  }

  // ─── Movimientos del libro ────────────────────────────────────────────────
  const donationById = byId(world.donations);
  const expenseById = byId(world.expenses);
  for (const movement of world.movements) {
    const label = `Asiento #${movement.id} (${movement.kind} ${movement.sourceType}:${movement.sourceId})`;
    if (inDemoCampaign(movement.campaignId)) {
      push(
        "campaign_movements",
        movement.id,
        label,
        "demo",
        ["Pertenece a la cadena de una campaña declarada DEMO."],
        movement.campaignId,
        movement.amount,
      );
      continue;
    }
    const source =
      movement.sourceType === "donation"
        ? donationById.get(movement.sourceId)
        : movement.sourceType === "expense"
          ? expenseById.get(movement.sourceId)
          : undefined;
    if (!source) {
      push(
        "campaign_movements",
        movement.id,
        label,
        "pending",
        ["Asiento HUÉRFANO: su origen no existe. No se toca sin decisión."],
        movement.campaignId,
        movement.amount,
      );
      continue;
    }
    if (
      movement.sourceType === "donation" &&
      "status" in source &&
      (source.status === "reconciled" || source.reconciledAt !== null)
    ) {
      push(
        "campaign_movements",
        movement.id,
        label,
        "real",
        ["Respalda una donación conciliada con el banco."],
        movement.campaignId,
        movement.amount,
      );
      continue;
    }
    push(
      "campaign_movements",
      movement.id,
      label,
      "pending",
      ["Cadena de una campaña no declarada DEMO: requiere decisión."],
      movement.campaignId,
      movement.amount,
    );
  }

  // ─── Donantes: compartidos = protegidos ───────────────────────────────────
  const campaignsPerDonor = new Map<string, Set<number>>();
  for (const donation of world.donations) {
    if (donation.campaignId === null) continue;
    const key = donation.email.trim().toLowerCase();
    if (!key) continue;
    const set = campaignsPerDonor.get(key) ?? new Set<number>();
    set.add(donation.campaignId);
    campaignsPerDonor.set(key, set);
  }
  for (const donor of world.donors) {
    const key = donor.email.trim().toLowerCase();
    const campaigns = campaignsPerDonor.get(key);
    const touchesProtected =
      campaigns !== undefined && [...campaigns].some((id) => protectedIds.has(id));
    if (campaigns && campaigns.size > 1) {
      push(
        "donors",
        donor.id,
        `Donante ${donor.name}`,
        "protected",
        [`Aporta en ${campaigns.size} campañas: compartido, nunca se borra.`],
      );
      continue;
    }
    if (touchesProtected) {
      push(
        "donors",
        donor.id,
        `Donante ${donor.name}`,
        "protected",
        ["Aporta en una campaña protegida: se conserva."],
      );
      continue;
    }
    push("donors", donor.id, `Donante ${donor.name}`, "pending", [
      "Sin evidencia de autenticidad ni declaración DEMO.",
    ]);
  }

  // ─── Mascotas y adopciones ────────────────────────────────────────────────
  const adoptionByPet = new Map<number, number>();
  for (const request of world.adoptionRequests) {
    adoptionByPet.set(request.petId, (adoptionByPet.get(request.petId) ?? 0) + 1);
  }
  for (const pet of world.pets) {
    const photos = pet.photos ?? [];
    const placeholderPhotos = photos.filter((url) => isPlaceholderMedia(url)).length;
    const requests = adoptionByPet.get(pet.id) ?? 0;
    if (requests > 0) {
      push(
        "pets",
        pet.id,
        `Mascota ${pet.name}`,
        "protected",
        [`Tiene ${requests} solicitud(es) de adopción: no se borra sin resolverlas.`],
      );
      continue;
    }
    if (photos.length > 0 && placeholderPhotos === photos.length) {
      push(
        "pets",
        pet.id,
        `Mascota ${pet.name}`,
        "demo",
        [`Todas sus fotos (${photos.length}) son medios de RELLENO del seed.`],
      );
      continue;
    }
    push("pets", pet.id, `Mascota ${pet.name}`, "pending", [
      photos.length === 0
        ? "Sin fotos: requiere decisión."
        : "Tiene alguna foto que no es de relleno: requiere decisión.",
    ]);
  }
  for (const request of world.adoptionRequests) {
    push(
      "adoption_requests",
      request.id,
      `Solicitud #${request.id} (mascota ${request.petId})`,
      "pending",
      [`Estado «${request.status}»: requiere decisión.`],
    );
  }

  // ─── Aliados, noticias, reportes, certificados, voluntarios ──────────────
  for (const ally of world.allies) {
    const placeholder = isPlaceholderMedia(ally.logoUrl);
    push(
      "allies",
      ally.id,
      `Aliado ${ally.name}`,
      placeholder ? "demo" : "pending",
      [
        placeholder
          ? "Su logo es un medio de RELLENO del seed."
          : "Logo propio o sin logo: requiere decisión.",
      ],
    );
  }
  for (const item of world.news) {
    const placeholder = isPlaceholderMedia(item.imageUrl);
    push(
      "news",
      item.id,
      `Noticia «${item.title}»`,
      placeholder ? "demo" : "pending",
      [
        placeholder
          ? "Su imagen es un medio de RELLENO del seed."
          : "Sin imagen de relleno: requiere decisión.",
      ],
    );
  }
  for (const report of world.reports) {
    push(
      "community_reports",
      report.id,
      `Reporte «${report.title}»`,
      "pending",
      [`Estado «${report.status}»: requiere decisión.`],
      report.campaignId,
    );
  }
  for (const certificate of world.certificates) {
    if (certificate.status === "issued") {
      push(
        "certificates",
        certificate.id,
        `Certificado ${certificate.code}`,
        "protected",
        ["Emitido: reconoce a una persona. Se revoca, no se borra."],
        certificate.campaignId,
      );
      continue;
    }
    push(
      "certificates",
      certificate.id,
      `Certificado ${certificate.code}`,
      "pending",
      [`Estado «${certificate.status}»: requiere decisión.`],
      certificate.campaignId,
    );
  }
  for (const volunteer of world.volunteers) {
    push(
      "volunteers",
      volunteer.id,
      `Voluntario/a ${volunteer.name}`,
      "pending",
      [`Estado «${volunteer.status}»: dato personal, requiere decisión.`],
    );
  }

  // ─── Evidencias e imágenes ────────────────────────────────────────────────
  for (const item of world.evidence) {
    const placeholder = isPlaceholderMedia(item.mediaUrl);
    push(
      "campaign_evidence",
      item.id,
      `Evidencia «${item.title}»`,
      placeholder ? "demo" : "pending",
      [
        placeholder
          ? "Su archivo es un medio de RELLENO del seed."
          : "Archivo propio: puede ser prueba documental, requiere decisión.",
      ],
      item.campaignId,
    );
  }
  for (const item of world.images) {
    const placeholder = isPlaceholderMedia(item.imageUrl);
    push(
      "campaign_images",
      item.id,
      `Imagen #${item.id}`,
      placeholder ? "demo" : "pending",
      [
        placeholder
          ? "Es un medio de RELLENO del seed."
          : "Imagen propia: requiere decisión.",
      ],
      item.campaignId,
    );
  }

  // ─── Herencia de la protección ────────────────────────────────────────────
  // Los registros de una campaña PROTEGIDA (ChocoFest) no son «DEMO» ni
  // «pendientes»: la protección es una declaración explícita de conservación, así
  // que su contenido se clasifica como protegido y no entra en ninguna purga
  // masiva. Un registro con evidencia propia más fuerte —dinero conciliado— sí
  // conserva su clasificación «real».
  for (const record of records) {
    if (record.campaignId === null) continue;
    if (!protectedIds.has(record.campaignId)) continue;
    if (record.classification === "real" || record.classification === "protected") continue;
    record.classification = "protected";
    record.reasons.push("Pertenece a una campaña PROTEGIDA: se conserva.");
  }

  return buildInventory(records, world, protectedIds, demoCampaignIds);
}

function buildInventory(
  records: ClassifiedRecord[],
  world: DemoWorld,
  protectedIds: Set<number>,
  demoCampaignIds: Set<number>,
): DemoInventory {
  const tables = [...new Set(records.map((record) => record.table))].sort();
  const byTable = tables.map((table) => {
    const rows = records.filter((record) => record.table === table);
    return {
      table,
      total: rows.length,
      real: rows.filter((r) => r.classification === "real").length,
      demo: rows.filter((r) => r.classification === "demo").length,
      pending: rows.filter((r) => r.classification === "pending").length,
      protected: rows.filter((r) => r.classification === "protected").length,
    };
  });

  const totals: Record<DemoClassification, number> = {
    real: 0,
    demo: 0,
    pending: 0,
    protected: 0,
  };
  for (const record of records) totals[record.classification] += 1;

  return {
    records,
    byTable,
    totals,
    protectedCampaigns: world.campaigns
      .filter((c) => protectedIds.has(c.id))
      .map((c) => ({ id: c.id, title: c.title })),
    declaredDemoCampaigns: world.campaigns
      .filter((c) => demoCampaignIds.has(c.id))
      .map((c) => ({ id: c.id, title: c.title })),
  };
}

// ─── Resolución de ChocoFest ─────────────────────────────────────────────────

/**
 * Patrón documentado de las campañas que hay que PROTEGER. Se resuelve contra la
 * base para obtener IDs REALES; la protección se guarda por ID, nunca por nombre
 * (un renombrado no puede desprotegerlas).
 */
export const PROTECTED_CAMPAIGN_PATTERN = /choco\s*fest|chocolatada/i;

/** Años que el enunciado protege explícitamente. */
export const PROTECTED_CAMPAIGN_YEARS = [2025, 2026] as const;

export interface ProtectedCandidate {
  id: number;
  title: string;
  year: number;
}

/**
 * Candidatas a proteger: las que coinciden con el patrón y con un año protegido.
 * Puro: el operador confirma después las que devuelve.
 */
export function findProtectedCandidates(
  campaigns: readonly { id: number; title: string }[],
): ProtectedCandidate[] {
  const years = PROTECTED_CAMPAIGN_YEARS as readonly number[];
  return campaigns
    .filter((campaign) => PROTECTED_CAMPAIGN_PATTERN.test(campaign.title))
    .map((campaign) => {
      const match = campaign.title.match(/\b(20\d{2})\b/);
      return {
        id: campaign.id,
        title: campaign.title,
        year: match ? Number(match[1]) : 0,
      };
    })
    .filter((candidate) => years.includes(candidate.year));
}

/** ¿El ID está protegido? (usado por las purgas antes de tocar nada) */
export function isProtectedCampaign(
  campaignId: number,
  protectedCampaignIds: readonly number[],
): boolean {
  return protectedCampaignIds.includes(campaignId);
}

/**
 * Clave de `settings` donde se guardan los IDs protegidos. Se resuelven UNA vez
 * desde la base y a partir de ahí la protección es por ID.
 */
export const PROTECTED_CAMPAIGNS_SETTING_KEY = "protected_campaign_ids";

/** Lee la lista de IDs protegidos guardada como CSV. Puro. */
export function parseProtectedCampaignIds(value: string | null | undefined): number[] {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ].sort((a, b) => a - b);
}
