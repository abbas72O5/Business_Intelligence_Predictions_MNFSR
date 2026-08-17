import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Plot from 'react-plotly.js';
import { toPng, toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { LineChart, BarChart2, PieChart, ScatterChart, Settings, Database, Filter, PlusCircle, X, Trash2, Download, ChevronDown, Image as ImageIcon, FileText, Save, FolderOpen } from 'lucide-react';

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

interface ChartConfig {
  id: string;
  selectedDataset: { type: string, data: any } | null;
  chartType: string;
  xColumn: string;
  yColumn: string;
  xAxisProps: { label: string; type: string };
  yAxisProps: { label: string; type: string };
  groupBy: boolean;
  aggregation: string;
  chartData: any[];
  width?: number;
  height?: number;
}

export default function Observations() {
  const { token } = useAuth();
  const [tables, setTables] = useState<TableMetadata[]>([]);
  const [models, setModels] = useState<any[]>([]);

  const loadState = (key: string, defaultVal: any) => {
    try {
      const v = localStorage.getItem(key);
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
        xAxisProps: loadState('obs_xAxisProps', { label: '', type: '' }),
        yAxisProps: loadState('obs_yAxisProps', { label: '', type: '' }),
        groupBy: loadState('obs_groupBy', false),
        aggregation: loadState('obs_aggregation', 'SUM'),
        chartData: loadState('obs_chartData', [])
      }];
    }
    return [];
  });

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
  const [dashboardName, setDashboardName] = useState('');
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedDashboards, setSavedDashboards] = useState<any[]>([]);

  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string>>({});

  useEffect(() => {
    localStorage.setItem('obs_charts', JSON.stringify(charts));
  }, [charts]);

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
      xAxisProps: { label: '', type: '' },
      yAxisProps: { label: '', type: '' },
      groupBy: false,
      aggregation: 'SUM',
      chartData: [],
      width: 500,
      height: 450
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
    updateChart(id, { selectedDataset: newDataset, xColumn: '', yColumn: '', chartData: [] });
  };

  const handleGenerateChart = async (chart: ChartConfig) => {
    if (!chart.selectedDataset || !chart.xColumn || !chart.yColumn) {
      setError({ ...error, [chart.id]: "Please select a dataset, X-axis, and Y-axis." });
      return;
    }

    setError({ ...error, [chart.id]: '' });
    setLoading({ ...loading, [chart.id]: true });

    try {
      const dataId = chart.selectedDataset.type === 'table' ? chart.selectedDataset.data.table_id : chart.selectedDataset.data.model_id;
      const res = await axios.post('http://localhost:8000/query/observations', {
        table_id: dataId,
        dataset_type: chart.selectedDataset.type,
        x_column: chart.xColumn,
        y_column: chart.yColumn,
        x_cast_type: chart.xAxisProps.type || null,
        y_cast_type: chart.yAxisProps.type || null,
        group_by: chart.groupBy,
        aggregation: chart.groupBy ? chart.aggregation : null
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      updateChart(chart.id, { chartData: res.data });
      setConfiguringChartId(null);
    } catch (err: any) {
      setError({ ...error, [chart.id]: err.response?.data?.detail || "Failed to generate chart data." });
      updateChart(chart.id, { chartData: [] });
    } finally {
      setLoading({ ...loading, [chart.id]: false });
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
    if (!dashboardName) return;
    try {
      await axios.post('http://localhost:8000/dashboards/', {
        name: dashboardName,
        charts: charts
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setShowSaveModal(false);
      setDashboardName('');
    } catch (err) {
      console.error(err);
      alert("Failed to save dashboard.");
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
      alert("Failed to fetch dashboards.");
    }
  };

  const loadDashboard = async (id: string) => {
    try {
      const response = await axios.get(`http://localhost:8000/dashboards/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setCharts(response.data.charts);
      setShowLoadModal(false);
    } catch (err) {
      console.error(err);
      alert("Failed to load dashboard.");
    }
  };

  const renderPlot = (chart: ChartConfig) => {
    if (chart.chartData.length === 0) return null;

    const xValues = chart.chartData.map(d => d[chart.xColumn]);
    const yValues = chart.chartData.map(d => d[chart.yColumn]);

    let data: any[] = [];

    if (chart.chartType === 'bar') {
      data = [{ type: 'bar', x: xValues, y: yValues, marker: { color: '#16a34a' } }];
    } else if (chart.chartType === 'line') {
      data = [{ type: 'scatter', mode: 'lines+markers', x: xValues, y: yValues, line: { color: '#16a34a' } }];
    } else if (chart.chartType === 'scatter') {
      data = [{ type: 'scatter', mode: 'markers', x: xValues, y: yValues, marker: { size: 10, color: '#16a34a' } }];
    } else if (chart.chartType === 'pie') {
      data = [{ type: 'pie', labels: xValues, values: yValues }];
    }

    const actualXLabel = chart.xAxisProps.label || chart.xColumn;
    const actualYLabel = chart.yAxisProps.label || chart.yColumn;

    return (
      <Plot
        data={data}
        layout={{
          title: `${chart.selectedDataset?.data?.filename || chart.selectedDataset?.data?.name} - ${chart.groupBy ? `${chart.aggregation}(${actualYLabel})` : actualYLabel} by ${actualXLabel}`,
          yaxis: {
            title: chart.groupBy ? `${chart.aggregation}(${actualYLabel})` : actualYLabel,
            ...(chart.yAxisProps.type === 'Integer' ? { tickformat: 'd' } : {})
          },
          xaxis: {
            title: actualXLabel,
            ...(chart.xAxisProps.type === 'Integer' ? { tickformat: 'd' } : {})
          },
          autosize: true,
          margin: { l: 50, r: 50, b: 50, t: 50, pad: 4 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          dragmode: 'pan',
          modebar: {
            orientation: 'h',
            bgcolor: '#ffffff',
            color: '#16a34a', // tailwind green-600
            activecolor: '#15803d'
          }
        }}
        config={{
          displayModeBar: true,
          scrollZoom: true,
          displaylogo: false,
          modeBarButtonsToAdd: ['pan2d', 'zoom2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d']
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
      />
    );
  };

  const configuringChart = charts.find(c => c.id === configuringChartId);

  return (
    <div className="animate-in fade-in duration-500 h-full flex flex-col overflow-hidden bg-gray-50">
      <div className="flex items-center justify-between mb-4 px-2 pt-2">
        <h1 className="text-2xl font-bold text-gray-900">Visual Observations Dashboard</h1>
        <div className="flex space-x-3">

          {/* Load Dashboard */}
          <button onClick={openLoadModal} className="flex items-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md font-medium transition-colors">
            <FolderOpen className="h-5 w-5 mr-2 text-blue-500" /> Load
          </button>

          {/* Save Dashboard */}
          <button onClick={() => setShowSaveModal(true)} className="flex items-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md font-medium transition-colors">
            <Save className="h-5 w-5 mr-2 text-green-500" /> Save
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

      <div className="flex-1 flex flex-row overflow-hidden relative">
        <div id="dashboard-canvas" className="flex-1 overflow-y-auto pr-4 pb-8 p-2" style={{ pointerEvents: isResizing ? 'none' : 'auto' }}>
          {charts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
              <BarChart2 className="h-16 w-16 mb-4 text-gray-300" />
              <p>Your dashboard is empty. Click "Add Visual" to create a chart.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-6 items-start pb-8">
              {charts.map(chart => (
                <div
                  key={chart.id}
                  style={{ width: chart.width || 500, height: chart.height || 450 }}
                  className={`bg-white rounded-lg shadow-sm border ${configuringChartId === chart.id ? 'border-green-500 ring-2 ring-green-200' : 'border-gray-200'} flex flex-col relative group cursor-pointer transition-shadow`}
                  onClick={() => setConfiguringChartId(chart.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setConfiguringChartId(chart.id);
                  }}
                >
                  {/* Header Actions */}
                  <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button onClick={(e) => { e.stopPropagation(); removeChart(chart.id); }} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-md" title="Remove Visual">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Chart Area */}
                  <div className="flex-1 w-full h-full relative p-2 pt-8">
                    {chart.chartData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <BarChart2 className="h-12 w-12 mb-2 text-gray-200" />
                        <p className="text-sm">Not Configured</p>
                        <p className="mt-2 text-xs text-green-600 font-medium">Click to configure</p>
                      </div>
                    ) : (
                      renderPlot(chart)
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

              {configuringChart.selectedDataset && (
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
                    </div>
                  </div>

                  {/* Axis Configuration */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700">X-Axis (Category)</label>
                      <button onClick={() => setShowXProps(!showXProps)} className="text-gray-400 hover:text-green-600 focus:outline-none" title="Axis Properties">
                        <Settings className="h-4 w-4" />
                      </button>
                    </div>
                    <select
                      value={configuringChart.xColumn}
                      onChange={(e) => updateChart(configuringChart.id, { xColumn: e.target.value })}
                      className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500 mb-2"
                    >
                      <option value="" disabled>Select column...</option>
                      {(configuringChart.selectedDataset.type === 'table' ? configuringChart.selectedDataset.data.columns : configuringChart.selectedDataset.data.columns_mapped).map((c: any) => (
                        <option key={c.name} value={c.name}>{c.name} {c.type !== 'Any' ? `(${c.type})` : ''}</option>
                      ))}
                    </select>

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
                      <label className="block text-sm font-medium text-gray-700">Y-Axis (Value)</label>
                      <button onClick={() => setShowYProps(!showYProps)} className="text-gray-400 hover:text-green-600 focus:outline-none" title="Axis Properties">
                        <Settings className="h-4 w-4" />
                      </button>
                    </div>
                    <select
                      value={configuringChart.yColumn}
                      onChange={(e) => updateChart(configuringChart.id, { yColumn: e.target.value })}
                      className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500 mb-2"
                    >
                      <option value="" disabled>Select column...</option>
                      {(configuringChart.selectedDataset.type === 'table'
                        ? configuringChart.selectedDataset.data.columns.filter((c: any) => (configuringChart.groupBy && configuringChart.aggregation === 'COUNT') || c.type === 'Integer' || c.type === 'Float')
                        : (configuringChart.selectedDataset.data.columns_mapped || [])
                      ).map((c: any) => (
                        <option key={c.name} value={c.name}>{c.name} {c.type !== 'Any' ? `(${c.type})` : ''}</option>
                      ))}
                    </select>

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
                  </div>

                  {/* Data Operations */}
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-gray-700 flex items-center">
                        <Filter className="h-4 w-4 mr-1" /> Group By X-Axis
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
                          className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500"
                        >
                          <option value="SUM">Sum (Total)</option>
                          <option value="AVG">Average</option>
                          <option value="COUNT">Count</option>
                          <option value="MIN">Minimum</option>
                          <option value="MAX">Maximum</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {error[configuringChart.id] && (
                    <div className="text-red-600 text-sm p-2 bg-red-50 rounded-md border border-red-200">
                      {error[configuringChart.id]}
                    </div>
                  )}

                </>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => handleGenerateChart(configuringChart)}
                disabled={loading[configuringChart.id] || !configuringChart.selectedDataset}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-96 p-6">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[500px] p-6 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center"><FolderOpen className="h-5 w-5 mr-2 text-blue-500"/> Load Dashboard</h2>
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
    </div>
  );
}
