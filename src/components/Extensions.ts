import { Node, mergeAttributes } from '@tiptap/core';

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  selectable: true, // 👈 变成可被整体选中的实体
  atom: true,       // 👈 核心：声明为原子节点，退格键（Backspace）会将其整个删除，不再会卡碎字符

  addAttributes() {
    return {
      id: { default: null },
      title: { default: '' },
    };
  },

  // 1. 解析数据库或初始化时读入的 HTML 标签
  parseHTML() {
    return [
      {
        tag: 'span[data-id]',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          return {
            id: element.getAttribute('data-id'),
            title: element.getAttribute('data-title') || element.textContent?.replace(/\[\[|\]\]/g, '') || '',
          };
        },
      },
    ];
  },

  // 2. 核心重构：彻底抛弃死板的括号，升级为现代语义化的“药丸（Pill）”外观
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'wiki-link-node',
        'data-id': HTMLAttributes.id,
        'data-title': HTMLAttributes.title,
        style: `
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background-color: #e1f5fe;
          color: #0071e3;
          padding: 2px 8px;
          margin: 0 3px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          user-select: none;
          transition: all 0.2s ease-in-out;
          border: 1px solid rgba(0, 113, 227, 0.15);
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        `,
        // 动态注入一个优雅的小图标，增强辨识度
        onmouseenter: "this.style.backgroundColor='#0071e3'; this.style.color='#ffffff'; this.style.boxShadow='0 2px 6px rgba(0,113,227,0.3)';",
        onmouseleave: "this.style.backgroundColor='#e1f5fe'; this.style.color='#0071e3'; this.style.boxShadow='0 1px 2px rgba(0,0,0,0.05)';"
      }),
      `🔗 ${HTMLAttributes.title}`, // 👈 去掉难看的 [[ ]] 括号，改为优雅的前置小图标 + 组件名
    ];
  },
});
