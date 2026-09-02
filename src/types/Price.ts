export type SubscriptionPurchaseType =
	| "pro_monthly"
	| "pro_yearly"
	| "pro_plus_monthly"
	| "pro_plus_yearly"
	| "max_monthly"
	| "max_yearly";

// Compatibility aliases for rows written before Stripe Price lookup keys became
// the stored subscription identity. New Stripe accounts do not belong in frontend code.
export const LEGACY_SUBSCRIPTION_PRICE_IDS = {
	pro: [
		"price_1S0hdiGiJrKwXclRByeNLSPu",
		"price_1SDdbKGiJrKwXclR7hn7fF4s",
		"price_1SDeIFGiJrKwXclRCNThnoXH",
		"price_1SOU2lKcI9PDo3JBhsT8URS9",
		"price_1T9CqjKcI9PDo3JBP6613Pzh"
	],
	pro_plus: ["price_1T9CqqKcI9PDo3JBBGC59S8O", "price_1T9CqqKcI9PDo3JB7LXgL5MV"],
	max: [
		"price_1S0heGGiJrKwXclR69Ku7XEc",
		"price_1SDf2NGiJrKwXclRwDs7XOd0",
		"price_1SDf2rGiJrKwXclReGeg8fQo",
		"price_1T9DCYKcI9PDo3JBsFc4nlZa",
		"price_1T9CqkKcI9PDo3JBEqHYJU68"
	]
} as const;
