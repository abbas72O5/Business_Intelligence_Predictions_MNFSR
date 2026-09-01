import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Save, AlertCircle, Building2, User, MapPin, Settings, CheckCircle2, History, FileText, ClipboardList, Database, DollarSign } from 'lucide-react';

interface MillProfile {
  id?: string;
  name: string;
  owner_name: string;
  location: string;
  installed_spindles: number;
  installed_rotors: number;
}

interface YarnDetail {
  count: string;
  quantity: number;
}

interface RawMaterial {
  opening: number;
  procurement: number;
  consumption: number;
  closing: number;
}

export default function Profile() {
  const { token } = useAuth();
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'profile' | 'formA' | 'genInfo' | 'rawMaterial' | 'cessStatus' | 'history'>('profile');
  const tabs = [
    { id: 'profile', name: 'Mill Profile', icon: Building2 },
    { id: 'formA', name: 'Form A (Cess Return)', icon: FileText },
    { id: 'genInfo', name: 'General Info', icon: ClipboardList },
    { id: 'rawMaterial', name: 'Raw Material', icon: Database },
    { id: 'cessStatus', name: 'Cess Status', icon: DollarSign },
    { id: 'history', name: 'History', icon: History },
  ];

  // ================= State: Profile =================
  const [millProfile, setMillProfile] = useState<MillProfile>({
    name: '', owner_name: '', location: '', installed_spindles: 0, installed_rotors: 0
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });

  // ================= State: Monthly Report =================
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportMsg, setReportMsg] = useState({ type: '', text: '' });
  
  // Base
  const [reportingMonth, setReportingMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Form A
  const [formA, setFormA] = useState({
    worked_spindles: 0, worked_rotors: 0,
    pressed_cotton_kg: 0, unpressed_cotton_kg: 0,
    cess_per_bale: 0, remitted_amount: 0,
    cheque_details: '', draft_details: '', money_order_details: '', cash_details: ''
  });

  // Derived Form A
  const pressedBales = formA.pressed_cotton_kg / 170;
  const unpressedBales = formA.unpressed_cotton_kg / 170;
  const totalKg = formA.pressed_cotton_kg + formA.unpressed_cotton_kg;
  const totalBales = pressedBales + unpressedBales;
  const totalCess = totalBales * formA.cess_per_bale;

  // General Info
  const [genInfo, setGenInfo] = useState({
    working_days: 0, shifts: 0
  });
  const [yarnCotton, setYarnCotton] = useState<YarnDetail[]>([]);
  const [yarnBlended, setYarnBlended] = useState<YarnDetail[]>([]);
  const [yarnSynthetic, setYarnSynthetic] = useState<YarnDetail[]>([]);

  // Raw Material
  const initialRaw = { opening: 0, procurement: 0, consumption: 0, closing: 0 };
  const [rmDomestic, setRmDomestic] = useState<RawMaterial>(initialRaw);
  const [rmImported, setRmImported] = useState<RawMaterial>(initialRaw);
  const [rmSynthetic, setRmSynthetic] = useState<RawMaterial>(initialRaw);
  
  const validateRM = (rm: RawMaterial) => {
    const expected = rm.opening + rm.procurement - rm.consumption;
    return Math.abs(rm.closing - expected) < 0.01;
  };

  // Cess Status
  const [cessStatus, setCessStatus] = useState({
    last_payment_amount: 0, last_payment_date: '',
    amount_due: 0, outstanding_cess: 0, cess_paid_this_month: 0
  });

  // ================= State: History =================
  const [reports, setReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // ================= Effects =================
  useEffect(() => {
    if (token) {
      fetchProfile();
      fetchReports();
    }
  }, [token]);

  const fetchProfile = async () => {
    try {
      const res = await axios.get('http://localhost:8000/mills/me', { headers: { Authorization: `Bearer ${token}` } });
      setMillProfile({
        name: res.data.name || '',
        owner_name: res.data.owner_name || '',
        location: res.data.location || '',
        installed_spindles: res.data.installed_spindles || 0,
        installed_rotors: res.data.installed_rotors || 0,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const fetchReports = async () => {
    try {
      setLoadingReports(true);
      const res = await axios.get('http://localhost:8000/mills/me/reports', { headers: { Authorization: `Bearer ${token}` } });
      setReports(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReports(false);
    }
  };

  // ================= Handlers =================
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      await axios.put('http://localhost:8000/mills/me', millProfile, { headers: { Authorization: `Bearer ${token}` } });
      setProfileMsg({ type: 'success', text: 'Profile updated successfully!' });
      
      axios.post('http://localhost:8000/activities', {
        action: 'Update Profile', details: { mill: millProfile.name }
      }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
      
      setTimeout(() => setProfileMsg({ type: '', text: '' }), 3000);
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to update profile' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSubmitReport = async () => {
    // Validate Raw Material
    if (!validateRM(rmDomestic)) {
      setReportMsg({ type: 'error', text: 'Domestic Raw Material closing balance does not match (Opening + Procurement - Consumption)' });
      setActiveTab('rawMaterial');
      return;
    }
    if (!validateRM(rmImported)) {
      setReportMsg({ type: 'error', text: 'Imported Raw Material closing balance does not match (Opening + Procurement - Consumption)' });
      setActiveTab('rawMaterial');
      return;
    }
    if (!validateRM(rmSynthetic)) {
      setReportMsg({ type: 'error', text: 'Synthetic Raw Material closing balance does not match (Opening + Procurement - Consumption)' });
      setActiveTab('rawMaterial');
      return;
    }

    const payload = {
      reporting_month: reportingMonth,
      worked_spindles: formA.worked_spindles,
      worked_rotors: formA.worked_rotors,
      pressed_cotton_kg: formA.pressed_cotton_kg,
      unpressed_cotton_kg: formA.unpressed_cotton_kg,
      cess_per_bale: formA.cess_per_bale,
      remitted_amount: formA.remitted_amount,
      payment_details: [
        { method: 'Cheque', details: formA.cheque_details },
        { method: 'Draft', details: formA.draft_details },
        { method: 'Money Order', details: formA.money_order_details },
        { method: 'Cash/Transfer', details: formA.cash_details },
      ].filter(p => p.details.trim() !== ''),
      working_days: genInfo.working_days,
      shifts: genInfo.shifts,
      yarn_cotton: yarnCotton,
      yarn_blended: yarnBlended,
      yarn_synthetic: yarnSynthetic,
      raw_material_domestic: rmDomestic,
      raw_material_imported: rmImported,
      raw_material_synthetic: rmSynthetic,
      last_payment_amount: cessStatus.last_payment_amount,
      last_payment_date: cessStatus.last_payment_date || null,
      amount_due: cessStatus.amount_due,
      outstanding_cess: cessStatus.outstanding_cess,
      cess_paid_this_month: cessStatus.cess_paid_this_month
    };

    try {
      setSubmittingReport(true);
      await axios.post('http://localhost:8000/mills/me/reports', payload, { headers: { Authorization: `Bearer ${token}` } });
      setReportMsg({ type: 'success', text: 'Monthly report submitted successfully!' });
      
      axios.post('http://localhost:8000/activities', {
        action: 'Submit Monthly Report', details: { month: reportingMonth }
      }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));

      fetchReports();
      setTimeout(() => {
        setReportMsg({ type: '', text: '' });
        setActiveTab('history');
      }, 2000);
    } catch (err: any) {
      setReportMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to submit report' });
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleYarnAdd = (setter: React.Dispatch<React.SetStateAction<YarnDetail[]>>, list: YarnDetail[]) => {
    if (list.length >= 4) return;
    setter([...list, { count: '', quantity: 0 }]);
  };
  const handleYarnChange = (setter: React.Dispatch<React.SetStateAction<YarnDetail[]>>, list: YarnDetail[], index: number, field: keyof YarnDetail, value: string | number) => {
    const updated = [...list];
    updated[index] = { ...updated[index], [field]: value };
    setter(updated);
  };
  const handleYarnRemove = (setter: React.Dispatch<React.SetStateAction<YarnDetail[]>>, list: YarnDetail[], index: number) => {
    const updated = [...list];
    updated.splice(index, 1);
    setter(updated);
  };

  // ================= Render Helpers =================
  const renderYarnList = (title: string, list: YarnDetail[], setter: React.Dispatch<React.SetStateAction<YarnDetail[]>>) => (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-medium text-gray-700">{title}</h4>
        <button onClick={() => handleYarnAdd(setter, list)} disabled={list.length >= 4} className="text-xs bg-white border border-gray-300 px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-50">
          + Add Row
        </button>
      </div>
      {list.length === 0 && <p className="text-xs text-gray-500 italic">No entries added.</p>}
      <div className="space-y-2">
        {list.map((item, idx) => (
          <div key={idx} className="flex gap-2">
            <input type="text" placeholder="Count" value={item.count} onChange={e => handleYarnChange(setter, list, idx, 'count', e.target.value)} className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded" />
            <input type="number" placeholder="Qty" value={item.quantity || ''} onChange={e => handleYarnChange(setter, list, idx, 'quantity', parseFloat(e.target.value) || 0)} className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded" />
            <button onClick={() => handleYarnRemove(setter, list, idx)} className="text-red-500 hover:text-red-700 px-2 text-sm font-bold">×</button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderRM = (title: string, rm: RawMaterial, setter: React.Dispatch<React.SetStateAction<RawMaterial>>) => {
    const expected = rm.opening + rm.procurement - rm.consumption;
    const isValid = Math.abs(rm.closing - expected) < 0.01;
    return (
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h4 className="text-sm font-medium text-gray-700 mb-3">{title}</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500">Opening Balance (kg)</label>
            <input type="number" value={rm.opening || ''} onChange={e => setter({...rm, opening: parseFloat(e.target.value) || 0})} className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Procurement (kg)</label>
            <input type="number" value={rm.procurement || ''} onChange={e => setter({...rm, procurement: parseFloat(e.target.value) || 0})} className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Consumption (kg)</label>
            <input type="number" value={rm.consumption || ''} onChange={e => setter({...rm, consumption: parseFloat(e.target.value) || 0})} className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Closing Balance (kg)</label>
            <input type="number" value={rm.closing || ''} onChange={e => setter({...rm, closing: parseFloat(e.target.value) || 0})} className={`mt-1 w-full px-3 py-1.5 text-sm border rounded focus:outline-none ${!isValid && rm.closing !== 0 ? 'border-red-500 bg-red-50' : 'border-gray-300'}`} />
            {!isValid && rm.closing !== 0 && <p className="text-red-500 text-[10px] mt-1">Must equal {expected}</p>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mill Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your profile and submit mandatory monthly returns.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Navigation Sidebar */}
        <div className="w-full lg:w-64 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <nav className="flex flex-col">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center px-4 py-4 text-sm font-medium transition-colors border-l-4 ${
                      isActive 
                        ? 'border-green-600 bg-green-50 text-green-700' 
                        : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className={`h-5 w-5 mr-3 ${isActive ? 'text-green-600' : 'text-gray-400'}`} />
                    {tab.name}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Submission Panel for Report Tabs */}
          {['formA', 'genInfo', 'rawMaterial', 'cessStatus'].includes(activeTab) && (
            <div className="mt-6 bg-white p-5 rounded-xl shadow-sm border border-gray-200 text-center">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Ready to submit?</h3>
              <p className="text-xs text-gray-500 mb-4">Ensure all 4 sections are completed before submitting.</p>
              
              {reportMsg.text && (
                <div className={`mb-4 p-2 rounded text-xs text-left ${reportMsg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                  {reportMsg.text}
                </div>
              )}
              
              <button
                onClick={handleSubmitReport}
                disabled={submittingReport}
                className="w-full inline-flex justify-center items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {submittingReport ? 'Submitting...' : 'Submit Monthly Report'}
              </button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 min-h-[500px]">
          
          {/* ================= TAB: PROFILE ================= */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Static Mill Profile</h2>
                  <p className="text-sm text-gray-500">This information persists across your monthly reports.</p>
                </div>
                <button type="submit" disabled={savingProfile} className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  <Save className="h-4 w-4 mr-2" />
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>

              {profileMsg.text && (
                <div className={`mb-6 p-4 rounded-md text-sm border ${profileMsg.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {profileMsg.text}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name of Mill</label>
                  <div className="relative">
                    <Building2 className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400" />
                    <input type="text" required value={millProfile.name} onChange={e => setMillProfile({...millProfile, name: e.target.value})} className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name of Owner or Agent</label>
                  <div className="relative">
                    <User className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400" />
                    <input type="text" required value={millProfile.owner_name} onChange={e => setMillProfile({...millProfile, owner_name: e.target.value})} className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <div className="relative">
                    <MapPin className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400" />
                    <input type="text" value={millProfile.location} onChange={e => setMillProfile({...millProfile, location: e.target.value})} className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Installed Spindles</label>
                  <div className="relative">
                    <Settings className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400" />
                    <input type="number" value={millProfile.installed_spindles || ''} onChange={e => setMillProfile({...millProfile, installed_spindles: parseInt(e.target.value)||0})} className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Installed Rotors</label>
                  <div className="relative">
                    <Settings className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400" />
                    <input type="number" value={millProfile.installed_rotors || ''} onChange={e => setMillProfile({...millProfile, installed_rotors: parseInt(e.target.value)||0})} className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* ================= REPORT SHARED HEADER ================= */}
          {['formA', 'genInfo', 'rawMaterial', 'cessStatus'].includes(activeTab) && (
            <div className="border-b border-gray-200 px-6 md:px-8 py-5 bg-gray-50 flex items-center justify-between rounded-t-xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Monthly Submission</h2>
                <p className="text-sm text-gray-500">Editing draft. Submit when all sections are complete.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Return Month/Year</label>
                <input type="month" value={reportingMonth} onChange={e => setReportingMonth(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium shadow-sm focus:ring-green-500 focus:border-green-500" />
              </div>
            </div>
          )}

          {/* ================= TAB: FORM A ================= */}
          {activeTab === 'formA' && (
            <div className="p-6 md:p-8 space-y-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Capacity Worked</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Average Number of Ring Spindles</label>
                      <input type="number" value={formA.worked_spindles || ''} onChange={e => setFormA({...formA, worked_spindles: parseInt(e.target.value)||0})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Average Number of Rotors</label>
                      <input type="number" value={formA.worked_rotors || ''} onChange={e => setFormA({...formA, worked_rotors: parseInt(e.target.value)||0})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Cotton Consumed</h3>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Pressed (kg)</label>
                        <input type="number" value={formA.pressed_cotton_kg || ''} onChange={e => setFormA({...formA, pressed_cotton_kg: parseFloat(e.target.value)||0})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Bales (170kg)</label>
                        <input type="text" readOnly value={pressedBales.toFixed(2)} className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-sm text-gray-500" />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Un-pressed (kg)</label>
                        <input type="number" value={formA.unpressed_cotton_kg || ''} onChange={e => setFormA({...formA, unpressed_cotton_kg: parseFloat(e.target.value)||0})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Bales (170kg)</label>
                        <input type="text" readOnly value={unpressedBales.toFixed(2)} className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-sm text-gray-500" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 p-6 rounded-xl border border-green-200">
                <h3 className="text-sm font-bold text-green-900 border-b border-green-200 pb-2 mb-4">Cess Calculation</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-medium text-green-800 mb-1">Total Weight (kg)</label>
                    <div className="text-lg font-bold text-green-900">{totalKg.toFixed(2)}</div>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-medium text-green-800 mb-1">Total Bales</label>
                    <div className="text-lg font-bold text-green-900">{totalBales.toFixed(2)}</div>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-medium text-green-800 mb-1">Cess Rs. / Bale</label>
                    <input type="number" value={formA.cess_per_bale || ''} onChange={e => setFormA({...formA, cess_per_bale: parseFloat(e.target.value)||0})} className="w-full px-3 py-1.5 border border-green-300 rounded shadow-sm text-sm" />
                  </div>
                  <div className="col-span-2 md:col-span-2 text-right bg-white p-3 rounded-lg shadow-sm border border-green-100">
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Total Cess Amount</label>
                    <div className="text-2xl font-black text-green-600">Rs. {totalCess.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Payment Remittance</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Amount Remitted Herewith (Rs.)</label>
                    <input type="number" value={formA.remitted_amount || ''} onChange={e => setFormA({...formA, remitted_amount: parseFloat(e.target.value)||0})} className="w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cheque Details</label>
                    <input type="text" placeholder="Cheque No, Date, Bank" value={formA.cheque_details} onChange={e => setFormA({...formA, cheque_details: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Draft Details</label>
                    <input type="text" placeholder="Draft No, Date, Bank" value={formA.draft_details} onChange={e => setFormA({...formA, draft_details: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Money Order Details</label>
                    <input type="text" placeholder="MO No, Date" value={formA.money_order_details} onChange={e => setFormA({...formA, money_order_details: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cash/Transfer Details</label>
                    <input type="text" placeholder="Receipt No, Date" value={formA.cash_details} onChange={e => setFormA({...formA, cash_details: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB: GEN INFO ================= */}
          {activeTab === 'genInfo' && (
            <div className="p-6 md:p-8 space-y-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Working Days</label>
                  <input type="number" value={genInfo.working_days || ''} onChange={e => setGenInfo({...genInfo, working_days: parseInt(e.target.value)||0})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">No. of Shifts</label>
                  <input type="number" value={genInfo.shifts || ''} onChange={e => setGenInfo({...genInfo, shifts: parseFloat(e.target.value)||0})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Count Wise Yarn (Max 4 per category)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {renderYarnList("Cotton Yarn", yarnCotton, setYarnCotton)}
                  {renderYarnList("Blended Yarn", yarnBlended, setYarnBlended)}
                  {renderYarnList("Synthetic Yarn", yarnSynthetic, setYarnSynthetic)}
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB: RAW MATERIAL ================= */}
          {activeTab === 'rawMaterial' && (
            <div className="p-6 md:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg text-sm border border-yellow-200 flex items-start">
                <AlertCircle className="h-5 w-5 mr-3 shrink-0" />
                <p><strong>Validation Rule:</strong> Closing Balance MUST equal (Opening Balance + Procurement - Consumption). The system will block submission if these do not match.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {renderRM("Domestic Cotton", rmDomestic, setRmDomestic)}
                {renderRM("Imported Cotton", rmImported, setRmImported)}
                {renderRM("Synthetic Fibres", rmSynthetic, setRmSynthetic)}
              </div>
            </div>
          )}

          {/* ================= TAB: CESS STATUS ================= */}
          {activeTab === 'cessStatus' && (
            <div className="p-6 md:p-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="max-w-2xl bg-gray-50 p-6 rounded-xl border border-gray-200 space-y-6">
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2">Status of Cotton Cess</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Last payment made (in Rs.)</label>
                    <input type="number" value={cessStatus.last_payment_amount || ''} onChange={e => setCessStatus({...cessStatus, last_payment_amount: parseFloat(e.target.value)||0})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Last payment Date</label>
                    <input type="date" value={cessStatus.last_payment_date} onChange={e => setCessStatus({...cessStatus, last_payment_date: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Amount Due (Rs.)</label>
                    <input type="number" value={cessStatus.amount_due || ''} onChange={e => setCessStatus({...cessStatus, amount_due: parseFloat(e.target.value)||0})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Outstanding Cess (if any) Rs.</label>
                    <input type="number" value={cessStatus.outstanding_cess || ''} onChange={e => setCessStatus({...cessStatus, outstanding_cess: parseFloat(e.target.value)||0})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cess paid in reporting month Rs.</label>
                    <input type="number" value={cessStatus.cess_paid_this_month || ''} onChange={e => setCessStatus({...cessStatus, cess_paid_this_month: parseFloat(e.target.value)||0})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB: HISTORY ================= */}
          {activeTab === 'history' && (
            <div className="p-6 md:p-8 animate-in fade-in zoom-in-95 duration-300">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Submission History</h2>
              
              {loadingReports ? (
                <div className="text-center py-12 text-gray-500">Loading reports...</div>
              ) : reports.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <History className="h-8 w-8 mx-auto text-gray-400 mb-3" />
                  <p>No monthly reports have been submitted yet.</p>
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
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {reports.map((r, idx) => {
                        const tBales = (r.pressed_cotton_kg/170) + (r.unpressed_cotton_kg/170);
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{r.reporting_month}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{tBales.toFixed(2)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">Rs. {r.remitted_amount.toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Filed
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
