import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Clock, ShieldAlert, FileText, Database, Share2, Activity, X } from 'lucide-react';

interface ActivityDetails {
  dataset?: string;
  relationships?: string[];
  visuals?: string[];
  [key: string]: any;
}

interface ActivityData {
  id: string;
  user_id: string;
  user_email: string;
  department: string | null;
  action: string;
  details: ActivityDetails;
  timestamp: string;
}

export default function AuditLogs() {
  const { token, user: currentUser } = useAuth();
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [selectedActivity, setSelectedActivity] = useState<ActivityData | null>(null);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:8000/activities', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setActivities(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch activities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch if superadmin or an admin with privileges
    if (token && (currentUser?.role === 'superadmin' || (currentUser?.role === 'admin' && currentUser?.privileges?.can_view_activities !== false))) {
      fetchActivities();
    }
  }, [token, currentUser]);

  if (currentUser?.role !== 'superadmin' && (currentUser?.role !== 'admin' || currentUser?.privileges?.can_view_activities === false)) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500">
        <ShieldAlert className="h-16 w-16 mb-4 text-red-500 opacity-50" />
        <h2 className="text-xl font-medium">Access Denied</h2>
        <p>You do not have permission to view the audit logs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor system usage, visual generation, and dashboard exports.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* Activities Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Zone
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date / Time
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="inline-flex items-center text-green-700">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading audit logs...
                    </div>
                  </td>
                </tr>
              ) : activities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No activities found.
                  </td>
                </tr>
              ) : (
                activities.map((activity) => (
                  <tr key={activity.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{activity.user_email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{activity.department || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {activity.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(activity.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => setSelectedActivity(activity)}
                        className="inline-flex items-center text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-md transition-colors"
                      >
                        <FileText className="h-4 w-4 mr-1.5" />
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity Details Modal */}
      {selectedActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900">Audit Log Details</h3>
              </div>
              <button
                onClick={() => setSelectedActivity(null)}
                className="text-gray-400 hover:text-gray-500 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg space-y-2 border border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Action:</span>
                  <span className="font-medium text-gray-900">{selectedActivity.action}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">User:</span>
                  <span className="font-medium text-gray-900">{selectedActivity.user_email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Time:</span>
                  <span className="font-medium text-gray-900">{new Date(selectedActivity.timestamp).toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-4">
                {/* Dataset */}
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <Database className="h-4 w-4 text-gray-400" />
                    <h4 className="text-sm font-medium text-gray-900">Dataset Used</h4>
                  </div>
                  <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md border border-gray-200">
                    {selectedActivity.details?.dataset || 'Not available'}
                  </div>
                </div>

                {/* Relationships */}
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <Share2 className="h-4 w-4 text-gray-400" />
                    <h4 className="text-sm font-medium text-gray-900">Relationships</h4>
                  </div>
                  {selectedActivity.details?.relationships && selectedActivity.details.relationships.length > 0 ? (
                    <ul className="list-disc list-inside text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md border border-gray-200 space-y-1">
                      {selectedActivity.details.relationships.map((rel, idx) => (
                        <li key={idx}>{rel}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md border border-gray-200">
                      Not available
                    </div>
                  )}
                </div>

                {/* Visuals */}
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <Activity className="h-4 w-4 text-gray-400" />
                    <h4 className="text-sm font-medium text-gray-900">Visuals Generated</h4>
                  </div>
                  {selectedActivity.details?.visuals && selectedActivity.details.visuals.length > 0 ? (
                    <ul className="list-disc list-inside text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md border border-gray-200 space-y-1">
                      {selectedActivity.details.visuals.map((vis, idx) => (
                        <li key={idx}>{vis}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md border border-gray-200">
                      Not available
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setSelectedActivity(null)}
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
