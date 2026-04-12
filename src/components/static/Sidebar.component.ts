import * as helpers from "../../utils/helpers";
import * as personalityService from "../../services/Personality.service";
import * as chatsService from "../../services/Chats.service";
import * as toastService from "../../services/Toast.service";
import { db } from "../../services/Db.service";
import "./ChatSearch.component";

const hideSidebarButton = document.querySelector("#btn-hide-sidebar");
const showSidebarButton = document.querySelector("#btn-show-sidebar");
const sidebarViews = document.querySelectorAll<HTMLElement>(".sidebar-section");
const sidebar = document.querySelector<HTMLDivElement>(".sidebar");
const clearAllPersonalitiesButton = document.querySelector("#btn-clearall-personality");
const deleteAllChatsButton = document.querySelector("#btn-reset-chat");

const importPersonalityButton = document.querySelector("#btn-import-personality");
const clearAllDataButton = document.querySelector("#btn-clear-all-data");
const bulkImportChatsButton = document.querySelector("#btn-bulk-import-chats");
const exportAllChatsButton = document.querySelector("#btn-export-all-chats");
const bulkImportPersonasButton = document.querySelector("#btn-bulk-import-personas");
const exportAllPersonasButton = document.querySelector("#btn-export-all-personas");

if (
	!sidebar ||
	!hideSidebarButton ||
	!showSidebarButton ||
	!sidebarViews ||
	!clearAllPersonalitiesButton ||
	!deleteAllChatsButton ||
	!importPersonalityButton ||
	!exportAllChatsButton ||
	!bulkImportChatsButton ||
	!clearAllDataButton ||
	!bulkImportPersonasButton ||
	!exportAllPersonasButton
) {
	console.error("Sidebar component is missing some elements. Please check the HTML structure.");
	throw new Error("Sidebar component is not properly initialized.");
}
hideSidebarButton.addEventListener("click", () => {
	helpers.hideElement(sidebar);
});
showSidebarButton.addEventListener("click", () => {
	sidebar.style.display = "flex";
	helpers.showElement(sidebar, false);
});
clearAllPersonalitiesButton.addEventListener("click", () => {
	void (async () => {
		const confirmation = await helpers.confirmDialogDanger(
			"You are about to clear all your custom personalities. This action cannot be undone!"
		);
		if (confirmation) {
			void personalityService.removeAll();
		}
	})();
});
deleteAllChatsButton.addEventListener("click", () => {
	void (async () => {
		const confirmation = await helpers.confirmDialogDanger(
			"You are about to wipe your chats. This action cannot be undone!"
		);
		if (confirmation) {
			await chatsService.deleteAllChats(db);
		}
	})();
});

exportAllChatsButton.addEventListener("click", () => {
	void (async () => {
		await chatsService.exportAllChats();
	})();
});

bulkImportChatsButton.addEventListener("click", () => {
	const fileInput = document.createElement("input");
	fileInput.type = "file";
	fileInput.addEventListener("change", () => {
		void (async () => {
			await chatsService.importChats(fileInput.files!);
		})();
	});
	fileInput.click();
	fileInput.remove();
});

importPersonalityButton.addEventListener("click", () => {
	const fileInput = document.createElement("input");
	fileInput.type = "file";
	fileInput.accept = ".json,.personality";
	fileInput.addEventListener("change", () => {
		void (async () => {
			const file = fileInput.files && fileInput.files[0];
			if (!file) return;
			try {
				const content = await file.text();
				const persona = JSON.parse(content);
				const added = await personalityService.add(persona, persona?.id);
				if (added) {
					toastService.info({
						title: "Persona imported",
						text: `Imported \"${persona.name || "persona"}\".`
					});
				}
			} catch (err) {
				console.error("Failed to import personality", err);
				toastService.danger({
					title: "Import Failed",
					text: "Failed to import personality. Please ensure the file is valid JSON."
				});
			}
		})();
	});
	fileInput.click();
	fileInput.remove();
});

bulkImportPersonasButton.addEventListener("click", () => {
	const fileInput = document.createElement("input");
	fileInput.type = "file";
	fileInput.accept = ".json,.personality";
	fileInput.multiple = true;
	fileInput.addEventListener("change", () => {
		void (async () => {
			const files = fileInput.files;
			if (!files || files.length === 0) return;

			try {
				const personasToImport: any[] = [];
				for (const file of Array.from(files)) {
					const content = await file.text();
					const parsed = JSON.parse(content);
					const personas = Array.isArray(parsed) ? parsed : [parsed];
					personasToImport.push(...personas);
				}

				let importedCount = 0;
				for (const persona of personasToImport) {
					const added = await personalityService.add(persona, persona?.id);
					if (added) importedCount++;
				}

				if (importedCount > 0) {
					toastService.info({
						title: "Personas imported",
						text: `Imported ${importedCount} persona${importedCount === 1 ? "" : "s"}.`
					});
				}
			} catch (err) {
				console.error("Failed to import personas", err);
				toastService.danger({
					title: "Import Failed",
					text: "Failed to import personas. Please ensure the file is valid JSON."
				});
			}
		})();
	});
	fileInput.click();
	fileInput.remove();
});

exportAllPersonasButton.addEventListener("click", () => {
	void (async () => {
		try {
			const personalities = await personalityService.getAll();
			const blob = new Blob([JSON.stringify(personalities, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "personas.json";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			toastService.info({
				title: "Personas exported",
				text: `Exported ${personalities.length} persona${personalities.length === 1 ? "" : "s"}.`
			});
		} catch (err) {
			console.error("Failed to export personas", err);
			toastService.danger({
				title: "Export Failed",
				text: "Failed to export personas."
			});
		}
	})();
});

clearAllDataButton.addEventListener("click", () => {
	void (async () => {
		const confirmation = await helpers.confirmDialogDanger(
			"You are about to clear all your data. This action cannot be undone!"
		);
		if (confirmation) {
			await db.delete();
			localStorage.clear();
			window.location.reload();
		}
	})();
});

window.addEventListener("resize", () => {
	//show sidebar if window is resized to desktop size
	if (window.innerWidth > 1032) {
		//to prevent running showElement more than necessary
		if ((sidebar as HTMLElement)?.style.opacity == "0" && sidebar) {
			helpers.showElement(sidebar, false);
		}
	}
});
