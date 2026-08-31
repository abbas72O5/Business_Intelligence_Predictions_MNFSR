import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { LineChart, LayoutDashboard, PanelRightOpen, X, GripVertical, Trash2, Layout, Loader2, Save, Download, FolderOpen, PlusCircle } from 'lucide-react';
import ChartRenderer from '../components/ChartRenderer';
import type { ChartConfig } from '../components/ChartRenderer';
import { useAuth } from '../context/AuthContext';
import Plot from 'react-plotly.js';
import { toPng, toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

interface PredictionData {
  ds: string;
  y: number | null;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

interface CanvasItem {
  id: string; // unique canvas id
  chart: ChartConfig;
  isConfiguring: boolean;
  configTab: 'time_series' | 'data_driven';
  predictionConfig: {
    periods: number;
    freq: string;
    dateCol: string;
    valCol: string;
    allowNegatives: boolean;
  };
  predictionData: PredictionData[] | null;
  predictionMetrics?: {
    confidence_score: number;
    type: string;
  };
  loading: boolean;
  error: string | null;
}

export default function Predictions() {
  const { token, user } = useAuth();
  const loadState = (key: string, defaultVal: any) => {
    const userId = user?.id || 'guest';
    try {
      const v = localStorage.getItem(`${userId}_${key}`);
      return v ? JSON.parse(v) : defaultVal;
    } catch {
      return defaultVal;
    }
  };

  const [dashboards, setDashboards] = useState<any[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>(() => {
    const userId = user?.id || 'guest';
    const saved = localStorage.getItem(`${userId}_pred_selected_dashboard`);
    return saved || '';
  });

  const [canvasVisuals, setCanvasVisuals] = useState<CanvasItem[]>(() => loadState('pred_canvas', []));

  useEffect(() => {
    const userId = user?.id || 'guest';
    localStorage.setItem(`${userId}_pred_canvas`, JSON.stringify(canvasVisuals));
  }, [canvasVisuals, user?.id]);

  const [activeDashboard, setActiveDashboard] = useState<{id: string, name: string} | null>(() => {
    const userId = user?.id || 'guest';
    const saved = localStorage.getItem(`${userId}_pred_activeDashboard`);
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    const userId = user?.id || 'guest';
    localStorage.setItem(`${userId}_pred_activeDashboard`, JSON.stringify(activeDashboard));
  }, [activeDashboard, user?.id]);

  useEffect(() => {
    const userId = user?.id || 'guest';
    localStorage.setItem(`${userId}_pred_selected_dashboard`, selectedDashboardId);
  }, [selectedDashboardId, user?.id]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(384);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  // Drag and Drop state
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [dragEnabledIdx, setDragEnabledIdx] = useState<number | null>(null);

  const handleSort = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      const _canvasVisuals = [...canvasVisuals];
      const draggedItemContent = _canvasVisuals.splice(dragItem.current, 1)[0];
      _canvasVisuals.splice(dragOverItem.current, 0, draggedItemContent);
      setCanvasVisuals(_canvasVisuals);
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDragEnabledIdx(null);
  };

  // Resizing sidebar state
  useEffect(() => {
    if (!isResizingSidebar) return;
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate width based on distance from right edge of window
      const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizingSidebar(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  // Resizing state
  const [resizingItemId, setResizingItemId] = useState<string | null>(null);
  const [startSize, setStartSize] = useState({ w: 0, h: 0, x: 0, y: 0 });

  useEffect(() => {
    if (!resizingItemId) return;
    const item = canvasVisuals.find(c => c.id === resizingItemId);
    if (!item) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startSize.x;
      const dy = e.clientY - startSize.y;
      const newWidth = Math.max(300, startSize.w + dx);
      const newHeight = Math.max(300, startSize.h + dy);
      updateCanvasItem(resizingItemId, { chart: { ...item.chart, width: newWidth, height: newHeight } });
      window.dispatchEvent(new Event('resize'));
    };
    const handleMouseUp = () => setResizingItemId(null);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingItemId, startSize, canvasVisuals]);

  useEffect(() => {
    const fetchDashboards = async () => {
      try {
        const res = await axios.get('http://localhost:8000/dashboards/?type=observation', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDashboards(res.data);
      } catch (err) {
        console.error("Failed to fetch dashboards", err);
      }
    };
    if (token) fetchDashboards();
  }, [token]);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showNewDashboardModal, setShowNewDashboardModal] = useState(false);
  const [dashboardName, setDashboardName] = useState('');
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedDashboards, setSavedDashboards] = useState<any[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const saveDashboard = async () => {
    if (!activeDashboard && !dashboardName) return;
    try {
      if (activeDashboard) {
        // Update existing dashboard
        await axios.put(`http://localhost:8000/dashboards/${activeDashboard.id}`, {
          charts: canvasVisuals
        }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        showToast("Dashboard updated successfully!");
      } else {
        // Create new dashboard
        const response = await axios.post('http://localhost:8000/dashboards/', {
          name: dashboardName,
          type: 'prediction',
          charts: canvasVisuals
        }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setActiveDashboard({ id: response.data.dashboard_id, name: response.data.name });
        setShowSaveModal(false);
        setDashboardName('');
        showToast("Prediction Dashboard saved successfully!");
      }

      // Log activity
      axios.post('http://localhost:8000/activities', {
        action: activeDashboard ? 'Update Prediction Dashboard' : 'Save Prediction Dashboard',
        details: { visuals: canvasVisuals.map(c => c.chart.chartType) }
      }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).catch(e => console.error(e));
    } catch (err) {
      console.error(err);
      showToast("Failed to save dashboard.", "error");
    }
  };

  const openLoadModal = async () => {
    try {
      const response = await axios.get('http://localhost:8000/dashboards/?type=prediction', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setSavedDashboards(response.data);
      setShowLoadModal(true);
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch prediction dashboards.", "error");
    }
  };

  const loadDashboard = async (id: string) => {
    try {
      const response = await axios.get(`http://localhost:8000/dashboards/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setCanvasVisuals(response.data.charts);
      setActiveDashboard({ id: response.data.dashboard_id, name: response.data.name });
      setShowLoadModal(false);
      showToast("Dashboard loaded successfully!");
      
      // Log activity
      axios.post('http://localhost:8000/activities', {
        action: 'Load Prediction Dashboard',
        details: { dataset: response.data.name, visuals: response.data.charts.map((c: any) => c.chart?.chartType || 'unknown') }
      }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).catch(e => console.error(e));
    } catch (err) {
      console.error(err);
      showToast("Failed to load dashboard.", "error");
    }
  };

  const handleExportDashboard = async (format: 'png' | 'jpeg' | 'pdf') => {
    setShowExportMenu(false);
    const dashboardEl = document.getElementById('prediction-canvas');
    if (!dashboardEl) return;

    try {
      const options = { backgroundColor: '#f9fafb', pixelRatio: 2 };
      if (format === 'pdf') {
        const dataUrl = await toPng(dashboardEl, options);
        const pdf = new jsPDF({
          orientation: dashboardEl.clientWidth > dashboardEl.clientHeight ? 'l' : 'p',
          unit: 'px',
          format: [dashboardEl.clientWidth, dashboardEl.clientHeight]
        });
        pdf.addImage(dataUrl, 'PNG', 0, 0, dashboardEl.clientWidth, dashboardEl.clientHeight);
        pdf.save('prediction-export.pdf');
      } else {
        const dataUrl = format === 'png' ? await toPng(dashboardEl, options) : await toJpeg(dashboardEl, options);
        const link = document.createElement('a');
        link.download = `prediction-export.${format}`;
        link.href = dataUrl;
        link.click();
      }

      // Log activity
      axios.post('http://localhost:8000/activities', {
        action: `Export Prediction Dashboard (${format.toUpperCase()})`,
        details: { visuals: canvasVisuals.map(c => c.chart.chartType) }
      }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).catch(e => console.error(e));
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const selectedDashboard = dashboards.find(d => d.dashboard_id === selectedDashboardId);
  const sidebarCharts: ChartConfig[] = selectedDashboard ? selectedDashboard.charts : [];

  const handleDragStart = (e: React.DragEvent, chart: ChartConfig) => {
    e.dataTransfer.setData('chartData', JSON.stringify(chart));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const chartDataString = e.dataTransfer.getData('chartData');
    if (chartDataString) {
      try {
        const chart: ChartConfig = JSON.parse(chartDataString);
        const newId = `canvas-${chart.id}-${Date.now()}`;
        setCanvasVisuals(prev => [...prev, {
          id: newId,
          chart: chart,
          isConfiguring: false,
          configTab: 'time_series',
          predictionConfig: {
            periods: 12,
            freq: 'ME',
            dateCol: chart.xColumn || '',
            valCol: chart.yColumn || chart.valColumn || '',
            allowNegatives: false
          },
          predictionData: null,
          loading: false,
          error: null
        }]);
      } catch (err) {
        console.error("Failed to parse dropped chart data", err);
      }
    }
  };

  const removeVisual = (id: string) => {
    setCanvasVisuals(prev => prev.filter(c => c.id !== id));
  };

  const updateCanvasItem = (id: string, updates: Partial<CanvasItem>) => {
    setCanvasVisuals(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const updatePredictionConfig = (id: string, updates: Partial<CanvasItem['predictionConfig']>) => {
    setCanvasVisuals(prev => prev.map(c => c.id === id ? { ...c, predictionConfig: { ...c.predictionConfig, ...updates } } : c));
  };

  const handleGenerateForecast = async (item: CanvasItem) => {
    if (!item.predictionConfig.dateCol || !item.predictionConfig.valCol) {
      updateCanvasItem(item.id, { error: "Please select a date column and a value column." });
      return;
    }

    updateCanvasItem(item.id, { loading: true, error: null });

    const ds = item.chart.selectedDataset;
    if (!ds) {
      updateCanvasItem(item.id, { loading: false, error: "No dataset selected." });
      return;
    }

    const dataId = ds.type === 'table' ? ds.data.table_id : ds.data.model_id;

    let dCastType = null;
    let vCastType = null;
    if (ds.type === 'table' && ds.data.columns) {
      const dCol = ds.data.columns.find((c: any) => c.name === item.predictionConfig.dateCol);
      if (dCol) dCastType = dCol.type;
      const vCol = ds.data.columns.find((c: any) => c.name === item.predictionConfig.valCol);
      if (vCol) vCastType = vCol.type;
    } else if (ds.type === 'model' && ds.data.columns) {
      const dCol = ds.data.columns.find((c: any) => (c.alias || c.column) === item.predictionConfig.dateCol);
      if (dCol) dCastType = dCol.type;
      const vCol = ds.data.columns.find((c: any) => (c.alias || c.column) === item.predictionConfig.valCol);
      if (vCol) vCastType = vCol.type;
    }

    let predictionMode = 'trajectory';
    let groupingColumns: string[] = [];

    if (item.chart.chartType === 'map') {
      predictionMode = 'snapshot';
      groupingColumns = [item.chart.latColumn, item.chart.lonColumn].filter(Boolean) as string[];
    } else if (['bar', 'pie', 'treemap', 'scatter'].includes(item.chart.chartType)) {
      if (item.chart.xColumn !== item.predictionConfig.dateCol) {
        predictionMode = 'snapshot';
        groupingColumns = [item.chart.xColumn].filter(Boolean) as string[];
      }
    }

    try {
      const res = await axios.post('http://localhost:8000/query/predict', {
        table_id: dataId,
        dataset_type: ds.type,
        x_column: item.predictionConfig.dateCol,
        value_column: item.predictionConfig.valCol,
        periods: item.predictionConfig.periods,
        freq: item.predictionConfig.freq,
        x_cast_type: dCastType,
        value_cast_type: vCastType,
        chart_type: item.chart.chartType,
        grouping_columns: groupingColumns,
        prediction_mode: predictionMode,
        map_type: item.chart.mapType || 'bubble',
        allow_negatives: item.predictionConfig.allowNegatives
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      updateCanvasItem(item.id, {
        predictionData: res.data.records,
        predictionMetrics: res.data.metrics,
        isConfiguring: false,
        loading: false
      });

      // Log activity
      axios.post('http://localhost:8000/activities', {
        action: 'Generate Prediction Visual',
        details: {
          dataset: ds.type === 'table' ? ds.data.table_name : ds.data.model_name,
          visuals: [item.chart.chartType]
        }
      }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
    } catch (err: any) {
      console.error(err);
      let msg = "Failed to generate forecast.";
      if (err.response?.data?.detail) {
        msg = typeof err.response.data.detail === 'string' ? err.response.data.detail : "Configuration error.";
      }
      updateCanvasItem(item.id, { error: msg, loading: false });
    }
  };

  const renderForecast = (item: CanvasItem) => {
    if (!item.predictionData || item.predictionData.length === 0) return null;
    const { predictionData, predictionConfig } = item;

    // Check if this was a snapshot prediction (first object has the grouping columns instead of just ds/y/yhat)
    const isSnapshot = predictionData.length > 0 && !('yhat_upper' in predictionData[0]);

    let confText = "Prediction Confidence: N/A";
    let confColor = "text-gray-500";

    if (item.predictionMetrics && item.predictionMetrics.confidence_score !== undefined) {
      const score = item.predictionMetrics.confidence_score;
      if (score > 85) {
        confText = `Prediction Confidence: ${score.toFixed(1)}% - High Reliability (Strong Data Patterns)`;
        confColor = "text-green-600";
      } else if (score >= 70) {
        confText = `Prediction Confidence: ${score.toFixed(1)}% - Moderate Reliability (Significant Variance)`;
        confColor = "text-orange-500";
      } else {
        confText = `Prediction Confidence: ${score.toFixed(1)}% - Low Reliability (Unpredictable Data)`;
        confColor = "text-red-500";
      }
    }

    if (isSnapshot) {
      // Map the prediction data directly back into the original chart's format!
      const updatedChart = { ...item.chart, chartData: predictionData };
      return (
        <div className="w-full h-full relative flex flex-col pt-8 pb-6">
          <div className="absolute top-1 left-2 bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border border-yellow-200 z-10 flex items-center">
            <LineChart className="w-3 h-3 mr-1" />
            Forecast Snapshot (+{predictionConfig.periods} periods)
          </div>
          <div className="absolute top-1 right-8 flex space-x-3 z-10 bg-white/90 px-2 py-1 rounded shadow-sm border border-gray-200 text-[10px] font-medium">
            <div className="flex items-center"><span className="w-2 h-2 rounded-sm bg-green-600 mr-1"></span>Historical</div>
            <div className="flex items-center"><span className="w-2 h-2 rounded-sm bg-amber-500 mr-1"></span>Predicted</div>
          </div>
          <div className="flex-1 w-full relative">
            <ChartRenderer chart={updatedChart} overrideWidth="100%" overrideHeight="100%" />
          </div>
          <div className={`absolute bottom-1 left-0 right-0 text-center text-xs font-medium z-10 bg-white/90 py-1 border-t border-gray-100 shadow-sm ${confColor}`}>
            {confText}
          </div>
        </div>
      );
    }

    // Trajectory Mode
    // If the original chart is NOT a line chart, user expects it to remain as a bar/pie/scatter etc.
    if (item.chart.chartType !== 'line') {
      const mappedData = predictionData.map(d => ({
        ...d,
        [item.chart.xColumn]: d.ds,
        [item.chart.yColumn]: d.y !== null ? d.y : d.yhat,
        // Add a visual indicator field just in case
        _is_forecast: d.y === null
      }));

      const updatedChart = { ...item.chart, chartData: mappedData };
      return (
        <div className="w-full h-full relative flex flex-col pt-8 pb-6">
          <div className="absolute top-1 left-2 bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border border-blue-200 z-10 flex items-center">
            <LineChart className="w-3 h-3 mr-1" />
            Trajectory (+{predictionConfig.periods} periods)
          </div>
          <div className="absolute top-1 right-8 flex space-x-3 z-10 bg-white/90 px-2 py-1 rounded shadow-sm border border-gray-200 text-[10px] font-medium">
            <div className="flex items-center"><span className="w-2 h-2 rounded-sm bg-green-600 mr-1"></span>Historical</div>
            <div className="flex items-center"><span className="w-2 h-2 rounded-sm bg-amber-500 mr-1"></span>Predicted</div>
          </div>
          <div className="flex-1 w-full relative">
            <ChartRenderer chart={updatedChart} overrideWidth="100%" overrideHeight="100%" />
          </div>
          <div className={`absolute bottom-1 left-0 right-0 text-center text-xs font-medium z-10 bg-white/90 py-1 border-t border-gray-100 shadow-sm ${confColor}`}>
            {confText}
          </div>
        </div>
      );
    }

    // If it was originally a line chart, render the advanced Plot
    const histData = predictionData.filter(d => d.y !== null);
    const futData = predictionData.filter(d => d.y === null);
    
    const histX = histData.map(d => d.ds);
    const histY = histData.map(d => d.y);
    
    let futX: string[] = [];
    let futY: number[] = [];
    
    if (histData.length > 0) {
      const lastHist = histData[histData.length - 1];
      futX = [lastHist.ds, ...futData.map(d => d.ds)];
      futY = [lastHist.y as number, ...futData.map(d => d.yhat)];
    } else {
      futX = futData.map(d => d.ds);
      futY = futData.map(d => d.yhat);
    }

    const actualTrace = {
      x: histX,
      y: histY,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Historical',
      line: { color: '#16a34a', width: 2 },
      marker: { size: 4 }
    };
    const forecastTrace = {
      x: futX,
      y: futY,
      type: 'scatter',
      mode: 'lines',
      name: 'Forecast',
      line: { color: '#f59e0b', width: 2, dash: 'dot' }
    };

    return (
      <div className="w-full h-full relative flex flex-col pt-2 pb-6">
        <div className="flex-1 w-full relative">
          <Plot
            data={[actualTrace, forecastTrace] as any}
            layout={{
              title: `Forecast: ${predictionConfig.valCol}`,
              autosize: true,
              margin: { l: 50, r: 50, b: 30, t: 50, pad: 4 },
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              hovermode: 'x unified',
              xaxis: { title: predictionConfig.dateCol },
              yaxis: { title: predictionConfig.valCol, autorange: true },
              legend: { orientation: 'h', y: -0.2 }
            }}
            config={{ displaylogo: false, responsive: true }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        <div className={`absolute bottom-1 left-0 right-0 text-center text-xs font-medium z-10 bg-white/90 py-1 border-t border-gray-100 shadow-sm ${confColor}`}>
          {confText}
        </div>
      </div>
    );
  };

  const getColumns = (chart: ChartConfig) => {
    if (!chart.selectedDataset) return [];
    if (chart.selectedDataset.type === 'table') {
      return chart.selectedDataset.data.columns || [];
    }
    return chart.selectedDataset.data.columns.map((c: any) => ({ name: c.alias || c.column, type: 'Unknown' }));
  };

  return (
    <div className="flex h-full bg-gray-100 overflow-hidden relative animate-in fade-in duration-500">

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-gray-50">
        <div className="absolute top-4 left-4 z-10 flex space-x-2">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 bg-white rounded-md shadow-sm border border-gray-200 hover:bg-gray-50 text-gray-700"
              title="Open Sidebar"
            >
              <PanelRightOpen className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="bg-white border-b border-gray-200 p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <LineChart className="w-6 h-6 text-green-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Prediction Workspace</h1>
              <p className="text-sm text-gray-500">Drag visuals from your saved dashboards to configure forecasts.</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setShowNewDashboardModal(true)} 
              className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <PlusCircle className="w-4 h-4 mr-2 text-indigo-500" /> New
            </button>
            <button onClick={openLoadModal} className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">
              <FolderOpen className="w-4 h-4 mr-2 text-blue-500" /> Load
            </button>
            <button onClick={() => activeDashboard ? saveDashboard() : setShowSaveModal(true)} className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Save className="w-4 h-4 mr-2 text-green-500" /> {activeDashboard ? 'Save' : 'Save As'}
            </button>
            <div className="relative">
              <button onClick={() => setShowExportMenu(!showExportMenu)} className="flex items-center px-3 py-2 bg-green-700 text-white rounded-md shadow-sm text-sm font-medium hover:bg-green-800">
                <Download className="w-4 h-4 mr-2" /> Export
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
                  <div className="py-1">
                    <button onClick={() => handleExportDashboard('png')} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left">Export as PNG</button>
                    <button onClick={() => handleExportDashboard('jpeg')} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left">Export as JPEG</button>
                    <button onClick={() => handleExportDashboard('pdf')} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left">Export as PDF</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          id="prediction-canvas"
          className="flex-1 p-6 overflow-y-auto"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {canvasVisuals.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl bg-gray-50/50">
              <LayoutDashboard className="w-16 h-16 text-gray-400 mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Canvas is empty</h2>
              <p className="text-gray-500 max-w-md text-center">
                Select a dashboard from the right sidebar, then drag and drop a visual here to begin generating predictions.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-6 items-start pb-8">
              {canvasVisuals.map((item, index) => {
                const cols = getColumns(item.chart);

                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-xl shadow-md border border-gray-200 flex flex-col overflow-hidden relative group transition-all duration-200 ${dragEnabledIdx === index ? 'ring-2 ring-green-500 opacity-90' : ''}`}
                    style={{ width: item.chart.width || 500, height: item.chart.height || 400 }}
                    draggable={dragEnabledIdx === index}
                    onDragStart={(e) => {
                      dragItem.current = index;
                      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnter={(e) => {
                      dragOverItem.current = index;
                    }}
                    onDragEnd={handleSort}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <div 
                          className="cursor-move text-gray-400 hover:text-gray-600 p-1 -ml-2 rounded hover:bg-gray-200 transition-colors"
                          onMouseEnter={() => setDragEnabledIdx(index)}
                          onMouseLeave={() => setDragEnabledIdx(null)}
                          title="Drag to reorder"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <h3 className="font-semibold text-gray-800 text-sm truncate pr-4">
                          {item.chart.selectedDataset?.data?.filename || item.chart.selectedDataset?.data?.name || 'Chart'}
                        </h3>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => updateCanvasItem(item.id, { isConfiguring: !item.isConfiguring })}
                          className={`text-xs px-3 py-1.5 rounded transition-colors font-medium border ${item.isConfiguring ? 'bg-gray-100 text-gray-700 border-gray-300' : 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'}`}
                        >
                          {item.isConfiguring ? 'Cancel Config' : item.predictionData ? 'Reconfigure' : 'Configure Prediction'}
                        </button>
                        <button
                          onClick={() => removeVisual(item.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Remove Visual"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="p-4 w-full flex-1 min-h-0 relative flex flex-col">
                      {item.isConfiguring ? (
                        <div className="w-full flex-1 flex flex-col min-h-0 max-w-md mx-auto space-y-4 animate-in fade-in pt-2">
                          {/* Tabs */}
                          <div className="flex border-b border-gray-200 mb-2">
                            <button
                              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${item.configTab === 'time_series' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                              onClick={() => updateCanvasItem(item.id, { configTab: 'time_series' })}
                            >
                              Time Series (Prophet)
                            </button>
                            <button
                              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${item.configTab === 'data_driven' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                              onClick={() => updateCanvasItem(item.id, { configTab: 'data_driven' })}
                            >
                              Data Driven (Linear)
                            </button>
                          </div>

                          <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-2 pb-2">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {item.configTab === 'time_series' ? 'Time (Date) Column' : 'Numeric X-Axis Column'}
                              </label>
                              <select
                                className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500"
                                value={item.predictionConfig.dateCol}
                                onChange={(e) => updatePredictionConfig(item.id, { dateCol: e.target.value })}
                              >
                                <option value="">-- Select Column --</option>
                                {cols.map((c: any) => (
                                  <option key={c.name} value={c.name}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Metric (Value) Column</label>
                              <select
                                className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500"
                                value={item.predictionConfig.valCol}
                                onChange={(e) => updatePredictionConfig(item.id, { valCol: e.target.value })}
                              >
                                <option value="">-- Select Value to Forecast --</option>
                                {cols.map((c: any) => (
                                  <option key={c.name} value={c.name}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Periods</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="365"
                                  value={item.predictionConfig.periods}
                                  onChange={(e) => updatePredictionConfig(item.id, { periods: Number(e.target.value) })}
                                  className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500"
                                />
                              </div>
                              {item.configTab === 'time_series' && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Frequency</label>
                                  <select
                                    value={item.predictionConfig.freq}
                                    onChange={(e) => updatePredictionConfig(item.id, { freq: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500"
                                  >
                                    <option value="D">Days</option>
                                    <option value="ME">Months</option>
                                    <option value="YE">Years</option>
                                  </select>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center pt-2">
                              <input
                                type="checkbox"
                                id={`allow-negatives-${item.id}`}
                                checked={item.predictionConfig.allowNegatives}
                                onChange={(e) => updatePredictionConfig(item.id, { allowNegatives: e.target.checked })}
                                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                              />
                              <label htmlFor={`allow-negatives-${item.id}`} className="ml-2 block text-sm text-gray-900">
                                Allow Negative Values
                              </label>
                            </div>

                            {item.error && (
                              <div className="text-red-600 text-sm mt-2">{item.error}</div>
                            )}
                          </div>

                          <button
                            onClick={() => handleGenerateForecast(item)}
                            disabled={item.loading || !item.predictionConfig.dateCol || !item.predictionConfig.valCol}
                            className="w-full mt-auto flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-700 hover:bg-green-800 disabled:opacity-50 flex-shrink-0"
                          >
                            {item.loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LineChart className="w-4 h-4 mr-2" />}
                            Run {item.configTab === 'time_series' ? 'Prophet' : 'Linear'} Prediction
                          </button>
                        </div>
                      ) : item.predictionData ? (
                        renderForecast(item)
                      ) : (
                        <div className={`w-full h-full relative ${item.loading ? 'opacity-50 pointer-events-none' : ''}`}>
                          <ChartRenderer chart={item.chart} overrideWidth="100%" overrideHeight="100%" />
                          {item.loading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                              <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-20 opacity-0 group-hover:opacity-100"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setResizingItemId(item.id);
                        setStartSize({
                          w: item.chart.width || 500,
                          h: item.chart.height || 400,
                          x: e.clientX,
                          y: e.clientY
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Resizer Handle for Sidebar */}
      {sidebarOpen && (
        <div
          className="w-1.5 bg-gray-200 hover:bg-green-500 cursor-col-resize transition-colors flex items-center justify-center group z-30"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizingSidebar(true);
          }}
        >
          <div className="h-8 w-0.5 bg-gray-400 group-hover:bg-white rounded"></div>
        </div>
      )}

      {/* Right Sidebar - Visuals Bin */}
      <div
        style={{ width: sidebarOpen ? `${sidebarWidth}px` : '0px' }}
        className={`transition-all duration-300 ease-in-out bg-white flex flex-col z-20 shrink-0 absolute lg:relative h-full right-0 shadow-lg lg:shadow-none overflow-hidden`}
      >
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
          <h2 className="text-lg font-bold text-gray-800 flex items-center">
            <Layout className="w-5 h-5 mr-2 text-green-700" />
            Visuals Bin
          </h2>
          <button onClick={() => setSidebarOpen(false)} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30">
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Load Saved Dashboard</label>
            <select
              className="w-full bg-white border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-green-500 focus:border-green-500"
              value={selectedDashboardId}
              onChange={(e) => setSelectedDashboardId(e.target.value)}
            >
              <option value="">-- Select Dashboard --</option>
              {dashboards.map(d => (
                <option key={d.dashboard_id} value={d.dashboard_id}>
                  {d.name} ({new Date(d.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          {selectedDashboardId && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Available Visuals</h3>

              {sidebarCharts.length === 0 ? (
                <div className="text-center p-4 bg-white border border-gray-200 rounded-lg text-sm text-gray-500">
                  This dashboard has no visuals.
                </div>
              ) : (
                sidebarCharts.map(chart => (
                  <div
                    key={chart.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, chart)}
                    className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing flex flex-col"
                  >
                    <div className="flex items-center text-gray-700 font-medium text-sm mb-2 truncate">
                      <GripVertical className="w-4 h-4 mr-1 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{chart.selectedDataset?.data?.filename || chart.selectedDataset?.data?.name || 'Chart Visual'}</span>
                    </div>
                    <div className="w-full h-32 rounded bg-gray-50 border border-gray-100 overflow-hidden pointer-events-none relative">
                      <ChartRenderer chart={chart} overrideWidth="100%" overrideHeight="100%" />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Global Resize Overlay to prevent iframe event swallowing */}
      {resizingItemId && (
        <div className="fixed inset-0 z-[9999] cursor-se-resize" />
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg shadow-2xl w-96 p-6 border border-gray-200 pointer-events-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Save Prediction Dashboard</h2>
              <button onClick={() => setShowSaveModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-gray-600 text-sm mb-4">Save your current prediction layout to access it later.</p>
            <input
              type="text"
              value={dashboardName}
              onChange={(e) => setDashboardName(e.target.value)}
              placeholder="Dashboard Name"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border mb-4"
              autoFocus
            />
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">Cancel</button>
              <button onClick={saveDashboard} disabled={!dashboardName} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Load Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg shadow-2xl w-[500px] p-6 max-h-[80vh] flex flex-col border border-gray-200 pointer-events-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center"><FolderOpen className="h-5 w-5 mr-2 text-blue-500" /> Load Dashboard</h2>
              <button onClick={() => setShowLoadModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 border border-gray-200 rounded-md">
              {savedDashboards.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No saved prediction dashboards found.</div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {savedDashboards.map(d => (
                    <li key={d.dashboard_id} className="p-4 hover:bg-gray-50 flex justify-between items-center group cursor-pointer" onClick={() => loadDashboard(d.dashboard_id)}>
                      <div>
                        <p className="font-semibold text-gray-800">{d.name}</p>
                        <p className="text-xs text-gray-500">{new Date(d.created_at).toLocaleString()}</p>
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
                setCanvasVisuals([]);
                setActiveDashboard(null);
                setShowNewDashboardModal(false);
              }} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-[100] transition-opacity duration-300 ${toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMessage.text}
        </div>
      )}
    </div>
  );
}
