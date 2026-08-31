import { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background
} from 'reactflow';
import type { Connection, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Database, FileSpreadsheet, ListTree, PlayCircle, PlusCircle, X, Copy, Trash2, Settings, AlertTriangle, Eraser } from 'lucide-react';
import TableNode from '../components/TableNode';
import type { TableMetadata } from './DataUpload';

const nodeTypes = {
  tableNode: TableNode,
};

// We wrap the actual component in ReactFlowProvider so we can use useReactFlow hooks if needed later
function DataSelectionCanvas() {
  const { token, user } = useAuth();
  const [files, setFiles] = useState<TableMetadata[]>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Track selected columns across all nodes
  // Keyed by `${nodeId}-${fileId}-${columnName}`
  const [selectedColumns, setSelectedColumns] = useState<Map<string, { nodeId: string, tableId: string, filename: string, colName: string, type: string, alias: string }>>(new Map());

  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isSaveModelModalOpen, setIsSaveModelModalOpen] = useState(false);
  const [isLoadModelModalOpen, setIsLoadModelModalOpen] = useState(false);
  const [activeModel, setActiveModel] = useState<any>(null);
  const [showNewModelModal, setShowNewModelModal] = useState(false);
  const [savedModels, setSavedModels] = useState<any[]>([]);
  const [newTableName, setNewTableName] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [nodeContextMenu, setNodeContextMenu] = useState<{ id: string, top: number, left: number } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);
  const [errorPopup, setErrorPopup] = useState<{ title: string, message: string } | null>(null);

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

  const onToggleColumn = useCallback((nodeId: string, tableId: string, filename: string, colName: string, type: string, isChecked: boolean) => {
    setSelectedColumns((prev) => {
      const next = new Map(prev);
      const key = `${nodeId}-${tableId}-${colName}`;
      if (isChecked) {
        next.set(key, { nodeId, tableId, filename, colName, type, alias: colName });
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const onChangeColumnType = useCallback(async (nodeId: string, tableId: string, colName: string, oldType: string, newType: string) => {
    const o = oldType.toLowerCase();
    const n = newType.toLowerCase();

    if (o === n) return;

    // Define permissible casts according to business rules:
    const allowed: Record<string, string[]> = {
      'integer': ['float', 'string'],
      'float': ['integer', 'string'],
      'string': ['date'],
      'date': ['string'],
      'boolean': ['string']
    };

    const isAllowed = allowed[o]?.includes(n);

    if (!isAllowed) {
      setErrorPopup({
        title: "Invalid Data Type Cast",
        message: `Cannot cast column '${colName}' from ${oldType} to ${newType}. Allowed casts for ${oldType} are: ${allowed[o]?.join(', ') || 'none'}.`
      });
      return;
    }

    // Special verification for String -> Date cast
    if (o === 'string' && n === 'date') {
      try {
        const res = await axios.get(`http://localhost:8000/files/${tableId}/preview?limit=50`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = res.data;
        if (data && data.length > 0) {
          let validDates = 0;
          let totalChecked = 0;
          for (const row of data) {
            const val = row[colName];
            if (val === null || val === undefined || val === '') continue;
            totalChecked++;
            // Check if string can be parsed to a date
            if (!isNaN(Date.parse(String(val)))) {
              validDates++;
            }
          }

          if (totalChecked > 0 && validDates / totalChecked < 0.5) {
            setErrorPopup({
              title: "Invalid Data Type Cast",
              message: `Cannot cast column '${colName}' to Date. A sample of the top 50 rows indicates that the data does not contain valid dates.`
            });
            return;
          }
        }
      } catch (err) {
        console.error("Failed to fetch preview for validation", err);
        setErrorPopup({
          title: "Validation Error",
          message: "Failed to validate the data for casting. The server might be unreachable."
        });
        return;
      }
    }

    try {
      await axios.put(`http://localhost:8000/files/${tableId}/columns/${colName}/type`, { new_type: newType }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNodes(nds => nds.map(n => {
        if (n.id === nodeId) {
          const updatedColumns = n.data.columns.map((c: any) =>
            c.name === colName ? { ...c, type: newType } : c
          );
          return { ...n, data: { ...n.data, columns: updatedColumns } };
        }
        return n;
      }));
    } catch (err) {
      console.error("Failed to update column type", err);
    }
  }, [setNodes, token]);

  // Restore and Persist State
  useEffect(() => {
    try {
      const userId = user?.id || 'guest';
      const savedNodes = localStorage.getItem(`${userId}_dataSelectionNodes`);
      if (savedNodes) {
        const parsedNodes = JSON.parse(savedNodes).map((n: any) => ({
          ...n,
          data: {
            ...n.data,
            table_id: n.data.table_id || n.data.file_id,
            selectedColumns: new Set(n.data.selectedColumnsArray || []),
            onToggleColumn: (nId: string, fId: string, col: string, typ: string, chk: boolean) =>
              onToggleColumn(nId, fId, n.data.filename, col, typ, chk),
            onChangeColumnType: (nId: string, tId: string, col: string, oTyp: string, nTyp: string) =>
              onChangeColumnType(nId, tId, col, oTyp, nTyp)
          }
        }));
        setNodes(parsedNodes);
      }

      const savedEdges = localStorage.getItem(`${userId}_dataSelectionEdges`);
      if (savedEdges) {
        setEdges(JSON.parse(savedEdges));
      }

      const savedCols = localStorage.getItem(`${userId}_dataSelectionColumns`);
      if (savedCols) {
        setSelectedColumns(new Map(JSON.parse(savedCols)));
      }
    } catch (e) {
      console.error("Failed to restore canvas state", e);
    }
  }, [setNodes, setEdges, onToggleColumn]);

  useEffect(() => {
    if (nodes.length > 0) {
      const serializableNodes = nodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          onToggleColumn: undefined, // Cannot serialize functions
          onChangeColumnType: undefined,
          selectedColumnsArray: Array.from(n.data.selectedColumns || [])
        }
      }));
      const userId = user?.id || 'guest';
      localStorage.setItem(`${userId}_dataSelectionNodes`, JSON.stringify(serializableNodes));
    } else {
      const userId = user?.id || 'guest';
      localStorage.removeItem(`${userId}_dataSelectionNodes`);
    }
  }, [nodes, user?.id]);

  useEffect(() => {
    const userId = user?.id || 'guest';
    if (edges.length > 0) {
      localStorage.setItem(`${userId}_dataSelectionEdges`, JSON.stringify(edges));
    } else {
      localStorage.removeItem(`${userId}_dataSelectionEdges`);
    }
  }, [edges, user?.id]);

  useEffect(() => {
    const userId = user?.id || 'guest';
    if (selectedColumns.size > 0) {
      localStorage.setItem(`${userId}_dataSelectionColumns`, JSON.stringify(Array.from(selectedColumns.entries())));
    } else {
      localStorage.removeItem(`${userId}_dataSelectionColumns`);
    }
  }, [selectedColumns, user?.id]);

  const handleAliasChange = (key: string, newAlias: string) => {
    setSelectedColumns((prev) => {
      const next = new Map(prev);
      const item = next.get(key);
      if (item) {
        next.set(key, { ...item, alias: newAlias });
      }
      return next;
    });
  };

  const onConnect = useCallback(async (params: Connection | Edge) => {
    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);

    // Extract column names
    const sourceColName = params.sourceHandle?.replace('-source', '');
    const targetColName = params.targetHandle?.replace('-target', '');

    if (sourceNode && targetNode && sourceColName && targetColName) {
      // Find columns to check types
      const sourceColData = sourceNode.data.columns?.find((c: any) => (c.alias || c.name || c.column) === sourceColName || c.name === sourceColName);
      const targetColData = targetNode.data.columns?.find((c: any) => (c.alias || c.name || c.column) === targetColName || c.name === targetColName);

      if (sourceColData && targetColData) {
        // Sanitize: Check for data type mismatch
        if (sourceColData.type !== targetColData.type) {
          setErrorPopup({
            title: "Data Type Mismatch",
            message: `Cannot establish relationship. The data type of '${sourceColName}' is ${sourceColData.type || 'Unknown'}, but '${targetColName}' is ${targetColData.type || 'Unknown'}. Please ensure both columns have identical data types.`
          });
          return; // Abort connection
        }
      }
    }

    const edgeId = `e_${params.source}_${params.target}_${Date.now()}`;
    const newEdge = {
      ...params,
      id: edgeId,
      data: { joinType: 'INNER', cardinality: '1:1', isActive: true },
      style: { stroke: '#16a34a', strokeWidth: 2, strokeDasharray: 'none' }
    };
    setEdges((eds) => addEdge(newEdge, eds));

    // Save to backend

    if (sourceNode && targetNode) {
      try {
        await axios.post('http://localhost:8000/relationships/', {
          relationship_id: edgeId,
          source_table_id: sourceNode.data.table_id,
          target_table_id: targetNode.data.table_id,
          source_column: params.sourceHandle?.replace('-source', ''),
          target_column: params.targetHandle?.replace('-target', ''),
          cardinality: '1:1',
          join_type: 'INNER',
          is_active: true,
          created_by: 'system' // Backend will override with actual user ID
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        console.error("Failed to save relationship", err);
      }
    }
  }, [setEdges, nodes, token]);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: any) => {
    event.preventDefault();
    setNodeContextMenu({ id: node.id, top: event.clientY, left: event.clientX });
  }, []);

  const closeNodeContextMenu = () => setNodeContextMenu(null);

  const duplicateNode = () => {
    if (!nodeContextMenu) return;
    const nodeToDuplicate = nodes.find(n => n.id === nodeContextMenu.id);
    if (nodeToDuplicate) {
      const newNode = {
        ...nodeToDuplicate,
        id: `node_${Date.now()}`,
        position: { x: nodeToDuplicate.position.x + 50, y: nodeToDuplicate.position.y + 50 },
        data: {
          ...nodeToDuplicate.data,
          selectedColumns: new Set()
        }
      };
      setNodes((nds) => nds.concat(newNode));
    }
    closeNodeContextMenu();
  };

  const deleteNode = () => {
    if (!nodeContextMenu) return;
    setNodes((nds) => nds.filter(n => n.id !== nodeContextMenu.id));
    setEdges((eds) => eds.filter(e => e.source !== nodeContextMenu.id && e.target !== nodeContextMenu.id));

    // Also remove from selectedColumns
    setSelectedColumns((prev) => {
      const next = new Map(prev);
      for (const key of prev.keys()) {
        if (key.startsWith(`${nodeContextMenu.id}-`)) {
          next.delete(key);
        }
      }
      return next;
    });
    closeNodeContextMenu();
  };

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setSelectedEdge(edge);
  }, []);

  const updateEdgeSettings = async (joinType: string, cardinality: string, isActive: boolean) => {
    if (!selectedEdge) return;
    const edgeId = selectedEdge.id;
    const currentEdge = selectedEdge;

    setEdges((eds) => eds.map(e => {
      if (e.id === edgeId) {
        return {
          ...e,
          data: { joinType, cardinality, isActive },
          style: {
            stroke: isActive ? '#16a34a' : '#9ca3af',
            strokeWidth: 2,
            strokeDasharray: isActive ? 'none' : '5,5'
          }
        };
      }
      return e;
    }));
    setSelectedEdge(null);

    const sourceNode = nodes.find(n => n.id === currentEdge.source);
    const targetNode = nodes.find(n => n.id === currentEdge.target);
    if (sourceNode && targetNode) {
      try {
        await axios.post('http://localhost:8000/relationships/', {
          relationship_id: edgeId,
          source_table_id: sourceNode.data.table_id,
          target_table_id: targetNode.data.table_id,
          source_column: currentEdge.sourceHandle?.replace('-source', ''),
          target_column: currentEdge.targetHandle?.replace('-target', ''),
          cardinality,
          join_type: joinType,
          is_active: isActive,
          created_by: 'system'
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        console.error("Failed to update relationship", err);
      }
    }
  };

  const onEdgesChangeIntercept = useCallback((changes: any) => {
    changes.forEach((c: any) => {
      if (c.type === 'remove') {
        axios.delete(`http://localhost:8000/relationships/${c.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(console.error);
      }
    });
    onEdgesChange(changes);
  }, [onEdgesChange, token]);

  const onDragStart = (event: React.DragEvent, file: TableMetadata) => {
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

      const fileMeta: TableMetadata = JSON.parse(fileDataStr);

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
          table_id: fileMeta.table_id,
          columns: fileMeta.columns,
          selectedColumns: new Set(),
          onToggleColumn: (nId: string, fId: string, col: string, typ: string, chk: boolean) =>
            onToggleColumn(nId, fId, fileMeta.filename, col, typ, chk),
          onChangeColumnType: (nId: string, tId: string, col: string, oTyp: string, nTyp: string) =>
            onChangeColumnType(nId, tId, col, oTyp, nTyp)
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes, onToggleColumn]
  );

  const buildQueryPayload = () => {
    const columns = Array.from(selectedColumns.values()).map(col => ({
      table_id: col.tableId,
      column: col.colName,
      alias: col.alias || col.colName
    }));

    const joins = edges.filter(e => e.data?.isActive !== false).map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return null;

      return {
        source_table_id: sourceNode.data.table_id,
        target_table_id: targetNode.data.table_id,
        source_column: edge.sourceHandle?.replace('-source', ''),
        target_column: edge.targetHandle?.replace('-target', ''),
        join_type: edge.data?.joinType || 'INNER'
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
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Preview failed');
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
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveModel = async () => {
    if (activeModel) {
      // Update existing model
      setLoading(true);
      try {
        const payload = buildQueryPayload();
        await axios.put(`http://localhost:8000/query/saved_models/${activeModel.model_id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setErrorPopup({ title: 'Success', message: 'Model updated successfully!' });
        
        // Log activity
        axios.post('http://localhost:8000/activities', {
          action: 'Update Data Model / Relationships',
          details: { dataset: activeModel.model_name, relationships: payload.joins.map(j => `${j?.source_column}-${j?.target_column}`) }
        }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
      } catch (err: any) {
        const detail = err.response?.data?.detail;
        setErrorPopup({ title: 'Error', message: typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Update Model failed' });
      } finally {
        setLoading(false);
      }
    } else {
      // Create new model
      if (!newModelName.trim()) {
        setError('Please provide a model name.');
        return;
      }
      setError('');
      setLoading(true);
      try {
        const payload = { ...buildQueryPayload(), model_name: newModelName };
        const response = await axios.post('http://localhost:8000/query/saved_models', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setActiveModel(response.data);
        setIsSaveModelModalOpen(false);
        setNewModelName('');
        setErrorPopup({ title: 'Success', message: 'Model saved successfully! You can now use it in Observations.' });
        
        // Log activity
        axios.post('http://localhost:8000/activities', {
          action: 'Save Data Model / Relationships',
          details: { dataset: response.data.model_name, relationships: payload.joins.map(j => `${j?.source_column}-${j?.target_column}`) }
        }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
      } catch (err: any) {
        const detail = err.response?.data?.detail;
        setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Save Model failed');
      } finally {
        setLoading(false);
      }
    }
  };

  const fetchSavedModels = async () => {
    try {
      const res = await axios.get('http://localhost:8000/query/saved_models', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSavedModels(res.data);
      setIsLoadModelModalOpen(true);
    } catch (err) {
      console.error("Failed to fetch saved models", err);
      setErrorPopup({ title: 'Error', message: 'Failed to fetch saved models.' });
    }
  };

  const loadModel = (model: any) => {
    // 1. Determine which unique tables are needed
    const tableIds = new Set<string>();
    model.columns.forEach((col: any) => tableIds.add(col.table_id));
    model.joins.forEach((join: any) => {
      tableIds.add(join.source_table_id);
      tableIds.add(join.target_table_id);
    });

    // 2. Generate nodes for these tables, spaced out horizontally
    const newNodes: any[] = [];
    const nodeIdMap = new Map<string, string>(); // map table_id to node_id

    let xOffset = 100;
    Array.from(tableIds).forEach((tableId, index) => {
      const fileMeta = files.find(f => f.table_id === tableId);
      if (!fileMeta) return; // If file was deleted but model still exists

      const newNodeId = `node_${Date.now()}_${index}`;
      nodeIdMap.set(tableId, newNodeId);

      newNodes.push({
        id: newNodeId,
        type: 'tableNode',
        position: { x: xOffset, y: 100 },
        data: {
          filename: fileMeta.filename,
          table_id: fileMeta.table_id,
          columns: fileMeta.columns,
          selectedColumns: new Set(),
          onToggleColumn: (nId: string, fId: string, col: string, typ: string, chk: boolean) =>
            onToggleColumn(nId, fId, fileMeta.filename, col, typ, chk),
          onChangeColumnType: (nId: string, tId: string, col: string, oTyp: string, nTyp: string) =>
            onChangeColumnType(nId, tId, col, oTyp, nTyp)
        },
      });
      xOffset += 350;
    });

    setNodes(newNodes);

    // 3. Reconstruct selected columns
    const newSelectedColumns = new Map();
    model.columns.forEach((col: any) => {
      const nodeId = nodeIdMap.get(col.table_id);
      if (nodeId) {
        const fileMeta = files.find(f => f.table_id === col.table_id);
        const fileType = fileMeta?.columns.find(c => c.name === col.column)?.type || 'String';
        const key = `${nodeId}-${col.table_id}-${col.column}`;
        newSelectedColumns.set(key, {
          nodeId,
          tableId: col.table_id,
          filename: fileMeta?.filename || '',
          colName: col.column,
          type: fileType,
          alias: col.alias || col.column
        });
      }
    });
    setSelectedColumns(newSelectedColumns);

    // 4. Reconstruct edges
    const newEdges: any[] = [];
    model.joins.forEach((join: any, index: number) => {
      const sourceNodeId = nodeIdMap.get(join.source_table_id);
      const targetNodeId = nodeIdMap.get(join.target_table_id);
      if (sourceNodeId && targetNodeId) {
        const sourceHandle = `${join.source_column}-source`;
        const targetHandle = `${join.target_column}-target`;
        newEdges.push({
          id: `reactflow__edge-${sourceNodeId}${sourceHandle}-${targetNodeId}${targetHandle}`,
          source: sourceNodeId,
          target: targetNodeId,
          sourceHandle: sourceHandle,
          targetHandle: targetHandle,
          data: {
            joinType: join.join_type,
            cardinality: '1:1', // generic default, as cardinality isn't saved in SavedModelMetadata yet
            isActive: true
          },
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 2 },
        });
      }
    });

    // Slight timeout to let nodes render before applying edges
    setTimeout(() => {
      setEdges(newEdges);
    }, 50);

    setActiveModel(model);
    setIsLoadModelModalOpen(false);
  };

  const deleteFile = (e: React.MouseEvent, tableId: string) => {
    e.stopPropagation();
    setConfirmAction({
      title: 'Delete Table',
      message: 'Are you sure you want to permanently delete this table? This will remove it from the canvas and database.',
      onConfirm: async () => {
        try {
          await axios.delete(`http://localhost:8000/files/${tableId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          // Remove from sidebar
          setFiles(files.filter(f => f.table_id !== tableId));
          // Remove nodes representing this file
          setNodes(nds => nds.filter(n => n.data.table_id !== tableId));
          // Remove associated edges
          const removedNodeIds = new Set(nodes.filter(n => n.data.table_id === tableId).map(n => n.id));
          setEdges(eds => eds.filter(e => !removedNodeIds.has(e.source) && !removedNodeIds.has(e.target)));
          // Remove from selectedColumns
          setSelectedColumns(prev => {
            const next = new Map(prev);
            for (const key of prev.keys()) {
              if (removedNodeIds.has(key.split('-')[0])) next.delete(key);
            }
            return next;
          });
        } catch (err) {
          console.error('Failed to delete file', err);
          setError('Failed to delete file.');
        } finally {
          setConfirmAction(null);
        }
      }
    });
  };

  const clearCanvas = () => {
    setConfirmAction({
      title: 'Clear Canvas',
      message: 'Are you sure you want to clear all tables and connections from the canvas? This cannot be undone.',
      onConfirm: () => {
        edges.forEach(e => {
          axios.delete(`http://localhost:8000/relationships/${e.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(console.error);
        });
        setNodes([]);
        setEdges([]);
        setSelectedColumns(new Map());
        const userId = user?.id || 'guest';
        localStorage.removeItem(`${userId}_dataSelectionNodes`);
        localStorage.removeItem(`${userId}_dataSelectionEdges`);
        localStorage.removeItem(`${userId}_dataSelectionColumns`);
        setActiveModel(null);
        setConfirmAction(null);
      }
    });
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Canvas</h1>
          <p className="text-sm text-gray-500 mt-1">Drag files onto the canvas and connect columns to join tables.</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowNewModelModal(true)}
            className="flex items-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-md font-medium text-sm shadow-sm transition-colors whitespace-nowrap"
          >
            <PlusCircle className="h-4 w-4 mr-2 text-indigo-500" />
            New
          </button>
          <button
            onClick={clearCanvas}
            className="flex items-center bg-white border border-red-200 hover:bg-red-50 text-red-600 px-3 py-2 rounded-md font-medium text-sm shadow-sm transition-colors whitespace-nowrap"
          >
            <Eraser className="h-4 w-4 mr-2" />
            Clear Canvas
          </button>
          <button
            onClick={handlePreview}
            className="flex items-center bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-md font-medium text-sm shadow-sm transition-colors border border-gray-300 disabled:opacity-50 whitespace-nowrap"
            disabled={selectedColumns.size === 0}
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            Preview
          </button>
          <button
            onClick={fetchSavedModels}
            className="flex items-center bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-md font-medium text-sm shadow-sm transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <ListTree className="h-4 w-4 mr-2" />
            Load Model
          </button>
          <button
            onClick={() => activeModel ? handleSaveModel() : setIsSaveModelModalOpen(true)}
            className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md font-medium text-sm shadow-sm transition-colors disabled:opacity-50 whitespace-nowrap"
            disabled={selectedColumns.size === 0 && !activeModel}
          >
            <Database className="h-4 w-4 mr-2" />
            {activeModel ? 'Save' : 'Save As'}
          </button>
          <button
            onClick={() => setIsGenerateModalOpen(true)}
            className="flex items-center bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-md font-medium text-sm shadow-sm transition-colors disabled:opacity-50 whitespace-nowrap"
            disabled={selectedColumns.size === 0}
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            Generate Table
          </button>
        </div>
      </div>

      <div
        className="flex flex-col lg:flex-row gap-4 w-full resize-y overflow-hidden border-b-2 border-transparent hover:border-gray-200 transition-colors"
        style={{ minHeight: '600px', height: '85vh', maxHeight: '200vh' }}
      >

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
                  key={f.table_id}
                  draggable
                  onDragStart={(e) => onDragStart(e, f)}
                  className="bg-white border border-gray-200 rounded-md p-3 cursor-grab active:cursor-grabbing hover:border-green-400 hover:shadow-sm transition-all group relative"
                >
                  <button
                    onClick={(e) => deleteFile(e, f.table_id)}
                    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Delete Table"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="flex items-center pr-6">
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
              onEdgesChange={onEdgesChangeIntercept}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeContextMenu={onNodeContextMenu}
              onEdgeClick={onEdgeClick}
              onPaneClick={closeNodeContextMenu}
              nodeTypes={nodeTypes}
              fitView
              className="bg-gray-50"
            >
              <Background color="#ccc" gap={16} />
              <Controls />
              {nodeContextMenu && (
                <div
                  style={{ top: nodeContextMenu.top, left: nodeContextMenu.left }}
                  className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 py-1 min-w-[160px]"
                >
                  <button onClick={duplicateNode} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center">
                    <Copy className="h-4 w-4 mr-2" /> Duplicate
                  </button>
                  <button onClick={deleteNode} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center">
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </button>
                </div>
              )}
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
                      <input
                        type="text"
                        value={col.alias}
                        onChange={(e) => handleAliasChange(`${col.nodeId}-${col.tableId}-${col.colName}`, e.target.value)}
                        className="bg-transparent text-sm font-bold text-gray-900 border-b border-transparent hover:border-green-300 focus:border-green-500 focus:outline-none w-28 px-1"
                        title="Rename column in final table"
                      />
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

      {/* Save Model Modal */}
      {isSaveModelModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Save Relationship Model</h3>
              <button onClick={() => setIsSaveModelModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              {error && <div className="mb-4 bg-red-50 text-red-700 p-3 rounded border border-red-200 text-sm">{error}</div>}
              <p className="text-sm text-gray-500 mb-4">
                Saving as a logical model preserves your canvas configuration without generating a physical table.
                You can directly visualize this model in the Observations tab.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
              <input
                type="text"
                value={newModelName}
                onChange={e => setNewModelName(e.target.value)}
                placeholder="e.g. Finance_View"
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 mb-6"
              />
              <div className="flex justify-end space-x-3">
                <button onClick={() => setIsSaveModelModalOpen(false)} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-bold">Cancel</button>
                <button onClick={handleSaveModel} disabled={loading} className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-bold disabled:opacity-50">
                  {loading ? 'Saving...' : 'Save Model'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Relationship Settings Modal */}
      {selectedEdge && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center text-lg font-bold text-gray-900">
                <Settings className="h-5 w-5 mr-2 text-gray-500" /> Relationship Settings
              </div>
              <button onClick={() => setSelectedEdge(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Join Type</label>
                <select
                  defaultValue={selectedEdge.data?.joinType || 'INNER'}
                  id="joinTypeSelect"
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="INNER">Inner Join (Match Both)</option>
                  <option value="LEFT">Left Join (Keep All Left)</option>
                  <option value="RIGHT">Right Join (Keep All Right)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Determines how rows are combined if there are missing matches.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cardinality</label>
                <select
                  defaultValue={selectedEdge.data?.cardinality || '1:1'}
                  id="cardinalitySelect"
                  onChange={(e) => {
                    const warn = document.getElementById('mn-warning');
                    if (warn) warn.style.display = e.target.value === 'M:N' ? 'flex' : 'none';
                  }}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="1:1">One-to-One (1:1)</option>
                  <option value="1:N">One-to-Many (1:N)</option>
                  <option value="M:N">Many-to-Many (M:N)</option>
                </select>
                <div id="mn-warning" style={{ display: selectedEdge.data?.cardinality === 'M:N' ? 'flex' : 'none' }} className="mt-2 text-amber-700 bg-amber-50 p-2 rounded text-xs items-center border border-amber-200">
                  <AlertTriangle className="h-4 w-4 mr-1 flex-shrink-0" />
                  Use Many-to-Many with caution; it can artificially inflate row counts (Cartesian Product).
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div>
                  <label className="text-sm font-medium text-gray-700">Active Relationship</label>
                  <p className="text-xs text-gray-500">Temporarily disable this join</p>
                </div>
                <input
                  type="checkbox"
                  id="activeToggle"
                  defaultChecked={selectedEdge.data?.isActive !== false}
                  className="h-5 w-5 text-green-600 rounded focus:ring-green-500 cursor-pointer"
                />
              </div>

              <div className="flex justify-between items-center pt-4">
                <button onClick={() => {
                  setEdges(eds => eds.filter(e => e.id !== selectedEdge.id));
                  setSelectedEdge(null);
                  axios.delete(`http://localhost:8000/relationships/${selectedEdge.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                  }).catch(console.error);
                }} className="px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-md text-sm font-bold flex items-center">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Relationship
                </button>
                <div className="space-x-3">
                  <button onClick={() => setSelectedEdge(null)} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-bold">Cancel</button>
                  <button onClick={() => {
                    const jt = (document.getElementById('joinTypeSelect') as HTMLSelectElement).value;
                    const cd = (document.getElementById('cardinalitySelect') as HTMLSelectElement).value;
                    const act = (document.getElementById('activeToggle') as HTMLInputElement).checked;
                    updateEdgeSettings(jt, cd, act);
                  }} className="px-4 py-2 text-white bg-green-600 hover:bg-green-700 rounded-md text-sm font-bold">
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{confirmAction.title}</h3>
              <p className="text-sm text-gray-500 mb-6">{confirmAction.message}</p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setConfirmAction(null)} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-bold">Cancel</button>
                <button onClick={confirmAction.onConfirm} className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md text-sm font-bold">
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Popup Modal */}
      {errorPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{errorPopup.title}</h3>
              <p className="text-sm text-gray-500 mb-6">{errorPopup.message}</p>
              <div className="flex justify-end">
                <button onClick={() => setErrorPopup(null)} className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md text-sm font-bold">
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Load Model Modal */}
      {isLoadModelModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 flex items-center">
                <ListTree className="h-5 w-5 mr-2 text-indigo-500" />
                Load Model
              </h2>
              <button onClick={() => setIsLoadModelModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {savedModels.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No saved models found.</div>
              ) : (
                <ul className="space-y-3">
                  {savedModels.map((model) => (
                    <li
                      key={model.id}
                      onClick={() => loadModel(model)}
                      className="border border-gray-200 rounded-md p-4 hover:border-indigo-500 hover:bg-indigo-50 cursor-pointer transition-colors group"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-gray-800">{model.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{new Date(model.created_at).toLocaleString()}</p>
                        </div>
                        <span className="text-indigo-600 text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                          Load
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => setIsLoadModelModalOpen(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md font-bold hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Model Modal */}
      {showNewModelModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg shadow-2xl w-96 p-6 border border-gray-200 pointer-events-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center"><PlusCircle className="h-5 w-5 mr-2 text-indigo-500" /> New Model</h2>
              <button onClick={() => setShowNewModelModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-gray-600 text-sm mb-6">Are you sure you want to start a new model? Any unsaved changes will be lost.</p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setShowNewModelModal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">Cancel</button>
              <button onClick={() => {
                setNodes([]);
                setEdges([]);
                setSelectedColumns(new Map());
                const userId = user?.id || 'guest';
                localStorage.removeItem(`${userId}_dataSelectionNodes`);
                localStorage.removeItem(`${userId}_dataSelectionEdges`);
                localStorage.removeItem(`${userId}_dataSelectionColumns`);
                setActiveModel(null);
                setShowNewModelModal(false);
              }} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Confirm</button>
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
