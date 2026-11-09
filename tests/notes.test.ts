import Dexie from 'dexie';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { WikiLink } from '../src/components/Extensions';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type NoteNode } from '../src/db';
import { useGraphStore, hasUnsavedChanges } from '../src/store/graphStore';
import { parseBackup, mergeBackup } from '../src/backup';
import { noteMarkdown } from '../src/markdown';
const store = () => useGraphStore.getState();
const project = { id: 'p', name: '项目', createdAt: 1 };
const node = (id: string, content = ''): NoteNode => ({ id, projectId: 'p', title: id, type: 'concept', content, tags: [], createdAt: 1, updatedAt: 1 });
const link = '<span class="wiki-link-node" data-id="b" data-title="b">b</span>';
const sample = () => ({ version: 2, projects: [project], nodes: [node('a', '<p>' + link + '</p>'), node('b')], edges: [{ id: 'a->b', projectId: 'p', source: 'a', target: 'b', relation: 'references' }] });
beforeEach(async () => {
  vi.restoreAllMocks();
  await store().flushSaves();
  await db.transaction('rw', [db.projects, db.nodes, db.edges, db.backlinks], async () => {
    await db.projects.clear(); await db.nodes.clear(); await db.edges.clear(); await db.backlinks.clear();
    await db.projects.add(project); await db.nodes.bulkAdd([node('a'), node('b')]);
  });
  localStorage.clear();
  useGraphStore.setState({ projects: [project], currentProjectId: 'p', activeNodeId: null, saveStatus: {}, lastDeletedId: null });
  await store().loadGraphFromDB();
});
describe('reliable saving', () => {
  it('retains the final edit of each note when editing and switching rapidly', async () => {
    const a = store().syncNodeContent('a', 'A1', '<p>first</p>');
    store().setActiveNode('b');
    const b = store().syncNodeContent('b', 'B', '<p>second</p>');
    const last = store().syncNodeContent('a', 'A2', '<p>latest</p>');
    await Promise.all([a,b,last]); await store().flushSaves();
    expect(await db.nodes.get('a')).toMatchObject({ title: 'A2', content: '<p>latest</p>' });
    expect(await db.nodes.get('b')).toMatchObject({ title: 'B', content: '<p>second</p>' });
    expect(hasUnsavedChanges()).toBe(false);
    expect(store().saveStatus).toMatchObject({ a: 'saved', b: 'saved' });
  });
  it('retains failed edits and succeeds when retried', async () => {
    const update = vi.spyOn(db.nodes, 'update').mockRejectedValueOnce(new Error('quota'));
    await store().syncNodeContent('a', 'Keep', '<p>unsaved</p>');
    expect(store().saveStatus.a).toBe('error');
    expect(localStorage.getItem('connected-ideas-pending:a')).toContain('unsaved');
    await expect(store().flushSaves()).rejects.toThrow('未保存');
    update.mockRestore(); await store().retrySave('a'); await store().flushSaves();
    expect((await db.nodes.get('a'))?.title).toBe('Keep');
    expect(localStorage.getItem('connected-ideas-pending:a')).toBeNull();
  });
  it('replays a recovery snapshot after reinitialization', async () => {
    localStorage.setItem('connected-ideas-pending:a', JSON.stringify({ id: 'a', projectId: 'p', title: 'Recovered', content: '<p>recovered</p>' }));
    await store().initProjects();
    expect((await db.nodes.get('a'))?.title).toBe('Recovered');
  });
  it('saves body and reference indices together and keeps titles synchronized', async () => {
    await store().syncNodeContent('a', 'A', '<p>' + link + '</p>');
    expect(await db.backlinks.count()).toBe(1);
    await store().syncNodeContent('b', 'Renamed', '<p>B</p>');
    expect((await db.nodes.get('a'))?.content).toContain('data-title="Renamed"');
  });
});
describe('recoverable deletion', () => {
  it('keeps references in trash and restores connections without erasing source text', async () => {
    await store().syncNodeContent('a', 'A', '<p>Before ' + link + ' after</p>');
    await store().deleteNode('b');
    expect(store().notes.map(n => n.id)).toEqual(['a']);
    expect(store().edges).toHaveLength(0);
    expect(store().trash[0].id).toBe('b');
    expect((await db.nodes.get('a'))?.content).toContain('data-id="b"');
    await store().restoreNode('b');
    expect(store().trash).toHaveLength(0); expect(store().edges).toHaveLength(1);
  });
});
describe('backup validation and import', () => {
  it('supports version 2 and rejects unsupported, duplicate, dangling and cross-project data', () => {
    expect(parseBackup(JSON.stringify(sample())).nodes).toHaveLength(2);
    expect(() => parseBackup(JSON.stringify({ ...sample(), version: 99 }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...sample(), nodes: [node('a'),node('a')] }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...sample(), nodes: [node('a')] }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...sample(), nodes: [node('a',link), { ...node('b'), projectId: 'missing' }] }))).toThrow();
  });
  it('sanitizes imported executable content without dropping reference IDs', () => {
    const data = sample(); data.nodes[0].content += '<script>alert(1)</script><img src="x" onerror="alert(1)">';
    const parsed = parseBackup(JSON.stringify(data));
    expect(parsed.nodes[0].content).not.toMatch(/<script|onerror/);
    expect(parsed.nodes[0].content).toContain('data-id="b"');
  });
  it('merges collisions as independent copies and remaps inline links', async () => {
    await store().importBackupData(JSON.stringify(sample()), 'merge');
    expect(await db.projects.count()).toBe(2); expect(await db.nodes.count()).toBe(4);
    const imported = await db.nodes.where('projectId').equals(store().currentProjectId!).toArray();
    const a = imported.find(n => n.title === 'a')!, b = imported.find(n => n.title === 'b')!;
    expect(a.content).toContain('data-id="' + b.id + '"'); expect(a.id).not.toBe('a');
    expect(await db.backlinks.count()).toBe(1);
  });
  it('keeps trash and remaps every project, node and edge when merging', () => {
    const input = sample(); input.nodes[1].deletedAt = 123;
    const result = mergeBackup(parseBackup(JSON.stringify(input)));
    expect(result.nodes[1].deletedAt).toBe(123);
    expect(result.edges[0].source).toBe(result.nodes[0].id);
    expect(result.edges[0].target).toBe(result.nodes[1].id);
  });
  it('rejects bad backups before modifying existing data', async () => {
    await expect(store().importBackupData('{"projects":[]}', 'replace')).rejects.toThrow();
    expect(await db.nodes.count()).toBe(2); expect(await db.projects.count()).toBe(1);
  });
  it('rolls back the entire replacement if any write fails', async () => {
    vi.spyOn(db.nodes, 'bulkAdd').mockRejectedValueOnce(new Error('write failed'));
    await expect(store().importBackupData(JSON.stringify(sample()), 'replace')).rejects.toThrow('write failed');
    expect(await db.nodes.count()).toBe(2); expect((await db.projects.get('p'))?.name).toBe('项目');
  });
  it('rebuilds reference indices on replacement even with a legacy missing index', async () => {
    await store().importBackupData(JSON.stringify(sample()), 'replace');
    expect(await db.backlinks.count()).toBe(1); expect(store().edges).toHaveLength(1);
  });
});
it('exports Markdown with tasks, fenced code, images and wiki references', () => {
  const html = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div><p>Done</p></div></li></ul><pre><code>const a = 1;</code></pre><p>' + link + '</p><img src="data:image/png;base64,aGVsbG8=" alt="image">';
  const md = noteMarkdown('Title', html);
  expect(md).toContain('- [x] Done'); expect(md).toContain('```'); expect(md).toContain('[[b]]'); expect(md).toContain('data:image/png;base64,aGVsbG8=');
});


