import TurndownService from 'turndown';
import { marked } from "marked";

const turndownService = new TurndownService({
    fence: '```',
    codeBlockStyle: 'fenced',
    headingStyle: 'atx',
    br: '\n\n',
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

export async function parseHtmlToMarkdown(html: string | TurndownService.Node): Promise<string> {
    // Convert HTML to Markdown using Turndown
    const markdown = turndownService.turndown(html);
    return markdown;
}