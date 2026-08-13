import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Plot from 'react-plotly.js';
import { LineChart, BarChart2, PieChart, ScatterChart, Settings, Database, Filter } from 'lucide-react';

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

  const [selectedDataset, setSelectedDataset] = useState<{type: string, data: any} | null>(() => loadState('obs_dataset', null));
  
  // Chart Config
  const [chartType, setChartType] = useState(() => loadState('obs_chartType', 'bar'));
  const [xColumn, setXColumn] = useState(() => loadState('obs_xColumn', ''));
  const [yColumn, setYColumn] = useState(() => loadState('obs_yColumn', ''));
  const [xAxisProps, setXAxisProps] = useState(() => loadState('obs_xAxisProps', { label: '', type: '' }));
  const [yAxisProps, setYAxisProps] = useState(() => loadState('obs_yAxisProps', { label: '', type: '' }));
  
  const [showXProps, setShowXProps] = useState(false);
  const [showYProps, setShowYProps] = useState(false);
  
  // Data Operations
  const [groupBy, setGroupBy] = useState(() => loadState('obs_groupBy', false));
  const [aggregation, setAggregation] = useState(() => loadState('obs_aggregation', 'SUM'));
  
  // Data State
  const [chartData, setChartData] = useState<any[]>(() => loadState('obs_chartData', []));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Persist State
  useEffect(() => {
    localStorage.setItem('obs_dataset', JSON.stringify(selectedDataset));
    localStorage.setItem('obs_chartType', JSON.stringify(chartType));
    localStorage.setItem('obs_xColumn', JSON.stringify(xColumn));
    localStorage.setItem('obs_yColumn', JSON.stringify(yColumn));
    localStorage.setItem('obs_xAxisProps', JSON.stringify(xAxisProps));
    localStorage.setItem('obs_yAxisProps', JSON.stringify(yAxisProps));
    localStorage.setItem('obs_groupBy', JSON.stringify(groupBy));
    localStorage.setItem('obs_aggregation', JSON.stringify(aggregation));
    localStorage.setItem('obs_chartData', JSON.stringify(chartData));
  }, [selectedDataset, chartType, xColumn, yColumn, xAxisProps, yAxisProps, groupBy, aggregation, chartData]);

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

  const handleDatasetSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const [type, id] = val.split(':');
    if (type === 'table') {
      const table = tables.find(t => t.table_id === id);
      setSelectedDataset(table ? { type: 'table', data: table } : null);
    } else {
      const model = models.find(m => m.model_id === id);
      // Map columns array elements (which have 'column' and 'alias') to {name, type} for the UI
      if (model) {
        model.columns_mapped = model.columns.map((c: any) => ({ name: c.alias || c.column, type: 'Any' })); // Type is not fully known dynamically unless preserved, assume Any/Numeric works
      }
      setSelectedDataset(model ? { type: 'model', data: model } : null);
    }
    setXColumn('');
    setYColumn('');
    setChartData([]);
  };

  const handleGenerateChart = async () => {
    if (!selectedDataset || !xColumn || !yColumn) {
      setError("Please select a dataset, X-axis, and Y-axis.");
      return;
    }
    
    setError('');
    setLoading(true);
    try {
      const id = selectedDataset.type === 'table' ? selectedDataset.data.table_id : selectedDataset.data.model_id;
      const res = await axios.post('http://localhost:8000/query/observations', {
        table_id: id,
        dataset_type: selectedDataset.type,
        x_column: xColumn,
        y_column: yColumn,
        x_cast_type: xAxisProps.type || null,
        y_cast_type: yAxisProps.type || null,
        group_by: groupBy,
        aggregation: groupBy ? aggregation : null
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setChartData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to generate chart data.");
      setChartData([]);
    } finally {
      setLoading(false);
    }
  };

  const renderPlot = () => {
    if (chartData.length === 0) return null;
    
    const xValues = chartData.map(d => d[xColumn]);
    const yValues = chartData.map(d => d[yColumn]);

    let data: any[] = [];

    if (chartType === 'bar') {
      data = [{ type: 'bar', x: xValues, y: yValues, marker: { color: '#16a34a' } }];
    } else if (chartType === 'line') {
      data = [{ type: 'scatter', mode: 'lines+markers', x: xValues, y: yValues, line: { color: '#16a34a' } }];
    } else if (chartType === 'scatter') {
      data = [{ type: 'scatter', mode: 'markers', x: xValues, y: yValues, marker: { size: 10, color: '#16a34a' } }];
    } else if (chartType === 'pie') {
      data = [{ type: 'pie', labels: xValues, values: yValues }];
    }

    const actualXLabel = xAxisProps.label || xColumn;
    const actualYLabel = yAxisProps.label || yColumn;
    
    return (
      <Plot
        data={data}
        layout={{ 
          title: `${selectedDataset?.data?.filename || selectedDataset?.data?.name} - ${groupBy ? `${aggregation}(${actualYLabel})` : actualYLabel} by ${actualXLabel}`,
          yaxis: {
            title: groupBy ? `${aggregation}(${actualYLabel})` : actualYLabel,
            ...(yAxisProps.type === 'Integer' ? { tickformat: 'd' } : {})
          },
          xaxis: {
            title: actualXLabel,
            ...(xAxisProps.type === 'Integer' ? { tickformat: 'd' } : {})
          },
          autosize: true,
          margin: { l: 50, r: 50, b: 50, t: 50, pad: 4 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          dragmode: 'pan' // default to pan mode instead of zoom box
        }}
        config={{
          displayModeBar: true,
          scrollZoom: true,
          displaylogo: false,
          modeBarButtonsToAdd: ['pan2d', 'zoom2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d']
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%', minHeight: '400px' }}
      />
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Visual Observations</h1>
      </div>

      <div className="flex gap-6 h-full min-h-[600px]">
        {/* Left Sidebar - Configuration */}
        <div className="w-80 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-y-auto">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center">
            <Settings className="h-5 w-5 text-gray-500 mr-2" />
            <h2 className="font-bold text-gray-700">Configuration</h2>
          </div>
          
          <div className="p-4 space-y-6">
            {/* Dataset Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Database className="h-4 w-4 mr-1" /> Dataset
              </label>
              <select 
                className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500"
                onChange={handleDatasetSelect}
                value={selectedDataset ? `${selectedDataset.type}:${selectedDataset.data.table_id || selectedDataset.data.model_id}` : ""}
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

            {selectedDataset && (
              <>
                {/* Chart Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Chart Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setChartType('bar')} className={`flex items-center justify-center py-2 px-3 border rounded-md text-sm ${chartType === 'bar' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      <BarChart2 className="h-4 w-4 mr-1" /> Bar
                    </button>
                    <button onClick={() => setChartType('line')} className={`flex items-center justify-center py-2 px-3 border rounded-md text-sm ${chartType === 'line' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      <LineChart className="h-4 w-4 mr-1" /> Line
                    </button>
                    <button onClick={() => setChartType('pie')} className={`flex items-center justify-center py-2 px-3 border rounded-md text-sm ${chartType === 'pie' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      <PieChart className="h-4 w-4 mr-1" /> Pie
                    </button>
                    <button onClick={() => setChartType('scatter')} className={`flex items-center justify-center py-2 px-3 border rounded-md text-sm ${chartType === 'scatter' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
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
                    value={xColumn}
                    onChange={(e) => setXColumn(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500 mb-2"
                  >
                    <option value="" disabled>Select column...</option>
                    {(selectedDataset.type === 'table' ? selectedDataset.data.columns : selectedDataset.data.columns_mapped).map((c: any) => (
                      <option key={c.name} value={c.name}>{c.name} {c.type !== 'Any' ? `(${c.type})` : ''}</option>
                    ))}
                  </select>

                  {showXProps && (
                    <div className="bg-gray-50 border border-gray-200 rounded p-2 mb-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-gray-600 mb-1">Display Label</label>
                        <input type="text" value={xAxisProps.label} onChange={e => setXAxisProps({...xAxisProps, label: e.target.value})} className="w-full border border-gray-300 rounded px-2 py-1" placeholder="e.g. Department Name" />
                      </div>
                      <div>
                        <label className="block text-gray-600 mb-1">Data Type Cast</label>
                        <select value={xAxisProps.type} onChange={e => setXAxisProps({...xAxisProps, type: e.target.value})} className="w-full border border-gray-300 rounded px-2 py-1 bg-white">
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
                    value={yColumn}
                    onChange={(e) => setYColumn(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500 mb-2"
                  >
                    <option value="" disabled>Select column...</option>
                    {(selectedDataset.type === 'table' 
                        ? selectedDataset.data.columns.filter((c: any) => (groupBy && aggregation === 'COUNT') || c.type === 'Integer' || c.type === 'Float') 
                        : (selectedDataset.data.columns_mapped || [])
                     ).map((c: any) => (
                      <option key={c.name} value={c.name}>{c.name} {c.type !== 'Any' ? `(${c.type})` : ''}</option>
                    ))}
                  </select>
                  
                  {showYProps && (
                    <div className="bg-gray-50 border border-gray-200 rounded p-2 mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-gray-600 mb-1">Display Label</label>
                        <input type="text" value={yAxisProps.label} onChange={e => setYAxisProps({...yAxisProps, label: e.target.value})} className="w-full border border-gray-300 rounded px-2 py-1" placeholder="e.g. Total Revenue" />
                      </div>
                      <div>
                        <label className="block text-gray-600 mb-1">Data Type Cast</label>
                        <select value={yAxisProps.type} onChange={e => setYAxisProps({...yAxisProps, type: e.target.value})} className="w-full border border-gray-300 rounded px-2 py-1 bg-white">
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
                      checked={groupBy}
                      onChange={(e) => setGroupBy(e.target.checked)}
                      className="h-4 w-4 text-green-600 rounded focus:ring-green-500 cursor-pointer"
                    />
                  </div>
                  
                  {groupBy && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Aggregation Function</label>
                      <select 
                        value={aggregation}
                        onChange={(e) => setAggregation(e.target.value)}
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

                {error && <div className="text-red-600 text-sm p-2 bg-red-50 rounded-md border border-red-200">{error}</div>}

                <button 
                  onClick={handleGenerateChart}
                  disabled={loading}
                  className="w-full bg-green-600 text-white py-2 rounded-md font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Generate Chart'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right Content - Chart Area */}
        <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col relative min-w-[500px]">
          {chartData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
              <BarChart2 className="h-16 w-16 mb-4 text-gray-300" />
              <p>Select a dataset and configure axes to generate a visualization.</p>
            </div>
          ) : (
            <div className="flex-1 w-full h-full relative">
              {renderPlot()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
