import DOMPurify from 'dompurify';
import type { Project, NoteNode, NoteEdge } from './db';
export interface Backup { version: number; projects: Project[]; nodes: NoteNode[]; edges: NoteEdge[] }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const id = (v: unknown): v is string => text(v) && v.length > 0 && v.length <= 200;
export function cleanHTML(html: string) {
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-id', 'data-title', 'data-type', 'data-checked'], FORBID_ATTR: ['style'] });
}
export function parseBackup(json: string): Backup {
  const data: unknown = JSON.parse(json);
  if (!record(data) || (data.version !== 2 && data.version !== 3) || !Array.isArray(data.projects) || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('备份版本或结构不正确，仅支持版本 2 和 3。');
  const projects: Project[] = data.projects.map(p => {
    if (!record(p) || !id(p.id) || !text(p.name) || !p.name.trim() || !finite(p.createdAt)) throw new Error('项目数据不完整。');
    return { id: p.id, name: p.name, createdAt: p.createdAt };
  });
  const projectIds = new Set(projects.map(p => p.id));
  if (!projects.length || projectIds.size !== projects.length) throw new Error('备份中的项目为空或编号重复。');
  const nodes: NoteNode[] = data.nodes.map(n => {
    if (!record(n) || !id(n.id) || !text(n.projectId) || !projectIds.has(n.projectId) || !text(n.title) || !text(n.content) || !text(n.type) || !Array.isArray(n.tags) || !n.tags.every(text) || !finite(n.createdAt) || !finite(n.updatedAt) || (n.deletedAt !== undefined && !finite(n.deletedAt)) || (n.position !== undefined && (!record(n.position) || !finite(n.position.x) || !finite(n.position.y)))) throw new Error('笔记数据不完整或所属项目不存在。');
    return { id: n.id, projectId: n.projectId, title: n.title, content: cleanHTML(n.content), type: n.type, tags: n.tags, createdAt: n.createdAt, updatedAt: n.updatedAt, ...(n.deletedAt !== undefined ? { deletedAt: n.deletedAt } : {}), ...(n.position ? { position: { x: (n.position as {x:number}).x, y: (n.position as {y:number}).y } } : {}) };
  });
  const byId = new Map(nodes.map(n => [n.id, n]));
  if (byId.size !== nodes.length) throw new Error('笔记编号重复。');
  const edges: NoteEdge[] = data.edges.map(e => {
    if (!record(e) || !id(e.id) || !text(e.projectId) || !text(e.source) || !text(e.target) || !text(e.relation) || byId.get(e.source)?.projectId !== e.projectId || byId.get(e.target)?.projectId !== e.projectId) throw new Error('关联数据指向不存在的笔记或跨越项目。');
    return { id: e.id, projectId: e.projectId, source: e.source, target: e.target, relation: e.relation };
  });
  if (new Set(edges.map(e => e.id)).size !== edges.length) throw new Error('关联编号重复。');
  for (const n of nodes) for (const target of referenceIds(n.content)) {
    if (byId.get(target)?.projectId !== n.projectId) throw new Error('正文中的引用指向不存在的笔记或跨越项目。');
  }
  return { version: 3, projects, nodes, edges };
}
export function referenceIds(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...new Set(Array.from(doc.querySelectorAll('.wiki-link-node[data-id]')).map(el => el.getAttribute('data-id')!).filter(Boolean))];
}
export function mergeBackup(data: Backup): Backup {
  const projects = new Map(data.projects.map(p => [p.id, crypto.randomUUID()]));
  const nodes = new Map(data.nodes.map(n => [n.id, crypto.randomUUID()]));
  return { version: 3,
    projects: data.projects.map(p => ({ ...p, id: projects.get(p.id)!, name: p.name + '（导入）' })),
    nodes: data.nodes.map(n => {
      const doc = new DOMParser().parseFromString(n.content, 'text/html');
      doc.querySelectorAll('.wiki-link-node[data-id]').forEach(el => el.setAttribute('data-id', nodes.get(el.getAttribute('data-id')!)!));
      return { ...n, id: nodes.get(n.id)!, projectId: projects.get(n.projectId)!, content: doc.body.innerHTML };
    }),
    edges: data.edges.map(e => ({ ...e, id: crypto.randomUUID(), projectId: projects.get(e.projectId)!, source: nodes.get(e.source)!, target: nodes.get(e.target)! }))
  };
}
export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
