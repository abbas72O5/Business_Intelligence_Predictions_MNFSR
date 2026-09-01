import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { UserCheck, ShieldCheck, LayoutDashboard } from 'lucide-react';
import ChartRenderer from '../components/ChartRenderer';

export default function Overview() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [refresh, setRefresh] = useState(0);

  const [recentDashboards, setRecentDashboards] = useState<any[]>([]);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'superadmin') {
      axios.get('http://localhost:8000/auth/pending', {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => setPendingUsers(res.data))
        .catch(console.error);
    }
  }, [user, token, refresh]);

  useEffect(() => {
    // Fetch user's recent dashboards
    axios.get('http://localhost:8000/dashboards/', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      setRecentDashboards(res.data);
    }).catch(console.error);
  }, [token]);

  // Extract up to 2 recent visuals for Observations
  const obsVisuals = recentDashboards
    .filter(d => d.type === 'observation' || !d.type)
    .flatMap(d => (d.charts || []).map((chart: any) => ({ ...chart, dashboardName: d.name, dashboardId: d.dashboard_id })))
    .slice(0, 2);

  // Extract up to 2 recent visuals for Predictions
  const predVisuals = recentDashboards
    .filter(d => d.type === 'prediction')
    .flatMap(d => (d.charts || []).map((item: any) => {
      let chartConfig = item.chart ? { ...item.chart } : { ...item };
      
      // If there's prediction data, we map it into chartData format so ChartRenderer can display the forecast!
      if (item.predictionData && item.predictionData.length > 0) {
        const mappedData = item.predictionData.map((pd: any) => ({
          ...pd,
          [chartConfig.xColumn]: pd.ds,
          [chartConfig.yColumn]: pd.y !== null ? pd.y : pd.yhat,
          _is_forecast: pd.y === null
        }));
        chartConfig.chartData = mappedData;
      }
      
      return { ...chartConfig, dashboardName: d.name, dashboardId: d.dashboard_id };
    }))
    .slice(0, 2);

  const handleVisualClick = (chart: any, type: 'observation' | 'prediction') => {
    if (type === 'observation') {
      localStorage.setItem('obs_auto_load_id', chart.dashboardId);
      navigate('/dashboard/observations');
    } else {
      localStorage.setItem('pred_selected_dashboard', chart.dashboardId);
      navigate('/dashboard/predictions');
    }
  };

  const handleVerify = async (userId: string) => {
    try {
      await axios.post(`http://localhost:8000/auth/verify/${userId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRefresh(prev => prev + 1);
    } catch (err) {
      alert("Failed to verify user");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-6 py-8 border-l-4 border-l-green-800">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Welcome to your Workspace
        </h1>
        <p className="mt-2 text-lg text-gray-500">
          Securely manage projects, view allocations, and run AI forecasts for the {user?.department || 'Global'} department.
        </p>
      </div>

      {(user?.role === 'admin' || user?.role === 'superadmin') && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
            <div className="flex items-center">
              <ShieldCheck className="h-6 w-6 text-green-700 mr-2" />
              <h3 className="text-lg leading-6 font-bold text-gray-900">
                Security & Approvals
              </h3>
            </div>
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
              {pendingUsers.length} Pending
            </span>
          </div>
          
          <ul className="divide-y divide-gray-200">
            {pendingUsers.length === 0 ? (
              <li className="px-6 py-12 text-center">
                <p className="text-gray-500 font-medium">No pending user verification requests.</p>
                <p className="text-sm text-gray-400 mt-1">Your department is fully secure.</p>
              </li>
            ) : (
              pendingUsers.map(pu => (
                <li key={pu.id} className="px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="mb-4 sm:mb-0">
                    <p className="text-sm font-bold text-gray-900">{pu.email}</p>
                    <p className="text-sm text-gray-500 mt-0.5">Zone: {pu.department}</p>
                    <p className="text-xs text-gray-400 mt-1">Requested: {new Date(pu.created_at).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => handleVerify(pu.id)}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-md shadow-sm text-white bg-green-700 hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-700 transition-colors"
                  >
                    <UserCheck className="h-4 w-4 mr-2" />
                    Approve Access
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {/* Recent Visuals Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
          <div className="flex items-center">
            <LayoutDashboard className="h-6 w-6 text-green-700 mr-2" />
            <h3 className="text-lg leading-6 font-bold text-gray-900">
              Recent Dashboard Visuals
            </h3>
          </div>
        </div>
        
        <div className="p-6 space-y-8">
          {obsVisuals.length === 0 && predVisuals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 font-medium">No recent visuals found.</p>
              <p className="text-sm text-gray-400 mt-1">Go to Observations or Predictions to create some!</p>
            </div>
          ) : (
            <>
              {obsVisuals.length > 0 && (
                <div>
                  <h4 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Observations</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {obsVisuals.map((chart: any, idx: number) => (
                      <div 
                        key={idx} 
                        onClick={() => handleVisualClick(chart, 'observation')}
                        className="border border-gray-200 rounded-lg p-2 shadow-sm bg-white cursor-pointer hover:shadow-md hover:border-green-500 transition-all group overflow-hidden"
                        title={`Open Dashboard: ${chart.dashboardName}`}
                      >
                        <div className="w-full overflow-hidden flex justify-center bg-white rounded pointer-events-none">
                          <ChartRenderer chart={chart} overrideWidth="100%" overrideHeight="300px" />
                        </div>
                        <div className="mt-2 text-center text-sm font-medium text-gray-600 group-hover:text-green-700 transition-colors">
                          View in Observations
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {predVisuals.length > 0 && (
                <div>
                  <h4 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Predictions</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {predVisuals.map((chart: any, idx: number) => (
                      <div 
                        key={idx} 
                        onClick={() => handleVisualClick(chart, 'prediction')}
                        className="border border-gray-200 rounded-lg p-2 shadow-sm bg-white cursor-pointer hover:shadow-md hover:border-green-500 transition-all group overflow-hidden"
                        title={`Open Dashboard: ${chart.dashboardName}`}
                      >
                        <div className="w-full overflow-hidden flex justify-center bg-white rounded pointer-events-none">
                          <ChartRenderer chart={chart} overrideWidth="100%" overrideHeight="300px" />
                        </div>
                        <div className="mt-2 text-center text-sm font-medium text-gray-600 group-hover:text-green-700 transition-colors">
                          View in Predictions
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
