import * as overlayService from "./Overlay.service";
import { Db, db } from "./Db.service";
import { Personality } from "../models/Personality";

export async function initialize() {
    //default personality setup
    const defaultPersonalityCard = insert(getDefault(), -1);
    if (!defaultPersonalityCard) {
        console.error("Default personality failed to insert");
        return
    }
    defaultPersonalityCard.querySelector(".btn-edit-card")?.remove(); // Remove edit button from default personality
    defaultPersonalityCard.querySelector("input")?.click();

    //load all personalities from local storage
    const personalitiesArray = await getAll();
    if (personalitiesArray) {
        for (let personality of personalitiesArray) {
            const { id: id , ...personalityData } = personality; // Destructure to exclude 'id'
            insert(personalityData, id);
        }
    }

    // Add the "Create New" card at the end
    const createCard = createAddPersonalityCard();
    document.querySelector("#personalitiesDiv")?.appendChild(createCard);
}

export async function getSelected(): Promise<Personality | undefined> {
    const selectedID = document.querySelector("input[name='personality']:checked")?.parentElement?.id.split("-")[1];
    if (!selectedID) {
        return getDefault();
    }
    return await get(parseInt(selectedID));
}

export function getDefault(): Personality {
    return {
        name: 'zodiac',
        image: 'https://techcrunch.com/wp-content/uploads/2023/12/google-bard-gemini-v2.jpg',
        description: 'zodiac is a cheerful assistant, always ready to help you with your tasks.',
        prompt: "You are zodiac, a helpful assistant created by faetalize, built upon Google's Gemini model. Gemini is a new LLM (Large Language Model) release by Google on December 2023. Your purpose is being a helpful assistant to the user.",
        sensuality: 0,
        aggressiveness: 0,
        internetEnabled: true,
        roleplayEnabled: false,
        toneExamples: [],
    };
}

export async function get(id: number): Promise<Personality> {
    if (id < 0) {
        return getDefault();
    }
    const personality = await db?.personalities.get(id);
    if (!personality) {
        return getDefault();
    }
    return personality;
}

export async function getAll() {
    const personalities = await db.personalities.toArray();
    if (!personalities) {
        return [];
    };
    return personalities;
}

export async function remove(id: number) {
    if (id < 0) {
        return;
    }
    await db.personalities.delete(id);
}

function insert(personality: Personality, id: number) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    if (!personalitiesDiv) {
        return
    }
    const card = generateCard(personality, id);
    personalitiesDiv.append(card);
    return card;
}

export function share(personality: Personality) {
    //export personality to a string
    const personalityString = JSON.stringify(personality, null, 2)
    //download
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(personalityString));
    element.setAttribute('download', `${personality.name}.json`);
    element.style.display = 'none';
    //appending the element is required for firefox
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

export function createAddPersonalityCard() {
    const card = document.createElement("div");
    card.classList.add("card-personality", "card-add-personality");
    card.id = "btn-add-personality";
    card.innerHTML = `
        <div class="add-personality-content">
            <span class="material-symbols-outlined add-icon">add</span>
        </div>
    `;

    card.addEventListener("click", () => {
        overlayService.showAddPersonalityForm();
    });

    return card;
}

export async function removeAll() {
    await db.personalities.clear();
    const personalityElements = document.querySelector<HTMLDivElement>("#personalitiesDiv")!.children;
    for (let i = personalityElements.length - 1; i >= 0; i--) {
        const element = personalityElements[i];
        if (element.id !== "btn-add-personality" && element.id) {
            element.remove();
        }
    }
}

export async function add(personality: Personality) {
    const id = await db.personalities.add(structuredClone(personality));
    insert(personality, id);

    // Move the add card to be the last element
    const addCard = document.querySelector("#btn-add-personality");
    if (addCard) {
        document.querySelector("#personalitiesDiv")?.appendChild(addCard);
    }
}

export async function edit(id: number, personality: Personality) {
    const element = document.querySelector(`#personality-${id}`);

    await db.personalities.update(id, {...personality});

    //reselect the personality if it was selected prior
    element?.replaceWith(generateCard(personality, id));
    document.querySelector(`#personality-${id}`)?.querySelector("input")?.click();
}

export function generateCard(personality: Personality, id: number) {
    const card = document.createElement("label");
    card.classList.add("card-personality");
    if (id && id !== -1) {
        card.id = `personality-${id}`;
    }
    card.innerHTML = `
            <img class="background-img" src="${personality.image}"></img>
            <input  type="radio" name="personality" value="${personality.name}">
            <div class="btn-array-personalityactions">
                ${id ? `<button class="btn-textual btn-edit-card material-symbols-outlined" 
                    id="btn-edit-personality-${personality.name}">edit</button>` : ''}
                <button class="btn-textual btn-share-card material-symbols-outlined" 
                    id="btn-share-personality-${personality.name}">share</button>
                ${id ? `<button class="btn-textual btn-delete-card material-symbols-outlined"
                    id="btn-delete-personality-${personality.name}">delete</button>` : ''}
            </div>
            <div class="personality-info">
                <h3 class="personality-title">${personality.name}</h3>
                <p class="personality-description">${personality.description}</p>
            </div>
            `;

    // Add event listeners
    const shareButton = card.querySelector(".btn-share-card");
    const deleteButton = card.querySelector(".btn-delete-card");
    const editButton = card.querySelector(".btn-edit-card");
    const input = card.querySelector("input");

    shareButton?.addEventListener("click", () => {
        share(personality);
    });
    if (deleteButton) {
        deleteButton.addEventListener("click", () => {
            //first if the personality to delete is the one currently selected, we select the default personality
            if (input?.checked) {
                ((document.querySelector("#personalitiesDiv")?.firstElementChild) as HTMLElement).click();
            }
            if (id && id != -1) {
                remove(id);
            }
            card.remove();
        });
    }
    if (editButton) {
        editButton.addEventListener("click", async () => {
            overlayService.showEditPersonalityForm(personality);
        });
    }
    return card;
}

