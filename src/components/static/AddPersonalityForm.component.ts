import { Personality } from "../../types/Personality";
import * as personalityService from '../../services/Personality.service';
import * as overlayService from '../../services/Overlay.service';
import * as toastService from '../../services/Toast.service';
import { TONE_QUESTIONS } from '../../constants/ToneQuestions';

const form = document.querySelector<HTMLFormElement>("#form-add-personality");
const btn = document.querySelector<HTMLButtonElement>('#btn-add-tone-example');
const toneStep = btn?.closest('.step');

if (!form || !btn || !toneStep) {
    console.error("Form or tone example controls are misconfigured, abort");
    throw new Error("Form or tone example controls are misconfigured, abort");
}

const formEl = form;

const toneExamplesContainer = document.createElement('div');
toneExamplesContainer.classList.add('tone-example-list');
toneStep.insertBefore(toneExamplesContainer, btn);

const MAX_TONE_EXAMPLES = TONE_QUESTIONS.length;

function updateAddButtonState() {
    if (!btn) {
        return;
    }
    const reachedLimit = getNextAvailableQuestionIndex() === undefined;
    btn.disabled = reachedLimit;
    if (reachedLimit) {
        btn.setAttribute('aria-disabled', 'true');
    } else {
        btn.removeAttribute('aria-disabled');
    }
}

function syncToneExampleNames() {
    Array.from(toneExamplesContainer.querySelectorAll<HTMLInputElement>('input.tone-example')).forEach((input, index) => {
        input.name = `tone-example-${index + 1}`;
    });
    updateAddButtonState();
}

function getUsedQuestionIndices(): Set<number> {
    const used = new Set<number>();
    Array.from(toneExamplesContainer.querySelectorAll<HTMLInputElement>('input.tone-example')).forEach((input) => {
        const questionIndex = Number.parseInt(input.dataset.questionIndex ?? '', 10);
        if (!Number.isNaN(questionIndex) && questionIndex >= 0) {
            used.add(questionIndex);
        }
    });
    return used;
}

function getNextAvailableQuestionIndex(): number | undefined {
    const used = getUsedQuestionIndices();
    for (let i = 0; i < MAX_TONE_EXAMPLES; i++) {
        if (!used.has(i)) {
            return i;
        }
    }
    return undefined;
}

function assignQuestionToInput(input: HTMLInputElement, questionIndex: number) {
    input.dataset.questionIndex = questionIndex.toString();
    const label = input.closest('.tone-example-container')?.querySelector<HTMLLabelElement>('label.tone-example-label');
    const questionText = TONE_QUESTIONS[questionIndex] ?? 'Tone example';
    if (label) {
        label.textContent = questionText;
    }
    input.placeholder = questionText;
}

function createToneExampleRow(initialValue = ''): HTMLDivElement {
    const container = document.createElement('div');
    container.classList.add('tone-example-container');

    const label = document.createElement('label');
    label.classList.add('tone-example-label');
    label.textContent = 'Tone example';

    const row = document.createElement('div');
    row.classList.add('tone-example-row');

    const input = document.createElement('input');
    input.type = 'text';
    input.classList.add('tone-example');
    input.value = initialValue;
    const inputId = `tone-example-${crypto.randomUUID()}`;
    input.id = inputId;
    label.setAttribute('for', inputId);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.classList.add('tone-example-remove', 'material-symbols-outlined');
    removeButton.setAttribute('aria-label', 'Remove tone example');
    removeButton.textContent = 'remove_circle';
    removeButton.addEventListener('click', () => {
        if (toneExamplesContainer.children.length === 1) {
            input.value = '';
            input.focus();
            syncToneExampleNames();
            return;
        }
        container.remove();
        syncToneExampleNames();
    });

    row.append(input, removeButton);
    container.append(label, row);
    return container;
}

