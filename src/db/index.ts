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

class AiGraphDatabase extends Dexie {
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

    // 👈 升级版本 2：添加 backlinks 索引表，对 sourceId 和 targetId 建立联合索引
    this.version(2).stores({
      backlinks: '++id, projectId, sourceId, targetId, [projectId+targetId]'
    });
  }
}

export const db = new AiGraphDatabase();
