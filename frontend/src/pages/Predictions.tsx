import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, LayoutDashboard, PanelRightOpen, X, GripVertical, Trash2, Layout, Loader2 } from 'lucide-react';
import ChartRenderer from '../components/ChartRenderer';
import type { ChartConfig } from '../components/ChartRenderer';
import { useAuth } from '../context/AuthContext';
import Plot from 'react-plotly.js';

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
  };
  predictionData: PredictionData[] | null;
  loading: boolean;
  error: string | null;
}

export default function Predictions() {
  const { token } = useAuth();
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>('');

  const [canvasVisuals, setCanvasVisuals] = useState<CanvasItem[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const fetchDashboards = async () => {
      try {
        const res = await axios.get('http://localhost:8000/dashboards/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDashboards(res.data);
      } catch (err) {
        console.error("Failed to fetch dashboards", err);
      }
    };
    if (token) fetchDashboards();
  }, [token]);

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
            freq: 'M',
            dateCol: chart.xColumn || '',
            valCol: chart.yColumn || chart.valColumn || ''
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

    try {
      const res = await axios.post('http://localhost:8000/query/predict', {
        table_id: dataId,
        dataset_type: ds.type,
        x_column: item.predictionConfig.dateCol,
        value_column: item.predictionConfig.valCol,
        periods: item.predictionConfig.periods,
        freq: item.predictionConfig.freq,
        x_cast_type: dCastType,
        value_cast_type: vCastType
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      updateCanvasItem(item.id, { predictionData: res.data, isConfiguring: false, loading: false });
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
    const ds = predictionData.map(d => d.ds);
    const y_actual = predictionData.map(d => d.y);
    const yhat = predictionData.map(d => d.yhat);
    const yhat_lower = predictionData.map(d => d.yhat_lower);
    const yhat_upper = predictionData.map(d => d.yhat_upper);

    const actualTrace = {
      x: ds,
      y: y_actual,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Historical',
      line: { color: '#16a34a', width: 2 },
      marker: { size: 4 }
    };
    const forecastTrace = {
      x: ds,
      y: yhat,
      type: 'scatter',
      mode: 'lines',
      name: 'Forecast',
      line: { color: '#f59e0b', width: 2, dash: 'dot' }
    };
    const upperTrace = {
      x: ds,
      y: yhat_upper,
      type: 'scatter',
      mode: 'lines',
      marker: { color: '#444' },
      line: { width: 0 },
      name: 'Upper Bound',
      showlegend: false
    };
    const lowerTrace = {
      x: ds,
      y: yhat_lower,
      type: 'scatter',
      mode: 'lines',
      marker: { color: '#444' },
      line: { width: 0 },
      fillcolor: 'rgba(245, 158, 11, 0.2)',
      fill: 'tonexty',
      name: 'Confidence Interval'
    };

    return (
      <Plot
        data={[upperTrace, lowerTrace, actualTrace, forecastTrace] as any}
        layout={{
          title: `Forecast: ${predictionConfig.valCol}`,
          autosize: true,
          margin: { l: 50, r: 50, b: 50, t: 50, pad: 4 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          hovermode: 'x unified',
          xaxis: { title: predictionConfig.dateCol },
          yaxis: { title: predictionConfig.valCol },
          legend: { orientation: 'h', y: -0.2 }
        }}
        config={{ displaylogo: false, responsive: true }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
      />
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
        </div>

        <div
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
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {canvasVisuals.map((item) => {
                const cols = getColumns(item.chart);

                return (
                  <div key={item.id} className="bg-white rounded-xl shadow-md border border-gray-200 flex flex-col overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                      <h3 className="font-semibold text-gray-800 text-sm truncate pr-4">
                        {item.chart.selectedDataset?.data?.filename || item.chart.selectedDataset?.data?.name || 'Chart'}
                      </h3>
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

                    <div className="p-4 w-full h-[350px] relative">
                      {item.isConfiguring ? (
                        <div className="h-full flex flex-col max-w-md mx-auto space-y-4 animate-in fade-in pt-2">
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

                          <div className="overflow-y-auto flex-1 space-y-4 pr-2">
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
                                    <option value="M">Months</option>
                                    <option value="Y">Years</option>
                                  </select>
                                </div>
                              )}
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
                        <div className={item.loading ? 'opacity-50 pointer-events-none' : ''}>
                          <ChartRenderer chart={item.chart} overrideWidth="100%" overrideHeight="100%" />
                          {item.loading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                              <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Visuals Bin */}
      <div className={`${sidebarOpen ? 'w-80 lg:w-96 translate-x-0' : 'w-0 -translate-x-full'} transition-all duration-300 ease-in-out bg-white border-l border-gray-200 flex flex-col z-20 shrink-0 absolute lg:relative h-full right-0 shadow-lg lg:shadow-none`}>
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-bold text-gray-800 flex items-center">
            <Layout className="w-5 h-5 mr-2 text-green-700" />
            Visuals Bin
          </h2>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-500 hover:text-gray-700">
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
    </div>
  );
}
