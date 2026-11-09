import { useEffect, useRef, useState } from 'react';
import { LeftGraphPanel } from './components/GraphPanel';
import { RightEditorPanel } from './components/EditorPanel';
import { Modal } from './components/Modal';
import { hasUnsavedChanges, useGraphStore } from './store/graphStore';
import { parseBackup, type Backup } from './backup';
type View = 'graph' | 'list' | 'note';
function App() {
  const { projects, currentProjectId, initProjects, switchProject, createNewProject, exportBackupData, importBackupData, addNodeAtCenter, notes, trash, setActiveNode, restoreNode, lastDeletedId, saveStatus, retrySave } = useGraphStore();
  const [view, setView] = useState<View>('graph'), [query, setQuery] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState(''), [creating, setCreating] = useState(false), [showTrash, setShowTrash] = useState(false);
  const [backup, setBackup] = useState<Backup | null>(null), [importMode, setImportMode] = useState<'merge' | 'replace'>('merge'), [confirmed, setConfirmed] = useState(false);
  const initialized = useRef(false);
  useEffect(() => { if (initialized.current) return; initialized.current = true; void initProjects().catch(() => setMessage('无法读取本机笔记，请刷新重试。')); }, [initProjects]);
  useEffect(() => { const before = (e: BeforeUnloadEvent) => { if (hasUnsavedChanges()) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before); }, []);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); } catch (e) { setMessage(e instanceof Error ? e.message : '操作未完成，请重试。'); }
    finally { setBusy(false); }
  }
  const open = (id: string) => { setActiveNode(id); setView('note'); setQuery(''); };
  const found = notes.filter(n => (n.title + ' ' + n.content.replace(/<[^>]*>/g, ' ')).toLowerCase().includes(query.toLowerCase()));
  const errors = Object.entries(saveStatus).filter(([,status]) => status === 'error');
  return <div className="workspace" data-view={view}>
    <header className="workspace-header">
      <a className="brand" href="#"><span className="brand-mark">↗</span><span>连接想法<small>每个想法，都有下一站</small></span></a>
      <div className="project-switch"><label htmlFor="project">当前项目</label><select id="project" value={currentProjectId || ''} disabled={busy} onChange={e => void run(async () => { await switchProject(e.target.value); setQuery(''); setView('list'); })}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="workspace-actions"><button disabled={busy} onClick={() => setCreating(true)}>＋ 项目</button><button disabled={busy} onClick={() => void run(exportBackupData)}>导出备份</button><label className="import-button">导入备份<input aria-label="导入备份" type="file" accept=".json,application/json" disabled={busy} onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        void run(async () => { if (file.size > 100 * 1024 * 1024) throw new Error('备份超过 100MB，请拆分后导入。'); const data = parseBackup(await file.text()); setBackup(data); setImportMode('merge'); setConfirmed(false); });
      }} /></label><button disabled={busy} onClick={() => setShowTrash(true)}>回收站{trash.length ? ' · ' + trash.length : ''}</button></div>
    </header>
    {message && <div role="status" className="notice">{message}<button aria-label="关闭提示" onClick={() => setMessage('')}>×</button></div>}
    {!!errors.length && <div role="alert" className="notice error-notice">有 {errors.length} 条笔记未保存成功，修改已保留。<button disabled={busy} onClick={() => void run(async () => { await Promise.all(errors.map(([id]) => retrySave(id))); })}>重试全部保存</button></div>}
    {lastDeletedId && <div className="notice" role="status">想法已移入回收站，原有连接已保留。<button disabled={busy} onClick={() => void run(() => restoreNode(lastDeletedId))}>撤销删除</button></div>}
    <nav className="mobile-tabs" aria-label="工作区视图"><button aria-pressed={view === 'graph'} onClick={() => setView('graph')}>关系画布</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}>笔记列表</button><button aria-pressed={view === 'note'} onClick={() => setView('note')}>笔记编辑</button></nav>
    <main className="workspace-body">
      <section className="graph-pane" aria-label="想法导航">
        <div className="pane-heading"><div><span className="eyebrow">YOUR IDEAS, CONNECTED</span><h1>{view === 'list' ? '笔记列表' : '关系画布'} <small>{notes.length} 个想法</small></h1></div><button className="primary" disabled={busy} onClick={() => void run(async () => { await addNodeAtCenter(null); setView('note'); })}>＋ 新建想法</button></div>
        <div className="navigation-options"><button aria-pressed={view !== 'list'} onClick={() => setView('graph')}>画布</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}>列表 · 最近编辑</button></div>
        <div className="node-search"><input aria-label="搜索想法" placeholder="搜索标题和正文…" value={query} onChange={e => setQuery(e.target.value)} />{query && view !== 'list' && <div className="search-results">{found.length ? found.map(n => <button key={n.id} onClick={() => open(n.id)}>{n.title || '未命名想法'}<span>打开 →</span></button>) : <p>没有找到想法，试试其他关键词。</p>}</div>}</div>
        <div className="graph-canvas" hidden={view === 'list'}><LeftGraphPanel onSelect={() => setView('note')} /></div>
        {view === 'list' && <div className="notes-list">{found.length ? found.map(n => <button className="note-card" key={n.id} onClick={() => open(n.id)}><strong>{n.title || '未命名想法'}</strong><span>{n.content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim().slice(0,120) || '还没有正文，写下第一个想法吧。'}</span><small>{new Date(n.updatedAt).toLocaleString('zh-CN')} · {edgesCount(n.id)} 条连接</small></button>) : <p className="list-empty">{query ? '没有找到匹配的想法。' : '还没有笔记，点击“新建想法”开始。'}</p>}</div>}
        <p className="canvas-hint">{view === 'list' ? '按最近编辑排序 · 点击打开笔记' : '点击想法编辑 · 拖动整理位置 · 引用自动建立连接'}</p>
      </section>
      <section className="editor-pane" aria-label="笔记编辑"><RightEditorPanel /></section>
    </main>
    {creating && <Modal title="给想法一个新空间" close={() => { if (!busy) setCreating(false); }}><form onSubmit={e => { e.preventDefault(); if (!projectName.trim()) return; void run(async () => { await createNewProject(projectName.trim()); setCreating(false); setProjectName(''); setView('note'); }); }}><label htmlFor="project-name">项目名称</label><input autoFocus id="project-name" value={projectName} maxLength={80} onChange={e => setProjectName(e.target.value)} placeholder="例如：阅读与灵感" required /><div className="dialog-actions"><button type="button" disabled={busy} onClick={() => setCreating(false)}>取消</button><button className="primary" disabled={busy || !projectName.trim()}>创建项目</button></div></form></Modal>}
    {backup && <Modal title="核对导入备份" close={() => { if (!busy) setBackup(null); }}><p>已校验：{backup.projects.length} 个项目、{backup.nodes.filter(n => !n.deletedAt).length} 条笔记、{backup.nodes.filter(n => !!n.deletedAt).length} 条回收站记录、{backup.edges.length} 条连接。</p><fieldset className="import-modes"><legend>导入方式</legend><label><input type="radio" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} />合并导入（推荐）<small>作为独立项目副本加入，保留本机全部内容。</small></label><label><input type="radio" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />替换全部数据<small>用备份替换本机项目、笔记和回收站。</small></label></fieldset>{importMode === 'replace' && <><button disabled={busy} onClick={() => void run(exportBackupData)}>先导出当前备份</button><label className="confirm-replace"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />我确认替换本机全部数据</label></>}<div className="dialog-actions"><button disabled={busy} onClick={() => setBackup(null)}>取消</button><button className="primary" disabled={busy || (importMode === 'replace' && !confirmed)} onClick={() => void run(async () => { await importBackupData(JSON.stringify(backup), importMode); setBackup(null); setQuery(''); setView('list'); setMessage('备份已导入。'); })}>{busy ? '导入中…' : '确认导入'}</button></div></Modal>}
    {showTrash && <Modal title="回收站" close={() => setShowTrash(false)}><p className="muted">当前项目 · 恢复后会重新显示原有连接。回收站不会自动清空。</p><div className="trash-list">{trash.length ? trash.map(n => <article key={n.id}><div><strong>{n.title || '未命名想法'}</strong><small>{new Date(n.deletedAt!).toLocaleString('zh-CN')}</small></div><button disabled={busy} onClick={() => void run(() => restoreNode(n.id))}>恢复</button></article>) : <p>回收站是空的。</p>}</div></Modal>}
  </div>;
}
function edgesCount(id: string) { return useGraphStore.getState().edges.filter(e => e.source === id || e.target === id).length; }
export default App;
