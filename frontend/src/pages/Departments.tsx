import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Building2, Plus, CheckCircle, XCircle, ShieldAlert, X } from 'lucide-react';

interface DepartmentData {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export default function Departments() {
  const { token, user: currentUser } = useAuth();
  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:8000/departments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDepartments(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && currentUser?.role === 'superadmin') {
      fetchDepartments();
    }
  }, [token, currentUser]);

  const toggleDepartmentStatus = async (departmentId: string, currentIsActive: boolean, departmentName: string) => {
    if (!window.confirm(`Are you sure you want to ${currentIsActive ? 'deactivate' : 'activate'} the ${departmentName} department? This will automatically ${currentIsActive ? 'deactivate' : 'activate'} all users and admins within this department.`)) {
      return;
    }

    try {
      await axios.put(`http://localhost:8000/departments/${departmentId}/status`, 
        { is_active: !currentIsActive },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchDepartments();
      
      // Log activity
      axios.post('http://localhost:8000/activities', {
        action: currentIsActive ? 'Deactivate Department' : 'Activate Department',
        details: { department: departmentName }
      }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update department status');
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:8000/departments', {
        name: newDepartmentName
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setShowModal(false);
      setNewDepartmentName('');
      fetchDepartments();
      
      // Log activity
      axios.post('http://localhost:8000/activities', {
        action: 'Create Department',
        details: { department: newDepartmentName }
      }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create department');
    }
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
          <h1 className="text-2xl font-bold text-gray-900">Department Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            View, create, and manage departments across the system.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Department
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* Departments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department Name
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
                      Loading departments...
                    </div>
                  </td>
                </tr>
              ) : departments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    No departments found.
                  </td>
                </tr>
              ) : (
                departments.map((dept) => (
                  <tr key={dept.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-green-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{dept.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        dept.is_active 
                          ? 'bg-green-50 text-green-700 border-green-200' 
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {dept.is_active ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {dept.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(dept.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {dept.is_active ? (
                        <button
                          onClick={() => toggleDepartmentStatus(dept.id, dept.is_active, dept.name)}
                          className="inline-flex items-center text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md transition-colors"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleDepartmentStatus(dept.id, dept.is_active, dept.name)}
                          className="inline-flex items-center text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-md transition-colors"
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Department Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Create New Department</h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-500 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateDepartment} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Department Name</label>
                <input
                  type="text"
                  required
                  value={newDepartmentName}
                  onChange={(e) => setNewDepartmentName(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                  placeholder="e.g. Finance, Agriculture, HR"
                />
                <p className="mt-1 text-xs text-gray-500">This department will be available for users to select during registration.</p>
              </div>

              <div className="pt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newDepartmentName.trim()}
                  className="bg-green-600 border border-transparent rounded-md shadow-sm py-2 px-4 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
