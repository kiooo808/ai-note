import TurndownService from 'turndown';
import { downloadFile } from './backup';
export function noteMarkdown(title: string, html: string) {
  const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  service.addRule('wiki', { filter: node => node.nodeName === 'SPAN' && (node as HTMLElement).classList.contains('wiki-link-node'), replacement: (_content, node) => {
    const el = node as HTMLElement;
    return '[[' + (el.getAttribute('data-title') || el.textContent || '') + ']]';
  } });
  service.addRule('task', { filter: node => node.nodeName === 'LI' && (node as HTMLElement).getAttribute('data-type') === 'taskItem', replacement: (content, node) => {
    return '\n- [' + ((node as HTMLElement).getAttribute('data-checked') === 'true' ? 'x' : ' ') + '] ' + content.trim() + '\n';
  } });
  return '# ' + title.replace(/[\r\n]/g, ' ') + '\n\n' + service.turndown(html) + '\n';
}
export function exportNote(title: string, html: string) {
  const filename = Array.from(title || '未命名想法').map(char => char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char).join('').slice(0,100);
  downloadFile(filename + '.md', noteMarkdown(title, html), 'text/markdown;charset=utf-8');
}
