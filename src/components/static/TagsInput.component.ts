//chip-style tags input component
const container = document.querySelector<HTMLDivElement>('#tags-input-container');
const chipsContainer = container?.querySelector<HTMLDivElement>('.tags-chips');
const input = container?.querySelector<HTMLInputElement>('.tags-input');
const hiddenInput = document.querySelector<HTMLInputElement>('#tags-hidden-input');
const form = document.querySelector<HTMLFormElement>('#form-add-personality');

if (!container || !chipsContainer || !input || !hiddenInput) {
    console.error('Tags input elements not found');
    throw new Error('Tags input elements not found');
}

let tags: string[] = [];

function updateHiddenInput() {
    if (hiddenInput) {
        hiddenInput.value = tags.join(',');
    }
}

function createChip(tag: string): HTMLSpanElement {
    const chip = document.createElement('span');
    chip.classList.add('tag-chip');
    chip.dataset.tag = tag;

    const text = document.createElement('span');
    text.textContent = tag;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.classList.add('tag-chip-remove', 'material-symbols-outlined');
    removeBtn.textContent = 'close';
    removeBtn.setAttribute('aria-label', `Remove ${tag}`);
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTag(tag);
    });

    chip.append(text, removeBtn);
    return chip;
}

function addTag(tag: string) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || tags.includes(normalized)) {
        return;
    }
    tags.push(normalized);
    chipsContainer?.appendChild(createChip(normalized));
    updateHiddenInput();
}

function removeTag(tag: string) {
    const index = tags.indexOf(tag);
    if (index === -1) {
        return;
    }
    tags.splice(index, 1);
    const chip = chipsContainer?.querySelector<HTMLSpanElement>(`.tag-chip[data-tag="${tag}"]`);
    chip?.remove();
    updateHiddenInput();
}

function setTags(newTags: string[]) {
    //clear existing
    tags = [];
    if (chipsContainer) {
        chipsContainer.innerHTML = '';
    }
    //add new
    newTags.forEach(t => addTag(t));
}

function reset() {
    tags = [];
    if (chipsContainer) {
        chipsContainer.innerHTML = '';
    }
    if (input) {
        input.value = '';
    }
    updateHiddenInput();
}

//handle input events
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const value = input.value.trim();
        if (value) {
            addTag(value);
            input.value = '';
        }
    } else if (e.key === 'Backspace' && !input.value && tags.length > 0) {
        //remove last tag on backspace if input is empty
        removeTag(tags[tags.length - 1]);
    } else if (e.key === 'Escape') {
        //let escape bubble up to close overlay
    }
});

//also add tag on blur (if user types and clicks away)
input.addEventListener('blur', () => {
    const value = input.value.trim();
    if (value) {
        addTag(value);
        input.value = '';
    }
});

//click container to focus input
container.addEventListener('click', () => {
    input.focus();
});

//custom events for form integration
form?.addEventListener('tags:set', (event) => {
    const detail = (event as CustomEvent<{ tags: string[] }>).detail;
    setTags(detail?.tags ?? []);
});

form?.addEventListener('tags:reset', () => {
    reset();
});

export { setTags, reset, tags };
