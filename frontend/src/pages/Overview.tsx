import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { UserCheck, ShieldCheck } from 'lucide-react';

export default function Overview() {
  const { user, token } = useAuth();
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
                    <p className="text-sm text-gray-500 mt-0.5">Department: {pu.department}</p>
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
    </div>
  );
}