it('keeps pending edits bound to their original project while switching', async () => {
  await db.projects.add({ id: 'other', name: 'Other', createdAt: 2 });
  await db.nodes.add({ ...node('other-note'), projectId: 'other' });
  const save = store().syncNodeContent('a', 'Original project edit', '<p>saved</p>');
  await store().switchProject('other'); await save;
  expect(store().notes.map(n => n.id)).toEqual(['other-note']);
  expect((await db.nodes.get('a'))?.projectId).toBe('p');
  expect((await db.nodes.get('a'))?.title).toBe('Original project edit');
});
it('uses the latest target title when an old source snapshot is saved later', async () => {
  const rename = store().syncNodeContent('b', 'Latest name', '<p>b</p>');
  const source = store().syncNodeContent('a', 'A', '<p>' + link + '</p>');
  await Promise.all([rename,source]);
  expect((await db.nodes.get('a'))?.content).toContain('data-title="Latest name"');
});
it('round trips editor images, checked tasks and references without inferred bold styling', () => {
  const extensions = [StarterKit, Image.configure({ allowBase64: true }), TaskList, TaskItem, WikiLink];
  const editor = new Editor({ extensions, content: '<p>Task</p>' });
  editor.commands.toggleTaskList(); editor.commands.updateAttributes('taskItem', { checked: true });
  editor.commands.insertContent({ type: 'wikiLink', attrs: { id: 'b', title: 'Target' } });
  editor.commands.setImage({ src: 'data:image/png;base64,aGVsbG8=', alt: 'test' });
  const html = editor.getHTML();
  const restored = new Editor({ extensions, content: html });
  expect(restored.getHTML()).toContain('data-checked="true"');
  expect(restored.getHTML()).toContain('data-id="b"');
  expect(restored.getHTML()).toContain('data:image/png;base64,aGVsbG8=');
  expect(restored.getHTML()).not.toContain('<strong>');
  expect(noteMarkdown('Title', html)).toContain('[[Target]]');
  editor.destroy(); restored.destroy();
});
it('creates fenced code blocks in the editor', () => {
  const editor = new Editor({ extensions: [StarterKit], content: '<p>const n = 1;</p>' });
  editor.commands.toggleCodeBlock();
  expect(noteMarkdown('Code', editor.getHTML())).toContain('```\nconst n = 1;\n```');
  editor.destroy();
});
it('upgrades old defaults without changing user-authored notes or the database name', async () => {
  await db.delete();
  const legacy = new Dexie('AiGraphNotesDatabase');
  legacy.version(2).stores({ projects: 'id, name', nodes: 'id, projectId, title, type', edges: 'id, projectId, source, target', backlinks: '++id, projectId, sourceId, targetId, [projectId+targetId]' });
  await legacy.open();
  await legacy.table('projects').add({ id: 'proj_default', name: '默认 AI 研发项目', createdAt: 1 });
  await legacy.table('nodes').bulkAdd([
    { ...node('welcome'), projectId: 'proj_default', title: 'AI 架构根节点', content: '<h1>开始你的第一个 AI 项目</h1><p>点击上方「＋组件」在画布中心创建节点。</p>' },
    { ...node('custom'), projectId: 'proj_default', title: 'My AI research', content: '<p>User content</p>' }
  ]);
  legacy.close(); await db.open();
  expect((await db.projects.get('proj_default'))?.name).toBe('我的想法');
  expect((await db.nodes.get('welcome'))?.title).toBe('第一个想法');
  expect((await db.nodes.get('custom'))?.title).toBe('My AI research');
  expect((await db.nodes.get('custom'))?.content).toBe('<p>User content</p>');
});
