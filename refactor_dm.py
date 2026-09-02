import re

def refactor():
    with open('c:/Projects/mnfsr_internship_/BI_project/frontend/src/pages/Users.tsx', 'r', encoding='utf-8') as f:
        users_code = f.read()

    # In Users.tsx, remove the Reports logic
    users_code = re.sub(r'  // Reports Modal State.*?  };\n', '', users_code, flags=re.DOTALL)
    users_code = re.sub(r'  const handleExportUserReports = async \(\) => \{.*?\n  };\n', '', users_code, flags=re.DOTALL)
    users_code = re.sub(r'                              <button\s+onClick=\{.*?\n.*?</button>\n', '', users_code, flags=re.DOTALL)
    users_code = re.sub(r'      \{/\* ================= USER REPORTS MODAL ================= \*/\}.*?      \}\n', '', users_code, flags=re.DOTALL)

    with open('c:/Projects/mnfsr_internship_/BI_project/frontend/src/pages/Users.tsx', 'w', encoding='utf-8') as f:
        f.write(users_code)


    with open('c:/Projects/mnfsr_internship_/BI_project/frontend/src/pages/DataManagement.tsx', 'r', encoding='utf-8') as f:
        dm_code = f.read()

    dm_code = dm_code.replace('export default function Users()', 'export default function DataManagement()')
    dm_code = dm_code.replace('<h1 className="text-2xl font-bold text-gray-900">User Management</h1>', '<h1 className="text-2xl font-bold text-gray-900">Data Management</h1>')
    dm_code = dm_code.replace('Manage system access for', 'View reports and manage data for')
    
    # Remove Create Mill Owner modal logic
    dm_code = re.sub(r'  const handleCreateUser = async \(e: React.FormEvent\) => \{.*?\n  };\n', '', dm_code, flags=re.DOTALL)
    dm_code = re.sub(r'        \{canManageUsers && \(\s+<button\s+onClick=\{.*?\n.*?</button>\s+\)\}\n', '', dm_code, flags=re.DOTALL)
    dm_code = re.sub(r'      \{/\* ================= CREATE USER MODAL ================= \*/\}.*?      \}\n', '', dm_code, flags=re.DOTALL)
    
    # Remove activate/deactivate logic
    dm_code = re.sub(r'  const toggleUserStatus = async \(userId: string, currentIsActive: boolean, isPending: boolean\) => \{.*?\n  };\n', '', dm_code, flags=re.DOTALL)
    
    # Remove the activate/deactivate buttons
    dm_code = re.sub(r'                              \{canManageUsers && \(.*?</button>\n                              \)\}\n', '', dm_code, flags=re.DOTALL)
    
    with open('c:/Projects/mnfsr_internship_/BI_project/frontend/src/pages/DataManagement.tsx', 'w', encoding='utf-8') as f:
        f.write(dm_code)

if __name__ == '__main__':
    refactor()
