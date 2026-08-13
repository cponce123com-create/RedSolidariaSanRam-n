import {
  db,
  campaignsTable,
  statsTable,
  testimonialsTable,
  alliesTable,
  faqTable,
  settings as settingsTable,
  newsTable,
  petsTable,
  communityReportsTable,
  donationsTable,
  campaignUpdatesTable,
  campaignImagesTable,
  campaignExpensesTable,
  campaignEvidenceTable,
  adminUsersTable,
} from "@workspace/db";
import {
  CHOCOLATADA_2024_CAMPAIGN,
  CHOCOLATADA_2024_DONATIONS,
  CHOCOLATADA_2024_EVIDENCE,
  CHOCOLATADA_2024_EXPENSES,
  CHOCOLATADA_2024_IMAGES,
  CHOCOLATADA_2024_UPDATES,
} from "./chocolatada-2024-data";
import {
  CHOCOLATADA_2025_CAMPAIGN,
  CHOCOLATADA_2025_DONATIONS,
  CHOCOLATADA_2025_EVIDENCE,
  CHOCOLATADA_2025_EXPENSES,
  CHOCOLATADA_2025_IMAGES,
  CHOCOLATADA_2025_UPDATES,
} from "./chocofest-2025-data";
import { eq, isNull, sql } from "drizzle-orm";
import { logger } from "./logger";
import { hashPassword } from "../middleware/auth-utils";
import { generateRandomPassword } from "./random-password";

// ─── Imágenes demo ───────────────────────────────────────────────────────────
// Mientras no se configuren credenciales de Cloudinary usamos imágenes públicas
// de Unsplash para que el sitio se vea completo en producción. Cuando se
// configuren las credenciales, los datos reales (con URLs de Cloudinary) pueden
// reemplazar estas URL desde el panel admin.
const u = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const CAMPAIGN_IMAGES: Record<string, string> = {
  "Chocolatada Navideña 2024": u("photo-1512909006721-3d6018887383", 1600),
  "Chocofest 2025": u("photo-1512909006721-3d6018887383", 1600),
  "Campaña Escolar 2025": u("photo-1503676260728-1c00da094a0b", 1600),
  "Rescate Animal San Ramón": u("photo-1548199973-03cce0bbc87b", 1600),
  "Techado para Familias": u("photo-1503387762-592deb58ef4e", 1600),
  "Brigada Médica Rural": u("photo-1576091160399-112ba8d25d1d", 1600),
  "Calor para Adultos Mayores": u("photo-1544717305-2782549b5136", 1600),
  "Agua Limpia para Comunidades": u("photo-1548839140-29a749e1cf4d", 1600),
};

const PET_PHOTOS: Record<string, string[]> = {
  Luna: [u("photo-1552053831-71594a27632d", 900), u("photo-1548199973-03cce0bbc87b", 900)],
  Mochi: [u("photo-1573865526739-10659fec78a5", 900), u("photo-1592194996308-7b43878e84a6", 900)],
  Rex: [u("photo-1518717758536-85ae29035b6d", 900)],
  Kira: [u("photo-1514888286974-6c03e2ca1dba", 900), u("photo-1518791841217-8f162f1e1131", 900)],
  Tobi: [u("photo-1583511655857-d19b40a7a54e", 900), u("photo-1517849845537-4d257902454a", 900)],
  Nala: [u("photo-1560807707-8cc77767d783", 900)],
};

const NEWS_IMAGES: Record<string, string> = {
  "Navidad Feliz: 500 niños recibieron regalos en los anexos más alejados": u("photo-1512389142860-9c449e58a543", 1400),
  "Nueva campaña escolar: asegurando el futuro de 300 niños": u("photo-1509062522246-3755977927d7", 1400),
  "Primer rescate animal: 15 mascotas encontraron hogar": u("photo-1548199973-03cce0bbc87b", 1400),
};

const ALLY_LOGOS: Record<string, string> = {
  "Municipalidad de San Ramón": u("photo-1486406146926-c627a92ad1ab", 600),
  "Botica Popular San Ramón": u("photo-1587854692152-cbe660dbde88", 600),
  "Café Selva Verde": u("photo-1495474472287-4d71bcdd2085", 600),
  "Clínica Veterinaria Chanchamayo": u("photo-1583337130417-3346a1be7dee", 600),
  "APAFA Colegio San Ramón": u("photo-1580582932707-520aed937b7b", 600),
  "Transportes Chanchamayo": u("photo-1544620347-c4fd4a3d5957", 600),
};

const TESTIMONIAL_AVATARS: Record<string, string> = {
  "María Quispe": u("photo-1494790108377-be9c29b29330", 400),
  "Carlos Mendoza": u("photo-1507003211169-0a1dd7228f2d", 400),
  "Prof. Ana Torres": u("photo-1438761681033-6461ffad8d80", 400),
  "Pedro Alvarado": u("photo-1500648767791-00dcc994a43e", 400),
};

const REPORT_PHOTOS: Record<string, string[]> = {
  "Familia con 4 hijos sin techo tras incendio en San Ramón": [u("photo-1560518883-ce09059eeffa", 900)],
  "Niño de 7 años con desnutrición severa en Pichanaki": [u("photo-1476703993599-0035a21b17a9", 900)],
  "Abuela de 78 años sola y sin ayuda en San Luis de Shuaro": [u("photo-1544717305-2782549b5136", 900)],
  "Deslizamiento afectó 6 viviendas en Pampa Hermosa": [u("photo-1541888946425-d81bb19240f5", 900)],
  "Perro con fractura de pata abandonado en mercado central": [u("photo-1552053831-71594a27632d", 900)],
  "Madre con bebé recién nacido sin leche ni pañales": [u("photo-1519689680058-324335c77eba", 900)],
  "Albergue San Vicente necesita colchones y frazadas para 18 adultos": [u("photo-1492684223066-81342ee5ff30", 900)],
};

