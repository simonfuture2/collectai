export const STRIPE_CONFIG = {
  pro: {
    price_id: "price_1T4ipMLOcSeBPUW0duXqKp8y",
    product_id: "prod_U2oSKDGxRnAx1x",
    name: "Pro Monthly",
    price: 14.99,
    mode: "subscription" as const,
  },
  credits_10: {
    price_id: "price_1T4ipaLOcSeBPUW00ZTuYUgo",
    product_id: "prod_U2oSb0GXXerl32",
    name: "10 Credit Pack",
    price: 9.99,
    credits: 10,
    mode: "payment" as const,
  },
  credits_50: {
    price_id: "price_1T4ipmLOcSeBPUW08TsIams4",
    product_id: "prod_U2oS9AcuiOdUmy",
    name: "50 Credit Pack",
    price: 24.99,
    credits: 50,
    mode: "payment" as const,
  },
  credits_100: {
    price_id: "price_1T4ipyLOcSeBPUW0YadFsTK3",
    product_id: "prod_U2oS0IpwPaqUAg",
    name: "100 Credit Pack",
    price: 39.99,
    credits: 100,
    mode: "payment" as const,
  },
} as const;
