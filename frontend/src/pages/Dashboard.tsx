import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { LogOut, UserCheck } from 'lucide-react';

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'superadmin') {
      axios.get('http://localhost:8000/auth/pending', {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => setPendingUsers(res.data))
        .catch(console.error);
    }
  }, [user, token, refresh]);

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-green-900 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center text-white font-bold text-lg">
            Ministry BI Portal
            <span className="ml-4 px-2.5 py-0.5 rounded-full text-xs bg-yellow-500 text-green-900 uppercase tracking-wide font-semibold">
              {user?.role}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-300 text-sm">{user?.email}</span>
            <button 
              onClick={logout}
              className="flex items-center text-sm text-gray-300 hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Welcome Section */}
        <div className="bg-white rounded-lg shadow px-6 py-5 border-l-4 border-green-800 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome to the {user?.department ? `${user.department} ` : 'Global '} Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            You are logged in securely. From here you can manage projects, view allocations, and run AI forecasts.
          </p>
        </div>

        {/* Admin Section: Pending Users */}
        {(user?.role === 'admin' || user?.role === 'superadmin') && (
          <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Pending Verification Requests
              </h3>
              <span className="bg-red-100 text-red-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                {pendingUsers.length} Pending
              </span>
            </div>
            
            <ul className="divide-y divide-gray-200">
              {pendingUsers.length === 0 ? (
                <li className="px-6 py-8 text-center text-gray-500 text-sm">
                  No pending users to verify.
                </li>
              ) : (
                pendingUsers.map(pu => (
                  <li key={pu.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{pu.email}</p>
                      <p className="text-sm text-gray-500">Department: {pu.department}</p>
                    </div>
                    <button
                      onClick={() => handleVerify(pu.id)}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-700 hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      Approve Access
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        {/* Future placeholder for data tables and charts */}
        <div className="bg-white rounded-lg shadow border border-dashed border-gray-300 px-6 py-12 text-center">
          <p className="text-gray-500">Project Data Tables and AI Forecasting Canvas will go here.</p>
        </div>

      </main>
    </div>
  );
}