// Comprobante/boleta demo (hasta que Cloudinary esté configurado)
const RECEIPT_DEMO = u("photo-1554224155-6726b3ff858f", 600);

async function isEmpty(tableName: string): Promise<boolean> {
  const result = await db.execute(
    sql.raw(`SELECT COUNT(*)::int AS n FROM "${tableName}"`)
  );
  const rows = result.rows as Array<{ n: number }>;
  return rows[0]?.n === 0;
}

// Backfill idempotente: completa las imágenes demo en filas existentes que aún
// no tienen imagen (útil cuando la DB ya fue sembrada en un deploy anterior).
// Se hace inline en cada seed*() con UPDATEs condicionados a IS NULL.

export async function seedIfEmpty(): Promise<void> {
  logger.info("Checking database seed state...");

  await seedAdminUsers();
  await seedCampaigns();
  await seedStats();
  await seedTestimonials();
  await seedAllies();
  await seedFaq();
  await seedSettings();
  await seedNews();
  await seedPets();
  await seedCommunityReports();
  await seedCampaignMedia();

  logger.info("Seed check complete");
}

// Cuentas de administración de ejemplo (SOLO desarrollo): en producción el
// superadmin se gestiona con ADMIN_USERNAME/ADMIN_PASSWORD y el resto de
// cuentas (administrador/moderador) se crean desde el panel → Usuarios.
// No existen credenciales por defecto: la contraseña de cada cuenta demo se
// genera aleatoriamente al crearla y se imprime en la consola.
async function seedAdminUsers() {
  if (process.env.NODE_ENV === "production") return;

  const demoUsers = [
    { username: "administrador", name: "Administrador", role: "administrador" },
    { username: "moderador", name: "Moderador", role: "moderador" },
  ];

  for (const demo of demoUsers) {
    const existing = await db
      .select({ id: adminUsersTable.id })
      .from(adminUsersTable)
      .where(eq(adminUsersTable.username, demo.username));
    if (existing.length > 0) continue;

    const password = generateRandomPassword();
    logger.info(`Seeding admin user: ${demo.username} (${demo.role})`);
    logger.warn(
      { username: demo.username, role: demo.role },
      `Cuenta demo (solo desarrollo): ${demo.username} / ${password} — contraseña generada aleatoriamente`,
    );
    await db.insert(adminUsersTable).values({
      username: demo.username,
      password: await hashPassword(password),
      name: demo.name,
      role: demo.role,
    });
  }
}

async function seedCampaigns() {
  if (await isEmpty("campaigns")) {
    logger.info("Seeding campaigns...");
    await db.insert(campaignsTable).values([
      CHOCOLATADA_2024_CAMPAIGN,
      CHOCOLATADA_2025_CAMPAIGN,
      {
        title: "Campaña Escolar 2025",
        description: "Dotamos de útiles escolares y uniformes a familias de escasos recursos en comunidades rurales de Chanchamayo para que ningún niño deje de estudiar por falta de materiales.",
        goal: 8000,
        raised: 2100,
        status: "active",
        featured: true,
        category: "educación",
        startDate: "2025-01-15",
        endDate: "2025-03-30",
        latitude: -11.1021,
        longitude: -75.3321,
        imageUrl: CAMPAIGN_IMAGES["Campaña Escolar 2025"],
      },
      {
        title: "Rescate Animal San Ramón",
        description: "Ayudamos a rescatar, rehabilitar y encontrar hogares responsables para animales abandonados o maltratados en la región de San Ramón.",
        goal: 3000,
        raised: 1800,
        status: "active",
        featured: true,
        category: "animales",
        startDate: "2024-09-01",
        latitude: -11.1378,
        longitude: -75.3612,
        imageUrl: CAMPAIGN_IMAGES["Rescate Animal San Ramón"],
      },
      {
        title: "Techado para Familias",
        description: "Campaña para ayudar a familias vulnerables a mejorar sus viviendas con materiales de construcción básicos en zonas rurales de Chanchamayo.",
        goal: 12000,
        raised: 12000,
        status: "completed",
        featured: false,
        category: "vivienda",
        startDate: "2024-03-01",
        endDate: "2024-08-31",
        latitude: -11.2510,
        longitude: -75.3010,
        imageUrl: CAMPAIGN_IMAGES["Techado para Familias"],
      },
      {
        title: "Brigada Médica Rural",
        description: "Organizamos brigadas médicas gratuitas en comunidades sin acceso a centros de salud, brindando atención primaria y medicamentos básicos.",
        goal: 6000,
        raised: 4500,
        status: "active",
        featured: false,
        category: "salud",
        startDate: "2024-10-01",
        endDate: "2025-06-30",
        latitude: -10.9261,
        longitude: -74.8688,
        imageUrl: CAMPAIGN_IMAGES["Brigada Médica Rural"],
      },
      {
        title: "Calor para Adultos Mayores",
        description: "Entregamos frazadas, abrigos y alimentos a los adultos mayores más vulnerables de San Ramón y sus anexos, quienes enfrentan solas las noches frías de la selva alta.",
        goal: 4000,
        raised: 1250,
        status: "active",
        featured: false,
        category: "adultos-mayores",
        startDate: "2025-05-01",
        endDate: "2025-08-31",
        latitude: -11.1542,
        longitude: -75.3789,
        imageUrl: CAMPAIGN_IMAGES["Calor para Adultos Mayores"],
      },
      {
        title: "Agua Limpia para Comunidades",
        description: "Llevamos agua segura a comunidades de Chanchamayo que dependen de ríos y quebradas contaminadas. Cada kit de purificación protege a familias enteras de enfermedades.",
        goal: 9000,
        raised: 3400,
        status: "active",
        featured: false,
        category: "agua",
        startDate: "2025-02-01",
        endDate: "2025-09-30",
        latitude: -11.3402,
        longitude: -75.2704,
        imageUrl: CAMPAIGN_IMAGES["Agua Limpia para Comunidades"],
      },
    ]);
  }

  // Backfill: completa imageUrl en campañas existentes sin imagen
  const rows = await db
    .select({ id: campaignsTable.id, title: campaignsTable.title })
    .from(campaignsTable)
    .where(isNull(campaignsTable.imageUrl));
  for (const row of rows) {
    const image = CAMPAIGN_IMAGES[row.title];
    if (!image) continue;
    await db
      .update(campaignsTable)
      .set({ imageUrl: image })
      .where(eq(campaignsTable.id, row.id));
  }
}

