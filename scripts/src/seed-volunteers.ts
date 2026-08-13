// ─── Seed demo: 20 voluntarios para el panel admin ───────────────────────────
// Inserta 20 voluntarios de ejemplo (datos ficticios pero realistas de la zona
// de San Ramón / Chanchamayo) para que el panel admin tenga contenido con qué
// trabajar. Idempotente: solo siembra si la tabla está VACÍA (mismo criterio
// que el seed de campañas).
//
// Uso:
//   pnpm --filter @workspace/scripts seed:volunteers
//
// Notas:
// - El campo photo se sube normalmente desde el formulario público vía
//   Cloudinary; en el seed se usan retratos de placeholder (randomuser.me)
//   para que la lista admin se vea completa.
// - Los valores de availability/interests/status coinciden con los que usan
//   el formulario público y el panel admin (es/en).

import { db, pool, runMigrations, volunteersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

interface SeedVolunteer {
  name: string;
  email: string;
  phone: string | null;
  age: string | null;
  district: string | null;
  availability: string;
  skills: string | null;
  interests: string | null;
  motivation: string;
  priorExperience: string | null;
  status: string;
  photo: string | null;
  createdAt: Date;
}

const VOLUNTEERS: SeedVolunteer[] = [
  {
    name: "María Quispe Huamán",
    email: "maria.quispe@gmail.com",
    phone: "964 221 087",
    age: "32",
    district: "San Ramón",
    availability: "fines-semana",
    skills: "Primeros auxilios, organización de eventos",
    interests: "Campañas sociales, Colectas y eventos",
    motivation:
      "Quiero devolver a mi comunidad todo lo que me ha dado y apoyar a las familias más necesitadas de San Ramón.",
    priorExperience: "Cruz Roja (2 años), campañas navideñas parroquiales",
    status: "approved",
    photo: "https://randomuser.me/api/portraits/women/65.jpg",
    createdAt: new Date("2026-05-18T14:20:00Z"),
  },
  {
    name: "Juan Carlos Paredes Laos",
    email: "juancarlos.paredes@hotmail.com",
    phone: "965 812 340",
    age: "41",
    district: "La Merced",
    availability: "ambos",
    skills: "Manejo de herramientas, construcción, logística",
    interests: "Bienestar animal, Colectas y eventos",
    motivation:
      "Siempre he ayudado con animales abandonados de mi zona; quiero sumarme a las brigadas y a la construcción de refugios.",
    priorExperience: "Albergue de mascotas de La Merced (colaborador)",
    status: "approved",
    photo: "https://randomuser.me/api/portraits/men/32.jpg",
    createdAt: new Date("2026-05-22T16:05:00Z"),
  },
  {
    name: "Lucía Rojas Fernández",
    email: "lucia.rojasf@gmail.com",
    phone: "966 543 219",
    age: "27",
    district: "Pichanaki",
    availability: "fines-semana",
    skills: "Redes sociales, diseño básico, fotografía",
    interests: "Apoyo a niños, Redes sociales / difusión",
    motivation:
      "Me gusta contar historias que mueven a la gente; quiero ayudar con la difusión y con las actividades para niños.",
    priorExperience: null,
    status: "pending",
    photo: "https://randomuser.me/api/portraits/women/44.jpg",
    createdAt: new Date("2026-06-02T10:30:00Z"),
  },
  {
    name: "Pedro Salazar Torres",
    email: "pedro.salazar@outlook.com",
    phone: "967 110 456",
    age: "38",
    district: "Perené",
    availability: "entre-semana",
    skills: "Enfermería, primeros auxilios, salud comunitaria",
    interests: "Salud / primeros auxilios, Atención a adultos mayores",
    motivation:
      "Soy técnico en enfermería y quiero acercar la salud básica a las familias de las comunidades del Perené.",
    priorExperience: "Puesto de salud de Perené (voluntariado en campañas de vacunación)",
    status: "approved",
    photo: "https://randomuser.me/api/portraits/men/76.jpg",
    createdAt: new Date("2026-06-10T12:45:00Z"),
  },
  {
    name: "Rosa Mamani Cárdenas",
    email: "rosa.mamani@gmail.com",
    phone: "968 902 771",
    age: "45",
    district: "San Ramón",
    availability: "eventos",
    skills: "Cocina, repostería, trabajo en equipo",
    interests: "Colectas y eventos, Campañas sociales",
    motivation:
      "Me encanta la cocina solidaria; participo en cada chocolatada y quiero ayudar a organizar más colectas.",
    priorExperience: "Ollas comunes del barrio (3 años)",
    status: "contacted",
    photo: "https://randomuser.me/api/portraits/women/68.jpg",
    createdAt: new Date("2026-06-15T18:00:00Z"),
  },
  {
    name: "Jorge Luis Huayta Quispe",
    email: "jorge.huayta@gmail.com",
    phone: "969 334 508",
    age: "29",
    district: "Vitoc",
    availability: "fines-semana",
    skills: "Conducción, mecánica, carga y traslado",
    interests: "Campañas sociales, Colectas y eventos",
    motivation:
      "Tengo camioneta propia y quiero apoyar con el traslado de donaciones y brigadas a las zonas altas.",
    priorExperience: null,
    status: "reviewing",
    photo: null,
    createdAt: new Date("2026-06-21T09:15:00Z"),
  },
  {
    name: "Carmen Villanueva Espinoza",
    email: "carmen.villanueva@hotmail.com",
    phone: "970 654 322",
    age: "52",
    district: "San Luis de Shuaro",
    availability: "entre-semana",
    skills: "Tejido, manualidades, cuidado de personas",
    interests: "Atención a adultos mayores, Apoyo a niños",
    motivation:
      "Quiero acompañar a los adultos mayores de mi comunidad y apoyar en las actividades con los niños.",
    priorExperience: "Voluntariado en el centro del adulto mayor de La Merced",
    status: "approved",
    photo: "https://randomuser.me/api/portraits/women/12.jpg",
    createdAt: new Date("2026-06-28T15:40:00Z"),
  },
  {
    name: "Miguel Ángel Cárdenas Ríos",
    email: "miguel.cardenas@gmail.com",
    phone: "971 208 903",
    age: "35",
    district: "La Merced",
    availability: "remoto",
    skills: "Desarrollo web, contabilidad, Excel",
    interests: "Diseño gráfico, Redes sociales / difusión",
    motivation:
      "Puedo aportar desde lo digital: mantener la web, los registros y la transparencia de las cuentas.",
    priorExperience: "Asesoría contable a pequeñas ONG",
    status: "contacted",
    photo: null,
    createdAt: new Date("2026-07-02T11:25:00Z"),
  },
  {
    name: "Ana Lucía Flores Gutierrez",
    email: "analu.flores@gmail.com",
    phone: "972 118 674",
    age: "23",
    district: "Pichanaki",
    availability: "fines-semana",
    skills: "Pedagogía, arte, música",
    interests: "Apoyo a niños, Campañas sociales",
    motivation:
      "Estudio educación inicial y quiero aportar con talleres y actividades recreativas para los niños.",
    priorExperience: "Prácticas en inicial, voluntariado en comedores",
    status: "pending",
    photo: "https://randomuser.me/api/portraits/women/89.jpg",
    createdAt: new Date("2026-07-06T17:50:00Z"),
  },
  {
    name: "Carlos Mendoza Huamán",
    email: "carlos.mendoza@outlook.com",
    phone: "973 445 210",
    age: "48",
    district: "San Ramón",
    availability: "ambos",
    skills: "Carpintería, electricidad, reparaciones",
    interests: "Campañas sociales, Bienestar animal",
    motivation:
      "Puedo reparar y acondicionar espacios para la red: desde un aula hasta un refugio para animales.",
    priorExperience: "Taller propio de carpintería; colaborador en faenas comunales",
    status: "approved",
    photo: "https://randomuser.me/api/portraits/men/11.jpg",
    createdAt: new Date("2026-07-09T08:35:00Z"),
  },
  {
    name: "Katherine Ramos Pineda",
    email: "katherine.ramos@gmail.com",
    phone: "974 772 065",
    age: "31",
    district: "Perené",
    availability: "entre-semana",
    skills: "Trabajo social, orientación familiar",
    interests: "Atención a adultos mayores, Ayuda legal",
    motivation:
      "Soy trabajadora social y quiero orientar a las familias que más lo necesitan en trámites y cuidados.",
    priorExperience: "Municipalidad de Perené (programa de adultos mayores)",
    status: "reviewing",
    photo: null,
    createdAt: new Date("2026-07-13T14:10:00Z"),
  },
  {
    name: "Luis Alberto Chávez Salas",
    email: "luis.chavez@hotmail.com",
    phone: "975 331 849",
    age: "26",
    district: "San Ramón",
    availability: "fines-semana",
    skills: "Fotografía, edición de video",
    interests: "Fotografía / video, Redes sociales / difusión",
    motivation:
      "Quiero registrar el trabajo de la red con fotos y videos para mostrar el impacto real de cada campaña.",
    priorExperience: null,
    status: "pending",
    photo: "https://randomuser.me/api/portraits/men/45.jpg",
    createdAt: new Date("2026-07-16T19:20:00Z"),
  },
  {
    name: "Fiorella Torres Rojas",
    email: "fiorella.torres@gmail.com",
    phone: "976 205 517",
    age: "34",
    district: "La Merced",
    availability: "remoto",
    skills: "Comunicación, traducción, redacción",
    interests: "Redes sociales / difusión, Campañas sociales",
    motivation:
      "Puedo redactar notas, traducir contenido y mantener informada a la comunidad desde las redes.",
    priorExperience: "Community manager freelance",
    status: "approved",
    photo: null,
    createdAt: new Date("2026-07-19T10:55:00Z"),
  },
  {
    name: "David Rojas Espinoza",
    email: "david.rojas@gmail.com",
    phone: "977 680 334",
    age: "39",
    district: "Oxapampa",
    availability: "eventos",
    skills: "Logística, sonido, armado de escenarios",
    interests: "Colectas y eventos, Campañas sociales",
    motivation:
      "Tengo equipo de sonido y experiencia con eventos; quiero apoyar en las colectas y actividades multitudinarias.",
    priorExperience: "Eventos municipales y campañas de salud",
    status: "contacted",
    photo: "https://randomuser.me/api/portraits/men/85.jpg",
    createdAt: new Date("2026-07-22T12:40:00Z"),
  },
  {
    name: "Maribel Quinto Díaz",
    email: "maribel.quinto@gmail.com",
    phone: "978 419 083",
    age: "56",
    district: "San Ramón",
    availability: "entre-semana",
    skills: "Costura, tejido, preparación de alimentos",
    interests: "Atención a adultos mayores, Colectas y eventos",
    motivation:
      "Quiero apoyar con la elaboración de frazadas y ropa para las campañas de invierno y visitar a los abuelitos.",
    priorExperience: "Taller de costura comunal",
    status: "pending",
    photo: null,
    createdAt: new Date("2026-07-25T16:30:00Z"),
  },
  {
    name: "Renzo Pacheco Lazo",
    email: "renzo.pacheco@hotmail.com",
    phone: "979 246 158",
    age: "24",
    district: "Pichanaki",
    availability: "fines-semana",
    skills: "Deportes, animación, trabajo con jóvenes",
    interests: "Apoyo a niños, Salud / primeros auxilios",
    motivation:
      "Quiero organizar escuelas deportivas y actividades de integración para los niños y jóvenes de Pichanaki.",
    priorExperience: "Monitor deportivo en colegios",
    status: "reviewing",
    photo: "https://randomuser.me/api/portraits/men/22.jpg",
    createdAt: new Date("2026-07-28T09:05:00Z"),
  },
  {
    name: "Daniela Ayllón Roca",
    email: "daniela.ayllon@gmail.com",
    phone: "980 517 264",
    age: "30",
    district: "Villa Rica",
    availability: "ambos",
    skills: "Nutrición, talleres de cocina saludable",
    interests: "Salud / primeros auxilios, Campañas sociales",
    motivation:
      "Soy nutricionista y quiero enseñar a preparar comidas nutritivas y económicas en los comedores populares.",
    priorExperience: "Programa de alimentación escolar (MINSA)",
    status: "approved",
    photo: "https://randomuser.me/api/portraits/women/28.jpg",
    createdAt: new Date("2026-07-30T13:15:00Z"),
  },
  {
    name: "Cristian Velásquez Oré",
    email: "cristian.velasquez@gmail.com",
    phone: "981 332 747",
    age: "22",
    district: "Satipo",
    availability: "remoto",
    skills: "Programación, bases de datos",
    interests: "Redes sociales / difusión, Diseño gráfico",
    motivation:
      "Quiero aportar con tecnología: automatizar registros y ayudar a que la web funcione mejor para la comunidad.",
    priorExperience: null,
    status: "rejected",
    photo: null,
    createdAt: new Date("2026-08-02T11:50:00Z"),
  },
  {
    name: "Paola Núñez Castro",
    email: "paola.nunez@outlook.com",
    phone: "982 660 431",
    age: "36",
    district: "La Merced",
    availability: "fines-semana",
    skills: "Psicología, contención emocional",
    interests: "Apoyo a niños, Atención a adultos mayores",
    motivation:
      "Soy psicóloga y quiero ofrecer contención y talleres emocionales a las familias que atiende la red.",
    priorExperience: "Colegio de La Merced (talleres psicoeducativos)",
    status: "pending",
    photo: null,
    createdAt: new Date("2026-08-05T17:45:00Z"),
  },
  {
    name: "Fernando Gutierrez Aliaga",
    email: "fernando.gutierrez@gmail.com",
    phone: "983 108 596",
    age: "44",
    district: "San Ramón",
    availability: "ambos",
    skills: "Docencia, alfabetización digital",
    interests: "Apoyo a niños, Campañas sociales",
    motivation:
      "Soy docente y quiero apoyar con refuerzo escolar y talleres de computación para los niños de la red.",
    priorExperience: "Docente de primaria (15 años)",
    status: "approved",
    photo: "https://randomuser.me/api/portraits/men/58.jpg",
    createdAt: new Date("2026-08-08T10:20:00Z"),
  },
];

async function main(): Promise<void> {
  // El esquema puede estar atrasado (columna photo pendiente): aplicamos las
  // migraciones antes de insertar, igual que los scripts apply:*.
  await runMigrations();

  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM volunteers`,
  );
  const rows = result.rows as Array<{ n: number }>;
  const existing = rows[0]?.n ?? 0;

  if (existing > 0) {
    console.log(
      `• La tabla volunteers ya tiene ${existing} fila(s): se omite el seed (idempotente).`,
    );
    return;
  }

  await db.insert(volunteersTable).values(VOLUNTEERS);
  console.log(
    `✔ ${VOLUNTEERS.length} voluntarios demo insertados (${VOLUNTEERS.filter((v) => v.photo).length} con foto).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
