import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Save, AlertCircle, Building2, MapPin, Settings, Lock, Key } from 'lucide-react';

interface MillProfile {
  id?: string;
  name: string;
  owner_name: string;
  location: string;
  installed_spindles: number;
  installed_rotors: number;
}

export default function Profile() {
  const { token, user } = useAuth();
  
  const canUpdatePassword = user?.role === 'superadmin' || user?.role === 'user' || (user?.role === 'admin' && (user?.privileges?.module_permissions?.['Profile']?.update_password ?? true));

  // Password reset state
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' });

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordMsg({ type: '', text: '' });
    try {
      await axios.put('http://localhost:8000/auth/me/password', passwordForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Log activity
      axios.post('http://localhost:8000/activities', {
        action: 'Update Password',
        details: {}
      }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));

      setPasswordMsg({ type: 'success', text: 'Password updated successfully.' });
      setPasswordForm({ old_password: '', new_password: '' });
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to update password.' });
    } finally {
      setSavingPassword(false);
    }
  };

  const [millProfile, setMillProfile] = useState<MillProfile>({
    name: '', owner_name: '', location: '', installed_spindles: 0, installed_rotors: 0
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await axios.get('http://localhost:8000/mills/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data) setMillProfile(res.data);
      } catch (err) {
        console.error('Error fetching profile:', err);
      }
    };
    fetchProfile();
  }, [token]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg({ type: '', text: '' });
    try {
      if (millProfile.id) {
        await axios.put('http://localhost:8000/mills/me', millProfile, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        const res = await axios.post('http://localhost:8000/mills/me', millProfile, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMillProfile(res.data);
      }
      
      // Log activity
      axios.post('http://localhost:8000/activities', {
        action: 'Update Profile',
        details: { mill_name: millProfile.name }
      }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));

      setProfileMsg({ type: 'success', text: 'Profile saved successfully.' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: 'Failed to save profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto pb-12">
      {user?.role === 'user' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-5 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center">
              <Building2 className="h-6 w-6 text-green-700 mr-2" />
              <h2 className="text-xl font-bold text-gray-900">Mill Profile Setup</h2>
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 disabled:opacity-50 transition-colors"
            >
              {savingProfile ? 'Saving...' : <><Save className="h-4 w-4 mr-2" /> Save Profile</>}
            </button>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            {profileMsg.text && (
              <div className={`p-4 rounded-md flex items-center ${profileMsg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                <AlertCircle className="h-5 w-5 mr-2" />
                {profileMsg.text}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mill Name</label>
                <div className="relative">
                  <Building2 className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400" />
                  <input type="text" required value={millProfile.name} onChange={e => setMillProfile({ ...millProfile, name: e.target.value })} className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner / Agent Name</label>
                <div className="relative">
                  <Building2 className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400" />
                  <input type="text" required value={millProfile.owner_name} onChange={e => setMillProfile({ ...millProfile, owner_name: e.target.value })} className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <div className="relative">
                  <MapPin className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400" />
                  <input type="text" value={millProfile.location} onChange={e => setMillProfile({ ...millProfile, location: e.target.value })} className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Installed Spindles</label>
                <div className="relative">
                  <Settings className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400" />
                  <input type="number" value={millProfile.installed_spindles || ''} onChange={e => setMillProfile({ ...millProfile, installed_spindles: parseInt(e.target.value) || 0 })} className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Installed Rotors</label>
                <div className="relative">
                  <Settings className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400" />
                  <input type="number" value={millProfile.installed_rotors || ''} onChange={e => setMillProfile({ ...millProfile, installed_rotors: parseInt(e.target.value) || 0 })} className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Change Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 px-6 py-5 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center">
            <Lock className="h-6 w-6 text-green-700 mr-2" />
            <h2 className="text-xl font-bold text-gray-900">Security Settings</h2>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="p-6 md:p-8 space-y-6">
          {passwordMsg.text && (
            <div className={`p-4 rounded-md flex items-center ${passwordMsg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <AlertCircle className="h-5 w-5 mr-2" />
              {passwordMsg.text}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <div className="relative">
                <Key className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400" />
                <input type="password" required value={passwordForm.old_password} onChange={e => setPasswordForm({ ...passwordForm, old_password: e.target.value })} className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <div className="relative">
                <Lock className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400" />
                <input type="password" required value={passwordForm.new_password} onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })} className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPassword || !canUpdatePassword}
              title={!canUpdatePassword ? "Permission denied" : ""}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-md shadow-sm transition-colors ${
                !canUpdatePassword 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-70' 
                  : 'text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 disabled:opacity-50'
              }`}
            >
              {savingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}