async function seedStats() {
  if (!(await isEmpty("stats"))) return;
  logger.info("Seeding stats...");
  await db.insert(statsTable).values([
    { key: "childrenHelped", intValue: 1250 },
    { key: "campaignsRun", intValue: 8 },
    { key: "volunteers", intValue: 87 },
    { key: "donationsReceived", floatValue: 45600.5 },
    { key: "animalsHelped", intValue: 38 },
  ]);
}

async function seedTestimonials() {
  if (await isEmpty("testimonials")) {
    logger.info("Seeding testimonials...");
    await db.insert(testimonialsTable).values([
      {
        name: "María Quispe",
        role: "Madre de familia, Vista Alegre",
        message: "Gracias a la Red Solidaria, mi hijo pudo tener su primer juguete de Navidad. Yo sola no hubiera podido. Dios los bendiga a todos los voluntarios que vinieron hasta nuestra comunidad.",
        avatarUrl: TESTIMONIAL_AVATARS["María Quispe"],
      },
      {
        name: "Carlos Mendoza",
        role: "Voluntario desde 2022",
        message: "Participar en las campañas de la Red Solidaria ha cambiado mi manera de ver el mundo. Ver la alegría en los ojos de los niños cuando llegamos a sus comunidades es algo que no tiene precio. ¡Los invito a unirse!",
        avatarUrl: TESTIMONIAL_AVATARS["Carlos Mendoza"],
      },
      {
        name: "Prof. Ana Torres",
        role: "Directora de IE N° 30891, San Ramón",
        message: "La campaña escolar de Red Solidaria llegó justo cuando más lo necesitábamos. Varios de mis alumnos iban a desertar por no tener útiles. Gracias a ellos, este año tenemos aula llena.",
        avatarUrl: TESTIMONIAL_AVATARS["Prof. Ana Torres"],
      },
      {
        name: "Pedro Alvarado",
        role: "Donante regular",
        message: "Confío plenamente en Red Solidaria porque son transparentes con cada donación. Puedo ver exactamente en qué se usa mi dinero y eso me da mucha seguridad para seguir apoyando.",
        avatarUrl: TESTIMONIAL_AVATARS["Pedro Alvarado"],
      },
    ]);
  }

  const rows = await db
    .select({ id: testimonialsTable.id, name: testimonialsTable.name })
    .from(testimonialsTable)
    .where(isNull(testimonialsTable.avatarUrl));
  for (const row of rows) {
    const avatar = TESTIMONIAL_AVATARS[row.name];
    if (!avatar) continue;
    await db
      .update(testimonialsTable)
      .set({ avatarUrl: avatar })
      .where(eq(testimonialsTable.id, row.id));
  }
}

async function seedAllies() {
  if (await isEmpty("allies")) {
    logger.info("Seeding allies...");
    await db.insert(alliesTable).values([
      { name: "Municipalidad de San Ramón", type: "institucion", description: "Gobierno local que colabora con permisos, espacios y apoyo logístico para nuestras campañas en el distrito.", featured: true, active: true, sortOrder: 1, logo: ALLY_LOGOS["Municipalidad de San Ramón"] },
      { name: "Botica Popular San Ramón", type: "empresa", description: "Apoya con medicamentos, vitaminas y suministros médicos para nuestras atenciones comunitarias.", featured: true, active: true, sortOrder: 2, logo: ALLY_LOGOS["Botica Popular San Ramón"] },
      { name: "Café Selva Verde", type: "emprendimiento", description: "Emprendimiento cafetalero local que dona un porcentaje de sus ventas a nuestras campañas de ayuda alimentaria.", featured: false, active: true, sortOrder: 3, logo: ALLY_LOGOS["Café Selva Verde"] },
      { name: "Clínica Veterinaria Chanchamayo", type: "empresa", description: "Colabora con jornadas gratuitas de vacunación y esterilización para perros y gatos de familias de escasos recursos.", featured: false, active: true, sortOrder: 4, logo: ALLY_LOGOS["Clínica Veterinaria Chanchamayo"] },
      { name: "APAFA Colegio San Ramón", type: "institucion", description: "Asociación de padres de familia que moviliza a la comunidad educativa en colectas y actividades solidarias.", featured: false, active: true, sortOrder: 5, logo: ALLY_LOGOS["APAFA Colegio San Ramón"] },
      { name: "Transportes Chanchamayo", type: "empresa", description: "Empresa de transporte que facilita la movilización gratuita de voluntarios y donaciones entre distritos.", featured: false, active: true, sortOrder: 6, logo: ALLY_LOGOS["Transportes Chanchamayo"] },
    ]);
  }

  const rows = await db
    .select({ id: alliesTable.id, name: alliesTable.name })
    .from(alliesTable)
    .where(isNull(alliesTable.logo));
  for (const row of rows) {
    const logo = ALLY_LOGOS[row.name];
    if (!logo) continue;
    await db
      .update(alliesTable)
      .set({ logo: logo as string })
      .where(eq(alliesTable.id, row.id));
  }
}

