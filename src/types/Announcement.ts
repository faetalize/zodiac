import type { Enums } from "./database.types";

export type AnnouncementAction = Enums<"announcement_action">;

export interface Announcement {
	id: string;
	key: string;
	title: string;
	body: string;
	heroImageUrl: string | null;
	heroImageAlt: string;
	actionLabel: string | null;
	action: AnnouncementAction | null;
}

export type AnnouncementReceiptEvent = "seen" | "dismissed" | "actioned";
