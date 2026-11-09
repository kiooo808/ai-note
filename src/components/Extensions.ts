import { Node, mergeAttributes } from '@tiptap/core';
export const WikiLink = Node.create({
  name: 'wikiLink', group: 'inline', inline: true, selectable: true, atom: true,
  addAttributes() {
    return {
      id: { default: null, parseHTML: el => el.getAttribute('data-id'), renderHTML: attrs => ({ 'data-id': attrs.id }) },
      title: { default: '', parseHTML: el => el.getAttribute('data-title') || el.textContent?.replace(/\[\[|\]\]/g, '') || '', renderHTML: attrs => ({ 'data-title': attrs.title }) }
    };
  },
  parseHTML() { return [{ tag: 'span[data-id]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'wiki-link-node', role: 'link', tabindex: '0' }), '↗ ' + (HTMLAttributes['data-title'] || '未命名想法')];
  }
});
