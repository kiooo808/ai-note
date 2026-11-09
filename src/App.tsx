import { useEffect, useRef, useState } from 'react';
import { LeftGraphPanel } from './components/GraphPanel';
import { RightEditorPanel } from './components/EditorPanel';
import { useGraphStore } from './store/graphStore';

function App() {
  const { projects, currentProjectId, initProjects, switchProject, createNewProject,
    exportBackupData, importBackupData, addNodeAtCenter, nodes, setActiveNode } = useGraphStore();
  const [view, setView] = useState('graph');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const projectInput = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  useEffect(() => { if (initialized.current) return; initialized.current = true; void initProjects().catch(() => setMessage('无法读取本机笔记，请刷新重试。')); }, [initProjects]);
  useEffect(() => { if (creating) projectInput.current?.focus(); }, [creating]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setMessage('');
    try { await action(); } catch { setMessage('操作未完成，请重试。'); }
    finally { setBusy(false); }
  }
  return <div className="workspace" data-view={view}>
    <header className="workspace-header">
      <a className="brand" href="#"><span className="brand-mark">n.</span><span>AI Note<small>把想法连接起来</small></span></a>
      <div className="project-switch"><label htmlFor="project">当前项目</label><select id="project" value={currentProjectId || ''} disabled={busy} onChange={e => void run(() => switchProject(e.target.value))}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="workspace-actions">
        <button disabled={busy} onClick={() => setCreating(true)}>＋ 项目</button>
        <button disabled={busy} onClick={() => void run(exportBackupData)}>导出备份</button>
        <label className="import-button">导入备份<input aria-label="导入备份" type="file" accept=".json,application/json" disabled={busy} onChange={e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
          if (!window.confirm('导入备份会替换本机全部项目和笔记。请确认已导出当前备份。')) return;
          void run(async () => { const ok = await importBackupData(await file.text()); setMessage(ok ? '备份已导入。' : '导入失败，请检查备份文件。'); });
        }} /></label>
      </div>
    </header>
    {message && <div role="status" className="notice">{message}<button aria-label="关闭提示" onClick={() => setMessage('')}>×</button></div>}
    <nav className="mobile-tabs" aria-label="工作区视图"><button aria-pressed={view === 'graph'} onClick={() => setView('graph')}>关系画布</button><button aria-pressed={view === 'note'} onClick={() => setView('note')}>笔记编辑</button></nav>
    <main className="workspace-body">
      <section className="graph-pane" aria-label="关系画布">
        <div className="pane-heading"><div><span className="eyebrow">YOUR IDEAS, CONNECTED</span><h1>关系画布 <small>{nodes.length} 个组件</small></h1></div><button className="primary" disabled={busy} onClick={() => void run(async () => { await addNodeAtCenter(null); setView('note'); })}>＋ 新建组件</button></div>
        <div className="node-search"><input aria-label="搜索组件" placeholder="搜索组件，快速找到一个想法…" value={query} onChange={e => setQuery(e.target.value)} />{query && <div className="search-results">{nodes.filter(n => String(n.data.label).toLowerCase().includes(query.toLowerCase())).map(n => <button key={n.id} onClick={() => { setActiveNode(n.id); setView('note'); setQuery(''); }}>{n.data.label}<span>打开 →</span></button>)}{!nodes.some(n => String(n.data.label).toLowerCase().includes(query.toLowerCase())) && <p>没有找到组件，试试其他关键词。</p>}</div>}</div>
        <div className="graph-canvas"><LeftGraphPanel onSelect={() => setView('note')} /></div><p className="canvas-hint">点击组件编辑 · 拖动整理位置 · 双链自动连接想法</p>
      </section>
      <section className="editor-pane" aria-label="笔记编辑"><RightEditorPanel /></section>
    </main>
    {creating && <div className="dialog-backdrop"><form className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onKeyDown={e => { if (e.key === 'Escape') setCreating(false); }} onSubmit={e => { e.preventDefault(); if (!projectName.trim()) return; void run(async () => { await createNewProject(projectName.trim()); setCreating(false); setProjectName(''); setView('graph'); }); }}><span className="eyebrow">A NEW SPACE</span><h2 id="new-project-title">给想法一个新空间</h2><label htmlFor="project-name">项目名称</label><input id="project-name" ref={projectInput} value={projectName} maxLength={80} onChange={e => setProjectName(e.target.value)} placeholder="例如：机器人学习笔记" required /><div className="dialog-actions"><button type="button" onClick={() => setCreating(false)}>取消</button><button className="primary" disabled={busy || !projectName.trim()}>创建项目</button></div></form></div>}
  </div>;
}
export default App;
