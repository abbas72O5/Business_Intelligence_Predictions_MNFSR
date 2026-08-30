import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Search, Shield, ShieldAlert, CheckCircle, XCircle, Clock, UserCheck, UserX } from 'lucide-react';

interface UserData {
  id: string;
  email: string;
  role: string;
  department: string | null;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

type StatusFilter = 'All' | 'Active' | 'Pending' | 'Inactive';

export default function Users() {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:8000/auth/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchUsers();
    }
  }, [token]);

  const toggleUserStatus = async (userId: string, currentIsActive: boolean, isPending: boolean) => {
    try {
      if (isPending) {
        // Pending users need verification
        await axios.post(`http://localhost:8000/auth/verify/${userId}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        // Active/Inactive users just need their active status toggled
        await axios.put(`http://localhost:8000/auth/users/${userId}/status`, 
          { is_active: !currentIsActive },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      // Refresh the list
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update user status');
    }
  };

  const getStatus = (u: UserData) => {
    if (!u.is_verified) return 'Pending';
    if (!u.is_active) return 'Inactive';
    return 'Active';
  };

  const filteredUsers = users.filter(u => {
    // 1. Match Search
    const matchesSearch = u.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    // 2. Match Status Filter
    let matchesStatus = true;
    const status = getStatus(u);
    if (statusFilter !== 'All') {
      matchesStatus = status === statusFilter;
    }
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage system access for {currentUser?.role === 'superadmin' ? 'all users across the platform.' : `users in the ${currentUser?.department} department.`}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* Controls: Search and Filters */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search by email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm"
          />
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-lg">
          {(['All', 'Active', 'Pending', 'Inactive'] as StatusFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                statusFilter === filter
                  ? 'bg-white text-green-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
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
                      Loading users...
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No users found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const status = getStatus(u);
                  const isSelf = u.id === currentUser?.id;
                  
                  return (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                            <span className="text-green-800 font-bold text-sm">
                              {u.email.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 flex items-center">
                              {u.email}
                              {isSelf && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">You</span>}
                            </div>
                            <div className="text-sm text-gray-500">{u.department || 'Global'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900 capitalize">
                          {u.role === 'superadmin' ? (
                            <ShieldAlert className="h-4 w-4 mr-1.5 text-purple-600" />
                          ) : u.role === 'admin' ? (
                            <Shield className="h-4 w-4 mr-1.5 text-blue-600" />
                          ) : (
                            <div className="h-4 w-4 mr-1.5" />
                          )}
                          {u.role}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          status === 'Active' 
                            ? 'bg-green-50 text-green-700 border-green-200' 
                            : status === 'Pending'
                            ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {status === 'Active' && <CheckCircle className="h-3 w-3 mr-1" />}
                          {status === 'Pending' && <Clock className="h-3 w-3 mr-1" />}
                          {status === 'Inactive' && <XCircle className="h-3 w-3 mr-1" />}
                          {status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {!isSelf && (
                          status === 'Active' ? (
                            <button
                              onClick={() => toggleUserStatus(u.id, u.is_active, !u.is_verified)}
                              className="inline-flex items-center text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md transition-colors"
                            >
                              <UserX className="h-4 w-4 mr-1.5" />
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => toggleUserStatus(u.id, u.is_active, !u.is_verified)}
                              className="inline-flex items-center text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-md transition-colors"
                            >
                              <UserCheck className="h-4 w-4 mr-1.5" />
                              Activate
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
