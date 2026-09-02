import os

def process():
    # USERS.TSX
    with open('c:/Projects/mnfsr_internship_/BI_project/frontend/src/pages/Users.tsx', 'r', encoding='utf-8') as f:
        u = f.read()

    # 1. Remove User Reports Modal State
    to_remove_state = """  // User Reports Modal State
  const [targetUser, setTargetUser] = useState<UserData | null>(null);
  const [userReports, setUserReports] = useState<any[]>([]);
  const [userReportsModalOpen, setUserReportsModalOpen] = useState(false);
  const [viewingReportDetails, setViewingReportDetails] = useState<any | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);"""
    u = u.replace(to_remove_state, "")

    # 2. Remove functions
    to_remove_funcs = """  const handleViewUserReports = async (user: UserData) => {
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
  };"""
    u = u.replace(to_remove_funcs, "")

    # 3. Remove View Reports button
    to_remove_reports_btn = """                          {u.role === 'user' && (
                            <button
                              onClick={() => handleViewUserReports(u)}
                              className="inline-flex items-center text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors"
                              title="View Monthly Reports"
                            >
                              <FileText className="h-4 w-4 mr-1.5" />
                              Reports
                            </button>
                          )}"""
    u = u.replace(to_remove_reports_btn, "")

    # 4. Remove Modals (we can find the exact strings)
    # The string between {/* User Reports List Modal */} and the end of the file is what we want to replace.
    # Wait, the end of the file is:
    #       )}
    #     </div>
    #   );
    # }
    modal_start = u.find("      {/* User Reports List Modal */}")
    if modal_start != -1:
        # Keep everything up to modal_start, then just append the closing tags
        u = u[:modal_start] + "    </div>\n  );\n}\n"

    # Also we need to clean unused imports
    u = u.replace(", Eye, FileText, History, Download", "")

    with open('c:/Projects/mnfsr_internship_/BI_project/frontend/src/pages/Users.tsx', 'w', encoding='utf-8') as f:
        f.write(u)


    # DATAMANAGEMENT.TSX
    with open('c:/Projects/mnfsr_internship_/BI_project/frontend/src/pages/DataManagement.tsx', 'r', encoding='utf-8') as f:
        dm = f.read()

    dm = dm.replace("export default function Users()", "export default function DataManagement()")
    dm = dm.replace("User Management", "Data Management")
    dm = dm.replace("Manage system access for {currentUser?.role === 'superadmin' ? 'all users across the platform.' : `users in the ${currentUser?.department} department.`}", "View reports and manage data for {currentUser?.role === 'superadmin' ? 'all users across the platform.' : `users in the ${currentUser?.department} department.`}")
    
    # Remove Create Mill Owner button
    create_btn = """        {canManageUsers && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Mill Owner
          </button>
        )}"""
    dm = dm.replace(create_btn, "")

    # Remove Create User Modal State
    modal_state = """  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newMillName, setNewMillName] = useState('');
  const [creating, setCreating] = useState(false);"""
    dm = dm.replace(modal_state, "")

    # Remove toggleUserStatus
    toggle_status_func = """  const toggleUserStatus = async (userId: string, currentIsActive: boolean, isPending: boolean) => {
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
  };"""
    dm = dm.replace(toggle_status_func, "")

    # Remove handleCreateUser
    create_func = """  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword || !newOwnerName || !newMillName) return;

    try {
      setCreating(true);
      await axios.post('http://localhost:8000/auth/users', {
        email: newEmail,
        password: newPassword,
        role: 'user',
        owner_name: newOwnerName,
        mill_name: newMillName,
        department: currentUser?.role === 'admin' ? currentUser.department : null
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
  };"""
    dm = dm.replace(create_func, "")

    # Remove deactivate / activate buttons
    act_deact = """                          {!isSelf && (
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
                          )}"""
    dm = dm.replace(act_deact, "")

    # Remove Create User Modal
    create_modal_start = dm.find("      {/* Create User Modal */}")
    reports_modal_start = dm.find("      {/* User Reports List Modal */}")
    if create_modal_start != -1 and reports_modal_start != -1:
        dm = dm[:create_modal_start] + dm[reports_modal_start:]
        
    dm = dm.replace("Search, Shield, ShieldAlert, CheckCircle, XCircle, Clock, UserCheck, UserX, Plus, X", "Search, Shield, ShieldAlert, CheckCircle, XCircle, Clock, X")

    with open('c:/Projects/mnfsr_internship_/BI_project/frontend/src/pages/DataManagement.tsx', 'w', encoding='utf-8') as f:
        f.write(dm)

if __name__ == '__main__':
    process()
