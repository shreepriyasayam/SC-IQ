import React, { useState } from 'react';
import { KeyRound, ShieldCheck, X } from 'lucide-react';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export function AuthDialog({
  open,
  onClose,
  onAuthenticated,
}: {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (token: string, user: AuthUser) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('evaluator@supplychainiq.edu');
  const [password, setPassword] = useState('Capstone2026!');
  const [role, setRole] = useState('Supply Chain Analyst');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' ? { email, password } : { name, email, password, role };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
      } else {
        onAuthenticated(data.token, data.user);
        onClose();
      }
    } catch {
      setError('Unable to reach authentication server.');
    } finally {
      setLoading(false);
    }
  }

  async function handleEvaluatorLogin() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/demo-login', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Evaluator sign-in failed.');
      } else {
        onAuthenticated(data.token, data.user);
        onClose();
      }
    } catch {
      setError('Unable to reach authentication server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md bg-[#111827] border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-display font-semibold text-white">
              {mode === 'login' ? 'Sign In to SUPPLY CHAIN IQ' : 'Create Analyst Account'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded bg-rose-950/50 border border-rose-800 text-xs text-rose-200">
              {error}
            </div>
          )}

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dr. Ananya Rao"
                  className="w-full px-3 py-2 text-xs bg-[#090D16] border border-slate-700 rounded text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Organization Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#090D16] border border-slate-700 rounded text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="Supply Chain Analyst">Supply Chain Analyst</option>
                  <option value="Procurement Director">Procurement Director</option>
                  <option value="ML Risk Engineer">ML Risk Engineer</option>
                  <option value="Academic Evaluator">Academic Evaluator</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#090D16] border border-slate-700 rounded text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#090D16] border border-slate-700 rounded text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors disabled:opacity-60"
            >
              {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Register Account'}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={handleEvaluatorLogin}
              className="w-full py-2 px-4 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5 text-teal-400" />
              1-Click Capstone Evaluator Sign-In
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {mode === 'login' ? 'Need a dedicated workspace account?' : 'Already have an account?'}
            </span>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
              className="text-sky-400 hover:underline font-medium"
            >
              {mode === 'login' ? 'Register' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
