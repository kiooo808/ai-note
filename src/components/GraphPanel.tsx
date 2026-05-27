import React, { useEffect } from 'react';
import ReactFlow, { Background, Controls, MiniMap, useReactFlow, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { useGraphStore } from '../store/graphStore';
import { db } from '../db';

const GraphInner: React.FC = () => {
  const { nodes, edges, onNodesChange, onEdgesChange, activeNodeId, setActiveNode, loadGraphFromDB, currentProjectId } = useGraphStore();
  const reactFlowInstance = useReactFlow(); // 👈 安全地在 Provider 内部调用

  useEffect(() => {
    if (currentProjectId) {
      loadGraphFromDB();
    }
  }, [currentProjectId, loadGraphFromDB]);

  // 监听激活节点，自动平滑追踪聚焦
  useEffect(() => {
    if (!activeNodeId) return;
    const activeNode = nodes.find(n => n.id === activeNodeId);
    if (activeNode?.position) {
      reactFlowInstance.setCenter(activeNode.position.x, activeNode.position.y, { zoom: 1.2, duration: 600 });
    }
  }, [activeNodeId, nodes, reactFlowInstance]);

  const onNodeDragStop = async (_: any, node: any) => {
    await db.nodes.update(node.id, { position: node.position });
  };

  const dynamicNodes = nodes.map(node => {
    const isActive = node.id === activeNodeId;
    return {
      ...node,
      style: {
        border: isActive ? '2px solid #0071e3' : '1px solid #d1d1d6',
        boxShadow: isActive ? '0 0 14px rgba(0, 113, 227, 0.6)' : 'none',
        background: isActive ? '#e1f5fe' : '#ffffff',
        borderRadius: '8px',
        color: '#1c1c1e',
        fontWeight: '500',
        transition: 'all 0.2s ease',
        padding: '10px'
      }
    };
  });

  return (
    <div style={{ width: '100%', height: '100%' }}> {/* 👈 放弃 Tailwind，强制原生百分比撑满 */}
      <ReactFlow
        nodes={dynamicNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => setActiveNode(node.id)}
        onPaneClick={() => setActiveNode(null)}
        onNodeDragStop={onNodeDragStop}
        fitView
      >
        <Background gap={16} size={1} color="#e5e5ea" />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};

export const LeftGraphPanel: React.FC = () => {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <GraphInner />
      </ReactFlowProvider>
    </div>
  );
};