async function seedFaq() {
  if (!(await isEmpty("faq"))) return;
  logger.info("Seeding FAQ...");
  await db.insert(faqTable).values([
    { question: "¿Cómo puedo hacer una donación?", answer: "Puedes donar por Yape (987 654 321), Plin (987 654 321) o depósito en BCP (193-12345678-0-55). Luego envíanos el comprobante por WhatsApp.", category: "donaciones", sortOrder: 1, active: true },
    { question: "¿Mi donación es deducible de impuestos?", answer: "Trabajamos para obtener esa certificación. Por ahora emitimos una constancia de donación para quienes la soliciten.", category: "donaciones", sortOrder: 2, active: true },
    { question: "¿Cómo me hago voluntario/a?", answer: "Completa el formulario en la sección Voluntariado. El equipo te contactará en los próximos días para coordinar tu participación.", category: "voluntariado", sortOrder: 1, active: true },
    { question: "¿Necesito experiencia previa para ser voluntario?", answer: "No, no es necesaria ninguna experiencia. Solo ganas de ayudar y disponibilidad. Tenemos actividades para todos los perfiles.", category: "voluntariado", sortOrder: 2, active: true },
    { question: "¿Cómo funciona el proceso de adopción?", answer: "Visita nuestra sección de Adopciones, elige a tu futuro compañero y completa el formulario. El equipo revisará tu solicitud y te contactará.", category: "adopciones", sortOrder: 1, active: true },
    { question: "¿Cómo puede mi empresa ser aliada?", answer: "Escríbenos por WhatsApp o usa el formulario de contacto. Diseñamos juntos el tipo de colaboración que mejor se adapte a tu empresa.", category: "aliados", sortOrder: 1, active: true },
  ]);
}

async function seedSettings() {
  if (!(await isEmpty("settings"))) return;
  logger.info("Seeding settings...");
  await db.insert(settingsTable).values([
    { key: "org_name", value: "Red Solidaria San Ramón", label: "Nombre de la organización", group: "general" },
    { key: "org_tagline", value: "Juntos construimos un San Ramón más solidario", label: "Eslogan / Tagline", group: "general" },
    { key: "org_description", value: "Somos una organización solidaria sin fines de lucro ubicada en San Ramón, Chanchamayo, Perú. Trabajamos por el bienestar de las personas y animales más vulnerables de nuestra comunidad.", label: "Descripción (usada en SEO)", group: "general" },
    { key: "org_phone", value: "+51 987 654 321", label: "Teléfono de contacto", group: "contacto" },
    { key: "org_whatsapp", value: "51987654321", label: "Número WhatsApp (sin +)", group: "contacto" },
    { key: "org_email", value: "contacto@redsolidariasanramon.org", label: "Correo electrónico", group: "contacto" },
    { key: "org_address", value: "Jr. Los Álamos 245, San Ramón, Chanchamayo, Junín, Perú", label: "Dirección", group: "contacto" },
    { key: "org_facebook", value: "https://facebook.com/redsolidariasanramon", label: "Facebook URL", group: "redes" },
    { key: "org_instagram", value: "https://instagram.com/redsolidariasanramon", label: "Instagram URL", group: "redes" },
    { key: "org_youtube", value: "", label: "YouTube URL", group: "redes" },
    { key: "donation_yape", value: "987 654 321", label: "Número Yape", group: "donaciones" },
    { key: "donation_plin", value: "987 654 321", label: "Número Plin", group: "donaciones" },
    { key: "donation_bcp", value: "193-12345678-0-55", label: "Cuenta BCP", group: "donaciones" },
    { key: "donation_bcp_cci", value: "00219300123456780558", label: "CCI BCP", group: "donaciones" },
  ]);
}

