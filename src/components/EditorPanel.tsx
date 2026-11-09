import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { WikiLink } from './Extensions';
import { useGraphStore } from '../store/graphStore';
import type { NoteNode } from '../db';
import { exportNote } from '../markdown';
import { cleanHTML } from '../backup';
import { Modal } from './Modal';
export function RightEditorPanel() {
  const id = useGraphStore(s => s.activeNodeId);
  const note = useGraphStore(s => s.notes.find(n => n.id === id));
  return note ? <NoteEditor key={note.id} note={note} /> : <div className="editor-empty"><span>↗</span><h2>给想法留个位置</h2><p>从画布或笔记列表选择一个想法，开始记录，再用引用把它们连接起来。</p><small>保存在当前浏览器 · 支持导出备份</small></div>;
}
function NoteEditor({ note }: { note: NoteNode }) {
  const { notes, edges, saveStatus, syncNodeContent, deleteNode, retrySave, setActiveNode } = useGraphStore();
  const imageInput = useRef<HTMLInputElement>(null);
  const [picker, setPicker] = useState(false), [query, setQuery] = useState(''), [deleting, setDeleting] = useState(false), [message, setMessage] = useState('');
  const editor = useEditor({
    extensions: [StarterKit, WikiLink, Image.configure({ allowBase64: true }), TaskList, TaskItem.configure({ nested: true, a11y: { checkboxLabel: (_node, checked) => checked ? '任务已完成' : '任务未完成' } }), Placeholder.configure({ placeholder: '写下一个想法，或引用另一条笔记…' })],
    content: cleanHTML(note.content),
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { role: 'textbox', 'aria-label': '笔记正文', 'aria-multiline': 'true' } },
    onUpdate: ({ editor }) => { const n = useGraphStore.getState().notes.find(n => n.id === note.id) || note; void syncNodeContent(n.id, n.title, editor.getHTML()); }
  });
  const status = saveStatus[note.id] || 'saved';
  const available = notes.filter(n => n.id !== note.id && n.title.toLowerCase().includes(query.toLowerCase()));
  const sources = notes.filter(n => edges.some(e => e.source === n.id && e.target === note.id));
  const toolbar = [
    { label: '加粗', text: 'B', active: editor?.isActive('bold'), run: () => editor?.chain().focus().toggleBold().run() },
    { label: '斜体', text: 'I', active: editor?.isActive('italic'), run: () => editor?.chain().focus().toggleItalic().run() },
    { label: '二级标题', text: 'H2', active: editor?.isActive('heading', { level: 2 }), run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: '无序列表', text: '列表', active: editor?.isActive('bulletList'), run: () => editor?.chain().focus().toggleBulletList().run() },
    { label: '任务清单', text: '☑ 任务', active: editor?.isActive('taskList'), run: () => editor?.chain().focus().toggleTaskList().run() },
    { label: '代码块', text: '</>', active: editor?.isActive('codeBlock'), run: () => editor?.chain().focus().toggleCodeBlock().run() },
  ];
  async function insertImage(file?: File) {
    if (!file || !editor) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) { setMessage('请选择不超过 5MB 的 PNG、JPEG、WebP 或 GIF 图片。'); return; }
    try {
      const data = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      if (!editor.isDestroyed) editor.chain().focus().setImage({ src: data, alt: file.name }).run();
      setMessage('图片已嵌入笔记，会随备份一起导出。');
    } catch { setMessage('图片读取失败，请重试。'); }
  }
  return <div className="note-editor">
    <header className="note-header"><div className="note-meta"><span className="eyebrow">CONNECTED IDEAS</span><span role="status" className={'save-status ' + status}>{status === 'saving' ? '保存中…' : status === 'error' ? '保存失败，修改已保留' : '已保存到本机'}</span>{status === 'error' && <button onClick={() => void retrySave(note.id)}>重试保存</button>}</div>
      <input className="note-title" aria-label="笔记标题" value={note.title} placeholder="给想法起个名字" onChange={e => { void syncNodeContent(note.id, e.target.value, editor?.getHTML() || note.content); }} />
      <div className="note-actions"><button onClick={() => { setQuery(''); setPicker(true); }}>↗ 引用想法</button><button onClick={() => exportNote(note.title, editor?.getHTML() || note.content)}>导出 Markdown</button><button className="danger-text" onClick={() => setDeleting(true)}>移入回收站</button></div>
    </header>
    {message && <p className="editor-message" role="status">{message}<button aria-label="关闭编辑提示" onClick={() => setMessage('')}>×</button></p>}
    <div className="note-scroll"><div className="editor-surface">
      <div className="editor-toolbar" role="toolbar" aria-label="正文格式">{toolbar.map(t => <button key={t.label} title={t.label} aria-label={t.label} aria-pressed={!!t.active} onClick={t.run}>{t.text}</button>)}<button onClick={() => imageInput.current?.click()}>图片</button><button aria-label="撤销" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}>撤销</button><button aria-label="重做" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}>重做</button></div>
      <input className="visually-hidden" ref={imageInput} aria-label="选择笔记图片" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { void insertImage(e.target.files?.[0]); e.target.value = ''; }} />
      <div onClick={e => { const link = (e.target as HTMLElement).closest('.wiki-link-node[data-id]'); const id = link?.getAttribute('data-id'); if (id) { if (notes.some(n => n.id === id)) setActiveNode(id); else setMessage('这个想法在回收站中，恢复后可再次打开。'); } }} onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).classList.contains('wiki-link-node')) { e.preventDefault(); (e.target as HTMLElement).click(); } }}><EditorContent editor={editor} /></div>
    </div><section className="backlinks"><h3>连接到这里 <small>{sources.length}</small></h3>{sources.length ? sources.map(n => <button key={n.id} onClick={() => setActiveNode(n.id)}>↗ {n.title || '未命名想法'}</button>) : <p>其他笔记引用这个想法后，会显示在这里。</p>}</section></div>
    {picker && <Modal title="引用一个想法" close={() => setPicker(false)}><input autoFocus aria-label="搜索引用想法" placeholder="搜索想法标题…" value={query} onChange={e => setQuery(e.target.value)} /><div className="picker-results">{available.length ? available.map(n => <button key={n.id} onClick={() => { editor?.chain().focus().insertContent({ type: 'wikiLink', attrs: { id: n.id, title: n.title } }).run(); setPicker(false); }}>↗ {n.title || '未命名想法'}</button>) : <p>{query ? '没有找到匹配的想法，换个关键词试试。' : '还没有其他想法，先新建一条笔记吧。'}</p>}</div><p className="muted">用 Tab 选择，按 Enter 引用，Esc 关闭。</p></Modal>}
    {deleting && <Modal title="移入回收站？" close={() => setDeleting(false)}><p>「{note.title || '未命名想法'}」和原有连接都会保留，可以随时从回收站恢复。</p><div className="dialog-actions"><button onClick={() => setDeleting(false)}>取消</button><button className="primary" onClick={() => { void deleteNode(note.id).catch((e: Error) => { setMessage(e.message); setDeleting(false); }); }}>确认移入回收站</button></div></Modal>}
  </div>;
}
