export const STRIPE_CONFIG = {
  pro: {
    price_id: "price_1T4iVvLOcSeBPUW0rS1sPOeW",
    product_id: "prod_U2o8G9JgJbkJrd",
    name: "Pro Monthly",
    price: 9.99,
    mode: "subscription" as const,
  },
  credits_10: {
    price_id: "price_1T4iWALOcSeBPUW0CngmuRz5",
    product_id: "prod_U2o8s7U7fWJ4sn",
    name: "10 Credit Pack",
    price: 4.99,
    credits: 10,
    mode: "payment" as const,
  },
  credits_50: {
    price_id: "price_1T4iWULOcSeBPUW0kpSHkc9H",
    product_id: "prod_U2o8Qe7j2DpoRt",
    name: "50 Credit Pack",
    price: 19.99,
    credits: 50,
    mode: "payment" as const,
  },
  credits_100: {
    price_id: "price_1T4iWmLOcSeBPUW0xvlCzmDs",
    product_id: "prod_U2o9mIXNqpLrdD",
    name: "100 Credit Pack",
    price: 34.99,
    credits: 100,
    mode: "payment" as const,
  },
} as const;