async function seedNews() {
  if (await isEmpty("news")) {
    logger.info("Seeding news...");
    await db.insert(newsTable).values([
      {
        title: "Navidad Feliz: 500 niños recibieron regalos en los anexos más alejados",
        summary: "45 voluntarios y cientos de donantes hicieron posible una navidad inolvidable para 500 niños en los anexos más remotos de Chanchamayo.",
        content: "Este año, gracias a la generosidad de nuestros donantes y la dedicación de 45 voluntarios, pudimos llegar hasta los anexos de Chanchamayo que nunca antes habían recibido visitas solidarias. Los niños de comunidades como El Palomar, Vista Alegre y San Pedro de Cochangas recibieron no solo chocolatada caliente y juguetes, sino también el abrazo de toda una comunidad que los quiere. La alegría en sus caras no tiene precio. Gracias a todos quienes hicieron posible este sueño.",
        publishedAt: "2024-12-26",
        imageUrl: NEWS_IMAGES["Navidad Feliz: 500 niños recibieron regalos en los anexos más alejados"],
      },
      {
        title: "Nueva campaña escolar: asegurando el futuro de 300 niños",
        summary: "Lanzamos nuestra campaña escolar 2025 para dotar de útiles a 300 niños en situación de vulnerabilidad en las comunidades rurales de San Ramón.",
        content: "Con el inicio del año escolar 2025, Red Solidaria San Ramón lanza su campaña de útiles escolares para garantizar que ningún niño de las comunidades vulnerables de San Ramón tenga que faltar a clases por falta de materiales. Hemos identificado a 300 familias en situación crítica que necesitan apoyo urgente. Cada kit incluye cuadernos, lápices, colores, regla y mochila.",
        publishedAt: "2025-01-20",
        imageUrl: NEWS_IMAGES["Nueva campaña escolar: asegurando el futuro de 300 niños"],
      },
      {
        title: "Primer rescate animal: 15 mascotas encontraron hogar",
        summary: "Nuestro programa de adopción responsable arrancó con fuerza: 23 rescates y 15 adopciones exitosas en el primer mes.",
        content: "Nuestra nueva área de rescate animal tuvo un inicio exitoso. En el primer mes de operaciones, rescatamos 23 animales en situación de abandono o maltrato, de los cuales 15 ya encontraron hogares responsables gracias a nuestra red de adoptantes. Seguimos trabajando para ampliar esta iniciativa y crear un verdadero refugio temporal para los animales que más lo necesitan.",
        publishedAt: "2025-02-10",
        imageUrl: NEWS_IMAGES["Primer rescate animal: 15 mascotas encontraron hogar"],
      },
    ]);
  }

  const rows = await db
    .select({ id: newsTable.id, title: newsTable.title })
    .from(newsTable)
    .where(isNull(newsTable.imageUrl));
  for (const row of rows) {
    const image = NEWS_IMAGES[row.title];
    if (!image) continue;
    await db
      .update(newsTable)
      .set({ imageUrl: image })
      .where(eq(newsTable.id, row.id));
  }
}

async function seedPets() {
  if (await isEmpty("pets")) {
    logger.info("Seeding pets...");
    await db.insert(petsTable).values([
      {
        name: "Luna",
        species: "perro",
        breed: "Mestiza labrador",
        sex: "hembra",
        ageCategory: "adult",
        size: "medium",
        description: "Luna es una perrita cariñosa y juguetona. Le encanta correr, jugar con pelotas y dar abrazos. Se lleva bien con niños y otros perros. Muy obediente y ya sabe hacer sus necesidades afuera.",
        healthStatus: "excellent",
        vaccinated: true,
        sterilized: true,
        location: "San Ramón, Chanchamayo",
        contactName: "Red Solidaria",
        contactPhone: "987 654 321",
        urgent: false,
        status: "available",
        featuredOnHome: true,
        photos: PET_PHOTOS["Luna"],
      },
      {
        name: "Mochi",
        species: "gato",
        breed: "Mestizo",
        sex: "macho",
        ageCategory: "puppy",
        size: "small",
        description: "Mochi es un gatito muy curioso e independiente. Adora explorar, trepar y jugar con cordeles. A pesar de ser pequeño, tiene una personalidad enorme. Ya usa el cajón de arena sin problema.",
        healthStatus: "good",
        vaccinated: true,
        sterilized: false,
        location: "San Ramón, Chanchamayo",
        contactName: "Voluntaria Susana M.",
        contactPhone: "956 789 012",
        urgent: false,
        status: "available",
        featuredOnHome: true,
        photos: PET_PHOTOS["Mochi"],
      },
      {
        name: "Rex",
        species: "perro",
        breed: "Pastor alemán mestizo",
        sex: "macho",
        ageCategory: "senior",
        size: "large",
        description: "Rex es un perro grande de corazón noble. Tranquilo, leal y muy cariñoso con su familia. Perfecto para personas que quieren compañía sin tanta energía. Le gustan los paseos cortos y las siestas.",
        healthStatus: "good",
        vaccinated: true,
        sterilized: true,
        location: "San Ramón, Chanchamayo",
        contactName: "Red Solidaria",
        contactPhone: "987 654 321",
        urgent: true,
        status: "available",
        featuredOnHome: false,
        photos: PET_PHOTOS["Rex"],
      },
      {
        name: "Kira",
        species: "gato",
        breed: "Siamesa mestiza",
        sex: "hembra",
        ageCategory: "adult",
        size: "small",
        description: "Kira es elegante, curiosa e independiente. Muy limpia y ordenada. Le encanta observar por las ventanas y jugar por las tardes. Puede convivir con otros gatos si la socialización es gradual.",
        healthStatus: "excellent",
        vaccinated: true,
        sterilized: true,
        location: "Pichanaki, Chanchamayo",
        contactName: "Voluntaria Carmen R.",
        contactPhone: "945 321 678",
        urgent: false,
        status: "available",
        featuredOnHome: false,
        photos: PET_PHOTOS["Kira"],
      },
      {
        name: "Tobi",
        species: "perro",
        breed: "Mestizo pequeño",
        sex: "macho",
        ageCategory: "puppy",
        size: "small",
        description: "Tobi es un torbellino de energía y amor. Juguetón, travieso y absolutamente adorable. Perfecto para una familia activa con niños que quieran un compañero de aventuras. Ya está aprendiendo comandos básicos.",
        healthStatus: "good",
        vaccinated: false,
        sterilized: false,
        location: "San Ramón, Chanchamayo",
        contactName: "Red Solidaria",
        contactPhone: "987 654 321",
        urgent: true,
        status: "available",
        featuredOnHome: false,
        photos: PET_PHOTOS["Tobi"],
      },
      {
        name: "Nala",
        species: "perro",
        breed: "Golden mestiza",
        sex: "hembra",
        ageCategory: "adult",
        size: "large",
        description: "Nala es todo amor. Gentil, tranquila y muy cariñosa. Excelente con niños de cualquier edad. Conoce comandos básicos y nunca ha tenido problemas de comportamiento. Sueña con un jardín donde correr.",
        healthStatus: "excellent",
        vaccinated: true,
        sterilized: true,
        location: "La Merced, Chanchamayo",
        contactName: "Voluntario Jorge P.",
        contactPhone: "978 456 123",
        urgent: false,
        status: "available",
        featuredOnHome: true,
        photos: PET_PHOTOS["Nala"],
      },
    ]);
  }

  const rows = await db
    .select({ id: petsTable.id, name: petsTable.name })
    .from(petsTable)
    .where(isNull(petsTable.photos));
  for (const row of rows) {
    const photos = PET_PHOTOS[row.name];
    if (!photos) continue;
    await db
      .update(petsTable)
      .set({ photos })
      .where(eq(petsTable.id, row.id));
  }
}

