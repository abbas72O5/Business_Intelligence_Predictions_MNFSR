import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, FileText, Clock, Eye, X } from 'lucide-react';
import ChartRenderer from '../components/ChartRenderer';

export default function Overview() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [recentDashboards, setRecentDashboards] = useState<any[]>([]);
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [viewingReportDetails, setViewingReportDetails] = useState<any | null>(null);

  useEffect(() => {
    if (user?.role === 'user') {
      axios.get('http://localhost:8000/mills/me/reports', {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => {
        setRecentReports(res.data.slice(0, 5));
      }).catch(console.error);
    }
  }, [user, token]);

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

  // removed handleVerify

  return (
    <>
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-6 py-8 border-l-4 border-l-green-800">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Welcome to your Workspace
        </h1>
        <p className="mt-2 text-lg text-gray-500">
          Securely manage projects, view allocations, and run AI forecasts for the {user?.department || 'Global'} department.
        </p>
      </div>


      {/* Recent Reports Section for Users */}
      {user?.role === 'user' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
            <div className="flex items-center">
              <FileText className="h-6 w-6 text-green-700 mr-2" />
              <h3 className="text-lg leading-6 font-bold text-gray-900">
                Recently Submitted Returns
              </h3>
            </div>
          </div>
          
          <ul className="divide-y divide-gray-200">
            {recentReports.length === 0 ? (
              <li className="px-6 py-12 text-center">
                <p className="text-gray-500 font-medium">No recent reports submitted.</p>
                <p className="text-sm text-gray-400 mt-1">Submit a new Monthly Return to see it here.</p>
              </li>
            ) : (
              recentReports.map((report: any) => (
                <li key={report.id} className="px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center">
                    <Clock className="h-5 w-5 text-gray-400 mr-4" />
                    <div>
                      <p className="text-sm font-bold text-gray-900">Return for {report.month} {report.year}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Submitted on: {new Date(report.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <button onClick={() => setViewingReportDetails(report)} className="text-green-600 hover:text-green-900 inline-flex items-center text-sm font-medium">
                    <Eye className="h-4 w-4 mr-1" /> View Details
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {/* Recent Visuals Section */}
      {user?.role !== 'user' && (
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
      )}
    </div>

      {/* ================= VIEW REPORT MODAL ================= */}
      {viewingReportDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">

            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Monthly Return: {viewingReportDetails.reporting_month}</h3>
                <p className="text-sm text-gray-500">Submitted on {new Date(viewingReportDetails.created_at).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setViewingReportDetails(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-8 bg-gray-50">

              {/* Capacity & Consumed */}
              <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                <h4 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Capacity & Cotton Consumed (Form A)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-gray-500 block text-xs">Worked Spindles</span><span className="font-medium">{viewingReportDetails.worked_spindles}</span></div>
                  <div><span className="text-gray-500 block text-xs">Worked Rotors</span><span className="font-medium">{viewingReportDetails.worked_rotors}</span></div>
                  <div><span className="text-gray-500 block text-xs">Pressed (kg)</span><span className="font-medium">{viewingReportDetails.pressed_cotton_kg}</span></div>
                  <div><span className="text-gray-500 block text-xs">Un-pressed (kg)</span><span className="font-medium">{viewingReportDetails.unpressed_cotton_kg}</span></div>
                </div>
              </div>

              {/* Cess Calculation */}
              <div className="bg-green-50 p-5 rounded-lg border border-green-200">
                <h4 className="text-sm font-bold text-green-900 border-b border-green-200 pb-2 mb-4">Cess Calculation</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-green-800 block text-xs">Total Bales</span><span className="font-bold">{((viewingReportDetails.pressed_cotton_kg + viewingReportDetails.unpressed_cotton_kg) / 170).toFixed(2)}</span></div>
                  <div><span className="text-green-800 block text-xs">Cess / Bale</span><span className="font-bold">Rs. {viewingReportDetails.cess_per_bale}</span></div>
                  <div className="col-span-2 text-right"><span className="text-green-800 block text-xs">Remitted Amount</span><span className="font-black text-lg text-green-700">Rs. {viewingReportDetails.remitted_amount?.toLocaleString() || viewingReportDetails.remitted_amount}</span></div>
                </div>
              </div>

              {/* General Info */}
              <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                <h4 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">General Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div><span className="text-gray-500 block text-xs">Working Days</span><span className="font-medium">{viewingReportDetails.working_days}</span></div>
                  <div><span className="text-gray-500 block text-xs">Shifts</span><span className="font-medium">{viewingReportDetails.shifts}</span></div>
                </div>

                {['yarn_cotton', 'yarn_blended', 'yarn_synthetic'].map(yKey => {
                  if (!viewingReportDetails[yKey] || viewingReportDetails[yKey].length === 0) return null;
                  return (
                    <div key={yKey} className="mb-4">
                      <span className="text-gray-700 block text-xs font-bold mb-2 uppercase">{yKey.replace('_', ' ')}</span>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {viewingReportDetails[yKey].map((y: any, idx: number) => (
                          <div key={idx} className="bg-gray-50 p-2 rounded border border-gray-200 text-xs">
                            <span className="text-gray-500">Count:</span> <span className="font-medium">{y.count}</span> <br />
                            <span className="text-gray-500">Qty:</span> <span className="font-medium">{y.quantity} kg</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Raw Material Position */}
              <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                <h4 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Raw Material Position</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {['raw_material_domestic', 'raw_material_imported', 'raw_material_synthetic'].map(rmKey => {
                    const rm = viewingReportDetails[rmKey];
                    if (!rm) return null;
                    return (
                      <div key={rmKey} className="bg-gray-50 p-3 rounded border border-gray-200 text-xs space-y-1">
                        <span className="text-gray-700 block font-bold mb-2 uppercase border-b pb-1">{rmKey.replace('raw_material_', '')}</span>
                        <div className="flex justify-between"><span className="text-gray-500">Opening:</span> <span className="font-medium">{rm.opening}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Procurement:</span> <span className="font-medium">{rm.procurement}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Consumption:</span> <span className="font-medium">{rm.consumption}</span></div>
                        <div className="flex justify-between pt-1 border-t border-gray-200 mt-1"><span className="text-gray-700 font-bold">Closing:</span> <span className="font-bold">{rm.closing}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cess Status */}
              <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                <h4 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Cess Status</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-gray-500 block text-xs">Last Payment</span><span className="font-medium">Rs. {viewingReportDetails.last_payment_amount}</span></div>
                  <div><span className="text-gray-500 block text-xs">Last Date</span><span className="font-medium">{viewingReportDetails.last_payment_date || '-'}</span></div>
                  <div><span className="text-gray-500 block text-xs">Amount Due</span><span className="font-medium">Rs. {viewingReportDetails.amount_due}</span></div>
                  <div><span className="text-gray-500 block text-xs">Outstanding</span><span className="font-medium">Rs. {viewingReportDetails.outstanding_cess}</span></div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </>
  );
}
