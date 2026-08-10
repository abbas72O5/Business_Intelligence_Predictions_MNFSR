import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Home, UploadCloud, Database, LineChart, Brain, Menu } from 'lucide-react';

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { name: 'Overview', path: '/dashboard', icon: Home },
    { name: 'Data Uploading', path: '/dashboard/upload', icon: UploadCloud },
    { name: 'Data Selection', path: '/dashboard/selection', icon: Database },
    { name: 'Observations', path: '/dashboard/observations', icon: LineChart },
    { name: 'Predictions', path: '/dashboard/predictions', icon: Brain },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 w-64 bg-green-900 text-white transform transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center justify-center border-b border-green-800">
          <span className="font-extrabold text-xl tracking-tight text-white">
            Ministry <span className="text-yellow-500">BI</span>
          </span>
        </div>
        <nav className="p-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center px-4 py-3 rounded-md transition-colors ${
                  isActive 
                    ? 'bg-green-800 text-white border-l-4 border-yellow-500 shadow-sm' 
                    : 'text-green-100 hover:bg-green-800 hover:text-white'
                }`}
              >
                <Icon className={`h-5 w-5 mr-3 ${isActive ? 'text-yellow-500' : 'text-green-300'}`} />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 border-b border-gray-200">
          <button 
            className="lg:hidden text-gray-500 hover:text-green-800 transition-colors p-1"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          
          <div className="flex-1 lg:flex-none flex items-center ml-4 lg:ml-0">
             <span className="px-3 py-1 rounded-full text-xs bg-green-50 text-green-800 uppercase tracking-wider font-bold border border-green-200">
              {user?.role} {user?.department ? `| ${user.department}` : ''}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-gray-600 text-sm hidden sm:block font-medium">{user?.email}</span>
            <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>
            <button 
              onClick={logout}
              className="flex items-center text-sm font-medium text-red-600 hover:text-red-800 transition-colors bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              Sign Out
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
