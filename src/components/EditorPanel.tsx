import React, { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { WikiLink } from './Extensions';
import { useGraphStore } from '../store/graphStore';
import { db, type NoteNode } from '../db';

// 👈 核心修复：显式给 STYLES 加上 React.CSSProperties 强类型约束，消灭所有 flexDirection 报错
const STYLES: Record<string, React.CSSProperties> = {
  container: { width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  header: { padding: '20px 16px 10px 16px', display: 'flex', flexDirection: 'column', gap: '14px', flexShrink: 0 },
  titleInput: { fontSize: '22px', fontWeight: '700', width: '100%', border: 'none', borderBottom: '1px solid #e5e5ea', paddingBottom: '10px', outline: 'none', color: '#1c1c1e' },
  btnGroup: { display: 'flex', gap: '8px' },
  btnRef: { flex: 2, padding: '8px 10px', background: '#f2f2f7', color: '#0071e3', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' },
  btnDel: { flex: 1, padding: '8px 10px', background: '#fff2f2', color: '#ff3b30', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' },
  scrollBody: { flex: 1, overflowY: 'auto', padding: '0 16px 20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' },
  editorWrapper: { border: '1px solid #e5e5ea', borderRadius: '12px', padding: '14px', background: '#ffffff', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', minHeight: '260px' },
  backlinkSection: { marginTop: '10px', borderTop: '1px dashed #e5e5ea', paddingTop: '16px' },
  backlinkTitle: { fontSize: '13px', fontWeight: '700', color: '#8e8e93', marginBottom: '8px', letterSpacing: '0.5px' },
  backlinkTag: { padding: '6px 10px', backgroundColor: '#f2f2f7', borderRadius: '6px', fontSize: '12px', fontWeight: '500', color: '#0071e3', cursor: 'pointer' },
  pickerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.96)', backdropFilter: 'blur(10px)', zIndex: 100, padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }
};

export const RightEditorPanel: React.FC = () => {
  const activeNodeId = useGraphStore(state => state.activeNodeId);
  const syncNodeContent = useGraphStore(state => state.syncNodeContent);
  const loadGraphFromDB = useGraphStore(state => state.loadGraphFromDB);
  const deleteNode = useGraphStore(state => state.deleteNode);
  const currentProjectId = useGraphStore(state => state.currentProjectId);
  const setActiveNode = useGraphStore(state => state.setActiveNode);

  const [note, setNote] = useState<NoteNode | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableNodes, setAvailableNodes] = useState<NoteNode[]>([]);
  const [backlinks, setBacklinks] = useState<NoteNode[]>([]);

  const isSwithingNode = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit, 
      WikiLink,
      Placeholder.configure({
        placeholder: '在此输入模块描述，点击上方按钮或使用双链引用其他组件...',
        emptyEditorClass: 'is-empty',
      }),
    ],
    editorProps: {
      attributes: { 
        class: 'prose focus:outline-none', 
        style: "min-height: 200px; outline: none; font-size: 15px; color: #1c1c1e;" // 👈 顺便修复了之前单引号引起的 Invalid Character
      }
    },
    onUpdate: ({ editor }) => {
      if (isSwithingNode.current || !note) return;
      const html = editor.getHTML();
      setNote(prev => prev ? { ...prev, content: html } : null);
      syncNodeContent(note.id, note.title, html);
      parseAndSyncEdges(note.id, html);
    }
  });

  const parseAndSyncEdges = async (sourceId: string, html: string) => {
    if (!currentProjectId || isSwithingNode.current) return;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const linkElements = doc.querySelectorAll('.wiki-link-node');
    
    const currentTargetIds = Array.from(new Set(
      Array.from(linkElements).map(el => el.getAttribute('data-id')).filter(Boolean)
    )) as string[];

    await db.transaction('rw', [db.edges, db.backlinks], async () => {
      await db.edges.where('projectId').equals(currentProjectId).and(e => e.source === sourceId).delete();
      await db.backlinks.where('projectId').equals(currentProjectId).and(bl => bl.sourceId === sourceId).delete();

      if (currentTargetIds.length > 0) {
        const newEdges = currentTargetIds.map(tId => ({
          id: `${sourceId}->${tId}`,
          projectId: currentProjectId,
          source: sourceId,
          target: tId,
          relation: 'references'
        }));
        await db.edges.bulkAdd(newEdges);

        const newBacklinks = currentTargetIds.map(tId => ({
          projectId: currentProjectId,
          sourceId,
          targetId: tId
        }));
        await db.backlinks.bulkAdd(newBacklinks);
      }
    });

    await loadGraphFromDB();
    fetchBacklinks(sourceId);
  };

  const fetchBacklinks = async (targetId: string) => {
    if (!currentProjectId) return;
    const inboundIndices = await db.backlinks
      .where('projectId').equals(currentProjectId)
      .and(bl => bl.targetId === targetId)
      .toArray();
      
    const sourceIds = inboundIndices.map(bl => bl.sourceId);
    if (sourceIds.length === 0) {
      setBacklinks([]);
      return;
    }
    const sourceNodes = await db.nodes.where('id').anyOf(sourceIds).toArray();
    setBacklinks(sourceNodes);
  };

  useEffect(() => {
    if (!activeNodeId) {
      setNote(null);
      return;
    }

    isSwithingNode.current = true;

    db.nodes.get(activeNodeId).then(data => {
      if (data) {
        setNote(data);
        const isContentEmpty = !data.content || data.content === '<p></p>' || data.content === '<h1>新节点</h1><p>在此输入模块描述...</p>';
        if (editor) {
          editor.commands.setContent(isContentEmpty ? '' : data.content);
        }
        fetchBacklinks(activeNodeId);
      }
      setTimeout(() => { isSwithingNode.current = false; }, 60);
    });
  }, [activeNodeId, editor]);

  useEffect(() => {
    const handleWikiClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target?.classList.contains('wiki-link-node') || target?.parentElement?.classList.contains('wiki-link-node')) {
        const nodeEl = target.classList.contains('wiki-link-node') ? target : target.parentElement;
        const nodeId = nodeEl?.getAttribute('data-id');
        if (nodeId) {
          e.preventDefault();
          setActiveNode(nodeId);
        }
      }
    };
    document.addEventListener('click', handleWikiClick);
    return () => document.removeEventListener('click', handleWikiClick);
  }, [setActiveNode]);

  const handleOpenPicker = async () => {
    if (!note || !currentProjectId) return;
    const allProjectNodes = await db.nodes.where('projectId').equals(currentProjectId).toArray();
    const filtered = allProjectNodes.filter(n => n.id !== note.id);
    
    if (filtered.length === 0) {
      alert("请先创建更多组件！");
      return;
    }
    
    setAvailableNodes(filtered);
    setSearchQuery('');
    setIsPickerOpen(true);
  };

  const handleSelectNode = (targetNode: NoteNode) => {
    if (editor) {
      editor.commands.insertContent({
        type: 'wikiLink',
        attrs: { id: targetNode.id, title: targetNode.title }
      });
    }
    setIsPickerOpen(false);
  };

  const handleDelete = async () => {
    if (!note) return;
    if (window.confirm(`确定删除【${note.title}】吗？`)) {
      await deleteNode(note.id);
    }
  };

  if (!note) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', color: '#94a3b8', padding: '32px' }}>
        <span style={{ fontSize: '30px', marginBottom: '12px' }}>👁️‍🗨️</span>
        <div style={{ fontSize: '14px', fontWeight: '500' }}>未选中组件</div>
      </div>
    );
  }

  return (
    <div style={STYLES.container}>
      <style>{`
        .ProseMirror {
          line-height: 1.8 !important;
        }
        .ProseMirror p.is-empty::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
          font-style: italic;
          font-size: 14px;
         }
        .wiki-link-node {
          vertical-align: middle;
        }
      `}</style>

      <div style={STYLES.header}>
        <input
          type="text"
          style={STYLES.titleInput}
          value={note.title}
          onChange={(e) => {
            const newTitle = e.target.value;
            setNote({ ...note, title: newTitle });
            syncNodeContent(note.id, newTitle, note.content);
          }}
        />
        
        <div style={STYLES.btnGroup}>
          <button onClick={handleOpenPicker} style={STYLES.btnRef}>🔗 引用特定组件</button>
          <button onClick={handleDelete} style={STYLES.btnDel}>🗑️ 删除</button>
        </div>
      </div>

      <div style={STYLES.scrollBody}>
        <div style={STYLES.editorWrapper}>
          <EditorContent editor={editor} />
        </div>

        <div style={STYLES.backlinkSection}>
          <div style={STYLES.backlinkTitle}>🔗 被以下组件引用 ({backlinks.length})</div>
          {backlinks.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>暂无反向引用脉络</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {backlinks.map(bNode => (
                <div key={bNode.id} onClick={() => setActiveNode(bNode.id)} style={STYLES.backlinkTag}>
                  ↩️ {bNode.title}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isPickerOpen && (
        <div style={STYLES.pickerOverlay}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>选择要引入的双链组件</span>
            <button onClick={() => setIsPickerOpen(false)} style={{ border: 'none', background: 'none', color: '#3b82f6', fontWeight: '600', fontSize: '14px' }}>取消</button>
          </div>
          <input 
            type="text" 
            placeholder="🔍 输入关键字搜索组件..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }} 
          />
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {availableNodes.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase())).map(nodeItem => (
              <div key={nodeItem.id} onClick={() => handleSelectNode(nodeItem)} style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f1f5f9', fontSize: '14px', fontWeight: '500', color: '#1e293b', cursor: 'pointer' }}>
                📄 {nodeItem.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
