import { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, { 
  ReactFlowProvider, 
  addEdge, 
  useNodesState, 
  useEdgesState,
  Controls,
  Background,
  MiniMap
} from 'reactflow';
import type { Connection, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Database, FileSpreadsheet, ListTree, PlayCircle, PlusCircle, X } from 'lucide-react';
import TableNode from '../components/TableNode';
import type { FileMetadata } from './DataUpload';

const nodeTypes = {
  tableNode: TableNode,
};

// We wrap the actual component in ReactFlowProvider so we can use useReactFlow hooks if needed later
function DataSelectionCanvas() {
  const { token } = useAuth();
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Track selected columns across all nodes
  // Keyed by `${nodeId}-${fileId}-${columnName}`
  const [selectedColumns, setSelectedColumns] = useState<Map<string, {nodeId: string, fileId: string, filename: string, colName: string, type: string}>>(new Map());

  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchFiles = useCallback(() => {
    axios.get('http://localhost:8000/files/', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => setFiles(res.data))
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Update nodes data whenever selectedColumns changes so they can render the checked state
  useEffect(() => {
    setNodes((nds) => 
      nds.map((node) => {
        // Collect which columns are selected for this specific node
        const nodeSelectedCols = new Set<string>();
        selectedColumns.forEach((val) => {
          if (val.nodeId === node.id) nodeSelectedCols.add(val.colName);
        });

        return {
          ...node,
          data: {
            ...node.data,
            selectedColumns: nodeSelectedCols
          }
        };
      })
    );
  }, [selectedColumns, setNodes]);

  const onToggleColumn = useCallback((nodeId: string, fileId: string, filename: string, colName: string, type: string, isChecked: boolean) => {
    setSelectedColumns((prev) => {
      const next = new Map(prev);
      const key = `${nodeId}-${fileId}-${colName}`;
      if (isChecked) {
        next.set(key, { nodeId, fileId, filename, colName, type });
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const onConnect = useCallback((params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const onDragStart = (event: React.DragEvent, file: FileMetadata) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(file));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const fileDataStr = event.dataTransfer.getData('application/reactflow');

      if (!fileDataStr || !reactFlowBounds) return;

      const fileMeta: FileMetadata = JSON.parse(fileDataStr);
      
      const position = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      };

      const newNodeId = `node_${Date.now()}`;
      
      const newNode = {
        id: newNodeId,
        type: 'tableNode',
        position,
        data: { 
          filename: fileMeta.filename,
          file_id: fileMeta.file_id,
          columns: fileMeta.columns,
          selectedColumns: new Set(),
          onToggleColumn: (nId: string, fId: string, col: string, typ: string, chk: boolean) => 
             onToggleColumn(nId, fId, fileMeta.filename, col, typ, chk)
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes, onToggleColumn]
  );

  const buildQueryPayload = () => {
    const columns = Array.from(selectedColumns.values()).map(col => ({
      file_id: col.fileId,
      column: col.colName
    }));

    const joins = edges.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return null;

      const sourceCol = edge.sourceHandle?.replace('-source', '');
      const targetCol = edge.targetHandle?.replace('-target', '');

      return {
        source_file_id: sourceNode.data.file_id,
        source_col: sourceCol,
        target_file_id: targetNode.data.file_id,
        target_col: targetCol
      };
    }).filter(Boolean);

    return { columns, joins };
  };

  const handlePreview = async () => {
    setError('');
    setLoading(true);
    setIsPreviewModalOpen(true);
    try {
      const payload = buildQueryPayload();
      const res = await axios.post('http://localhost:8000/query/preview', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPreviewData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Preview failed');
      setPreviewData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!newTableName.trim()) {
      setError('Please provide a table name.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const payload = { ...buildQueryPayload(), table_name: newTableName };
      await axios.post('http://localhost:8000/query/generate', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsGenerateModalOpen(false);
      setNewTableName('');
      fetchFiles(); // Refresh sidebar
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Canvas</h1>
          <p className="text-sm text-gray-500 mt-1">Drag files onto the canvas and connect columns to join tables.</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={handlePreview}
            className="flex items-center bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md font-bold shadow-sm transition-colors border border-gray-300 disabled:opacity-50"
            disabled={selectedColumns.size === 0}
          >
            <PlayCircle className="h-5 w-5 mr-2" />
            Preview
          </button>
          <button 
            onClick={() => setIsGenerateModalOpen(true)}
            className="flex items-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-bold shadow-sm transition-colors disabled:opacity-50"
            disabled={selectedColumns.size === 0}
          >
            <PlusCircle className="h-5 w-5 mr-2" />
            Generate Table
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-[70vh] h-full">
        
        {/* Sidebar */}
        <div className="w-full lg:w-64 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-bold text-gray-700 text-sm flex items-center">
            <Database className="h-4 w-4 mr-2" />
            Available Data
          </div>
          <div className="p-3 overflow-y-auto space-y-2 flex-1">
            {files.length === 0 ? (
              <p className="text-xs text-gray-500 text-center mt-4">No data available. Upload files first.</p>
            ) : (
              files.map(f => (
                <div 
                  key={f.file_id}
                  draggable
                  onDragStart={(e) => onDragStart(e, f)}
                  className="bg-white border border-gray-200 rounded-md p-3 cursor-grab active:cursor-grabbing hover:border-green-400 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center">
                    <FileSpreadsheet className="h-5 w-5 text-green-600 mr-2 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 truncate" title={f.filename}>{f.filename}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{f.columns.length} columns</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative">
          <div className="flex-1" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              fitView
              className="bg-gray-50"
            >
              <Background color="#ccc" gap={16} />
              <Controls />
              <MiniMap 
                nodeStrokeColor={(n) => {
                  if (n.type === 'tableNode') return '#16a34a';
                  return '#eee';
                }}
                nodeColor={(n) => {
                  return '#fff';
                }}
                nodeBorderRadius={8}
                className="bg-white border border-gray-200 shadow-sm rounded-lg"
              />
            </ReactFlow>
          </div>

          {/* Bottom Selected Schema Panel */}
          <div className="h-48 border-t border-gray-200 bg-white flex flex-col">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center">
              <ListTree className="h-4 w-4 text-green-700 mr-2" />
              <span className="font-bold text-sm text-gray-700">Constructed Table Schema ({selectedColumns.size} columns)</span>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              {selectedColumns.size === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">
                  No columns selected yet. Check columns from the nodes above.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Array.from(selectedColumns.values()).map((col) => (
                    <div key={`${col.nodeId}-${col.colName}`} className="flex items-center bg-green-50 border border-green-200 rounded-full px-3 py-1">
                      <span className="text-xs text-gray-500 mr-1 truncate max-w-[100px]" title={col.filename}>{col.filename}</span>
                      <span className="text-xs font-bold text-green-800 mx-1">.</span>
                      <span className="text-sm font-bold text-gray-900">{col.colName}</span>
                      <span className="ml-2 text-[10px] font-mono bg-white px-1 border border-gray-200 rounded text-gray-500">{col.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Preview Modal */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Data Preview (50 Rows)</h3>
              <button onClick={() => setIsPreviewModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 flex-1 overflow-auto">
              {loading ? (
                <div className="flex justify-center py-12 text-gray-500">Executing DuckDB Query...</div>
              ) : error ? (
                <div className="bg-red-50 text-red-700 p-4 rounded border border-red-200">{error}</div>
              ) : previewData && previewData.length > 0 ? (
                <div className="overflow-x-auto shadow-sm ring-1 ring-black ring-opacity-5 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(previewData[0]).map(key => (
                          <th key={key} className="px-3 py-3 text-left text-xs font-semibold text-gray-900 whitespace-nowrap">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {previewData.map((row, i) => (
                        <tr key={i}>
                          {Object.values(row).map((val: any, j) => (
                            <td key={j} className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">{String(val)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">No data returned.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generate Modal */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Generate New Table</h3>
              <button onClick={() => setIsGenerateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              {error && <div className="mb-4 bg-red-50 text-red-700 p-3 rounded border border-red-200 text-sm">{error}</div>}
              <label className="block text-sm font-medium text-gray-700 mb-1">Table Name</label>
              <input 
                type="text" 
                value={newTableName}
                onChange={e => setNewTableName(e.target.value)}
                placeholder="e.g. Combined_Project_Finances"
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-green-500 focus:border-green-500 mb-6"
              />
              <div className="flex justify-end space-x-3">
                <button onClick={() => setIsGenerateModalOpen(false)} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-bold">Cancel</button>
                <button onClick={handleGenerate} disabled={loading} className="px-4 py-2 text-white bg-green-600 hover:bg-green-700 rounded-md text-sm font-bold disabled:opacity-50">
                  {loading ? 'Generating...' : 'Generate & Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataSelection() {
  return (
    <ReactFlowProvider>
      <DataSelectionCanvas />
    </ReactFlowProvider>
  );
}