async function seedCommunityReports() {
  if (await isEmpty("community_reports")) {
    logger.info("Seeding community reports...");
    await db.insert(communityReportsTable).values([
      {
        type: "familia-vulnerable",
        title: "Familia con 4 hijos sin techo tras incendio en San Ramón",
        description: "La familia Quispe Mamani perdió su vivienda el 12 de enero tras un incendio. Los padres y cuatro niños (edades 3, 6, 9 y 12 años) están viviendo en casa de vecinos. Necesitan materiales para reconstruir, alimentos y ropa para los niños.",
        location: "Jr. Los Cerezos 245, Barrio La Victoria, San Ramón",
        urgency: "critical",
        reporterName: "Rosa Condori Huanca",
        isAnonymous: false,
        status: "approved",
        featuredOnHome: true,
        photos: REPORT_PHOTOS["Familia con 4 hijos sin techo tras incendio en San Ramón"],
      },
      {
        type: "nino-necesidad",
        title: "Niño de 7 años con desnutrición severa en Pichanaki",
        description: "Sebastián Tello Rojas, 7 años, presenta desnutrición severa confirmada por la posta de salud. Su madre es soltera y vendedora ambulante. Necesita leche, cereales, vitaminas y seguimiento médico.",
        location: "AA.HH. Vista Alegre, Pichanaki, Chanchamayo",
        urgency: "critical",
        reporterName: "Enfermera Carmen López",
        isAnonymous: false,
        status: "approved",
        featuredOnHome: true,
        photos: REPORT_PHOTOS["Niño de 7 años con desnutrición severa en Pichanaki"],
      },
      {
        type: "adulto-mayor",
        title: "Abuela de 78 años sola y sin ayuda en San Luis de Shuaro",
        description: "Doña Gregoria Pumacahua, 78 años, vive sola desde que falleció su esposo hace 6 meses. Tiene artritis avanzada y le cuesta moverse. Necesita acompañamiento, medicinas y apoyo para llegar a sus controles médicos.",
        location: "Calle Real s/n, San Luis de Shuaro, Chanchamayo",
        urgency: "high",
        reporterName: "Vecino anónimo",
        isAnonymous: true,
        status: "approved",
        featuredOnHome: false,
        photos: REPORT_PHOTOS["Abuela de 78 años sola y sin ayuda en San Luis de Shuaro"],
      },
      {
        type: "emergencia-comunitaria",
        title: "Deslizamiento afectó 6 viviendas en Pampa Hermosa",
        description: "Las lluvias de los últimos días provocaron un deslizamiento que dañó 6 viviendas. Aproximadamente 25 personas incluyendo 8 niños necesitan materiales de construcción, limpieza y alimentos.",
        location: "Sector Alto, Pampa Hermosa, Satipo",
        urgency: "high",
        reporterName: "Alcalde de Pampa Hermosa",
        isAnonymous: false,
        status: "approved",
        featuredOnHome: true,
        photos: REPORT_PHOTOS["Deslizamiento afectó 6 viviendas en Pampa Hermosa"],
      },
      {
        type: "animal-herido",
        title: "Perro con fractura de pata abandonado en mercado central",
        description: "Un perro de raza cruzada de aproximadamente 2 años fue encontrado con fractura de pata delantera en el mercado central. Lleva 3 días en el lugar y necesita atención veterinaria urgente y un hogar temporal.",
        location: "Mercado Central, Av. Chanchamayo, San Ramón",
        urgency: "medium",
        reporterName: "Teresa Ávila",
        isAnonymous: false,
        status: "approved",
        featuredOnHome: false,
        photos: REPORT_PHOTOS["Perro con fractura de pata abandonado en mercado central"],
      },
      {
        type: "familia-vulnerable",
        title: "Madre con bebé recién nacido sin leche ni pañales",
        description: "Yasmín Torres, 19 años, tuvo a su bebé hace 10 días. No puede amamantar por problemas de salud y no tiene recursos para leche de fórmula ni pañales. Necesita apoyo urgente con leche maternizada y pañales.",
        location: "Jr. Grau 178, San Ramón",
        urgency: "high",
        reporterName: "Enfermera del Hospital San Ramón",
        isAnonymous: true,
        status: "approved",
        featuredOnHome: false,
        photos: REPORT_PHOTOS["Madre con bebé recién nacido sin leche ni pañales"],
      },
      {
        type: "albergue",
        title: "Albergue San Vicente necesita colchones y frazadas para 18 adultos",
        description: "El Albergue San Vicente acoge a 18 adultos mayores en situación de calle. Sus colchones están completamente deteriorados. Necesitan 18 colchones de 1 plaza y 30 frazadas para el invierno que se aproxima.",
        location: "Av. 7 de Junio 890, San Ramón",
        urgency: "medium",
        reporterName: "Hermana María Inés Salas",
        isAnonymous: false,
        status: "reviewing",
        featuredOnHome: false,
        photos: REPORT_PHOTOS["Albergue San Vicente necesita colchones y frazadas para 18 adultos"],
      },
    ]);
  }

  const rows = await db
    .select({ id: communityReportsTable.id, title: communityReportsTable.title })
    .from(communityReportsTable)
    .where(isNull(communityReportsTable.photos));
  for (const row of rows) {
    const photos = REPORT_PHOTOS[row.title];
    if (!photos) continue;
    await db
      .update(communityReportsTable)
      .set({ photos })
      .where(eq(communityReportsTable.id, row.id));
  }
}

