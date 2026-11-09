import Dexie, { type Table } from 'dexie';

export interface Project {
  id: string;
  name: string;
  createdAt: number;
}

export interface NoteNode {
  id: string;
  projectId: string;
  title: string;
  type: string;
  content: string;
  position?: { x: number; y: number };
  tags: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface NoteEdge {
  id: string;
  projectId: string;
  source: string;
  target: string;
  relation: string;
}

// 👈 新增：双链原子反链关系表结构
export interface BacklinkIndex {
  id?: number; // 自增主键
  projectId: string;
  sourceId: string;
  targetId: string;
}

class IdeasDatabase extends Dexie {
  projects!: Table<Project>;
  nodes!: Table<NoteNode>;
  edges!: Table<NoteEdge>;
  backlinks!: Table<BacklinkIndex>; // 👈 挂载新表

  constructor() {
    super('AiGraphNotesDatabase');
    
    // 工业级版本演进控制
    this.version(1).stores({
      projects: 'id, name',
      nodes: 'id, projectId, title, type',
      edges: 'id, projectId, source, target'
    });

    // Legacy database name stays unchanged so existing notes remain available.
    // 👈 升级版本 2：添加 backlinks 索引表，对 sourceId 和 targetId 建立联合索引
    this.version(2).stores({
      backlinks: '++id, projectId, sourceId, targetId, [projectId+targetId]'
    });
    this.version(3).stores({ nodes: 'id, projectId, title, type, updatedAt, deletedAt' });
    this.version(4).stores({}).upgrade(async tx => {
      const project = await tx.table('projects').get('proj_default');
      if (project?.name === '默认 AI 研发项目') await tx.table('projects').update('proj_default', { name: '我的想法' });
      const welcome = await tx.table('nodes').get('welcome');
      if (welcome?.title === 'AI 架构根节点' && welcome.content === '<h1>开始你的第一个 AI 项目</h1><p>点击上方「＋组件」在画布中心创建节点。</p>')
        await tx.table('nodes').update('welcome', { title: '第一个想法', content: '<h1>把想法连接起来</h1><p>写下一条笔记，再通过引用建立连接。</p>' });
    });
  }
}

export const db = new IdeasDatabase();
