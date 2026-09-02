import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Search, Shield, ShieldAlert, CheckCircle, XCircle, Clock, UserCheck, UserX, Plus, X, UserPlus } from 'lucide-react';

interface UserData {
  id: string;
  email: string;
  role: string;
  department: string | null;
  owner_name: string | null;
  mill_name: string | null;
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

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newMillName, setNewMillName] = useState('');
  const [creating, setCreating] = useState(false);

  // Admin Creation Modal State
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminZone, setNewAdminZone] = useState('');
  const [newAdminPrivileges, setNewAdminPrivileges] = useState({
    can_manage_users: true,
    can_view_activities: true
  });
  const [departmentsList, setDepartmentsList] = useState<{ name: string, is_active: boolean }[]>([]); const fetchUsers = async () => {
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
      if (currentUser?.role === 'superadmin') {
        const fetchZones = async () => {
          try {
            const response = await axios.get('http://localhost:8000/departments', {
              headers: { Authorization: `Bearer ${token}` }
            });
            const activeDepts = response.data.filter((d: any) => d.is_active);
            setDepartmentsList(activeDepts);
            if (activeDepts.length > 0) {
              setNewAdminZone(activeDepts[0].name);
            }
          } catch (err) {
            console.error('Failed to fetch departments', err);
          }
        };
        fetchZones();
      }
    }
  }, [token, currentUser]);

  const toggleUserStatus = async (userId: string, currentIsActive: boolean, isPending: boolean) => {
    try {
      if (isPending) {
        await axios.post(`http://localhost:8000/auth/verify/${userId}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.put(`http://localhost:8000/auth/users/${userId}/status`,
          { is_active: !currentIsActive },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      fetchUsers();

      const targetUser = users.find(u => u.id === userId);
      if (targetUser) {
        let actionStr = 'Verify User';
        if (!isPending) {
          actionStr = currentIsActive ? 'Deactivate User' : 'Activate User';
        }
        axios.post('http://localhost:8000/activities', {
          action: actionStr,
          details: { user: targetUser.email, department: targetUser.department }
        }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update user status');
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:8000/auth/admins', {
        email: newAdminEmail,
        password: newAdminPassword,
        department: newAdminZone,
        privileges: newAdminPrivileges
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setShowAdminModal(false);
      setNewAdminEmail('');
      setNewAdminPassword('');
      setNewAdminZone('');
      setNewAdminPrivileges({ can_manage_users: true, can_view_activities: true });
      fetchUsers();

      // Log activity
      axios.post('http://localhost:8000/activities', {
        action: 'Create Admin',
        details: { user: newAdminEmail, department: newAdminZone }
      }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create admin');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword || !newOwnerName || !newMillName) return;

    try {
      setCreating(true);
      await axios.post('http://localhost:8000/auth/users', {
        email: newEmail,
        password: newPassword,
        owner_name: newOwnerName,
        mill_name: newMillName
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Log activity
      axios.post('http://localhost:8000/activities', {
        action: 'Create Mill Owner',
        details: { user: newEmail, mill_name: newMillName, department: currentUser?.department || 'Global' }
      }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));

      setShowModal(false);
      setNewEmail('');
      setNewPassword('');
      setNewOwnerName('');
      setNewMillName('');
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const getStatus = (u: UserData) => {
    if (!u.is_verified) return 'Pending';
    if (!u.is_active) return 'Inactive';
    return 'Active';
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.mill_name && u.mill_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.owner_name && u.owner_name.toLowerCase().includes(searchQuery.toLowerCase()));

    let matchesStatus = true;
    const status = getStatus(u);
    if (statusFilter !== 'All') {
      matchesStatus = status === statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  const canManageUsers = currentUser?.role === 'superadmin' || (currentUser?.role === 'admin' && currentUser?.privileges?.can_manage_users);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage system access for {currentUser?.role === 'superadmin' ? 'all users across the platform.' : `users in the ${currentUser?.department} department.`}
          </p>
        </div>

        {canManageUsers && (
          <div className="flex items-center space-x-3">
            {currentUser?.role === 'superadmin' && (
              <button
                onClick={() => setShowAdminModal(true)}
                className="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Create Admin
              </button>
            )}
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Mill Owner
            </button>
          </div>
        )}
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
            placeholder="Search by email, mill, or owner..."
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
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${statusFilter === filter
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mill Info</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
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
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
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
                        {u.role === 'user' ? (
                          <>
                            <div className="text-sm font-medium text-gray-900">{u.mill_name || '--'}</div>
                            <div className="text-xs text-gray-500">{u.owner_name || '--'}</div>
                          </>
                        ) : (
                          <div className="text-sm text-gray-400 italic">Not Applicable</div>
                        )}
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
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${status === 'Active'
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
                        <div className="flex justify-end items-center space-x-2">

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
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Create New Mill Owner</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-500 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                  placeholder="owner@mill.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name of Owner</label>
                <input
                  type="text"
                  required
                  value={newOwnerName}
                  onChange={e => setNewOwnerName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name of Mill</label>
                <input
                  type="text"
                  required
                  value={newMillName}
                  onChange={e => setNewMillName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                  placeholder="Green Valley Mills"
                />
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Owner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Creation Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Create New Zone Admin</h3>
              <button
                onClick={() => setShowAdminModal(false)}
                className="text-gray-400 hover:text-gray-500 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAdmin} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email Address</label>
                <input
                  type="email"
                  required
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                  placeholder="admin@ministry.gov"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Zone</label>
                <select
                  required
                  value={newAdminZone}
                  onChange={(e) => setNewAdminZone(e.target.value)}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-green-700 focus:border-green-700 sm:text-sm rounded-md border bg-white"
                >
                  {departmentsList.map(dept => (
                    <option key={dept.name} value={dept.name}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 border-t border-gray-200 space-y-4">
                <h4 className="text-sm font-medium text-gray-900">Initial Privileges</h4>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Manage Users</span>
                  <button
                    type="button"
                    onClick={() => setNewAdminPrivileges(prev => ({ ...prev, can_manage_users: !prev.can_manage_users }))}
                    className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none ${newAdminPrivileges.can_manage_users ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${newAdminPrivileges.can_manage_users ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">View Activities</span>
                  <button
                    type="button"
                    onClick={() => setNewAdminPrivileges(prev => ({ ...prev, can_view_activities: !prev.can_view_activities }))}
                    className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none ${newAdminPrivileges.can_view_activities ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${newAdminPrivileges.can_view_activities ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                  </button>
                </div>
              </div>

              <div className="pt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-green-600 border border-transparent rounded-md shadow-sm py-2 px-4 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Create Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