function addToneExample(value = '', suppressFeedback = false): HTMLDivElement | undefined {
    const nextQuestionIndex = getNextAvailableQuestionIndex();
    if (nextQuestionIndex === undefined) {
        if (!suppressFeedback) {
            toastService.warn({
                title: 'Tone example limit reached',
                text: `You can add up to ${MAX_TONE_EXAMPLES} tone examples.`
            });
        }
        updateAddButtonState();
        return undefined;
    }
    const row = createToneExampleRow(value);
    toneExamplesContainer.append(row);
    const input = row.querySelector<HTMLInputElement>('input.tone-example');
    if (input) {
        assignQuestionToInput(input, nextQuestionIndex);
        input.value = value;
    }
    syncToneExampleNames();



    return row;
}

function setToneExamples(values: string[]) {
    toneExamplesContainer.replaceChildren();
    const limitedValues = values.slice(0, MAX_TONE_EXAMPLES);
    if (limitedValues.length === 0) {
        addToneExample('', true);
        return;
    }
    limitedValues.forEach((tone) => addToneExample(tone, true));
}

const initialInput = toneStep.querySelector<HTMLInputElement>('input.tone-example');
if (initialInput) {
    const initialValue = initialInput.value;
    initialInput.remove();
    addToneExample(initialValue, true);
} else {
    addToneExample('', true);
}

formEl.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission on Enter key
        }
        if (e.key === 'Escape') {
            overlayService.closeOverlay(); // Close the overlay on Escape key
        }
    }
    );
});

function handleFormSubmit() {
    //turn all the form data into a personality object
    const personality: Personality = {
        name: '',
        aggressiveness: 0,
        description: '',
        image: '',
        internetEnabled: false,
        prompt: '',
        roleplayEnabled: false,
        sensuality: 0,
        independence: 0,
        nsfw: false,
        category: 'assistant',
        tags: [],
        toneExamples: []
    };
    const data = new FormData(formEl);
    for (const [key, value] of data.entries()) {
        if (key.includes("tone")) {
            if (value) {
                personality.toneExamples.push(value.toString());
            }
            continue;
        }
        if (key === 'id') {
            continue;
        }
        if (key === 'aggressiveness' || key === 'sensuality' || key === 'independence') {
            personality[key] = Number(value);
        } else if (key === 'description' || key === 'image' || key === 'name' || key === 'prompt') {
            personality[key] = value.toString();
        } else if (key === 'internetEnabled' || key === 'roleplayEnabled' || key === 'nsfw') {
            personality[key] = Boolean(value);
        } else if (key === 'category') {
            personality.category = value.toString() as 'character' | 'assistant';
        } else if (key === 'tags') {
            //tags are already comma-separated in hidden input by TagsInput component
            const tagsString = value.toString().trim();
            personality.tags = tagsString ? tagsString.split(',').filter(t => t.length > 0) : [];
        } else {
            console.warn(`Unhandled form key: ${key}`);
        }
    }

    //handle both edit and add cases
    const idRaw = data.get('id');
    const id = typeof idRaw === 'string' ? idRaw : '';
    if (id && id.trim().length > 0) {
        personalityService.edit(id, personality);
    } else {
        personalityService.add(personality);
    }

    overlayService.closeOverlay();

}

formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    handleFormSubmit();
});

//fallback for any programmatic submit calls that bypass the submit event
formEl.submit = () => {
    handleFormSubmit();
};

//this code is for setting up the `add tone example` button
btn.addEventListener('click', (e) => {
    e.preventDefault();
    const row = addToneExample('');
    if (row) {
        row.querySelector<HTMLInputElement>('input.tone-example')?.focus();
        // Scroll the add button into view so user can add another
        requestAnimationFrame(() => {
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }
});

form.addEventListener('toneExamples:set', (event) => {
    const detail = (event as CustomEvent<{ toneExamples: string[] }>).detail;
    setToneExamples(detail?.toneExamples ?? []);
});

form.addEventListener('toneExamples:reset', () => {
    setToneExamples([]);
});