export type SubscriptionTier = "free" | "pro" | "pro_plus" | "max" | "canceled";

export interface UserSubscription {
	id: string;
	user_id: string;
	status: string;
	price_id: string | null;
	current_period_end?: string | number | null;
	cancel_at_period_end?: boolean | null;
	stripe_customer_id?: string | null;
	[key: string]: unknown;
}

export interface ImageGenerationRecord {
	user_id: string;
	remaining_image_generations: number | null;
	[key: string]: unknown;
}

export interface MegaCreditsRecord {
	user_id: string;
	remaining_mega_credits: number | null;
	[key: string]: unknown;
}

export interface NanoBananaDailyUsageRecord {
	user_id: string;
	usage_date: string;
	usage_count: number;
	[key: string]: unknown;
}

export type MarketplacePersonaInfo =
	| {
			id: string;
			version: number;
			name: string;
			exists: true;
	  }
	| {
			exists: false;
	  };
