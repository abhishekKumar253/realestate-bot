import { prisma } from "../src/db/client";
import { ProjectStatus, PropertyType } from "@prisma/client";
import * as dotenv from "dotenv";
dotenv.config();

const BUILDER_ID = "cmqve4nu3000068nf3wxm6q55";

const seed = async () => {
  console.log("🌱 Seeding projects and properties...");

  // Step 1: Localities fetch karo
  const localities = await prisma.locality.findMany({
    select: { id: true, name: true },
  });

  const loc = (name: string) => {
    const l = localities.find((l) =>
      l.name.toLowerCase().includes(name.toLowerCase())
    );
    if (!l) throw new Error(`Locality not found: ${name}`);
    return l.id;
  };

  // Step 2: Projects create karo
  const projects = await Promise.all([
    prisma.project.create({
      data: {
        builderId: BUILDER_ID,
        name: "Prestige Gachibowli Heights",
        description: "Premium apartments near financial district",
        reraNumber: "P02400001234",
        status: ProjectStatus.LAUNCHED,
      },
    }),
    prisma.project.create({
      data: {
        builderId: BUILDER_ID,
        name: "My Home Kondapur",
        description: "Affordable luxury in Kondapur",
        reraNumber: "P02400001235",
        status: ProjectStatus.UNDER_CONSTRUCTION,
      },
    }),
    prisma.project.create({
      data: {
        builderId: BUILDER_ID,
        name: "Aparna HiTech City",
        description: "Ready to move flats near HITEC City",
        reraNumber: "P02400001236",
        status: ProjectStatus.READY_TO_MOVE,
      },
    }),
    prisma.project.create({
      data: {
        builderId: BUILDER_ID,
        name: "Vasavi Miyapur Enclave",
        description: "Budget friendly homes in Miyapur",
        reraNumber: "P02400001237",
        status: ProjectStatus.LAUNCHED,
      },
    }),
    prisma.project.create({
      data: {
        builderId: BUILDER_ID,
        name: "Aliens Space Station Kukatpally",
        description: "Modern apartments in Kukatpally",
        reraNumber: "P02400001238",
        status: ProjectStatus.READY_TO_MOVE,
      },
    }),
  ]);

  console.log(`✅ ${projects.length} projects created`);

  // Step 3: Properties create karo
  const properties = [
    // Prestige Gachibowli Heights
    {
      projectId: projects[0].id,
      localityId: loc("Gachibowli"),
      type: PropertyType.APARTMENT,
      bhk: "2BHK",
      price: 9500000,
      area: 1200,
    },
    {
      projectId: projects[0].id,
      localityId: loc("Gachibowli"),
      type: PropertyType.APARTMENT,
      bhk: "3BHK",
      price: 14000000,
      area: 1800,
    },
    {
      projectId: projects[0].id,
      localityId: loc("Gachibowli"),
      type: PropertyType.APARTMENT,
      bhk: "4BHK",
      price: 19000000,
      area: 2400,
    },

    // My Home Kondapur
    {
      projectId: projects[1].id,
      localityId: loc("Kondapur"),
      type: PropertyType.APARTMENT,
      bhk: "2BHK",
      price: 8000000,
      area: 1100,
    },
    {
      projectId: projects[1].id,
      localityId: loc("Kondapur"),
      type: PropertyType.APARTMENT,
      bhk: "3BHK",
      price: 12000000,
      area: 1600,
    },

    // Aparna HiTech City
    {
      projectId: projects[2].id,
      localityId: loc("HITEC City"),
      type: PropertyType.APARTMENT,
      bhk: "2BHK",
      price: 10500000,
      area: 1250,
    },
    {
      projectId: projects[2].id,
      localityId: loc("HITEC City"),
      type: PropertyType.APARTMENT,
      bhk: "3BHK",
      price: 15500000,
      area: 1900,
    },

    // Vasavi Miyapur Enclave
    {
      projectId: projects[3].id,
      localityId: loc("Miyapur"),
      type: PropertyType.APARTMENT,
      bhk: "1BHK",
      price: 4500000,
      area: 650,
    },
    {
      projectId: projects[3].id,
      localityId: loc("Miyapur"),
      type: PropertyType.APARTMENT,
      bhk: "2BHK",
      price: 6500000,
      area: 1050,
    },
    {
      projectId: projects[3].id,
      localityId: loc("Miyapur"),
      type: PropertyType.APARTMENT,
      bhk: "3BHK",
      price: 9000000,
      area: 1450,
    },

    // Aliens Space Station Kukatpally
    {
      projectId: projects[4].id,
      localityId: loc("Kukatpally"),
      type: PropertyType.APARTMENT,
      bhk: "2BHK",
      price: 7500000,
      area: 1100,
    },
    {
      projectId: projects[4].id,
      localityId: loc("Kukatpally"),
      type: PropertyType.APARTMENT,
      bhk: "3BHK",
      price: 11000000,
      area: 1550,
    },
  ];

  await prisma.property.createMany({ data: properties });
  console.log(`✅ ${properties.length} properties seeded`);

  await prisma.$disconnect();
  console.log("🔌 Done");
};

seed().catch(async (e) => {
  console.error("❌ Seed failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
