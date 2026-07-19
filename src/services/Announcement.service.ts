import type { Announcement, AnnouncementAction, AnnouncementReceiptEvent } from "../types/Announcement";
import type { Tables } from "../types/database.types";
import { supabase } from "./Supabase.service";

type AnnouncementRow = Pick<
	Tables<"announcements">,
	"id" | "key" | "title" | "body" | "hero_image_url" | "hero_image_alt" | "action_label" | "action"
>;

type AnnouncementReceiptRow = Pick<Tables<"announcement_receipts">, "announcement_id" | "dismissed_at">;

function isAction(value: unknown): value is AnnouncementAction {
	return value === "dismiss" || value === "next";
}

function normalizeAnnouncement(row: AnnouncementRow): Announcement | null {
	if (
		typeof row.id !== "string" ||
		typeof row.key !== "string" ||
		typeof row.title !== "string" ||
		typeof row.body !== "string"
	) {
		return null;
	}

	const action = isAction(row.action) ? row.action : null;
	const actionLabel =
		action && typeof row.action_label === "string" && row.action_label.trim() ? row.action_label : null;

	return {
		id: row.id,
		key: row.key,
		title: row.title,
		body: row.body,
		heroImageUrl: typeof row.hero_image_url === "string" && row.hero_image_url.trim() ? row.hero_image_url : null,
		heroImageAlt: typeof row.hero_image_alt === "string" ? row.hero_image_alt : "",
		actionLabel,
		action: actionLabel ? action : null
	};
}

export async function getEligibleAnnouncements(): Promise<Announcement[]> {
	const { data, error } = await supabase
		.from("announcements")
		.select("id,key,title,body,hero_image_url,hero_image_alt,action_label,action")
		.order("priority", { ascending: false });

	if (error) {
		console.warn("Unable to load in-app announcements:", error.message);
		return [];
	}

	const announcements = ((data ?? []) as AnnouncementRow[])
		.map(normalizeAnnouncement)
		.filter((announcement): announcement is Announcement => announcement !== null);
	if (!announcements.length) return [];

	const { data: receiptData, error: receiptError } = await supabase
		.from("announcement_receipts")
		.select("announcement_id,dismissed_at")
		.in(
			"announcement_id",
			announcements.map((announcement) => announcement.id)
		);

	if (receiptError) {
		console.warn("Unable to load announcement receipts:", receiptError.message);
		return [];
	}

	const dismissedIds = new Set(
		((receiptData ?? []) as AnnouncementReceiptRow[])
			.filter((receipt) => typeof receipt.announcement_id === "string" && receipt.dismissed_at !== null)
			.map((receipt) => receipt.announcement_id as string)
	);

	return announcements.filter((announcement) => !dismissedIds.has(announcement.id));
}

export async function recordAnnouncementReceipt(
	userId: string,
	announcementId: string,
	event: AnnouncementReceiptEvent
): Promise<void> {
	const occurredAt = new Date().toISOString();
	const receipt: Record<string, string> = {
		user_id: userId,
		announcement_id: announcementId
	};

	if (event === "seen") receipt.seen_at = occurredAt;
	if (event === "dismissed") receipt.dismissed_at = occurredAt;
	if (event === "actioned") {
		receipt.actioned_at = occurredAt;
		receipt.dismissed_at = occurredAt;
	}

	const { error } = await supabase
		.from("announcement_receipts")
		.upsert(receipt, { onConflict: "announcement_id,user_id" });
	if (error) {
		console.warn(`Unable to record announcement ${event} receipt:`, error.message);
	}
}
