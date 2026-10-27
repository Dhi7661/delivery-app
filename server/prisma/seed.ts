import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const INITIAL_SETTINGS = [
  {
    key: 'DELIVERY_FEE_PAISE',
    value_paise: 2000, // ₹20
    is_dummy: true,
  },
  {
    key: 'FREE_DELIVERY_THRESHOLD_PAISE',
    value_paise: 30000, // ₹300
    is_dummy: true,
  },
  {
    key: 'COD_LIMIT_PAISE',
    value_paise: 100000, // ₹1,000
    is_dummy: true,
  },
];

export async function main() {
  console.log('[Seed] Seeding initial dummy settings...');

  for (const setting of INITIAL_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {
        value_paise: setting.value_paise,
        is_dummy: setting.is_dummy,
      },
      create: {
        key: setting.key,
        value_paise: setting.value_paise,
        is_dummy: setting.is_dummy,
      },
    });
  }

  console.log('[Seed] 3 dummy settings seeded successfully.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
