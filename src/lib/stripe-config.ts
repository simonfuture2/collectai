export const STRIPE_CONFIG = {
  pro: {
    price_id: "price_1T5Ept1sHqLtRhMjmjQKR2mY",
    product_id: "prod_U3LWcSgpIvvEwb",
    name: "Pro Monthly",
    price: 14.99,
    mode: "subscription" as const,
  },
  credits_10: {
    price_id: "price_1T5En91sHqLtRhMjieEskxnU",
    product_id: "prod_U3LUssmKAJLMjx",
    name: "10 Credit Pack",
    price: 9.99,
    credits: 10,
    mode: "payment" as const,
  },
  credits_50: {
    price_id: "price_1T5Enq1sHqLtRhMji0VcN36u",
    product_id: "prod_U3LUNHmWz9efkI",
    name: "50 Credit Pack",
    price: 24.99,
    credits: 50,
    mode: "payment" as const,
  },
  credits_100: {
    price_id: "price_1T5EoT1sHqLtRhMj8uG8CN60",
    product_id: "prod_U3LVySbsHL6Sur",
    name: "100 Credit Pack",
    price: 39.99,
    credits: 100,
    mode: "payment" as const,
  },
} as const;
