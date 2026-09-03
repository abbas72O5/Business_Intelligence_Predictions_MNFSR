import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Search, Shield, ShieldAlert, CheckCircle, XCircle, Clock, X, Eye, FileText, History, Download, Database, Table, CheckCircle2, AlertCircle } from 'lucide-react';

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

export default function DataManagement() {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [error, setError] = useState<string | null>(null);



  // User Reports Modal State
  const [targetUser, setTargetUser] = useState<UserData | null>(null);
  const [userReports, setUserReports] = useState<any[]>([]);
  const [userReportsModalOpen, setUserReportsModalOpen] = useState(false);
  const [viewingReportDetails, setViewingReportDetails] = useState<any | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);
  const [importingReport, setImportingReport] = useState<string | null>(null);

  // Selection State for Reports Compilation
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [compilingReports, setCompilingReports] = useState(false);

  // User Datasets Modal State
  const [userDatasets, setUserDatasets] = useState<any[]>([]);
  const [userDatasetsModalOpen, setUserDatasetsModalOpen] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [importingDataset, setImportingDataset] = useState<string | null>(null);

  // Dataset Preview Modal State
  const [viewingDatasetPreview, setViewingDatasetPreview] = useState<any[] | null>(null);
  const [previewDatasetName, setPreviewDatasetName] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Status Message State
  const [importMessage, setImportMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

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



  const handleViewUserReports = async (user: UserData) => {
    setTargetUser(user);
    setUserReportsModalOpen(true);
    try {
      setLoadingReports(true);
      const response = await axios.get(`http://localhost:8000/mills/user/${user.id}/reports`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUserReports(response.data);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to fetch user reports');
    } finally {
      setLoadingReports(false);
    }
  };

  const handleViewUserDatasets = async (user: UserData) => {
    setTargetUser(user);
    setUserDatasetsModalOpen(true);
    try {
      setLoadingDatasets(true);
      const response = await axios.get(`http://localhost:8000/files/user/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUserDatasets(response.data);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to fetch user datasets');
    } finally {
      setLoadingDatasets(false);
    }
  };

  const handleImportDataset = async (tableId: string) => {
    try {
      setImportMessage(null);
      setImportingDataset(tableId);
      await axios.post(`http://localhost:8000/files/${tableId}/import`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImportMessage({ type: 'success', text: 'Dataset imported successfully! You can view it in the Data Uploading module.' });
      setTimeout(() => setImportMessage(null), 5000);
    } catch (err: any) {
      setImportMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to import dataset' });
    } finally {
      setImportingDataset(null);
    }
  };

  const handleImportAllReports = async () => {
    if (!targetUser) return;
    try {
      setImportMessage(null);
      setImportingReport(targetUser.id);
      await axios.post(`http://localhost:8000/mills/user/${targetUser.id}/reports/import`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImportMessage({ type: 'success', text: 'All reports imported successfully! You can view them in the Data Uploading module.' });
      setTimeout(() => setImportMessage(null), 5000);
    } catch (err: any) {
      setImportMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to import reports' });
    } finally {
      setImportingReport(null);
    }
  };

  const handleCompileReports = async () => {
    if (selectedUserIds.length === 0) return;
    try {
      setCompilingReports(true);
      setImportMessage(null);
      await axios.post('http://localhost:8000/mills/reports/compile', 
        { user_ids: selectedUserIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setImportMessage({ type: 'success', text: 'Selected reports successfully compiled! Check the Data Uploading module.' });
      setIsSelectionMode(false);
      setSelectedUserIds([]);
      setTimeout(() => setImportMessage(null), 5000);
    } catch (err: any) {
      setImportMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to compile reports' });
    } finally {
      setCompilingReports(false);
    }
  };

  const handleViewPreview = async (dataset: any) => {
    try {
      setPreviewLoading(true);
      setPreviewDatasetName(dataset.filename);
      setViewingDatasetPreview([]);
      const response = await axios.get(`http://localhost:8000/files/${dataset.table_id}/preview?limit=5`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setViewingDatasetPreview(response.data);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to fetch dataset preview');
      setViewingDatasetPreview(null);
      setPreviewDatasetName(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExportUserReports = async () => {
    if (!targetUser) return;
    try {
      const response = await axios.get(`http://localhost:8000/mills/user/${targetUser.id}/reports/export`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Monthly_Returns_${targetUser.email}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      alert('Failed to export reports');
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
          <h1 className="text-2xl font-bold text-gray-900">Data Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            View reports and manage data for {currentUser?.role === 'superadmin' ? 'all users across the platform.' : `users in the ${currentUser?.department} department.`}
          </p>
        </div>
        
        {!isSelectionMode ? (
          <button
            onClick={() => setIsSelectionMode(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 transition-colors"
          >
            <Database className="h-4 w-4 mr-2" />
            Compile Reports
          </button>
        ) : (
          <div className="flex items-center space-x-3 bg-green-50 p-2 rounded-lg border border-green-200">
            <span className="text-sm font-medium text-green-800 px-2">{selectedUserIds.length} Selected</span>
            <button
              onClick={() => {
                setIsSelectionMode(false);
                setSelectedUserIds([]);
              }}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCompileReports}
              disabled={selectedUserIds.length === 0 || compilingReports}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              {compilingReports ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Compiling...
                </>
              ) : 'Confirm & Compile'}
            </button>
          </div>
        )}
      </div>

      {importMessage && (
        <div className={`p-4 rounded-md text-sm border ${
          importMessage.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {importMessage.text}
        </div>
      )}

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
                {isSelectionMode && (
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                    <input 
                      type="checkbox"
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500 h-4 w-4"
                      checked={filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUserIds(filteredUsers.map(u => u.id));
                        } else {
                          setSelectedUserIds([]);
                        }
                      }}
                    />
                  </th>
                )}
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
                      {isSelectionMode && (
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <input 
                            type="checkbox"
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500 h-4 w-4"
                            checked={selectedUserIds.includes(u.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUserIds([...selectedUserIds, u.id]);
                              } else {
                                setSelectedUserIds(selectedUserIds.filter(id => id !== u.id));
                              }
                            }}
                          />
                        </td>
                      )}
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
                        <div className="flex justify-end items-center space-x-2">
                          {u.role === 'user' && (
                            <button
                              onClick={() => handleViewUserReports(u)}
                              className="inline-flex items-center text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors"
                              title="View Monthly Reports"
                            >
                              <FileText className="h-4 w-4 mr-1.5" />
                              Reports
                            </button>
                          )}
                          {(u.role === 'user' || u.role === 'admin') && (
                            <button
                              onClick={() => handleViewUserDatasets(u)}
                              className="inline-flex items-center text-purple-600 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-md transition-colors"
                              title="View Uploaded Data"
                            >
                              <Database className="h-4 w-4 mr-1.5" />
                              Data Uploaded
                            </button>
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

      {/* User Reports List Modal */}
      {userReportsModalOpen && targetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Reports for {targetUser.email}</h3>
              <div className="flex items-center space-x-3">
                {userReports.length > 0 && (
                  <>
                    <button 
                      onClick={handleImportAllReports} 
                      disabled={importingReport === targetUser.id}
                      className="inline-flex items-center text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 px-3 py-1.5 rounded-md transition-colors shadow-sm disabled:opacity-50"
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      {importingReport === targetUser.id ? 'Importing...' : 'Import to Data Uploading'}
                    </button>
                    <button onClick={handleExportUserReports} className="inline-flex items-center text-sm font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-md transition-colors shadow-sm">
                      <Download className="h-4 w-4 mr-1.5" />
                      Export
                    </button>
                  </>
                )}
                <button 
                  onClick={() => { setUserReportsModalOpen(false); setImportMessage(null); }}
                  className="text-gray-400 hover:text-gray-500 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            {importMessage && (
              <div className={`px-6 py-3 border-b text-sm flex items-center ${importMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                {importMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 mr-2" /> : <AlertCircle className="h-4 w-4 mr-2" />}
                {importMessage.text}
              </div>
            )}
            
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {loadingReports ? (
                <div className="text-center py-8 text-gray-500">Loading reports...</div>
              ) : userReports.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <History className="h-8 w-8 mx-auto text-gray-400 mb-3" />
                  <p>No monthly reports have been submitted by this user yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Month</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Submission Date</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Total Bales</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Cess Paid</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {userReports.map((r, idx) => {
                        const tBales = (r.pressed_cotton_kg/170) + (r.unpressed_cotton_kg/170);
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{r.reporting_month}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{tBales.toFixed(2)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">Rs. {r.remitted_amount.toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button onClick={() => setViewingReportDetails(r)} className="text-blue-600 hover:text-blue-900 inline-flex items-center">
                                <Eye className="h-4 w-4 mr-1" /> View Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User Datasets List Modal */}
      {userDatasetsModalOpen && targetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Datasets uploaded by {targetUser.email}</h3>
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => { setUserDatasetsModalOpen(false); setImportMessage(null); }}
                  className="text-gray-400 hover:text-gray-500 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            {importMessage && (
              <div className={`px-6 py-3 border-b text-sm flex items-center ${importMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                {importMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 mr-2" /> : <AlertCircle className="h-4 w-4 mr-2" />}
                {importMessage.text}
              </div>
            )}

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {loadingDatasets ? (
                <div className="text-center py-8 text-gray-500">Loading datasets...</div>
              ) : userDatasets.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <Database className="h-8 w-8 mx-auto text-gray-400 mb-3" />
                  <p>No datasets have been uploaded by this user yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Dataset Name</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Upload Date</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Preview</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {userDatasets.map((d, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{d.filename}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(d.uploaded_at).toLocaleDateString()}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <button 
                              onClick={() => handleViewPreview(d)} 
                              className="text-blue-600 hover:text-blue-900 inline-flex items-center bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors"
                            >
                              <Table className="h-4 w-4 mr-1.5" /> Preview
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button 
                              onClick={() => handleImportDataset(d.table_id)} 
                              disabled={importingDataset === d.table_id}
                              className="text-green-600 hover:text-green-900 inline-flex items-center disabled:opacity-50 px-3 py-1.5 border border-green-200 bg-green-50 rounded-md"
                            >
                              <Download className="h-4 w-4 mr-1" /> {importingDataset === d.table_id ? 'Importing...' : 'Import'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= VIEW REPORT DETAILS MODAL ================= */}
      {viewingReportDetails && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
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
                  <div><span className="text-green-800 block text-xs">Total Bales</span><span className="font-bold">{((viewingReportDetails.pressed_cotton_kg + viewingReportDetails.unpressed_cotton_kg)/170).toFixed(2)}</span></div>
                  <div><span className="text-green-800 block text-xs">Cess / Bale</span><span className="font-bold">Rs. {viewingReportDetails.cess_per_bale}</span></div>
                  <div className="col-span-2 text-right"><span className="text-green-800 block text-xs">Remitted Amount</span><span className="font-black text-lg text-green-700">Rs. {viewingReportDetails.remitted_amount.toLocaleString()}</span></div>
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
                            <span className="text-gray-500">Count:</span> <span className="font-medium">{y.count}</span> <br/>
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
      {/* Dataset Preview Modal */}
      {viewingDatasetPreview !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Dataset Preview: {previewDatasetName}</h3>
              <button 
                onClick={() => { setViewingDatasetPreview(null); setPreviewDatasetName(null); }}
                className="text-gray-400 hover:text-gray-500 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-auto bg-gray-50 flex-1">
              {previewLoading ? (
                <div className="text-center py-12 text-gray-500 flex flex-col items-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mb-4"></div>
                  Loading preview data...
                </div>
              ) : viewingDatasetPreview.length === 0 ? (
                <div className="text-center py-12 text-gray-500">No data available for preview.</div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm inline-block min-w-full">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                      <tr>
                        {Object.keys(viewingDatasetPreview[0]).map((key) => (
                          <th 
                            key={key} 
                            className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider sticky top-0 bg-gray-100"
                          >
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {viewingDatasetPreview.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          {Object.values(row).map((val: any, j) => (
                            <td 
                              key={j} 
                              className="px-4 py-2 whitespace-nowrap text-sm text-gray-700 max-w-[200px] truncate"
                              title={String(val)}
                            >
                              {String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
