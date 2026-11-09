# AI Note

用关系画布和双链组织项目笔记。数据保存在当前浏览器的 IndexedDB 中；不同设备之间需要通过导出、导入备份转移，当前没有云同步或 AI 模型调用。

## 使用

- 电脑：左侧搜索、整理组件，右侧编辑笔记。
- 手机：通过「关系画布 / 笔记编辑」切换视图，点击组件自动进入编辑。
- 编辑区支持加粗、斜体、标题、列表、撤销和重做。
- 引用组件后自动建立关联，可从反向引用跳转。
- 导入备份会替换本机全部项目与笔记，请先导出当前备份。

## 本地运行

```sh
npm ci
npm run dev
```

## 检查与发布

```sh
npm run build
npm run lint
```

项目使用 Vite、React、TypeScript、Tiptap、React Flow、Dexie 和 Zustand。
`vite.config.ts` 的 base 为 `/ai-note/`。`npm run deploy` 会构建并把 dist 发布到 GitHub Pages 的 gh-pages 分支。
