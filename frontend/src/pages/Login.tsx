import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const response = await axios.post('http://localhost:8000/auth/login', {
        email,
        password,
      });
      login(response.data.access_token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An error occurred during login.');
    }
  };

  return (
    <div className="min-h-screen flex font-sans">
      {/* Left Side: 70% Dark Green */}
      <div className="hidden lg:flex lg:w-[70%] bg-green-900 flex-col justify-center items-center text-white px-12 relative overflow-hidden">
        {/* Subtle background pattern or overlay could go here */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>

        <div className="relative z-10 text-center max-w-3xl">
          <ShieldAlert className="mx-auto h-24 w-24 text-yellow-500 mb-8" />
          <h1 className="text-5xl font-extrabold mb-6 tracking-tight">
            Ministry Of Nationl Food Security and Research
          </h1>
          <p className="text-xl text-green-100 max-w-2xl mx-auto leading-relaxed">
            Secure Departmental Access Portal. Monitor allocations, analyze expenditure, and utilize AI-driven budget forecasting to manage development portfolios effectively.
          </p>
        </div>
      </div>

      {/* Right Side: 30% White */}
      <div className="w-full lg:w-[30%] bg-white flex flex-col justify-center py-12 px-8 shadow-2xl z-10">
        <div className="sm:mx-auto sm:w-full sm:max-w-md mb-8">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Sign In
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Access your departmental dashboard
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
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Official Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
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
                  name="password"
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
                Sign In
              </button>
            </div>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-600">
              New to the system?{' '}
              <Link to="/register" className="font-medium text-green-700 hover:text-green-600">
                Register new account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
