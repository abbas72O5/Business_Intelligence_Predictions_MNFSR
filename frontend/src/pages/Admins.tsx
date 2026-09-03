import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, X, ShieldAlert, Settings, CheckCircle, XCircle, Clock, UserCheck, UserX } from 'lucide-react';

interface Privileges {
  can_manage_users: boolean;
  can_view_activities: boolean;
  disabled_modules?: string[];
  module_permissions?: Record<string, Record<string, boolean>>;
}

interface AdminData {
  id: string;
  email: string;
  department: string | null;
  privileges: Privileges | null;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export default function Admins() {
  const { token, user: currentUser } = useAuth();
  const [admins, setAdmins] = useState<AdminData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showPrivilegesModal, setShowPrivilegesModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminData | null>(null);

  const [showModulePrivilegesModal, setShowModulePrivilegesModal] = useState(false);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [pendingModulePermissions, setPendingModulePermissions] = useState<Record<string, Record<string, boolean>>>({});

  const ALL_MODULES = [
    'Overview',
    'Profile',
    'Data Uploading',
    'Data Selection',
    'Observations',
    'Predictions',
    'Data Management'
  ];

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:8000/auth/admins', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAdmins(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch admins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && currentUser?.role === 'superadmin') {
      fetchAdmins();
    }
  }, [token, currentUser]);

  const togglePrivilege = async (adminId: string, currentPrivileges: Privileges | null, field: 'can_manage_users' | 'can_view_activities') => {
    const defaultPrivileges = { can_manage_users: true, can_view_activities: true };
    const privilegesToUpdate = currentPrivileges ? { ...currentPrivileges } : { ...defaultPrivileges };

    privilegesToUpdate[field] = !privilegesToUpdate[field];

    try {
      await axios.put(`http://localhost:8000/auth/admins/${adminId}/privileges`,
        { privileges: privilegesToUpdate },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Optimistic update
      setAdmins(prev => prev.map(a =>
        a.id === adminId ? { ...a, privileges: privilegesToUpdate } : a
      ));

      // Keep modal state in sync
      if (selectedAdmin?.id === adminId) {
        setSelectedAdmin(prev => prev ? { ...prev, privileges: privilegesToUpdate } : null);
      }

      // Log activity
      const targetAdmin = admins.find(a => a.id === adminId);
      if (targetAdmin) {
        axios.post('http://localhost:8000/activities', {
          action: 'Update Admin Privileges',
          details: { user: targetAdmin.email, department: targetAdmin.department, updated_field: field }
        }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update privileges');
    }
  };

  const toggleModuleStatus = async (adminId: string, currentPrivileges: Privileges | null, moduleName: string) => {
    const defaultPrivileges: Privileges = { can_manage_users: true, can_view_activities: true, disabled_modules: [] };
    const privilegesToUpdate = currentPrivileges ? { ...currentPrivileges } : { ...defaultPrivileges };

    if (!privilegesToUpdate.disabled_modules) {
      privilegesToUpdate.disabled_modules = [];
    }

    if (privilegesToUpdate.disabled_modules.includes(moduleName)) {
      privilegesToUpdate.disabled_modules = privilegesToUpdate.disabled_modules.filter(m => m !== moduleName);
    } else {
      privilegesToUpdate.disabled_modules = [...privilegesToUpdate.disabled_modules, moduleName];
    }

    try {
      await axios.put(`http://localhost:8000/auth/admins/${adminId}/privileges`,
        { privileges: privilegesToUpdate },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAdmins(prev => prev.map(a =>
        a.id === adminId ? { ...a, privileges: privilegesToUpdate } : a
      ));

      if (selectedAdmin?.id === adminId) {
        setSelectedAdmin(prev => prev ? { ...prev, privileges: privilegesToUpdate } : null);
      }

      // Log activity
      const targetAdmin = admins.find(a => a.id === adminId);
      if (targetAdmin) {
        const actionStr = privilegesToUpdate.disabled_modules.includes(moduleName) ? 'Disable Module' : 'Enable Module';
        axios.post('http://localhost:8000/activities', {
          action: actionStr,
          details: { user: targetAdmin.email, module: moduleName }
        }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update module status');
    }
  };

  const saveModulePrivileges = async (adminId: string, currentPrivileges: Privileges | null, moduleName: string) => {
    const defaultPrivileges: Privileges = { can_manage_users: true, can_view_activities: true, disabled_modules: [] };
    const privilegesToUpdate = currentPrivileges ? JSON.parse(JSON.stringify(currentPrivileges)) : defaultPrivileges;

    if (!privilegesToUpdate.module_permissions) {
      privilegesToUpdate.module_permissions = {};
    }

    if (!privilegesToUpdate.module_permissions[moduleName]) {
      privilegesToUpdate.module_permissions[moduleName] = {};
    }

    const pendingForModule = pendingModulePermissions[moduleName] || {};
    privilegesToUpdate.module_permissions[moduleName] = {
      ...privilegesToUpdate.module_permissions[moduleName],
      ...pendingForModule
    };

    try {
      await axios.put(`http://localhost:8000/auth/admins/${adminId}/privileges`,
        { privileges: privilegesToUpdate },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAdmins(prev => prev.map(a =>
        a.id === adminId ? { ...a, privileges: privilegesToUpdate } : a
      ));

      if (selectedAdmin?.id === adminId) {
        setSelectedAdmin(prev => prev ? { ...prev, privileges: privilegesToUpdate } : null);
      }

      // Log activity
      const targetAdmin = admins.find(a => a.id === adminId);
      if (targetAdmin) {
        axios.post('http://localhost:8000/activities', {
          action: 'Update Module Privileges',
          details: { user: targetAdmin.email, module: moduleName }
        }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
      }

      alert('Privileges updated successfully');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update module privileges');
    }
  };

  const toggleAdminStatus = async (adminId: string, currentIsActive: boolean, isPending: boolean) => {
    try {
      if (isPending) {
        await axios.post(`http://localhost:8000/auth/verify/${adminId}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.put(`http://localhost:8000/auth/users/${adminId}/status`,
          { is_active: !currentIsActive },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      fetchAdmins();

      // Log activity
      const targetAdmin = admins.find(a => a.id === adminId);
      if (targetAdmin) {
        let actionStr = 'Verify Admin';
        if (!isPending) {
          actionStr = currentIsActive ? 'Deactivate Admin' : 'Activate Admin';
        }
        axios.post('http://localhost:8000/activities', {
          action: actionStr,
          details: { user: targetAdmin.email, department: targetAdmin.department }
        }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update admin status');
    }
  };

  const renderCheckbox = (moduleName: string, permKey: string, labelText: string) => {
    if (!selectedAdmin) return null;
    return (
      <label key={permKey} className="flex items-center space-x-3 cursor-pointer p-2 hover:bg-gray-50 rounded-md transition-colors">
        <input
          type="checkbox"
          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
          checked={
            pendingModulePermissions[moduleName]?.[permKey] !== undefined
              ? pendingModulePermissions[moduleName][permKey]
              : (selectedAdmin.privileges?.module_permissions?.[moduleName]?.[permKey] ?? true)
          }
          onChange={(e) => {
            setPendingModulePermissions(prev => ({
              ...prev,
              [moduleName]: {
                ...(prev[moduleName] || {}),
                [permKey]: e.target.checked
              }
            }));
          }}
        />
        <span className="text-sm font-medium text-gray-700">{labelText}</span>
      </label>
    );
  };

  if (currentUser?.role !== 'superadmin') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500">
        <ShieldAlert className="h-16 w-16 mb-4 text-red-500 opacity-50" />
        <h2 className="text-xl font-medium">Access Denied</h2>
        <p>This module is restricted to superadmin accounts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage zone administrators and their granular privileges.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* Admins Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Admin
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Privileges
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created At
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="inline-flex items-center text-green-700">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading admins...
                    </div>
                  </td>
                </tr>
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    No zone admins found.
                  </td>
                </tr>
              ) : (
                admins.map((admin) => {
                  const privileges = admin.privileges || { can_manage_users: true, can_view_activities: true };

                  return (
                    <tr key={admin.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <ShieldCheck className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{admin.email}</div>
                            <div className="text-sm text-gray-500 font-semibold">{admin.department}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-600">
                            {[
                              privileges.can_manage_users && 'Manage Users',
                              privileges.can_view_activities && 'View Activities'
                            ].filter(Boolean).join(', ') || 'None'}
                          </span>
                          <button
                            onClick={() => {
                              setSelectedAdmin(admin);
                              setShowPrivilegesModal(true);
                            }}
                            className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                            title="Configure Privileges"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${admin.is_active
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : !admin.is_verified
                            ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                          }`}>
                          {admin.is_active && <CheckCircle className="h-3 w-3 mr-1" />}
                          {!admin.is_verified && <Clock className="h-3 w-3 mr-1" />}
                          {(!admin.is_active && admin.is_verified) && <XCircle className="h-3 w-3 mr-1" />}
                          {admin.is_active ? 'Active' : (!admin.is_verified ? 'Pending' : 'Inactive')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(admin.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {admin.is_active ? (
                          <button
                            onClick={() => toggleAdminStatus(admin.id, admin.is_active, !admin.is_verified)}
                            className="inline-flex items-center text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md transition-colors"
                          >
                            <UserX className="h-4 w-4 mr-1.5" />
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleAdminStatus(admin.id, admin.is_active, !admin.is_verified)}
                            className="inline-flex items-center text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-md transition-colors"
                          >
                            <UserCheck className="h-4 w-4 mr-1.5" />
                            Activate
                          </button>
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

      {/* Privileges Modal */}
      {showPrivilegesModal && selectedAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Configure Privileges</h3>
              <button
                onClick={() => setShowPrivilegesModal(false)}
                className="text-gray-400 hover:text-gray-500 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              <div className="text-sm text-gray-500">
                Adjust privileges for <strong>{selectedAdmin.email}</strong>. Changes take effect instantly.
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Manage Users</h4>
                    <p className="text-xs text-gray-500 mt-1">Allow this admin to activate or deactivate users in their department.</p>
                  </div>
                  <button
                    onClick={() => togglePrivilege(selectedAdmin.id, selectedAdmin.privileges, 'can_manage_users')}
                    className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none ${(selectedAdmin.privileges?.can_manage_users ?? true) ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${(selectedAdmin.privileges?.can_manage_users ?? true) ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">View Activities</h4>
                    <p className="text-xs text-gray-500 mt-1">Allow this admin to view the activity log of their department's users.</p>
                  </div>
                  <button
                    onClick={() => togglePrivilege(selectedAdmin.id, selectedAdmin.privileges, 'can_view_activities')}
                    className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none ${(selectedAdmin.privileges?.can_view_activities ?? true) ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${(selectedAdmin.privileges?.can_view_activities ?? true) ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModule(ALL_MODULES[0]);
                    setShowModulePrivilegesModal(true);
                  }}
                  className="bg-purple-100 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-purple-700 hover:bg-purple-200 focus:outline-none transition-colors"
                >
                  Module Privileges
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrivilegesModal(false)}
                  className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Module Privileges Modal */}
      {showModulePrivilegesModal && selectedAdmin && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Module Privileges</h3>
                <p className="text-sm text-gray-500">Configure module access for {selectedAdmin.email}</p>
              </div>
              <button
                onClick={() => setShowModulePrivilegesModal(false)}
                className="text-gray-400 hover:text-gray-500 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar */}
              <div className="w-1/3 border-r border-gray-200 bg-white overflow-y-auto">
                <ul className="divide-y divide-gray-100">
                  {ALL_MODULES.map(mod => (
                    <li key={mod}>
                      <button
                        onClick={() => setSelectedModule(mod)}
                        className={`w-full text-left px-5 py-4 text-sm font-medium transition-colors flex items-center justify-between ${selectedModule === mod
                          ? 'bg-purple-50 text-purple-700 border-l-4 border-purple-500'
                          : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
                          }`}
                      >
                        {mod}
                        {selectedAdmin.privileges?.disabled_modules?.includes(mod) && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            Disabled
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Main Content */}
              <div className="w-2/3 bg-gray-50 p-8 overflow-y-auto">
                {selectedModule ? (
                  <div className="space-y-6 max-w-2xl mx-auto">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-5">
                      <div>
                        <h4 className="text-xl font-bold text-gray-900">{selectedModule}</h4>
                        <p className="text-sm text-gray-500 mt-1">Configure detailed functions and access for this module.</p>
                      </div>
                      <button
                        onClick={() => toggleModuleStatus(selectedAdmin.id, selectedAdmin.privileges, selectedModule)}
                        className={`px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors ${selectedAdmin.privileges?.disabled_modules?.includes(selectedModule)
                          ? 'bg-green-600 text-white hover:bg-green-700 border border-transparent'
                          : 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-200'
                          }`}
                      >
                        {selectedAdmin.privileges?.disabled_modules?.includes(selectedModule) ? 'Enable Module' : 'Disable Module'}
                      </button>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                      {selectedModule === 'Data Uploading' ? (
                        <div className="space-y-4">
                          <h5 className="text-sm font-bold text-gray-900 border-b pb-2">Permissions</h5>

                          {renderCheckbox('Data Uploading', 'can_upload_data', 'Upload Data')}
                          {renderCheckbox('Data Uploading', 'can_preview_data', 'Preview Data')}

                          <div className="pt-4 flex justify-end">
                            <button
                              onClick={() => saveModulePrivileges(selectedAdmin.id, selectedAdmin.privileges, 'Data Uploading')}
                              className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 shadow-sm transition-colors"
                            >
                              Update Privileges
                            </button>
                          </div>
                        </div>
                      ) : selectedModule === 'Data Selection' ? (
                        <div className="space-y-4">
                          <h5 className="text-sm font-bold text-gray-900 border-b pb-2">Permissions</h5>
                          
                          <div className="grid grid-cols-2 gap-2">
                            {renderCheckbox('Data Selection', 'modify_canvas', 'Allow Canvas Modification')}
                            {renderCheckbox('Data Selection', 'create_relationships', 'Create Relationships')}
                            {renderCheckbox('Data Selection', 'save_models', 'Save Models')}
                            {renderCheckbox('Data Selection', 'load_models', 'Load Models')}
                            {renderCheckbox('Data Selection', 'generate_tables', 'Generate Tables')}
                            {renderCheckbox('Data Selection', 'preview_data', 'Preview Data')}
                            {renderCheckbox('Data Selection', 'create_new_models', 'Create New Models')}
                          </div>

                          <div className="pt-4 flex justify-end">
                            <button
                              onClick={() => saveModulePrivileges(selectedAdmin.id, selectedAdmin.privileges, 'Data Selection')}
                              className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 shadow-sm transition-colors"
                            >
                              Update Privileges
                            </button>
                          </div>
                        </div>
                      ) : selectedModule === 'Observations' ? (
                        <div className="space-y-4">
                          <h5 className="text-sm font-bold text-gray-900 border-b pb-2">Permissions</h5>
                          
                          <div className="grid grid-cols-2 gap-2">
                            {renderCheckbox('Observations', 'add_visual', 'Add Visual')}
                            {renderCheckbox('Observations', 'export', 'Export')}
                            {renderCheckbox('Observations', 'save', 'Save')}
                            {renderCheckbox('Observations', 'load', 'Load')}
                            {renderCheckbox('Observations', 'new_dashboard', 'New Dashboard')}
                          </div>

                          <div className="pt-4 flex justify-end">
                            <button
                              onClick={() => saveModulePrivileges(selectedAdmin.id, selectedAdmin.privileges, 'Observations')}
                              className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 shadow-sm transition-colors"
                            >
                              Update Privileges
                            </button>
                          </div>
                        </div>
                      ) : selectedModule === 'Predictions' ? (
                        <div className="space-y-4">
                          <h5 className="text-sm font-bold text-gray-900 border-b pb-2">Permissions</h5>
                          
                          <div className="grid grid-cols-2 gap-2">
                            {renderCheckbox('Predictions', 'visual_bin', 'Visual Bin')}
                            {renderCheckbox('Predictions', 'export', 'Export')}
                            {renderCheckbox('Predictions', 'save', 'Save')}
                            {renderCheckbox('Predictions', 'load', 'Load')}
                            {renderCheckbox('Predictions', 'new_dashboard', 'New Dashboard')}
                          </div>

                          <div className="pt-4 flex justify-end">
                            <button
                              onClick={() => saveModulePrivileges(selectedAdmin.id, selectedAdmin.privileges, 'Predictions')}
                              className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 shadow-sm transition-colors"
                            >
                              Update Privileges
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-500 flex flex-col items-center justify-center min-h-[200px]">
                          <Settings className="h-12 w-12 text-gray-300 mb-4" />
                          <p className="text-base font-medium text-gray-900">No granular privileges available</p>
                          <p className="text-sm mt-2">This module currently relies on the global status (Enabled/Disabled).</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <p>Select a module from the left to view its privileges</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
