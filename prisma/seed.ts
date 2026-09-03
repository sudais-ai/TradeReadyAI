import { PrismaClient } from '@prisma/client'
import bcrypt from "bcryptjs";
const prisma = new PrismaClient()

async function main() {
  console.log("Seeding database...")

  // Create a default user with proper password hashing.
  // The update branch ensures re-running the seed always keeps the
  // passwordHash populated, even if a previous run created the user
  // without one.
  const passwordHash = await bcrypt.hash("demo123!@#", 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@tradeready.ai' },
    update: { passwordHash, name: 'Demo User' },
    create: {
      email: 'demo@tradeready.ai',
      name: 'Demo User',
      passwordHash,
    },
  })

  // Delete existing to allow re-running seed safely
  await prisma.tradeCase.deleteMany({})

  // Case 1: Needs Information
  const _case1 = await prisma.tradeCase.create({
    data: {
      status: "Needs Information",
      progress: "2 of 4",
      nextAction: "Complete product details",
      nextActionHref: "/cases/TR-2026-081/product",
      direction: "export",
      origin: "Pakistan",
      destination: "United Kingdom",
      shipmentDate: "2026-10-15",
      estimatedValue: "$48,000",
      userId: user.id,
      product: {
        create: {
          name: "Aseptic Mango Pulp",
          description: "Processed mango pulp in aseptic packaging for food manufacturing use.",
          material: "Mango fruit pulp",
          intendedUse: "Food manufacturing ingredient",
          origin: "Pakistan",
          quantity: "2,400 units (200kg drums)",
        }
      },
      documents: {
        create: [
          { name: "Commercial Invoice", status: "Added", description: "Invoice for the shipment." },
          { name: "Product Specification", status: "Added", description: "Technical product details." },
          { name: "Packing List", status: "Missing", description: "Required for customs clearance." },
          { name: "Certificate of Origin", status: "Missing", description: "May be required for preferential tariff treatment." },
        ]
      },
      requirements: {
        create: [
          { title: "Food safety certification", status: "Needs review", source: "UK Food Standards Agency" },
          { title: "Certificate of origin", status: "May be required", source: "Trade agreements" },
          { title: "Labelling requirements", status: "Needs review", source: "UK labelling regulations" },
        ]
      }
    }
  })

  // Case 2: In Progress
  const _case2 = await prisma.tradeCase.create({
    data: {
      status: "In Progress",
      progress: "4 of 4",
      nextAction: "View requirements",
      nextActionHref: "/cases/TR-2026-079/requirements",
      direction: "import",
      origin: "China",
      destination: "Germany",
      shipmentDate: "2026-11-01",
      estimatedValue: "$125,000",
      userId: user.id,
      product: {
        create: {
          name: "Lithium Ion Batteries",
          description: "Rechargeable lithium-ion battery cells for consumer electronics.",
          material: "Lithium cobalt oxide cathode",
          packaging: "Individual cells in fire-retardant packaging",
          intendedUse: "Consumer electronics power supply",
          origin: "China",
          quantity: "10,000 units",
          weight: "500 kg gross"
        }
      },
      documents: {
        create: [
          { name: "Commercial Invoice", status: "Added" },
          { name: "Battery Test Report (UN 38.3)", status: "Added" },
          { name: "Material Safety Data Sheet", status: "Added" },
          { name: "Packing List", status: "Added" },
        ]
      },
      requirements: {
        create: [
          { title: "UN 38.3 test summary", status: "Confirmed" },
          { title: "EU Battery Regulation compliance", status: "Needs review" },
          { title: "REACH declaration", status: "May be required" },
        ]
      }
    }
  })

  console.log("Seeding complete.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
