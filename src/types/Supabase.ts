export type SubscriptionTier = 'free' | 'pro' | 'max' | 'canceled';

export interface UserSubscription {
    id: string;
    user_id: string;
    status: string;
    price_id: string | null;
    current_period_end?: string | number | null;
    remaining_image_generations?: number | null;
    cancel_at_period_end?: boolean | null;
    stripe_customer_id?: string | null;
    [key: string]: unknown;
}

export interface ImageGenerationRecord {
    user_id: string;
    remaining_image_generations: number | null;
    [key: string]: unknown;
}

export type MarketplacePersonaInfo = {
    id: string;
    version: number;
    name: string;
    exists: true;
} | {
    exists: false;
};
