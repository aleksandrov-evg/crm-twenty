import { CoreApiClient } from 'twenty-client-sdk/core';
import { definePostInstallLogicFunction } from 'twenty-sdk/define';

type ProductSeed = {
  name: string;
  code: string;
  category: 'SINGLE' | 'GROUP_PACKAGE' | 'PERSONAL';
  sessionFormat: 'GROUP_REFORMER' | 'PERSONAL_EQUIPMENT';
  visitsIncluded: number;
  price: {
    amountMicros: number;
    currencyCode: 'RUB';
  };
};

const PRODUCT_SEEDS: ProductSeed[] = [
  {
    name: 'Разовое',
    code: 'GROUP-SINGLE-2500',
    category: 'SINGLE',
    sessionFormat: 'GROUP_REFORMER',
    visitsIncluded: 1,
    price: { amountMicros: 2_500_000_000, currencyCode: 'RUB' },
  },
  {
    name: 'Группа 4',
    code: 'GROUP-4-8800',
    category: 'GROUP_PACKAGE',
    sessionFormat: 'GROUP_REFORMER',
    visitsIncluded: 4,
    price: { amountMicros: 8_800_000_000, currencyCode: 'RUB' },
  },
  {
    name: 'Группа 8',
    code: 'GROUP-8-16000',
    category: 'GROUP_PACKAGE',
    sessionFormat: 'GROUP_REFORMER',
    visitsIncluded: 8,
    price: { amountMicros: 16_000_000_000, currencyCode: 'RUB' },
  },
  {
    name: 'Персональное разовое',
    code: 'PERSONAL-SINGLE-4000',
    category: 'PERSONAL',
    sessionFormat: 'PERSONAL_EQUIPMENT',
    visitsIncluded: 1,
    price: { amountMicros: 4_000_000_000, currencyCode: 'RUB' },
  },
  {
    name: 'Персональное 8',
    code: 'PERSONAL-8-28000',
    category: 'PERSONAL',
    sessionFormat: 'PERSONAL_EQUIPMENT',
    visitsIncluded: 8,
    price: { amountMicros: 28_000_000_000, currencyCode: 'RUB' },
  },
];

const handler = async () => {
  const client = new CoreApiClient();
  const productCodes = PRODUCT_SEEDS.map(({ code }) => code);
  const result = (await client.query({
    studioProducts: {
      __args: { filter: { code: { in: productCodes } }, first: productCodes.length },
      edges: { node: { code: true } },
    },
  } as never)) as unknown as {
    studioProducts?: { edges?: Array<{ node: { code: string } }> };
  };
  const existingProductCodes = new Set(
    result.studioProducts?.edges?.map(({ node }) => node.code) ?? [],
  );
  const validFrom = new Date().toISOString().slice(0, 10);
  const productsToCreate = PRODUCT_SEEDS.filter(
    ({ code }) => !existingProductCodes.has(code),
  ).map((product) => ({
    ...product,
    durationMinutes: 55,
    isActive: true,
    version: 1,
    validFrom,
  }));

  if (productsToCreate.length === 0) {
    console.log('Studio product seeds already exist.');

    return {};
  }

  await client.mutation({
    createStudioProducts: {
      __args: { data: productsToCreate },
      id: true,
    },
  } as never);

  console.log(`Seeded ${productsToCreate.length} studio products.`);

  return {};
};

export default definePostInstallLogicFunction({
  universalIdentifier: 'fb22ef32-514f-49a2-9d4e-c02f3ea4e01c',
  name: 'post-install',
  description: 'Seeds the studio products available for sale.',
  timeoutSeconds: 30,
  shouldRunSynchronously: true,
  handler,
});
