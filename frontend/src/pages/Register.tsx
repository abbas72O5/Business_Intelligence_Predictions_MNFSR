import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck } from 'lucide-react';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [departmentsList, setDepartmentsList] = useState<{name: string, is_active: boolean}[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const response = await axios.get('http://localhost:8000/departments');
        const activeDepts = response.data.filter((d: any) => d.is_active);
        setDepartmentsList(activeDepts);
        if (activeDepts.length > 0) {
          setDepartment(activeDepts[0].name);
        }
      } catch (err) {
        console.error('Failed to fetch departments', err);
      }
    };
    fetchDepartments();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post('http://localhost:8000/auth/register', {
        email,
        password,
        department
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed.');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <ShieldCheck className="mx-auto h-16 w-16 text-green-600 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Registration Successful</h2>
          <p className="text-gray-600">
            Your account has been created. It is currently pending verification from your department admin.
          </p>
          <p className="text-sm text-gray-500 mt-4">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex font-sans">
      {/* Left Side: 70% Dark Green */}
      <div className="hidden lg:flex lg:w-[70%] bg-green-900 flex-col justify-center items-center text-white px-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>

        <div className="relative z-10 flex flex-col items-center max-w-5xl -mt-20 px-8">
          <div className="flex flex-row items-center justify-center gap-8 mb-12">
            <img src="/main_logo.png" alt="Ministry of National Food Security and Research" className="h-auto drop-shadow-2xl flex-shrink-0" style={{ maxHeight: '30vh' }} />
            <h1 className="text-4xl lg:text-4xl font-bold tracking-tight text-white drop-shadow-lg text-left leading-tight max-w-lg">
              Ministry Of National Food Security And Research
            </h1>
          </div>

          <div className="text-center w-full">
            <h2 className="text-4xl lg:text-4xl font-bold text-green-20 max-w-5xl mx-auto">
              Business Intelligence & Predictions System
            </h2>
          </div>
        </div>
      </div>

      {/* Right Side: 30% White */}
      <div className="w-full lg:w-[30%] bg-white flex flex-col justify-center py-12 px-8 shadow-2xl z-10">
        <div className="sm:mx-auto sm:w-full sm:max-w-md mb-8">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Register
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Join the Ministry BI Portal
          </p>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm text-center">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="department" className="block text-sm font-medium text-gray-700">
                Department
              </label>
              <select
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-green-700 focus:border-green-700 sm:text-sm rounded-md border bg-white"
                required
              >
                {departmentsList.map(dept => (
                  <option key={dept.name} value={dept.name}>{dept.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Official Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-green-700 focus:border-green-700 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-green-700 focus:border-green-700 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-800 hover:bg-green-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-700 transition-colors mt-2"
              >
                Register
              </button>
            </div>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-green-700 hover:text-green-600">
                Sign in instead
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
