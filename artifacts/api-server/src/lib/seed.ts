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
} from "@workspace/db";
import { count as drizzleCount, sql } from "drizzle-orm";
import { logger } from "./logger";

async function isEmpty(tableName: string): Promise<boolean> {
  const result = await db.execute(
    sql.raw(`SELECT COUNT(*)::int AS n FROM "${tableName}"`)
  );
  const rows = result.rows as Array<{ n: number }>;
  return rows[0]?.n === 0;
}

export async function seedIfEmpty(): Promise<void> {
  logger.info("Checking database seed state...");

  await seedCampaigns();
  await seedStats();
  await seedTestimonials();
  await seedAllies();
  await seedFaq();
  await seedSettings();
  await seedNews();
  await seedPets();
  await seedCommunityReports();

  logger.info("Seed check complete");
}

async function seedCampaigns() {
  if (!(await isEmpty("campaigns"))) return;
  logger.info("Seeding campaigns...");
  await db.insert(campaignsTable).values([
    {
      title: "Chocolatada Navideña 2024",
      description: "Llevamos chocolatada caliente y juguetes a más de 500 niños en los anexos más alejados de San Ramón durante las fiestas navideñas. Juntos podemos hacer que esta navidad sea especial para cada niño.",
      goal: 5000,
      raised: 3250,
      status: "active",
      featured: true,
      category: "niñez",
      startDate: "2024-11-01",
      endDate: "2024-12-25",
    },
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
    },
  ]);
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
  if (!(await isEmpty("testimonials"))) return;
  logger.info("Seeding testimonials...");
  await db.insert(testimonialsTable).values([
    {
      name: "María Quispe",
      role: "Madre de familia, Vista Alegre",
      message: "Gracias a la Red Solidaria, mi hijo pudo tener su primer juguete de Navidad. Yo sola no hubiera podido. Dios los bendiga a todos los voluntarios que vinieron hasta nuestra comunidad.",
    },
    {
      name: "Carlos Mendoza",
      role: "Voluntario desde 2022",
      message: "Participar en las campañas de la Red Solidaria ha cambiado mi manera de ver el mundo. Ver la alegría en los ojos de los niños cuando llegamos a sus comunidades es algo que no tiene precio. ¡Los invito a unirse!",
    },
    {
      name: "Prof. Ana Torres",
      role: "Directora de IE N° 30891, San Ramón",
      message: "La campaña escolar de Red Solidaria llegó justo cuando más lo necesitábamos. Varios de mis alumnos iban a desertar por no tener útiles. Gracias a ellos, este año tenemos aula llena.",
    },
    {
      name: "Pedro Alvarado",
      role: "Donante regular",
      message: "Confío plenamente en Red Solidaria porque son transparentes con cada donación. Puedo ver exactamente en qué se usa mi dinero y eso me da mucha seguridad para seguir apoyando.",
    },
  ]);
}

async function seedAllies() {
  if (!(await isEmpty("allies"))) return;
  logger.info("Seeding allies...");
  await db.insert(alliesTable).values([
    { name: "Municipalidad de San Ramón", type: "institucion", description: "Gobierno local que colabora con permisos, espacios y apoyo logístico para nuestras campañas en el distrito.", featured: true, active: true, sortOrder: 1 },
    { name: "Botica Popular San Ramón", type: "empresa", description: "Apoya con medicamentos, vitaminas y suministros médicos para nuestras atenciones comunitarias.", featured: true, active: true, sortOrder: 2 },
    { name: "Café Selva Verde", type: "emprendimiento", description: "Emprendimiento cafetalero local que dona un porcentaje de sus ventas a nuestras campañas de ayuda alimentaria.", featured: false, active: true, sortOrder: 3 },
    { name: "Clínica Veterinaria Chanchamayo", type: "empresa", description: "Colabora con jornadas gratuitas de vacunación y esterilización para perros y gatos de familias de escasos recursos.", featured: false, active: true, sortOrder: 4 },
    { name: "APAFA Colegio San Ramón", type: "institucion", description: "Asociación de padres de familia que moviliza a la comunidad educativa en colectas y actividades solidarias.", featured: false, active: true, sortOrder: 5 },
    { name: "Transportes Chanchamayo", type: "empresa", description: "Empresa de transporte que facilita la movilización gratuita de voluntarios y donaciones entre distritos.", featured: false, active: true, sortOrder: 6 },
  ]);
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
  if (!(await isEmpty("news"))) return;
  logger.info("Seeding news...");
  await db.insert(newsTable).values([
    {
      title: "Navidad Feliz: 500 niños recibieron regalos en los anexos más alejados",
      summary: "45 voluntarios y cientos de donantes hicieron posible una navidad inolvidable para 500 niños en los anexos más remotos de Chanchamayo.",
      content: "Este año, gracias a la generosidad de nuestros donantes y la dedicación de 45 voluntarios, pudimos llegar hasta los anexos de Chanchamayo que nunca antes habían recibido visitas solidarias. Los niños de comunidades como El Palomar, Vista Alegre y San Pedro de Cochangas recibieron no solo chocolatada caliente y juguetes, sino también el abrazo de toda una comunidad que los quiere. La alegría en sus caras no tiene precio. Gracias a todos quienes hicieron posible este sueño.",
      publishedAt: "2024-12-26",
    },
    {
      title: "Nueva campaña escolar: asegurando el futuro de 300 niños",
      summary: "Lanzamos nuestra campaña escolar 2025 para dotar de útiles a 300 niños en situación de vulnerabilidad en las comunidades rurales de San Ramón.",
      content: "Con el inicio del año escolar 2025, Red Solidaria San Ramón lanza su campaña de útiles escolares para garantizar que ningún niño de las comunidades vulnerables de San Ramón tenga que faltar a clases por falta de materiales. Hemos identificado a 300 familias en situación crítica que necesitan apoyo urgente. Cada kit incluye cuadernos, lápices, colores, regla y mochila.",
      publishedAt: "2025-01-20",
    },
    {
      title: "Primer rescate animal: 15 mascotas encontraron hogar",
      summary: "Nuestro programa de adopción responsable arrancó con fuerza: 23 rescates y 15 adopciones exitosas en el primer mes.",
      content: "Nuestra nueva área de rescate animal tuvo un inicio exitoso. En el primer mes de operaciones, rescatamos 23 animales en situación de abandono o maltrato, de los cuales 15 ya encontraron hogares responsables gracias a nuestra red de adoptantes. Seguimos trabajando para ampliar esta iniciativa y crear un verdadero refugio temporal para los animales que más lo necesitan.",
      publishedAt: "2025-02-10",
    },
  ]);
}

async function seedPets() {
  if (!(await isEmpty("pets"))) return;
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
    },
  ]);
}

async function seedCommunityReports() {
  if (!(await isEmpty("community_reports"))) return;
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
    },
  ]);
}
