import TurndownService from 'turndown';
import { marked } from "marked";

const turndownService = new TurndownService({
    fence: '```',
    codeBlockStyle: 'fenced',
    headingStyle: 'atx',
    br: '',
});

export async function parseMarkdownToHtml(markdown: string): Promise<string> {
    // Convert Markdown to HTML using marked
    const html = await marked(markdown, {
        gfm: true,
        breaks: true,
        async: true,
    });
    return html;
}

export function parseHtmlToMarkdown(html: string | TurndownService.Node): string {
    // Convert HTML to Markdown using Turndown
    const markdown = turndownService.turndown(html);
    return markdown;
}