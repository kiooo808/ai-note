import { create } from 'zustand';
import { type Node, type Edge, applyNodeChanges, applyEdgeChanges, type OnNodesChange, type OnEdgesChange } from 'reactflow';
import { db } from '../db';

interface GraphState {
  projects: any[];
  currentProjectId: string | null;
  nodes: Node[];
  edges: Edge[];
  activeNodeId: string | null;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  setActiveNode: (id: string | null) => void;
  initProjects: () => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
  createNewProject: (name: string) => Promise<void>;
  loadGraphFromDB: () => Promise<void>;
  syncNodeContent: (id: string, title: string, content: string) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  exportBackupData: () => Promise<void>;
  importBackupData: (jsonStr: string) => Promise<boolean>;
  addNodeAtCenter: (reactFlowInstance: any) => Promise<void>;
}

let saveTimeout: any; // 👈 降级为 any 类型，瞬间绕过 Node 环境检查

export const useGraphStore = create<GraphState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  nodes: [],
  edges: [],
  activeNodeId: null,

  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  setActiveNode: (id) => set({ activeNodeId: id }),

  initProjects: async () => {
    const allProjects = await db.projects.toArray();
    let currentId = get().currentProjectId;

    if (allProjects.length === 0) {
      const defaultProject = { id: 'proj_default', name: '默认 AI 研发项目', createdAt: Date.now() };
      await db.projects.add(defaultProject);
      
      await db.nodes.add({
        id: 'welcome',
        projectId: 'proj_default',
        title: 'AI 架构根节点',
        type: 'concept',
        content: '<h1>开始你的第一个 AI 项目</h1><p>点击上方「＋组件」在画布中心创建节点。</p>',
        position: { x: 150, y: 150 },
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      
      set({ projects: [defaultProject], currentProjectId: 'proj_default' });
    } else {
      if (!currentId) currentId = allProjects[0].id;
      set({ projects: allProjects, currentProjectId: currentId });
    }
    await get().loadGraphFromDB();
  },

  createNewProject: async (name) => {
    const newProj = { id: `proj_${Date.now()}`, name, createdAt: Date.now() };
    await db.projects.add(newProj);
    await db.nodes.add({
      id: `node_${Date.now()}`,
      projectId: newProj.id,
      title: `${name} 的主组件`,
      type: 'concept',
      content: `<h1>欢迎来到 ${name}</h1><p>使用双链组织你的构思脉络。</p>`,
      position: { x: 150, y: 150 },
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    const allProjects = await db.projects.toArray();
    set({ projects: allProjects, currentProjectId: newProj.id, activeNodeId: null });
    await get().loadGraphFromDB();
  },

  switchProject: async (projectId) => {
    set({ currentProjectId: projectId, activeNodeId: null });
    await get().loadGraphFromDB();
  },

  loadGraphFromDB: async () => {
    const pId = get().currentProjectId;
    if (!pId) return;

    const dbNodes = await db.nodes.where('projectId').equals(pId).toArray();
    const dbEdges = await db.edges.where('projectId').equals(pId).toArray();

    set({
      nodes: dbNodes.map(n => ({
        id: n.id,
        type: 'default',
        position: n.position || { x: 150, y: 150 },
        data: { label: n.title }
      })),
      edges: dbEdges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.relation,
        animated: true
      }))
    });
  },

  syncNodeContent: async (id, title, content) => {
    const pId = get().currentProjectId;
    if (!pId) return;

    const nodes = get().nodes.map(n => n.id === id ? { ...n, data: { label: title } } : n);
    set({ nodes });

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      await db.transaction('rw', [db.nodes, db.backlinks], async () => {
        const oldNode = await db.nodes.get(id);
        const oldTitle = oldNode?.title || '';
        
        await db.nodes.update(id, { title, content, updatedAt: Date.now() });

        if (oldTitle && oldTitle !== title) {
          const relatedBacklinks = await db.backlinks
            .where('projectId').equals(pId)
            .and(bl => bl.targetId === id)
            .toArray();

          const sourceIds = relatedBacklinks.map(bl => bl.sourceId);
          if (sourceIds.length > 0) {
            const affectedNodes = await db.nodes.where('id').anyOf(sourceIds).toArray();
            
            for (const targetNode of affectedNodes) {
              const parser = new DOMParser();
              const doc = parser.parseFromString(targetNode.content, 'text/html');
              const matchedLinks = doc.querySelectorAll(`.wiki-link-node[data-id="${id}"]`);
              
              matchedLinks.forEach(el => {
                el.setAttribute('data-title', title);
                el.textContent = `[[${title}]]`;
              });
              
              await db.nodes.update(targetNode.id, {
                content: doc.body.innerHTML,
                updatedAt: Date.now()
              });
            }
          }
        }
      });
    }, 350);
  },

  addNodeAtCenter: async (reactFlowInstance) => {
    const pId = get().currentProjectId;
    if (!pId) return;

    let position = { x: 150, y: 150 };
    if (reactFlowInstance) {
      const width = window.innerWidth / 2; 
      const height = window.innerHeight;
      const flowPos = reactFlowInstance.screenToFlowPosition({ x: width / 2, y: height / 2 });
      
      const existingCount = get().nodes.length;
      position = {
        x: flowPos.x + (existingCount % 5) * 25,
        y: flowPos.y + (existingCount % 5) * 20
      };
    }

    const id = `node_${Date.now()}`;
    await db.nodes.add({
      id,
      projectId: pId,
      title: '未命名组件',
      type: 'concept',
      content: '<h1>新节点</h1><p>在此输入模块描述...</p>',
      position,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    await get().loadGraphFromDB();
    set({ activeNodeId: id });
  },

  // 👈 核心重构：深度连带擦除死链算法
  deleteNode: async (id) => {
    const pId = get().currentProjectId;
    if (!pId) return;

    await db.transaction('rw', [db.nodes, db.edges, db.backlinks], async () => {
      // 1. 利用增量索引表，在彻底删掉索引前，抓出“到底是谁在引用我”
      const relatedBacklinks = await db.backlinks
        .where('projectId').equals(pId)
        .and(bl => bl.targetId === id)
        .toArray();

      const affectedSourceIds = relatedBacklinks.map(bl => bl.sourceId);

      // 2. 如果有人引用了我，逆向进入这些组件的富文本，将对应的 WikiLink 标签斩草除根
      if (affectedSourceIds.length > 0) {
        const affectedNodes = await db.nodes.where('id').anyOf(affectedSourceIds).toArray();
        
        for (const targetNode of affectedNodes) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(targetNode.content, 'text/html');
          
          // 精准检索出指向当前死节点的 DOM 元素
          const matchedDeadLinks = doc.querySelectorAll(`.wiki-link-node[data-id="${id}"]`);
          
          // 执行物理抹除
          matchedDeadLinks.forEach(el => {
            el.remove(); 
          });
          
          // 写回数据库，更新时间戳
          await db.nodes.update(targetNode.id, {
            content: doc.body.innerHTML,
            updatedAt: Date.now()
          });
        }
      }

      // 3. 执行核心节点的物理删除
      await db.nodes.delete(id);
      
      // 4. 清理涉及该节点的所有拓扑连线
      const relativeEdges = await db.edges.where('source').equals(id).or('target').equals(id).toArray();
      if (relativeEdges.length > 0) {
        await db.edges.bulkDelete(relativeEdges.map(e => e.id));
      }

      // 5. 彻底蒸发掉增量反链表中的索引
      await db.backlinks.where('sourceId').equals(id).or('targetId').equals(id).delete();
    });

    // 6. 重置 UI 激活状态并刷新画布
    set({ activeNodeId: null });
    await get().loadGraphFromDB();
  },

  exportBackupData: async () => {
    const projects = await db.projects.toArray();
    const nodes = await db.nodes.toArray();
    const edges = await db.edges.toArray();
    const backlinks = await db.backlinks.toArray();
    
    const blob = new Blob([JSON.stringify({ projects, nodes, edges, backlinks, version: 2.0 })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importBackupData: async (jsonStr) => {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.projects || !data.nodes || !data.edges) return false;

      await db.transaction('rw', [db.projects, db.nodes, db.edges, db.backlinks], async () => {
        await db.projects.clear();
        await db.nodes.clear();
        await db.edges.clear();
        await db.backlinks.clear();
        
        await db.projects.bulkAdd(data.projects);
        await db.nodes.bulkAdd(data.nodes);
        await db.edges.bulkAdd(data.edges);
        if (data.backlinks) {
          await db.backlinks.bulkAdd(data.backlinks);
        }
      });

      await get().initProjects();
      return true;
    } catch {
      return false;
    }
  }
}));
