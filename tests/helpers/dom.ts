export function bootstrapDom(markup = ""): void {
    document.body.innerHTML = markup;
}

export function addHighlightThemeLink(): HTMLLinkElement {
    const link = document.createElement("link");
    link.setAttribute("data-highlight-theme", "true");
    document.head.append(link);
    return link;
}