// ─── Contenido demo de campañas (transparencia) ─────────────────────────────
// Donaciones, actualizaciones, galería, gastos y evidencias que alimentan el
// panel de transparencia y las listas de donantes. Solo se siembra si la tabla
// correspondiente está vacía; los IDs de campaña se resuelven por título.
async function campaignIdByTitle(title: string): Promise<number | null> {
  const rows = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(eq(campaignsTable.title, title));
  return rows[0]?.id ?? null;
}

async function seedCampaignMedia() {
  const chocolatada = await campaignIdByTitle("Chocolatada Navideña 2024");
  const chocolatada2025 = await campaignIdByTitle("Chocofest 2025");
  const escolar = await campaignIdByTitle("Campaña Escolar 2025");
  const rescate = await campaignIdByTitle("Rescate Animal San Ramón");

  // Donaciones demo (aprobadas + pendientes) → lista de donantes y movimientos
  if (await isEmpty("donations")) {
    logger.info("Seeding demo donations...");
    const demoDonations: Array<{
      campaignId?: number | null;
      firstName: string;
      lastName: string;
      email: string;
      amount: number;
      paymentMethod: string;
      message: string | null;
      anonymous: boolean;
      publicProof: boolean;
      status: "approved" | "pending";
      createdAt?: Date;
    }> = [
      // Donaciones reales de la Chocolatada Navideña 2024 (informe en vivo de
      // donaciones, Google Sheets). La lista completa vive en
      // ./chocolatada-2024-data.ts (fuente única de verdad).
      ...CHOCOLATADA_2024_DONATIONS.map((d) => ({ ...d, campaignId: chocolatada })),
      // Donaciones reales de Chocofest 2025. Fuente única: ./chocofest-2025-data.ts.
      ...CHOCOLATADA_2025_DONATIONS.map((d) => ({ ...d, campaignId: chocolatada2025 })),
      { campaignId: escolar, firstName: "Pedro", lastName: "Alvarado", email: "pedro.alvarado@example.com", amount: 200, paymentMethod: "transfer", message: "Para que ningún niño deje el aula", anonymous: false, publicProof: true, status: "approved" },
      { campaignId: escolar, firstName: "Ana", lastName: "Torres", email: "ana.torres@example.com", amount: 80, paymentMethod: "yape", message: "Apoyando la educación rural", anonymous: false, publicProof: false, status: "approved" },
      { campaignId: escolar, firstName: "", lastName: "", email: "anonimo2@example.com", amount: 60, paymentMethod: "plin", message: null, anonymous: true, publicProof: false, status: "approved" },
      { campaignId: rescate, firstName: "Susana", lastName: "Maldonado", email: "susana.m@example.com", amount: 75, paymentMethod: "yape", message: "Por los peluditos 🐾", anonymous: false, publicProof: false, status: "approved" },
      { campaignId: rescate, firstName: "", lastName: "", email: "anonimo3@example.com", amount: 30, paymentMethod: "cash", message: "Para el veterinario", anonymous: true, publicProof: false, status: "approved" },
      { campaignId: null, firstName: "Jorge", lastName: "Paredes", email: "jorge.paredes@example.com", amount: 150, paymentMethod: "transfer", message: "Donación general, usen donde más se necesite", anonymous: false, publicProof: false, status: "approved" },
    ];
    await db.insert(donationsTable).values(demoDonations);
  }

  // Actualizaciones de campaña
  if (await isEmpty("campaign_updates")) {
    logger.info("Seeding campaign updates...");
    const updates: Array<{ campaignId: number; title: string; content: string }> = [];
    if (chocolatada) {
      updates.push(
        ...CHOCOLATADA_2024_UPDATES.map((u) => ({ campaignId: chocolatada, ...u })),
      );
    }
    if (chocolatada2025) {
      updates.push(
        ...CHOCOLATADA_2025_UPDATES.map((u) => ({ campaignId: chocolatada2025, ...u })),
      );
    }
    if (escolar) {
      updates.push(
        { campaignId: escolar, title: "Primeros 100 kits entregados", content: "Entregamos los primeros 100 kits escolares en la IE N° 30891. Cada kit incluye mochila, cuadernos, lápices, colores y regla." },
        { campaignId: escolar, title: "Nuevo convenio con librería local", content: "Cerramos un convenio con una librería de San Ramón para ampliar el alcance de los kits a S/ 40 por estudiante. ¡Seguimos sumando!" },
      );
    }
    if (rescate) {
      updates.push(
        { campaignId: rescate, title: "Rex fue rescatado del mercado", content: "Gracias a la alerta de la comunidad, Rex fue llevado a la clínica veterinaria aliada. Ya inició su tratamiento y busca hogar temporal mientras se recupera." },
      );
    }
    if (updates.length) await db.insert(campaignUpdatesTable).values(updates);
  }

  // Galería de imágenes de campañas
  if (await isEmpty("campaign_images")) {
    logger.info("Seeding campaign gallery...");
    const images: Array<{ campaignId: number; imageUrl: string; caption: string }> = [];
    if (chocolatada) {
      images.push(
        ...CHOCOLATADA_2024_IMAGES.map((img) => ({ campaignId: chocolatada, ...img })),
      );
    }
    if (chocolatada2025) {
      images.push(
        ...CHOCOLATADA_2025_IMAGES.map((img) => ({ campaignId: chocolatada2025, ...img })),
      );
    }
    if (rescate) {
      images.push(
        { campaignId: rescate, imageUrl: u("photo-1552053831-71594a27632d", 1000), caption: "Luna esperando su hogar" },
        { campaignId: rescate, imageUrl: u("photo-1514888286974-6c03e2ca1dba", 1000), caption: "Kira en su espacio temporal" },
      );
    }
    if (escolar) {
      images.push(
        { campaignId: escolar, imageUrl: u("photo-1503676260728-1c00da094a0b", 1000), caption: "Kits escolares listos para entrega" },
      );
    }
    if (images.length) await db.insert(campaignImagesTable).values(images);
  }

  // Gastos públicos (rendición de cuentas)
  if (await isEmpty("campaign_expenses")) {
    logger.info("Seeding campaign expenses...");
    const expenses: Array<{
      campaignId: number;
      description: string;
      category: string;
      amount: number;
      date: string;
      responsible: string;
      receiptUrl: string | null;
      isPublic: boolean;
    }> = [];
    if (chocolatada) {
      expenses.push(
        ...CHOCOLATADA_2024_EXPENSES.map((e) => ({ campaignId: chocolatada, ...e })),
      );
    }
    if (chocolatada2025) {
      expenses.push(
        ...CHOCOLATADA_2025_EXPENSES.map((e) => ({ campaignId: chocolatada2025, ...e })),
      );
    }
    if (escolar) {
      expenses.push(
        { campaignId: escolar, description: "100 kits escolares (mochila + útiles)", category: "educación", amount: 1500, date: "2025-01-28", responsible: "Comisión Escolar", receiptUrl: RECEIPT_DEMO, isPublic: true },
        { campaignId: escolar, description: "Impresión de separadores y matrícula", category: "materiales", amount: 80, date: "2025-02-02", responsible: "Comisión Escolar", receiptUrl: null, isPublic: true },
        { campaignId: escolar, description: "Traslado de kits a comunidades", category: "transporte", amount: 200, date: "2025-02-05", responsible: "Logística", receiptUrl: null, isPublic: true },
      );
    }
    if (rescate) {
      expenses.push(
        { campaignId: rescate, description: "Atención veterinaria y vacunas", category: "salud", amount: 450, date: "2025-01-15", responsible: "Área Animal", receiptUrl: null, isPublic: true },
      );
    }
    if (expenses.length) await db.insert(campaignExpensesTable).values(expenses);
  }

  // Evidencias de impacto
  if (await isEmpty("campaign_evidence")) {
    logger.info("Seeding campaign evidence...");
    const evidence: Array<{
      campaignId: number;
      title: string;
      description: string;
      mediaUrl: string;
      mediaType: "image";
      evidenceType: string;
      date: string;
      isPublic: boolean;
    }> = [];
    if (chocolatada) {
      evidence.push(
        ...CHOCOLATADA_2024_EVIDENCE.map((ev) => ({ campaignId: chocolatada, ...ev })),
      );
    }
    if (chocolatada2025) {
      evidence.push(
        ...CHOCOLATADA_2025_EVIDENCE.map((ev) => ({ campaignId: chocolatada2025, ...ev })),
      );
    }
    if (escolar) {
      evidence.push(
        { campaignId: escolar, title: "Entrega de kits en IE N° 30891", description: "Los primeros 100 kits fueron entregados a los estudiantes.", mediaUrl: u("photo-1509062522246-3755977927d7", 1000), mediaType: "image", evidenceType: "activity", date: "2025-01-28", isPublic: true },
        { campaignId: escolar, title: "Kits escolares preparados", description: "Kits completos listos para distribución en las comunidades.", mediaUrl: u("photo-1503676260728-1c00da094a0b", 1000), mediaType: "image", evidenceType: "activity", date: "2025-01-25", isPublic: true },
      );
    }
    if (rescate) {
      evidence.push(
        { campaignId: rescate, title: "Rescate de Rex en el mercado", description: "Rex recibió atención veterinaria y está en recuperación.", mediaUrl: u("photo-1583337130417-3346a1be7dee", 1000), mediaType: "image", evidenceType: "activity", date: "2025-01-15", isPublic: true },
      );
    }
    if (evidence.length) await db.insert(campaignEvidenceTable).values(evidence);
  }
}
