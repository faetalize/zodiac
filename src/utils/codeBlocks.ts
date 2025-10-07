const CODE_WRAPPER_CLASS = "code-block-wrapper";
const TOOLBAR_CLASS = "code-block-toolbar";
const LANGUAGE_LABEL_CLASS = "code-lang-label";
const COPY_BUTTON_CLASS = "code-copy-btn";
const ICON_COPY = "content_copy";
const ICON_CHECK = "check";
const COPY_TIMEOUT_MS = 1000;

const LANGUAGE_ALIASES: Record<string, string> = {
    js: "JavaScript",
    javascript: "JavaScript",
    jsx: "JavaScript",
    ts: "TypeScript",
    typescript: "TypeScript",
    tsx: "TypeScript",
    py: "Python",
    python: "Python",
    rb: "Ruby",
    csharp: "C#",
    "c#": "C#",
    cs : "C#",
    cpp: "C++",
    "c++": "C++",
    java: "Java",
    go: "Go",
    rs: "Rust",
    rust: "Rust",
    php: "PHP",
    swift: "Swift",
    kotlin: "Kotlin",
    bash: "Bash",
    sh: "Bash",
    shell: "Bash",
    ps1: "PowerShell",
    powershell: "PowerShell",
    sql: "SQL",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    md: "Markdown",
    markdown: "Markdown",
    text: "Text",
    txt: "Text"
};

function formatLanguageToken(rawToken: string | null | undefined): string {
    if (!rawToken) {
        return "Text";
    }

    const normalized = rawToken.toLowerCase();
    if (LANGUAGE_ALIASES[normalized]) {
        return LANGUAGE_ALIASES[normalized];
    }

    return rawToken.charAt(0).toUpperCase() + rawToken.slice(1);
}

function deriveLanguageLabel(codeElement: HTMLElement): string {
    const languageClass = Array.from(codeElement.classList).find(cls => cls.startsWith("language-"));
    if (!languageClass) {
        return "Text";
    }

    const token = languageClass.replace("language-", "");
    return formatLanguageToken(token);
}

function attachCopyHandler(button: HTMLButtonElement, codeElement: HTMLElement): void {
    button.addEventListener("click", async () => {
        if (button.disabled) {
            return;
        }

        try {
            await navigator.clipboard.writeText(codeElement.textContent ?? "");
            button.disabled = true;
            button.classList.add("is-success");
            button.textContent = ICON_CHECK;

            setTimeout(() => {
                button.disabled = false;
                button.classList.remove("is-success");
                button.textContent = ICON_COPY;
            }, COPY_TIMEOUT_MS);
        } catch (error) {
            console.error("Failed to copy code block", error);
            button.disabled = false;
        }
    });
}

function wrapPreElement(preElement: HTMLPreElement): void {
    const codeElement = preElement.querySelector<HTMLElement>("code");
    if (!codeElement) {
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.classList.add(CODE_WRAPPER_CLASS);

    const toolbar = document.createElement("div");
    toolbar.classList.add(TOOLBAR_CLASS);

    const languageLabel = document.createElement("span");
    languageLabel.classList.add(LANGUAGE_LABEL_CLASS);
    languageLabel.textContent = deriveLanguageLabel(codeElement);

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.classList.add(COPY_BUTTON_CLASS, "material-symbols-outlined");
    copyButton.setAttribute("aria-label", "Copy code");
    copyButton.textContent = ICON_COPY;

    attachCopyHandler(copyButton, codeElement);

    toolbar.appendChild(languageLabel);
    toolbar.appendChild(copyButton);

    const parent = preElement.parentElement;
    if (!parent) {
        return;
    }

    parent.insertBefore(wrapper, preElement);
    wrapper.appendChild(preElement);
    wrapper.appendChild(toolbar);
}

export function stripCodeBlockEnhancements(root: ParentNode): void {
    const wrappers = root.querySelectorAll<HTMLElement>(`.${CODE_WRAPPER_CLASS}`);
    wrappers.forEach(wrapper => {
        const pre = wrapper.querySelector<HTMLPreElement>("pre");
        if (pre) {
            wrapper.replaceWith(pre);
        } else {
            wrapper.remove();
        }
    });
}

export function enhanceCodeBlocks(root: ParentNode): void {
    stripCodeBlockEnhancements(root);

    const preElements = root.querySelectorAll<HTMLPreElement>("pre");
    preElements.forEach(pre => {
        const messageContainer = pre.closest(".message-text");
        if (!messageContainer) {
            return;
        }

        if (pre.closest(`.${CODE_WRAPPER_CLASS}`)) {
            return;
        }

        wrapPreElement(pre);
    });
}
