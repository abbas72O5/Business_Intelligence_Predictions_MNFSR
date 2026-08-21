import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, LayoutDashboard, PanelRightOpen, X, GripVertical, Trash2, Layout } from 'lucide-react';
import ChartRenderer from '../components/ChartRenderer';
import type { ChartConfig } from '../components/ChartRenderer';
import { useAuth } from '../context/AuthContext';

export default function Predictions() {
  const { token } = useAuth();
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>('');

  // The charts currently dropped onto the main prediction canvas
  const [canvasVisuals, setCanvasVisuals] = useState<ChartConfig[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Fetch saved dashboards on mount
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

  // Drag handlers
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
        // Ensure unique ID for canvas to avoid React key conflicts
        const newChart = { ...chart, id: `canvas-${chart.id}-${Date.now()}` };
        setCanvasVisuals(prev => [...prev, newChart]);
      } catch (err) {
        console.error("Failed to parse dropped chart data", err);
      }
    }
  };

  const removeVisual = (id: string) => {
    setCanvasVisuals(prev => prev.filter(c => c.id !== id));
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

        {/* Header */}
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

        {/* Drop Zone */}
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
              {canvasVisuals.map((chart) => (
                <div key={chart.id} className="bg-white rounded-xl shadow-md border border-gray-200 flex flex-col overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-800 text-sm truncate pr-4">
                      {chart.selectedDataset?.data?.filename || chart.selectedDataset?.data?.name || 'Chart'}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <button className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded hover:bg-green-200 transition-colors font-medium border border-green-200">
                        Configure Prediction
                      </button>
                      <button
                        onClick={() => removeVisual(chart.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Remove Visual"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-4 w-full h-[350px] relative">
                    <ChartRenderer chart={chart} overrideWidth="100%" overrideHeight="100%" />
                  </div>
                </div>
              ))}
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
                    {/* Thumbnail View */}
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
