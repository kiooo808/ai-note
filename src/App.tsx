import React, { useEffect } from 'react';
import { LeftGraphPanel } from './components/GraphPanel';
import { RightEditorPanel } from './components/EditorPanel';
import { useGraphStore } from './store/graphStore';

function App() {
  const { 
    projects, currentProjectId, initProjects, switchProject, 
    createNewProject, exportBackupData, importBackupData, addNodeAtCenter
  } = useGraphStore();

  useEffect(() => {
    initProjects();
  }, [initProjects]);

  const handleCreateProject = () => {
    const name = window.prompt("请输入新 AI 项目的名称：");
    if (name && name.trim()) createNewProject(name.trim());
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const success = await importBackupData(evt.target?.result as string);
      alert(success ? "🎉 数据全量防灾恢复成功！" : "❌ 导入失败，文件损坏。");
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#f5f5f7', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      
      <div style={{ width: '50vw', height: '100%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #e5e5ea', position: 'relative' }}>
        
        <div style={{ padding: '12px 14px', backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #e5e5ea', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#8e8e93' }}>WORKSPACE</span>
            <select 
              value={currentProjectId || ''} 
              onChange={(e) => switchProject(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #d1d1d6', fontSize: '13px', fontWeight: '500', backgroundColor: '#fff', outline: 'none', minWidth: '125px' }}
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
            {/* 👈 修复：移除外界传入的不靠谱示例参数，让其内部自适应定位 */}
            <button onClick={() => addNodeAtCenter(null)} style={{ flex: 1, padding: '7px 0', backgroundColor: '#0071e3', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
              ＋ 组件
            </button>
            <button onClick={handleCreateProject} style={{ flex: 1, padding: '7px 0', backgroundColor: '#34c759', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
              ＋ 项目
            </button>
            <button onClick={exportBackupData} style={{ padding: '7px 10px', backgroundColor: '#e5e5ea', color: '#1c1c1e', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
              💾 备份
            </button>
            <label style={{ padding: '7px 10px', backgroundColor: '#e5e5ea', color: '#1c1c1e', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              📂 恢复
              <input type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        <div style={{ flex: 1, backgroundColor: '#f5f5f7', height: 'calc(100% - 80px)' }}>
          <LeftGraphPanel />
        </div>
      </div>

      <div style={{ width: '50vw', height: '100%' }}>
        <RightEditorPanel />
      </div>
    </div>
  );
}

export default App;
