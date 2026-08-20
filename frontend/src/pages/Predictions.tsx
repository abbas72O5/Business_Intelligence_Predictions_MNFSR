import { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Loader2, PanelRightOpen, X } from 'lucide-react';
import Plot from 'react-plotly.js';

interface Dataset {
  id: string;
  name: string;
  type: 'table' | 'model';
  data: any;
}

interface PredictionData {
  ds: string;
  y: number | null;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

export default function Predictions() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  
  const [columns, setColumns] = useState<{name: string, type: string}[]>([]);
  const [dateColumn, setDateColumn] = useState<string>('');
  const [valueColumn, setValueColumn] = useState<string>('');
  
  const [periods, setPeriods] = useState<number>(12);
  const [freq, setFreq] = useState<string>('M'); // 'D', 'M', 'Y'
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [predictionData, setPredictionData] = useState<PredictionData[] | null>(null);
  
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const token = localStorage.getItem('token');
        const [tablesRes, modelsRes] = await Promise.all([
          axios.get('http://localhost:8000/files/metadata', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('http://localhost:8000/query/saved_models', { headers: { Authorization: `Bearer ${token}` } })
        ]);

        const ds: Dataset[] = [];
        tablesRes.data.forEach((t: any) => {
          ds.push({ id: `table_${t.table_id}`, name: t.filename, type: 'table', data: t });
        });
        modelsRes.data.forEach((m: any) => {
          ds.push({ id: `model_${m.model_id}`, name: m.name, type: 'model', data: m });
        });
        setDatasets(ds);
      } catch (error) {
        console.error("Failed to fetch datasets", error);
      }
    };
    fetchDatasets();
  }, []);

  useEffect(() => {
    if (!selectedDatasetId) {
      setColumns([]);
      setDateColumn('');
      setValueColumn('');
      return;
    }

    const ds = datasets.find(d => d.id === selectedDatasetId);
    if (ds) {
      if (ds.type === 'table') {
        setColumns(ds.data.columns || []);
      } else {
        const cols = ds.data.columns.map((c: any) => ({ name: c.alias || c.column, type: 'Unknown' }));
        setColumns(cols);
      }
      setDateColumn('');
      setValueColumn('');
    }
  }, [selectedDatasetId, datasets]);

  const handleGenerateForecast = async () => {
    if (!selectedDatasetId || !dateColumn || !valueColumn) {
      setError("Please select a dataset, a date column, and a value column.");
      return;
    }
    
    setError('');
    setLoading(true);
    setPredictionData(null);
    
    const ds = datasets.find(d => d.id === selectedDatasetId);
    if (!ds) return;
    
    const dataId = ds.type === 'table' ? ds.data.table_id : ds.data.model_id;
    
    let dCastType = null;
    let vCastType = null;
    if (ds.type === 'table' && ds.data.columns) {
        const dCol = ds.data.columns.find((c:any) => c.name === dateColumn);
        if (dCol) dCastType = dCol.type;
        const vCol = ds.data.columns.find((c:any) => c.name === valueColumn);
        if (vCol) vCastType = vCol.type;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('http://localhost:8000/query/predict', {
        table_id: dataId,
        dataset_type: ds.type,
        date_column: dateColumn,
        value_column: valueColumn,
        periods: periods,
        freq: freq,
        date_cast_type: dCastType,
        value_cast_type: vCastType
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setPredictionData(res.data);
      if (window.innerWidth < 1024) setSidebarOpen(false);
    } catch (err: any) {
      console.error(err);
      let msg = "Failed to generate forecast.";
      if (err.response?.data?.detail) {
        msg = typeof err.response.data.detail === 'string' ? err.response.data.detail : "Configuration error.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const renderChart = () => {
    if (!predictionData || predictionData.length === 0) return null;

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
        name: 'Historical Data',
        line: { color: '#16a34a', width: 2 },
        marker: { size: 4 }
    };
    
    // Draw forecast everywhere, but only solid if historical exists?
    // User requested dotted line for the extended part.
    // The easiest is just plotting yhat natively as dotted.
    const forecastTrace = {
        x: ds,
        y: yhat,
        type: 'scatter',
        mode: 'lines',
        name: 'Forecast Trend',
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
            title: `Forecast: ${valueColumn} over time`,
            autosize: true,
            margin: { l: 50, r: 50, b: 50, t: 50, pad: 4 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            hovermode: 'x unified',
            xaxis: {
                title: dateColumn
            },
            yaxis: {
                title: valueColumn
            },
            legend: {
                orientation: 'h',
                y: -0.2
            }
          }}
          config={{
            displaylogo: false,
            responsive: true,
            displayModeBar: true,
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
        />
    );
  };

  return (
    <div className="flex h-full bg-gray-50 overflow-hidden relative animate-in fade-in duration-500">
      
      {/* Configuration Sidebar */}
      <div className={`${sidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full'} transition-all duration-300 ease-in-out bg-white border-r border-gray-200 flex flex-col z-20 shrink-0 absolute lg:relative h-full shadow-lg lg:shadow-none`}>
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-bold text-gray-800 flex items-center">
            <LineChart className="w-5 h-5 mr-2 text-green-700" />
            Prophet Forecast
          </h2>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dataset / Model</label>
              <select
                className="w-full bg-gray-50 border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-green-500 focus:border-green-500"
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
              >
                <option value="">-- Select Source --</option>
                {datasets.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.type === 'model' ? '🛠️' : '📄'} {d.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedDatasetId && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time (Date) Column</label>
                  <select
                    className="w-full bg-gray-50 border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-green-500 focus:border-green-500"
                    value={dateColumn}
                    onChange={(e) => setDateColumn(e.target.value)}
                  >
                    <option value="">-- Select Date Column --</option>
                    {columns.filter(c => c.type === 'Date' || c.type === 'String' || c.type === 'Unknown').map(c => (
                      <option key={c.name} value={c.name}>{c.name} {c.type !== 'Unknown' ? `(${c.type})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Metric (Value) Column</label>
                  <select
                    className="w-full bg-gray-50 border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-green-500 focus:border-green-500"
                    value={valueColumn}
                    onChange={(e) => setValueColumn(e.target.value)}
                  >
                    <option value="">-- Select Value to Forecast --</option>
                    {columns.filter(c => c.type === 'Integer' || c.type === 'Float' || c.type === 'Unknown').map(c => (
                      <option key={c.name} value={c.name}>{c.name} {c.type !== 'Unknown' ? `(${c.type})` : ''}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">This value will be summed per time interval automatically.</p>
                </div>

                <div className="pt-4 border-t border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Forecast Horizon</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Periods</label>
                            <input 
                                type="number" 
                                min="1" 
                                max="365"
                                value={periods}
                                onChange={(e) => setPeriods(Number(e.target.value))}
                                className="w-full bg-gray-50 border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-green-500 focus:border-green-500" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Frequency</label>
                            <select 
                                value={freq}
                                onChange={(e) => setFreq(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-green-500 focus:border-green-500"
                            >
                                <option value="D">Days</option>
                                <option value="M">Months</option>
                                <option value="Y">Years</option>
                            </select>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm text-red-600">{error}</p>
                    </div>
                )}
                
                <button
                  onClick={handleGenerateForecast}
                  disabled={loading || !dateColumn || !valueColumn}
                  className="w-full mt-4 flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LineChart className="w-4 h-4 mr-2" />}
                  Generate Forecast
                </button>
              </>
            )}
        </div>
      </div>

      {/* Main Plot Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-gray-100">
        <div className="absolute top-4 left-4 z-10 flex space-x-2">
            {!sidebarOpen && (
                <button 
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 bg-white rounded-md shadow-sm border border-gray-200 hover:bg-gray-50 text-gray-700"
                    title="Open Settings"
                >
                    <PanelRightOpen className="w-5 h-5" />
                </button>
            )}
        </div>

        <div className="flex-1 p-4 lg:p-8 overflow-hidden flex flex-col">
            {predictionData ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex-1 h-full w-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
                    <div className="flex-1 w-full relative min-h-[400px]">
                        {renderChart()}
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center p-8">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <LineChart className="w-10 h-10 text-green-700" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Predictive Forecasting</h2>
                        <p className="text-gray-500 max-w-md mx-auto">
                            Configure your time series parameters in the sidebar to generate AI-driven forecasts using Meta Prophet.
                        </p>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
