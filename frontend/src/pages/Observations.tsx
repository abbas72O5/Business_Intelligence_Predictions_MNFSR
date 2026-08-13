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
  const [selectedTable, setSelectedTable] = useState<TableMetadata | null>(null);
  
  // Chart Config
  const [chartType, setChartType] = useState('bar');
  const [xColumn, setXColumn] = useState('');
  const [yColumn, setYColumn] = useState('');
  
  // Data Operations
  const [groupBy, setGroupBy] = useState(false);
  const [aggregation, setAggregation] = useState('SUM');
  
  // Data State
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTables();
  }, [token]);

  const fetchTables = async () => {
    try {
      const res = await axios.get('http://localhost:8000/files/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTables(res.data);
    } catch (err) {
      console.error("Failed to load tables", err);
    }
  };

  const handleTableSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tableId = e.target.value;
    const table = tables.find(t => t.table_id === tableId);
    setSelectedTable(table || null);
    setXColumn('');
    setYColumn('');
    setChartData([]);
  };

  const handleGenerateChart = async () => {
    if (!selectedTable || !xColumn || !yColumn) {
      setError("Please select a table, X-axis, and Y-axis.");
      return;
    }
    
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:8000/query/observations', {
        table_id: selectedTable.table_id,
        x_column: xColumn,
        y_column: yColumn,
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

    return (
      <Plot
        data={data}
        layout={{ 
          title: `${selectedTable?.filename} - ${yColumn} by ${xColumn}`,
          autosize: true,
          margin: { l: 50, r: 50, b: 50, t: 50, pad: 4 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent'
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
                onChange={handleTableSelect}
                defaultValue=""
              >
                <option value="" disabled>Select a dataset...</option>
                {tables.map(t => (
                  <option key={t.table_id} value={t.table_id}>{t.filename}</option>
                ))}
              </select>
            </div>

            {selectedTable && (
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">X-Axis (Category)</label>
                  <select 
                    value={xColumn}
                    onChange={(e) => setXColumn(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500 mb-3"
                  >
                    <option value="" disabled>Select column...</option>
                    {selectedTable.columns.map(c => (
                      <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                    ))}
                  </select>

                  <label className="block text-sm font-medium text-gray-700 mb-1">Y-Axis (Value)</label>
                  <select 
                    value={yColumn}
                    onChange={(e) => setYColumn(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="" disabled>Select column...</option>
                    {selectedTable.columns.filter(c => c.type === 'Integer' || c.type === 'Float').map(c => (
                      <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                    ))}
                  </select>
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
