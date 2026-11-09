import { create } from 'zustand';
import { type Node, type Edge, applyNodeChanges, applyEdgeChanges, type OnNodesChange, type OnEdgesChange, type ReactFlowInstance } from 'reactflow';
import { db, type Project, type NoteNode } from '../db';
import { cleanHTML, downloadFile, mergeBackup, parseBackup, referenceIds } from '../backup';
export type SaveStatus = 'saving' | 'saved' | 'error';
interface Snapshot { id: string; projectId: string; title: string; content: string }
interface GraphState {
  projects: Project[]; currentProjectId: string | null; nodes: Node[]; edges: Edge[];
  notes: NoteNode[]; trash: NoteNode[]; lastDeletedId: string | null; activeNodeId: string | null; saveStatus: Record<string, SaveStatus>;
  onNodesChange: OnNodesChange; onEdgesChange: OnEdgesChange; setActiveNode: (id: string | null) => void;
  initProjects: () => Promise<void>; switchProject: (id: string) => Promise<void>; createNewProject: (name: string) => Promise<void>;
  loadGraphFromDB: () => Promise<void>; syncNodeContent: (id: string, title: string, content: string) => Promise<void>;
  flushSaves: () => Promise<void>; retrySave: (id: string) => Promise<void>;
  deleteNode: (id: string) => Promise<void>; restoreNode: (id: string) => Promise<void>;
  exportBackupData: () => Promise<void>; importBackupData: (json: string, mode?: 'merge' | 'replace') => Promise<void>;
  addNodeAtCenter: (instance: ReactFlowInstance | null) => Promise<void>;
}
const pending = new Map<string, Snapshot>();
const tasks = new Map<string, Promise<void>>();
const key = (id: string) => 'connected-ideas-pending:' + id;
let queue: Promise<void> = Promise.resolve();
let initTask: Promise<void> | undefined;
function setStatus(id: string, status: SaveStatus) {
  useGraphStore.setState(state => ({ saveStatus: { ...state.saveStatus, [id]: status } }));
}
function enqueue(snapshot: Snapshot) {
  pending.set(snapshot.id, snapshot);
  // A synchronous recovery copy protects edits even before IndexedDB finishes.
  try { localStorage.setItem(key(snapshot.id), JSON.stringify(snapshot)); } catch { /* IndexedDB still receives the edit immediately. */ }
  setStatus(snapshot.id, 'saving');
  const task = queue.then(async () => {
    await db.transaction('rw', [db.nodes, db.edges, db.backlinks], async () => {
      const old = await db.nodes.get(snapshot.id);
      if (!old || old.projectId !== snapshot.projectId || old.deletedAt) throw new Error('笔记已移入回收站或不存在。');
      const body = new DOMParser().parseFromString(snapshot.content, 'text/html');
      const referenced = await db.nodes.bulkGet(referenceIds(snapshot.content));
      body.querySelectorAll('.wiki-link-node[data-id]').forEach(el => {
        const target = referenced.find(n => n?.id === el.getAttribute('data-id'));
        if (target && target.projectId === snapshot.projectId) {
          const title = target.id === snapshot.id ? snapshot.title : target.title;
          el.setAttribute('data-title', title); el.textContent = title;
        }
      });
      await db.nodes.update(snapshot.id, { title: snapshot.title, content: body.body.innerHTML, updatedAt: Date.now() });
      if (old.title !== snapshot.title) {
        const sources = await db.nodes.where('projectId').equals(snapshot.projectId).toArray();
        for (const source of sources.filter(n => n.id !== snapshot.id)) {
          const doc = new DOMParser().parseFromString(source.content, 'text/html');
          let changed = false;
          doc.querySelectorAll('.wiki-link-node[data-id]').forEach(el => {
            if (el.getAttribute('data-id') === snapshot.id) {
              el.setAttribute('data-title', snapshot.title); el.textContent = snapshot.title; changed = true;
            }
          });
          if (changed) await db.nodes.update(source.id, { content: doc.body.innerHTML });
        }
      }
      const targetIds = referenceIds(snapshot.content);
      const targets = await db.nodes.bulkGet(targetIds);
      await db.edges.where('source').equals(snapshot.id).delete();
      await db.backlinks.where('sourceId').equals(snapshot.id).delete();
      for (const target of targets) if (target && target.projectId === snapshot.projectId) {
        await db.edges.put({ id: snapshot.id + '->' + target.id, projectId: snapshot.projectId, source: snapshot.id, target: target.id, relation: 'references' });
        await db.backlinks.add({ projectId: snapshot.projectId, sourceId: snapshot.id, targetId: target.id });
      }
    });
    if (pending.get(snapshot.id) === snapshot) {
      pending.delete(snapshot.id);
      try { localStorage.removeItem(key(snapshot.id)); } catch { /* Recovery may be unavailable. */ }
      setStatus(snapshot.id, 'saved');
    }
  }).catch(() => { if (pending.get(snapshot.id) === snapshot) setStatus(snapshot.id, 'error'); });
  queue = task;
  tasks.set(snapshot.id, task);
  return task.then(async () => { if (!pending.has(snapshot.id)) await useGraphStore.getState().loadGraphFromDB(); });
}
export const useGraphStore = create<GraphState>((set, get) => ({
  projects: [], currentProjectId: null, nodes: [], edges: [], notes: [], trash: [], lastDeletedId: null, activeNodeId: null, saveStatus: {},
  onNodesChange: changes => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: changes => set({ edges: applyEdgeChanges(changes, get().edges) }),
  setActiveNode: id => set({ activeNodeId: id }),
  initProjects: () => {
    if (initTask) return initTask;
    initTask = (async () => {
      let projects = await db.projects.toArray();
      if (!projects.length) {
        const time = Date.now();
        const project = { id: crypto.randomUUID(), name: '我的想法', createdAt: time };
        await db.transaction('rw', [db.projects, db.nodes], async () => {
          await db.projects.add(project);
          await db.nodes.add({ id: crypto.randomUUID(), projectId: project.id, title: '第一个想法', type: 'concept', content: '<h1>把想法连接起来</h1><p>写下一条笔记，再通过引用建立连接。</p>', position: { x: 150, y: 150 }, tags: [], createdAt: time, updatedAt: time });
        });
        projects = [project];
      }
      const currentId = projects.some(p => p.id === get().currentProjectId) ? get().currentProjectId : projects[0].id;
      set({ projects, currentProjectId: currentId, activeNodeId: null });
      const recoveries: Snapshot[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const name = localStorage.key(i)!;
          if (!name.startsWith('connected-ideas-pending:')) continue;
          try { const s = JSON.parse(localStorage.getItem(name)!); if (typeof s.id === 'string' && typeof s.projectId === 'string' && typeof s.title === 'string' && typeof s.content === 'string') recoveries.push(s); } catch { /* Ignore an unreadable recovery record without deleting it. */ }
        }
      } catch { /* IndexedDB remains usable without localStorage. */ }
      for (const s of recoveries) { const node = await db.nodes.get(s.id); if (node && !node.deletedAt && node.projectId === s.projectId) await enqueue(s); }
      await get().loadGraphFromDB();
    })().finally(() => { initTask = undefined; });
    return initTask;
  },
  createNewProject: async name => {
    await get().flushSaves();
    const time = Date.now(), project = { id: crypto.randomUUID(), name, createdAt: time };
    await db.projects.add(project);
    set({ projects: await db.projects.toArray(), currentProjectId: project.id, activeNodeId: null });
    await get().addNodeAtCenter(null);
  },
  switchProject: async projectId => {
    await get().flushSaves();
    if (!await db.projects.get(projectId)) throw new Error('项目不存在。');
    set({ currentProjectId: projectId, activeNodeId: null }); await get().loadGraphFromDB();
  },
  loadGraphFromDB: async () => {
    const projectId = get().currentProjectId; if (!projectId) return;
    const [all, edges] = await Promise.all([db.nodes.where('projectId').equals(projectId).toArray(), db.edges.where('projectId').equals(projectId).toArray()]);
    if (get().currentProjectId !== projectId) return;
    const notes = all.filter(n => !n.deletedAt).map(n => pending.has(n.id) ? { ...n, ...pending.get(n.id) } : n).sort((a,b) => b.updatedAt - a.updatedAt);
    const live = new Set(notes.map(n => n.id));
    set({ notes, trash: all.filter(n => !!n.deletedAt).sort((a,b) => b.deletedAt! - a.deletedAt!),
      nodes: notes.map(n => ({ id: n.id, type: 'default', position: n.position || { x: 150, y: 150 }, data: { label: n.title } })),
      edges: edges.filter(e => live.has(e.source) && live.has(e.target)).map(e => ({ id: e.id, source: e.source, target: e.target, label: e.relation, animated: true })) });
  },
  syncNodeContent: (id, title, content) => {
    const projectId = get().notes.find(n => n.id === id)?.projectId;
    if (!projectId) return Promise.resolve();
    const snapshot = { id, projectId, title, content };
    set({ nodes: get().nodes.map(n => n.id === id ? { ...n, data: { ...n.data, label: title } } : n), notes: get().notes.map(n => n.id === id ? { ...n, title, content, updatedAt: Date.now() } : n) });
    return enqueue(snapshot);
  },
  flushSaves: async () => {
    await Promise.all([...tasks.values()]);
    if (pending.size) throw new Error('仍有笔记未保存成功，请重试保存后继续。');
  },
  retrySave: async id => { const snapshot = pending.get(id); if (snapshot) await enqueue(snapshot); },
  addNodeAtCenter: async instance => {
    const projectId = get().currentProjectId; if (!projectId) return;
    const count = get().nodes.length;
    const position = instance ? instance.screenToFlowPosition({ x: window.innerWidth / 4, y: window.innerHeight / 2 }) : { x: 150 + (count % 3) * 190, y: 150 + Math.floor(count / 3) * 110 };
    const time = Date.now(), id = crypto.randomUUID();
    await db.nodes.add({ id, projectId, title: '未命名想法', type: 'concept', content: '', position, tags: [], createdAt: time, updatedAt: time });
    await get().loadGraphFromDB(); set({ activeNodeId: id });
  },
  deleteNode: async id => {
    await get().flushSaves();
    await db.nodes.update(id, { deletedAt: Date.now() });
    set({ lastDeletedId: id });
    if (get().activeNodeId === id) set({ activeNodeId: null });
    await get().loadGraphFromDB();
  },
  restoreNode: async id => {
    await db.nodes.update(id, { deletedAt: undefined }); set({ lastDeletedId: null }); await get().loadGraphFromDB();
  },
  exportBackupData: async () => {
    await get().flushSaves();
    const data = await db.transaction('r', [db.projects, db.nodes, db.edges], async () => ({ version: 3, projects: await db.projects.toArray(), nodes: await db.nodes.toArray(), edges: await db.edges.toArray() }));
    downloadFile('连接想法备份_' + new Date().toISOString().slice(0,10) + '.json', JSON.stringify(data), 'application/json');
  },
  importBackupData: async (json, mode = 'merge') => {
    const validated = parseBackup(json), data = mode === 'merge' ? mergeBackup(validated) : validated;
    await get().flushSaves();
    await db.transaction('rw', [db.projects, db.nodes, db.edges, db.backlinks], async () => {
      if (mode === 'replace') { await db.projects.clear(); await db.nodes.clear(); await db.edges.clear(); await db.backlinks.clear(); }
      await db.projects.bulkAdd(data.projects); await db.nodes.bulkAdd(data.nodes);
      await db.edges.bulkAdd(data.edges);
      for (const n of data.nodes) for (const target of referenceIds(n.content)) {
        await db.edges.put({ id: n.id + '->' + target, source: n.id, target, projectId: n.projectId, relation: 'references' });
        await db.backlinks.add({ sourceId: n.id, targetId: target, projectId: n.projectId });
      }
    });
    set({ currentProjectId: data.projects[0].id, activeNodeId: null, saveStatus: {} });
    await get().initProjects();
  }
}));
export function hasUnsavedChanges() { return pending.size > 0; }
export function recoveredContent(id: string) { return pending.get(id); }
export { cleanHTML };
