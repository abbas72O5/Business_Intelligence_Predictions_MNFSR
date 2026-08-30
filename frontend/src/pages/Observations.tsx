import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ChartRenderer from '../components/ChartRenderer';
import type { ChartConfig } from '../components/ChartRenderer';
import { toPng, toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { LineChart, BarChart2, PieChart, ScatterChart, Settings, Database, Filter, PlusCircle, X, Trash2, Download, ChevronDown, Image as ImageIcon, FileText, Save, FolderOpen, Move, Table, Grid, Network, Map as MapIcon } from 'lucide-react';

interface ColumnMetadata {
  name: string;
  type: string;
}

interface TableMetadata {
  id: string;
  table_id: string;
  filename: string;
  columns: ColumnMetadata[];
  is_generated?: boolean;
}

export default function Observations() {
  const { token, user } = useAuth();
  const [tables, setTables] = useState<TableMetadata[]>([]);
  const [models, setModels] = useState<any[]>([]);

  const loadState = (key: string, defaultVal: any) => {
    const userId = user?.id || 'guest';
    try {
      const v = localStorage.getItem(`${userId}_${key}`);
      return v ? JSON.parse(v) : defaultVal;
    } catch {
      return defaultVal;
    }
  };

  const [charts, setCharts] = useState<ChartConfig[]>(() => {
    const saved = loadState('obs_charts', null);
    if (saved && Array.isArray(saved) && saved.length > 0) return saved;

    // Legacy migration
    const legacyDataset = loadState('obs_dataset', null);
    if (legacyDataset) {
      return [{
        id: crypto.randomUUID(),
        selectedDataset: legacyDataset,
        chartType: loadState('obs_chartType', 'bar'),
        xColumn: loadState('obs_xColumn', ''),
        yColumn: loadState('obs_yColumn', ''),
        colorColumn: '',
        sizeColumn: '',
        xAxisProps: loadState('obs_xAxisProps', { label: '', type: '' }),
        yAxisProps: loadState('obs_yAxisProps', { label: '', type: '' }),
        groupBy: loadState('obs_groupBy', false),
        aggregation: loadState('obs_aggregation', 'SUM'),
        chartData: loadState('obs_chartData', [])
      }];
    }
    return [];
  });

  const [activeDashboard, setActiveDashboard] = useState<{ id: string, name: string } | null>(() => {
    const userId = user?.id || 'guest';
    const saved = localStorage.getItem(`${userId}_obs_activeDashboard`);
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    const userId = user?.id || 'guest';
    localStorage.setItem(`${userId}_obs_activeDashboard`, JSON.stringify(activeDashboard));
  }, [activeDashboard, user?.id]);

  const [configuringChartId, setConfiguringChartId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(350);
  const [isResizing, setIsResizing] = useState(false);

  // Individual Chart Resizing State
  const [resizingChartId, setResizingChartId] = useState<string | null>(null);
  const [startSize, setStartSize] = useState({ w: 0, h: 0, x: 0, y: 0 });

  const [showXProps, setShowXProps] = useState(false);
  const [showYProps, setShowYProps] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showNewDashboardModal, setShowNewDashboardModal] = useState(false);
  const [dashboardName, setDashboardName] = useState('');
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedDashboards, setSavedDashboards] = useState<any[]>([]);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [draggableChartId, setDraggableChartId] = useState<string | null>(null);
  const [draggedChartId, setDraggedChartId] = useState<string | null>(null);
  const [dragOverChartId, setDragOverChartId] = useState<string | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string>>({});

  useEffect(() => {
    const userId = user?.id || 'guest';
    localStorage.setItem(`${userId}_obs_charts`, JSON.stringify(charts));
  }, [charts, user?.id]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 250 && newWidth < 800) {
        setPanelWidth(newWidth);
        window.dispatchEvent(new Event('resize')); // helps plotly auto-resize
      }
    };
    const handleMouseUp = () => setIsResizing(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (!resizingChartId) return;
    const chart = charts.find(c => c.id === resizingChartId);
    if (!chart) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startSize.x;
      const dy = e.clientY - startSize.y;
      const newWidth = Math.max(300, startSize.w + dx);
      const newHeight = Math.max(300, startSize.h + dy);
      updateChart(resizingChartId, { width: newWidth, height: newHeight });
      window.dispatchEvent(new Event('resize')); // helps plotly auto-resize
    };
    const handleMouseUp = () => setResizingChartId(null);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingChartId, startSize, charts]);

  useEffect(() => {
    fetchDatasets();
  }, [token]);

  const fetchDatasets = async () => {
    try {
      const [resTables, resModels] = await Promise.all([
        axios.get('http://localhost:8000/files/', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('http://localhost:8000/query/saved_models', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setTables(resTables.data);
      setModels(resModels.data);
    } catch (err) {
      console.error("Failed to load datasets", err);
    }
  };

  const addChart = () => {
    const newChart: ChartConfig = {
      id: crypto.randomUUID(),
      selectedDataset: null,
      chartType: 'bar',
      xColumn: '',
      yColumn: '',
      colorColumn: '',
      sizeColumn: '',
      latColumn: '',
      lonColumn: '',
      valColumn: '',
      labelColumn: '',
      mapType: 'bubble',
      xAxisProps: { label: '', type: '' },
      yAxisProps: { label: '', type: '' },
      tableColumns: [],
      groupBy: false,
      groupAxis: 'x',
      aggregation: 'SUM',
      chartData: null,
      width: 500,
      height: 400,
      x: 0,
      y: 0
    };
    setCharts([...charts, newChart]);
    setConfiguringChartId(newChart.id);
  };

  const removeChart = (id: string) => {
    setCharts(charts.filter(c => c.id !== id));
    if (configuringChartId === id) setConfiguringChartId(null);
  };

  const updateChart = (id: string, updates: Partial<ChartConfig>) => {
    setCharts(charts.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleDatasetSelect = (id: string, e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const [type, item_id] = val.split(':');
    let newDataset = null;

    if (type === 'table') {
      const table = tables.find(t => t.table_id === item_id);
      newDataset = table ? { type: 'table', data: table } : null;
    } else {
      const model = models.find(m => m.model_id === item_id);
      if (model) {
        model.columns_mapped = model.columns.map((c: any) => ({ name: c.alias || c.column, type: 'Any' }));
      }
      newDataset = model ? { type: 'model', data: model } : null;
    }
    updateChart(id, { selectedDataset: newDataset, xColumn: '', yColumn: '', colorColumn: '', sizeColumn: '', valColumn: '', latColumn: '', lonColumn: '', labelColumn: '', tableColumns: [], chartData: [] });
  };

  const getValidationErrors = (chart: ChartConfig) => {
    const errors: Record<string, string> = {};
    if (!chart.selectedDataset) return errors;

    const dataset = chart.selectedDataset.data;
    const columns = chart.selectedDataset.type === 'table' ? dataset.columns : dataset.columns_mapped;
    const getColMeta = (colName: string) => columns.find((c: any) => c.name === colName);

    // Required Field Checks
    if (!['map', 'table'].includes(chart.chartType)) {
      if (!chart.xColumn) errors.xColumn = "Error: This field is required.";
      if (!chart.yColumn) errors.yColumn = "Error: This field is required.";
    }
    if (chart.chartType === 'heatmap' && !chart.valColumn) {
      errors.valColumn = "Error: Values (Numeric) field is required for Matrix.";
    }
    if (chart.chartType === 'table' && (!chart.tableColumns || chart.tableColumns.length === 0)) {
      errors.tableColumns = "Error: Please select at least one column for the table.";
    }
    if (chart.chartType === 'map') {
      if (!chart.latColumn) errors.latColumn = "Error: Latitude field is required.";
      if (!chart.lonColumn) errors.lonColumn = "Error: Longitude field is required.";
      if (!chart.valColumn) errors.valColumn = "Error: Value/Size field is required for Map.";
    }

    if (chart.chartType === 'pie') {
      const xMeta = getColMeta(chart.xColumn);
      if (xMeta && xMeta.unique_count && xMeta.unique_count > 12) {
        errors.xColumn = "Warning: More than 12 unique items. Chart may become unreadable.";
      }
      const yMeta = getColMeta(chart.yColumn);
      if (yMeta && yMeta.min_val !== undefined && yMeta.min_val !== null && yMeta.min_val < 0) {
        errors.yColumn = "Error: Pie charts cannot display negative values.";
      }
    }

    if (chart.chartType === 'scatter') {
      const xMeta = getColMeta(chart.xColumn);
      const yMeta = getColMeta(chart.yColumn);
      if (xMeta && xMeta.type === 'String') errors.xColumn = "Error: Scatter requires numeric axes.";
      if (yMeta && yMeta.type === 'String') errors.yColumn = "Error: Scatter requires numeric axes.";

      if (dataset.row_count && dataset.row_count > 5000) {
        errors.dataset = "Warning: Dataset too dense. Random 5000 sample will be used.";
      }
    }

    if (chart.chartType === 'heatmap') {
      const xMeta = getColMeta(chart.xColumn);
      if (xMeta && xMeta.unique_count && xMeta.unique_count > 20) {
        errors.xColumn = "Error: Too many unique column values (>20). This risks memory explosion.";
      }
    }

    if (chart.chartType === 'treemap') {
      const yMeta = getColMeta(chart.yColumn);
      if (yMeta && yMeta.min_val !== undefined && yMeta.min_val !== null && yMeta.min_val <= 0) {
        errors.yColumn = "Warning: Negative or zero sizes will be filtered out.";
      }
      if (chart.xColumn && chart.xColumn === chart.colorColumn) {
        errors.colorColumn = "Error: Hierarchy levels must be different.";
      }
    }

    return errors;
  };

  const handleGenerateChart = async (chart: ChartConfig) => {
    if (!chart.selectedDataset) {
      setError({ ...error, [chart.id]: "Please select a dataset." });
      return;
    }

    if (chart.chartType === 'map' && (!chart.latColumn || !chart.lonColumn || !chart.valColumn)) {
      setError({ ...error, [chart.id]: "Please select Latitude, Longitude, and Value fields for the Map." });
      return;
    }

    if (chart.chartType !== 'table' && chart.chartType !== 'map' && (!chart.xColumn || !chart.yColumn)) {
      setError({ ...error, [chart.id]: "Please select X-axis and Y-axis." });
      return;
    }

    if (chart.chartType === 'table' && (!chart.tableColumns || chart.tableColumns.length === 0)) {
      setError({ ...error, [chart.id]: "Please select at least one column for the table." });
      return;
    }

    setError({ ...error, [chart.id]: '' });
    setLoading({ ...loading, [chart.id]: true });

    try {
      const dataId = chart.selectedDataset.type === 'table' ? chart.selectedDataset.data.table_id : chart.selectedDataset.data.model_id;
      const res = await axios.post('http://localhost:8000/query/observations', {
        table_id: dataId,
        dataset_type: chart.selectedDataset.type,
        chart_type: chart.chartType,
        x_column: chart.xColumn || null,
        y_column: chart.yColumn || null,
        lat_column: chart.chartType === 'map' ? (chart.latColumn || null) : null,
        lon_column: chart.chartType === 'map' ? (chart.lonColumn || null) : null,
        val_column: (chart.chartType === 'heatmap' || chart.chartType === 'map') ? (chart.valColumn || null) : null,
        color_column: (chart.chartType === 'scatter' || chart.chartType === 'treemap') ? (chart.colorColumn || null) : null,
        size_column: chart.chartType === 'scatter' ? (chart.sizeColumn || null) : null,
        label_column: chart.labelColumn || null,
        map_type: chart.chartType === 'map' ? chart.mapType : null,
        table_columns: chart.chartType === 'table' ? chart.tableColumns : null,
        x_cast_type: chart.xAxisProps.type || null,
        y_cast_type: chart.yAxisProps.type || null,
        group_by: chart.groupBy,
        group_axis: chart.groupAxis || 'x',
        aggregation: chart.groupBy ? chart.aggregation : null
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      updateChart(chart.id, { chartData: res.data });
      setConfiguringChartId(null);
    } catch (err: any) {
      console.error(err);
      let msg = "Failed to generate observation.";
      if (err.response?.data?.detail) {
        if (typeof err.response.data.detail === 'string') {
          msg = err.response.data.detail;
        } else if (Array.isArray(err.response.data.detail)) {
          msg = err.response.data.detail.map((e: any) => `${e.loc.join('.')}: ${e.msg}`).join(', ');
        }
      }
      setError(prev => ({ ...prev, [chart.id]: msg }));
      updateChart(chart.id, { chartData: [] });
    } finally {
      setLoading(prev => ({ ...prev, [chart.id]: false }));
    }
  };

  const handleExportDashboard = async (format: 'png' | 'jpeg' | 'pdf') => {
    setShowExportMenu(false);
    const dashboardEl = document.getElementById('dashboard-canvas');
    if (!dashboardEl) return;

    try {
      const options = {
        backgroundColor: '#f9fafb', // matching tailwind bg-gray-50
        pixelRatio: 2 // higher res
      };

      if (format === 'pdf') {
        const dataUrl = await toPng(dashboardEl, options);
        const pdf = new jsPDF({
          orientation: dashboardEl.clientWidth > dashboardEl.clientHeight ? 'l' : 'p',
          unit: 'px',
          format: [dashboardEl.clientWidth, dashboardEl.clientHeight]
        });
        pdf.addImage(dataUrl, 'PNG', 0, 0, dashboardEl.clientWidth, dashboardEl.clientHeight);
        pdf.save('dashboard-export.pdf');
      } else {
        const dataUrl = format === 'png' ? await toPng(dashboardEl, options) : await toJpeg(dashboardEl, options);
        const link = document.createElement('a');
        link.download = `dashboard-export.${format}`;
        link.href = dataUrl;
        link.click();
      }
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const saveDashboard = async () => {
    if (!activeDashboard && !dashboardName) return;
    try {
      if (activeDashboard) {
        // Update existing dashboard
        await axios.put(`http://localhost:8000/dashboards/${activeDashboard.id}`, {
          charts: charts
        }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        showToast("Dashboard updated successfully!");
      } else {
        // Create new dashboard
        const response = await axios.post('http://localhost:8000/dashboards/', {
          name: dashboardName,
          charts: charts,
          type: 'observation'
        }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setActiveDashboard({ id: response.data.dashboard_id, name: response.data.name });
        setShowSaveModal(false);
        setDashboardName('');
        showToast("Dashboard saved successfully!");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to save dashboard.", "error");
    }
  };

  const openLoadModal = async () => {
    try {
      const response = await axios.get('http://localhost:8000/dashboards/', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setSavedDashboards(response.data);
      setShowLoadModal(true);
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch dashboards.", "error");
    }
  };

  const loadDashboard = async (id: string) => {
    try {
      const response = await axios.get(`http://localhost:8000/dashboards/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setCharts(response.data.charts);
      setActiveDashboard({ id: response.data.dashboard_id, name: response.data.name });
      setShowLoadModal(false);
      showToast("Dashboard loaded successfully!");
    } catch (err) {
      console.error(err);
      showToast("Failed to load dashboard.", "error");
    }
  };

  useEffect(() => {
    const userId = user?.id || 'guest';
    const autoLoadId = localStorage.getItem(`${userId}_obs_auto_load_id`);
    if (autoLoadId) {
      loadDashboard(autoLoadId);
      localStorage.removeItem(`${userId}_obs_auto_load_id`);
    }
  }, [user?.id]);

  // renderPlot has been moved to ChartRenderer

  const configuringChart = charts.find(c => c.id === configuringChartId);

  return (
    <div className="animate-in fade-in duration-500 h-full flex flex-col overflow-hidden bg-gray-50 relative">

      {/* Toast Notification */}
      {toast && (
        <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg text-white font-medium animate-in slide-in-from-top-5 fade-in ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-4 px-2 pt-2">
        <h1 className="text-2xl font-bold text-gray-900">Visual Observations Dashboard</h1>
        <div className="flex space-x-3">

          {/* New Dashboard */}
          <button
            onClick={() => setShowNewDashboardModal(true)}
            className="flex items-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md font-medium transition-colors"
          >
            <PlusCircle className="h-5 w-5 mr-2 text-indigo-500" /> New
          </button>

          {/* Load Dashboard */}
          <button onClick={openLoadModal} className="flex items-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md font-medium transition-colors">
            <FolderOpen className="h-5 w-5 mr-2 text-blue-500" /> Load
          </button>

          {/* Save Dashboard */}
          <button onClick={() => activeDashboard ? saveDashboard() : setShowSaveModal(true)} className="flex items-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md font-medium transition-colors">
            <Save className="h-5 w-5 mr-2 text-green-500" /> {activeDashboard ? 'Save' : 'Save As'}
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md font-medium transition-colors"
            >
              <Download className="h-5 w-5 mr-2 text-gray-500" /> Export <ChevronDown className="h-4 w-4 ml-1 text-gray-400" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50 py-1 animate-in fade-in zoom-in-95">
                <button onClick={() => handleExportDashboard('png')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center">
                  <ImageIcon className="h-4 w-4 mr-2 text-gray-400" /> Save as PNG
                </button>
                <button onClick={() => handleExportDashboard('jpeg')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center">
                  <ImageIcon className="h-4 w-4 mr-2 text-gray-400" /> Save as JPEG
                </button>
                <button onClick={() => handleExportDashboard('pdf')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center">
                  <FileText className="h-4 w-4 mr-2 text-gray-400" /> Save as PDF
                </button>
              </div>
            )}
          </div>

          <button onClick={addChart} className="flex items-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium transition-colors">
            <PlusCircle className="h-5 w-5 mr-2" /> Add Visual
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-row overflow-hidden relative bg-gray-200">
        <div className="flex-1 overflow-y-auto p-4" style={{ pointerEvents: isResizing ? 'none' : 'auto' }}>
          <div
            id="dashboard-canvas"
            className="bg-gray-50 border border-gray-300 shadow-sm rounded-lg p-6 mx-auto resize overflow-hidden"
            style={{ minWidth: '600px', width: '100%', minHeight: '100%' }}
          >
            {charts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg bg-white mt-10">
                <BarChart2 className="h-16 w-16 mb-4 text-gray-300" />
                <p>Your dashboard is empty. Click "Add Visual" to create a chart.</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-6 items-start pb-8">
                {charts.map(chart => (
                  <div
                    key={chart.id}
                    draggable={draggableChartId === chart.id}
                    onDragStart={(e) => {
                      setDraggedChartId(chart.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverChartId !== chart.id) setDragOverChartId(chart.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverChartId === chart.id) setDragOverChartId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedChartId && draggedChartId !== chart.id) {
                        const fromIndex = charts.findIndex(c => c.id === draggedChartId);
                        const toIndex = charts.findIndex(c => c.id === chart.id);
                        if (fromIndex !== -1 && toIndex !== -1) {
                          const newCharts = [...charts];
                          const [movedChart] = newCharts.splice(fromIndex, 1);
                          newCharts.splice(toIndex, 0, movedChart);
                          setCharts(newCharts);
                        }
                      }
                      setDraggedChartId(null);
                      setDragOverChartId(null);
                    }}
                    onDragEnd={() => {
                      setDraggedChartId(null);
                      setDragOverChartId(null);
                    }}
                    style={{ width: chart.width || 500, height: chart.height || 450 }}
                    className={`bg-white rounded-lg shadow-sm border ${configuringChartId === chart.id ? 'border-green-500 ring-2 ring-green-200' : 'border-gray-200'} ${dragOverChartId === chart.id ? 'border-blue-500 border-2 border-dashed opacity-75' : ''} ${draggedChartId === chart.id ? 'opacity-50' : ''} flex flex-col relative group cursor-pointer transition-all duration-200`}
                    onClick={() => setConfiguringChartId(chart.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setConfiguringChartId(chart.id);
                    }}
                  >
                    {/* Drag Handle */}
                    <div
                      className="absolute top-2 left-2 p-1.5 cursor-move opacity-0 group-hover:opacity-100 transition-opacity z-20 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"
                      title="Drag to move"
                      onMouseEnter={() => setDraggableChartId(chart.id)}
                      onMouseLeave={() => setDraggableChartId(null)}
                    >
                      <Move className="h-4 w-4" />
                    </div>

                    {/* Header Actions */}
                    <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      {chart.chartType === 'heatmap' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateChart(chart.id, { matrixMode: chart.matrixMode === 'heatmap' ? 'grid' : 'heatmap' });
                          }}
                          className="flex items-center px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-md text-xs font-medium"
                          title="Toggle Matrix View"
                        >
                          {chart.matrixMode === 'heatmap' ? (
                            <><Table className="h-3 w-3 mr-1" /> Grid</>
                          ) : (
                            <><Grid className="h-3 w-3 mr-1" /> Heat-Map</>
                          )}
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); removeChart(chart.id); }} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-md" title="Remove Visual">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Chart Area */}
                    <div className="flex-1 w-full h-full relative p-2 pt-8">
                      {error[chart.id] ? (
                        <div className="flex flex-col items-center justify-center h-full text-red-500 p-4 text-center">
                          <BarChart2 className="h-12 w-12 mb-2 text-red-200" />
                          <p className="text-sm font-semibold text-red-600">Generation Failed</p>
                          <p className="mt-1 text-xs text-red-500 break-words">{error[chart.id]}</p>
                        </div>
                      ) : !chart.chartData || chart.chartData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                          <BarChart2 className="h-12 w-12 mb-2 text-gray-200" />
                          <p className="text-sm">Not Configured</p>
                          <p className="mt-2 text-xs text-green-600 font-medium">Click to configure</p>
                        </div>
                      ) : (
                        <ChartRenderer chart={chart} overrideWidth="100%" overrideHeight="100%" />
                      )}
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-20 opacity-0 group-hover:opacity-100"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setResizingChartId(chart.id);
                        setStartSize({ w: chart.width || 500, h: chart.height || 450, x: e.clientX, y: e.clientY });
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full text-gray-400">
                        <path d="M15 21v-6h6M21 21l-7-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Resizer Handle */}
        {configuringChart && (
          <div
            className="w-1.5 bg-gray-200 hover:bg-green-500 cursor-col-resize transition-colors flex items-center justify-center group"
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
          >
            <div className="h-8 w-0.5 bg-gray-400 group-hover:bg-white rounded"></div>
          </div>
        )}

        {/* Properties Panel (Right Sidebar) */}
        {configuringChart && (
          <div
            style={{ width: `${panelWidth}px` }}
            className="bg-white border-l border-gray-200 flex flex-col h-full shadow-lg shrink-0"
          >
            <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center text-gray-800 font-bold">
                <Settings className="h-5 w-5 mr-2 text-gray-500" /> Properties
              </div>
              <button onClick={() => setConfiguringChartId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Dataset Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                  <Database className="h-4 w-4 mr-1" /> Dataset
                </label>
                <select
                  className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500"
                  onChange={(e) => handleDatasetSelect(configuringChart.id, e)}
                  value={configuringChart.selectedDataset ? `${configuringChart.selectedDataset.type}:${configuringChart.selectedDataset.data.table_id || configuringChart.selectedDataset.data.model_id}` : ""}
                >
                  <option value="" disabled>Select a dataset...</option>
                  {models.length > 0 && (
                    <optgroup label="Saved Models (Logical)">
                      {models.map(m => (
                        <option key={`model:${m.model_id}`} value={`model:${m.model_id}`}>{m.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {tables.length > 0 && (
                    <optgroup label="Physical Tables">
                      {tables.map(t => (
                        <option key={`table:${t.table_id}`} value={`table:${t.table_id}`}>{t.filename}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {configuringChart.selectedDataset && (() => {
                const fieldErrors = getValidationErrors(configuringChart);
                return (
                  <>
                    {/* Chart Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Chart Type</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateChart(configuringChart.id, { chartType: 'bar' })} className={`flex items-center justify-center py-2 px-3 border rounded-md text-sm ${configuringChart.chartType === 'bar' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <BarChart2 className="h-4 w-4 mr-1" /> Bar
                        </button>
                        <button onClick={() => updateChart(configuringChart.id, { chartType: 'line' })} className={`flex items-center justify-center py-2 px-3 border rounded-md text-sm ${configuringChart.chartType === 'line' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <LineChart className="h-4 w-4 mr-1" /> Line
                        </button>
                        <button onClick={() => updateChart(configuringChart.id, { chartType: 'pie' })} className={`flex items-center justify-center py-2 px-3 border rounded-md text-sm ${configuringChart.chartType === 'pie' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <PieChart className="h-4 w-4 mr-1" /> Pie
                        </button>
                        <button onClick={() => updateChart(configuringChart.id, { chartType: 'scatter' })} className={`flex items-center justify-center py-2 px-3 border rounded-md text-sm ${configuringChart.chartType === 'scatter' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <ScatterChart className="h-4 w-4 mr-1" /> Scatter
                        </button>
                        <button onClick={() => updateChart(configuringChart.id, { chartType: 'table' })} className={`flex items-center justify-center py-2 px-3 border rounded-md text-sm ${configuringChart.chartType === 'table' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <Table className="h-4 w-4 mr-1" /> Table
                        </button>
                        <button onClick={() => updateChart(configuringChart.id, { chartType: 'heatmap' })} className={`flex items-center justify-center py-2 px-3 border rounded-md text-sm ${configuringChart.chartType === 'heatmap' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <Grid className="h-4 w-4 mr-1" /> Matrix
                        </button>
                        <button onClick={() => updateChart(configuringChart.id, { chartType: 'treemap' })} className={`flex items-center justify-center py-2 px-3 border rounded-md text-sm ${configuringChart.chartType === 'treemap' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <Network className="h-4 w-4 mr-1" /> Tree
                        </button>
                        <button onClick={() => updateChart(configuringChart.id, { chartType: 'map' })} className={`flex items-center justify-center py-2 px-3 border rounded-md text-sm ${configuringChart.chartType === 'map' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <MapIcon className="h-4 w-4 mr-1" /> Map
                        </button>
                      </div>
                    </div>

                    {/* Axis Configuration */}
                    {configuringChart.chartType === 'table' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Select Columns</label>
                        <div className={`bg-white border ${fieldErrors?.tableColumns ? 'border-red-500' : 'border-gray-300'} rounded-md p-2 max-h-48 overflow-y-auto`}>
                          {(configuringChart.selectedDataset.type === 'table' ? configuringChart.selectedDataset.data.columns : configuringChart.selectedDataset.data.columns_mapped).map((c: any) => {
                            const isChecked = (configuringChart.tableColumns || []).includes(c.name);
                            return (
                              <label key={c.name} className="flex items-center space-x-2 py-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const currentCols = configuringChart.tableColumns || [];
                                    if (e.target.checked) {
                                      updateChart(configuringChart.id, { tableColumns: [...currentCols, c.name] });
                                    } else {
                                      updateChart(configuringChart.id, { tableColumns: currentCols.filter(col => col !== c.name) });
                                    }
                                  }}
                                  className="rounded text-green-600 focus:ring-green-500"
                                />
                                <span className="text-sm text-gray-700">{c.name} {c.type !== 'Any' ? `(${c.type})` : ''}</span>
                              </label>
                            );
                          })}
                        </div>
                        {fieldErrors?.tableColumns && <p className="text-xs mt-2 text-red-500">{fieldErrors.tableColumns}</p>}
                      </div>
                    ) : configuringChart.chartType === 'map' ? (
                      <div>
                        <div className="flex space-x-2 mb-4">
                          <button onClick={() => updateChart(configuringChart.id, { mapType: 'bubble' })} className={`flex-1 py-1.5 text-xs font-medium border rounded ${configuringChart.mapType === 'bubble' ? 'bg-green-100 border-green-500 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>Bubble Map</button>
                          <button onClick={() => updateChart(configuringChart.id, { mapType: 'heat' })} className={`flex-1 py-1.5 text-xs font-medium border rounded ${configuringChart.mapType === 'heat' ? 'bg-green-100 border-green-500 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>Heat Map</button>
                        </div>

                        <label className="block text-sm font-medium text-gray-700 mb-1">Latitude Field (Numeric)</label>
                        <select value={configuringChart.latColumn || ''} onChange={(e) => updateChart(configuringChart.id, { latColumn: e.target.value })} className={`w-full border rounded-md p-2 text-sm mb-1 ${fieldErrors.latColumn ? 'border-red-500' : 'border-gray-300 focus:ring-green-500 focus:border-green-500'}`}>
                          <option value="" disabled>Select column...</option>
                          {(configuringChart.selectedDataset.type === 'table' ? configuringChart.selectedDataset.data.columns : configuringChart.selectedDataset.data.columns_mapped).map((c: any) => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                        {fieldErrors.latColumn && <p className="text-xs mb-3 text-red-500">{fieldErrors.latColumn}</p>}

                        <label className="block text-sm font-medium text-gray-700 mb-1">Longitude Field (Numeric)</label>
                        <select value={configuringChart.lonColumn || ''} onChange={(e) => updateChart(configuringChart.id, { lonColumn: e.target.value })} className={`w-full border rounded-md p-2 text-sm mb-1 ${fieldErrors.lonColumn ? 'border-red-500' : 'border-gray-300 focus:ring-green-500 focus:border-green-500'}`}>
                          <option value="" disabled>Select column...</option>
                          {(configuringChart.selectedDataset.type === 'table' ? configuringChart.selectedDataset.data.columns : configuringChart.selectedDataset.data.columns_mapped).map((c: any) => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                        {fieldErrors.lonColumn && <p className="text-xs mb-3 text-red-500">{fieldErrors.lonColumn}</p>}

                        <label className="block text-sm font-medium text-gray-700 mb-1">Value/Size Field (Numeric)</label>
                        <select value={configuringChart.valColumn || ''} onChange={(e) => updateChart(configuringChart.id, { valColumn: e.target.value })} className={`w-full border rounded-md p-2 text-sm mb-1 ${fieldErrors.valColumn ? 'border-red-500' : 'border-gray-300 focus:ring-green-500 focus:border-green-500'}`}>
                          <option value="" disabled>Select column...</option>
                          {(configuringChart.selectedDataset.type === 'table' ? configuringChart.selectedDataset.data.columns : configuringChart.selectedDataset.data.columns_mapped).map((c: any) => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                        {fieldErrors.valColumn && <p className="text-xs mb-3 text-red-500">{fieldErrors.valColumn}</p>}

                        <label className="block text-sm font-medium text-gray-700 mb-1">Label Field (String)</label>
                        <select value={configuringChart.labelColumn || ''} onChange={(e) => updateChart(configuringChart.id, { labelColumn: e.target.value })} className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500 mb-3">
                          <option value="">(None)</option>
                          {(configuringChart.selectedDataset.type === 'table' ? configuringChart.selectedDataset.data.columns : configuringChart.selectedDataset.data.columns_mapped).map((c: any) => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                          ))}
                        </select>

                        <label className="flex items-center space-x-2 mt-4 cursor-pointer">
                          <input type="checkbox" checked={configuringChart.groupBy} onChange={(e) => updateChart(configuringChart.id, { groupBy: e.target.checked })} className="rounded text-green-600 focus:ring-green-500" />
                          <span className="text-sm font-medium text-gray-700">Aggregate Multiple Points</span>
                        </label>
                        {configuringChart.groupBy && (
                          <select value={configuringChart.aggregation} onChange={(e) => updateChart(configuringChart.id, { aggregation: e.target.value })} className="w-full mt-2 border border-gray-300 rounded-md p-2 text-sm">
                            <option value="SUM">SUM</option>
                            <option value="AVG">AVERAGE</option>
                            <option value="MAX">MAX</option>
                            <option value="MIN">MIN</option>
                            <option value="COUNT">COUNT</option>
                          </select>
                        )}
                      </div>
                    ) : (
                      <div>
                        {(() => {
                          const type = configuringChart.chartType;
                          const xLabel = type === 'pie' ? 'Legend (Category)' : type === 'heatmap' ? 'Columns (Category)' : type === 'treemap' ? 'Main Category (Category)' : 'X-Axis (Category)';
                          const yLabel = type === 'pie' ? 'Values (Numeric)' : type === 'heatmap' ? 'Rows (Category)' : type === 'treemap' ? 'Box Size (Numeric)' : 'Y-Axis (Value)';

                          const showColor = type === 'scatter' || type === 'treemap';
                          const colorLabel = type === 'scatter' ? 'Color By (Category)' : 'Sub-Category (Category)';
                          const showSize = type === 'scatter';
                          const sizeLabel = 'Bubble Size (Numeric)';
                          const showVal = type === 'heatmap';
                          const valLabel = 'Values (Numeric)';

                          return (
                            <>
                              {fieldErrors.dataset && (
                                <div className="text-yellow-600 text-xs p-2 mb-3 bg-yellow-50 rounded-md border border-yellow-200">
                                  {fieldErrors.dataset}
                                </div>
                              )}
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">{xLabel}</label>
                                <button onClick={() => setShowXProps(!showXProps)} className="text-gray-400 hover:text-green-600 focus:outline-none" title="Axis Properties">
                                  <Settings className="h-4 w-4" />
                                </button>
                              </div>
                              <select
                                value={configuringChart.xColumn}
                                onChange={(e) => updateChart(configuringChart.id, { xColumn: e.target.value })}
                                className={`w-full border rounded-md p-2 text-sm mb-2 ${fieldErrors.xColumn ? (fieldErrors.xColumn.includes('Error') ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-yellow-500 focus:ring-yellow-500 focus:border-yellow-500') : 'border-gray-300 focus:ring-green-500 focus:border-green-500'}`}
                              >
                                <option value="" disabled>Select column...</option>
                                {(configuringChart.selectedDataset.type === 'table'
                                  ? configuringChart.selectedDataset.data.columns.filter((c: any) => type !== 'heatmap' || c.type === 'String' || c.type === 'Integer')
                                  : configuringChart.selectedDataset.data.columns_mapped).map((c: any) => (
                                    <option key={c.name} value={c.name}>{c.name} {c.type !== 'Any' ? `(${c.type})` : ''}</option>
                                  ))}
                              </select>
                              {fieldErrors.xColumn && <p className={`text-xs mb-2 ${fieldErrors.xColumn.includes('Error') ? 'text-red-500' : 'text-yellow-600'}`}>{fieldErrors.xColumn}</p>}

                              {showXProps && (
                                <div className="bg-gray-50 border border-gray-200 rounded p-2 mb-3 grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <label className="block text-gray-600 mb-1">Display Label</label>
                                    <input type="text" value={configuringChart.xAxisProps.label} onChange={e => updateChart(configuringChart.id, { xAxisProps: { ...configuringChart.xAxisProps, label: e.target.value } })} className="w-full border border-gray-300 rounded px-2 py-1" placeholder="e.g. Dept" />
                                  </div>
                                  <div>
                                    <label className="block text-gray-600 mb-1">Data Type Cast</label>
                                    <select value={configuringChart.xAxisProps.type} onChange={e => updateChart(configuringChart.id, { xAxisProps: { ...configuringChart.xAxisProps, type: e.target.value } })} className="w-full border border-gray-300 rounded px-2 py-1 bg-white">
                                      <option value="">(None)</option>
                                      <option value="String">String</option>
                                      <option value="Integer">Integer</option>
                                      <option value="Float">Float</option>
                                      <option value="Boolean">Boolean</option>
                                      <option value="Date">Date</option>
                                    </select>
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center justify-between mb-1 mt-3">
                                <label className="block text-sm font-medium text-gray-700">{yLabel}</label>
                                <button onClick={() => setShowYProps(!showYProps)} className="text-gray-400 hover:text-green-600 focus:outline-none" title="Axis Properties">
                                  <Settings className="h-4 w-4" />
                                </button>
                              </div>
                              <select
                                value={configuringChart.yColumn}
                                onChange={(e) => updateChart(configuringChart.id, { yColumn: e.target.value })}
                                className={`w-full border rounded-md p-2 text-sm mb-2 ${fieldErrors.yColumn ? (fieldErrors.yColumn.includes('Error') ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-yellow-500 focus:ring-yellow-500 focus:border-yellow-500') : 'border-gray-300 focus:ring-green-500 focus:border-green-500'}`}
                              >
                                <option value="" disabled>Select column...</option>
                                {(configuringChart.selectedDataset.type === 'table'
                                  ? configuringChart.selectedDataset.data.columns.filter((c: any) => type === 'heatmap' ? (c.type === 'String' || c.type === 'Integer') : ((configuringChart.groupBy && configuringChart.aggregation === 'COUNT') || c.type === 'Integer' || c.type === 'Float'))
                                  : (configuringChart.selectedDataset.data.columns_mapped || [])
                                ).map((c: any) => (
                                  <option key={c.name} value={c.name}>{c.name} {c.type !== 'Any' ? `(${c.type})` : ''}</option>
                                ))}
                              </select>
                              {fieldErrors.yColumn && <p className={`text-xs mb-2 ${fieldErrors.yColumn.includes('Error') ? 'text-red-500' : 'text-yellow-600'}`}>{fieldErrors.yColumn}</p>}

                              {showYProps && (
                                <div className="bg-gray-50 border border-gray-200 rounded p-2 mt-2 grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <label className="block text-gray-600 mb-1">Display Label</label>
                                    <input type="text" value={configuringChart.yAxisProps.label} onChange={e => updateChart(configuringChart.id, { yAxisProps: { ...configuringChart.yAxisProps, label: e.target.value } })} className="w-full border border-gray-300 rounded px-2 py-1" placeholder="e.g. Value" />
                                  </div>
                                  <div>
                                    <label className="block text-gray-600 mb-1">Data Type Cast</label>
                                    <select value={configuringChart.yAxisProps.type} onChange={e => updateChart(configuringChart.id, { yAxisProps: { ...configuringChart.yAxisProps, type: e.target.value } })} className="w-full border border-gray-300 rounded px-2 py-1 bg-white">
                                      <option value="">(None)</option>
                                      <option value="String">String</option>
                                      <option value="Integer">Integer</option>
                                      <option value="Float">Float</option>
                                      <option value="Boolean">Boolean</option>
                                      <option value="Date">Date</option>
                                    </select>
                                  </div>
                                </div>
                              )}

                              {showColor && (
                                <div className="mt-3">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">{colorLabel}</label>
                                  <select
                                    value={configuringChart.colorColumn || ''}
                                    onChange={(e) => updateChart(configuringChart.id, { colorColumn: e.target.value })}
                                    className={`w-full border rounded-md p-2 text-sm mb-2 ${fieldErrors.colorColumn ? (fieldErrors.colorColumn.includes('Error') ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-yellow-500 focus:ring-yellow-500 focus:border-yellow-500') : 'border-gray-300 focus:ring-green-500 focus:border-green-500'}`}
                                  >
                                    <option value="">(None)</option>
                                    {(configuringChart.selectedDataset.type === 'table' ? configuringChart.selectedDataset.data.columns : (configuringChart.selectedDataset.data.columns_mapped || [])).map((c: any) => (
                                      <option key={c.name} value={c.name}>{c.name} {c.type !== 'Any' ? `(${c.type})` : ''}</option>
                                    ))}
                                  </select>
                                  {fieldErrors.colorColumn && <p className={`text-xs mb-2 ${fieldErrors.colorColumn.includes('Error') ? 'text-red-500' : 'text-yellow-600'}`}>{fieldErrors.colorColumn}</p>}
                                </div>
                              )}

                              {showSize && (
                                <div className="mt-3">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">{sizeLabel}</label>
                                  <select
                                    value={configuringChart.sizeColumn || ''}
                                    onChange={(e) => updateChart(configuringChart.id, { sizeColumn: e.target.value })}
                                    className={`w-full border rounded-md p-2 text-sm mb-2 ${fieldErrors.sizeColumn ? (fieldErrors.sizeColumn.includes('Error') ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-yellow-500 focus:ring-yellow-500 focus:border-yellow-500') : 'border-gray-300 focus:ring-green-500 focus:border-green-500'}`}
                                  >
                                    <option value="">(None)</option>
                                    {(configuringChart.selectedDataset.type === 'table' ? configuringChart.selectedDataset.data.columns.filter((c: any) => c.type === 'Integer' || c.type === 'Float') : (configuringChart.selectedDataset.data.columns_mapped || [])).map((c: any) => (
                                      <option key={c.name} value={c.name}>{c.name} {c.type !== 'Any' ? `(${c.type})` : ''}</option>
                                    ))}
                                  </select>
                                  {fieldErrors.sizeColumn && <p className={`text-xs mb-2 ${fieldErrors.sizeColumn.includes('Error') ? 'text-red-500' : 'text-yellow-600'}`}>{fieldErrors.sizeColumn}</p>}
                                </div>
                              )}

                              {showVal && (
                                <div className="mt-3">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">{valLabel}</label>
                                  <select
                                    value={configuringChart.valColumn || ''}
                                    onChange={(e) => updateChart(configuringChart.id, { valColumn: e.target.value })}
                                    className={`w-full border rounded-md p-2 text-sm mb-2 ${fieldErrors.valColumn ? (fieldErrors.valColumn.includes('Error') ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-yellow-500 focus:ring-yellow-500 focus:border-yellow-500') : 'border-gray-300 focus:ring-green-500 focus:border-green-500'}`}
                                  >
                                    <option value="">(None)</option>
                                    {(configuringChart.selectedDataset.type === 'table' ? configuringChart.selectedDataset.data.columns.filter((c: any) => c.type === 'Integer' || c.type === 'Float') : (configuringChart.selectedDataset.data.columns_mapped || [])).map((c: any) => (
                                      <option key={c.name} value={c.name}>{c.name} {c.type !== 'Any' ? `(${c.type})` : ''}</option>
                                    ))}
                                  </select>
                                  {fieldErrors.valColumn && <p className={`text-xs mb-2 ${fieldErrors.valColumn.includes('Error') ? 'text-red-500' : 'text-yellow-600'}`}>{fieldErrors.valColumn}</p>}
                                </div>
                              )}

                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Data Operations */}
                    {configuringChart.chartType !== 'table' && configuringChart.chartType !== 'map' && (
                      <div className="pt-4 border-t border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-sm font-medium text-gray-700 flex items-center">
                            <Filter className="h-4 w-4 mr-1" /> Group By
                          </label>
                          <input
                            type="checkbox"
                            checked={configuringChart.groupBy}
                            onChange={(e) => updateChart(configuringChart.id, { groupBy: e.target.checked })}
                            className="h-4 w-4 text-green-600 rounded focus:ring-green-500 cursor-pointer"
                          />
                        </div>

                        {configuringChart.groupBy && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Aggregation Function</label>
                            <select
                              value={configuringChart.aggregation}
                              onChange={(e) => updateChart(configuringChart.id, { aggregation: e.target.value })}
                              className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500 mb-3"
                            >
                              <option value="SUM">Sum (Total)</option>
                              <option value="AVG">Average</option>
                              <option value="COUNT">Count</option>
                              <option value="MIN">Minimum</option>
                              <option value="MAX">Maximum</option>
                            </select>

                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {configuringChart.chartType === 'heatmap' ? 'Grouping Field' : 'Grouping Axis'}
                            </label>
                            <select
                              value={configuringChart.groupAxis || 'x'}
                              onChange={(e) => updateChart(configuringChart.id, { groupAxis: e.target.value as 'x' | 'y' })}
                              className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500"
                            >
                              <option value="x">{configuringChart.chartType === 'heatmap' ? 'Columns' : 'X-Axis'}</option>
                              <option value="y">{configuringChart.chartType === 'heatmap' ? 'Rows' : 'Y-Axis'}</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {error[configuringChart.id] && (
                      <div className="text-red-600 text-sm p-2 bg-red-50 rounded-md border border-red-200">
                        {error[configuringChart.id]}
                      </div>
                    )}

                  </>
                );
              })()}
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => handleGenerateChart(configuringChart)}
                disabled={loading[configuringChart.id] || !configuringChart.selectedDataset || Object.values(getValidationErrors(configuringChart)).some(e => e.includes('Error'))}
                className="w-full bg-green-600 text-white py-2 rounded-md font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {loading[configuringChart.id] ? 'Processing...' : 'Generate & Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Save Dashboard Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg shadow-2xl w-96 p-6 border border-gray-200 pointer-events-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Save Dashboard</h2>
              <button onClick={() => setShowSaveModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-gray-600 text-sm mb-4">Save your current dashboard layout to access it later.</p>
            <input
              type="text"
              placeholder="Dashboard Name"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border mb-4"
              value={dashboardName}
              onChange={e => setDashboardName(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">Cancel</button>
              <button onClick={saveDashboard} disabled={!dashboardName} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Load Dashboard Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg shadow-2xl w-[500px] p-6 max-h-[80vh] flex flex-col border border-gray-200 pointer-events-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center"><FolderOpen className="h-5 w-5 mr-2 text-blue-500" /> Load Dashboard</h2>
              <button onClick={() => setShowLoadModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 border border-gray-200 rounded-md">
              {savedDashboards.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No saved dashboards found.</div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {savedDashboards.map(db => (
                    <li key={db.dashboard_id} className="p-4 hover:bg-gray-50 flex justify-between items-center group cursor-pointer" onClick={() => loadDashboard(db.dashboard_id)}>
                      <div>
                        <p className="font-semibold text-gray-800">{db.name}</p>
                        <p className="text-xs text-gray-500">{new Date(db.created_at).toLocaleString()}</p>
                      </div>
                      <span className="text-blue-600 text-sm opacity-0 group-hover:opacity-100 transition-opacity font-medium">Load</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowLoadModal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Global Resize Overlay to prevent iframe event swallowing */}
      {resizingChartId && (
        <div className="fixed inset-0 z-[9999] cursor-se-resize" />
      )}

      {/* New Dashboard Modal */}
      {showNewDashboardModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg shadow-2xl w-96 p-6 border border-gray-200 pointer-events-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center"><PlusCircle className="h-5 w-5 mr-2 text-indigo-500" /> New Dashboard</h2>
              <button onClick={() => setShowNewDashboardModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-gray-600 text-sm mb-6">Are you sure you want to start a new dashboard? Any unsaved changes will be lost.</p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setShowNewDashboardModal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">Cancel</button>
              <button onClick={() => {
                setCharts([]);
                setActiveDashboard(null);
                setConfiguringChartId(null);
                setShowNewDashboardModal(false);
              }} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
