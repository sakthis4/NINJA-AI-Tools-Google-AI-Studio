
import React, { useState } from 'react';
import { useAppContext } from '../hooks/useAppContext';
import { LockClosedIcon } from '../components/icons/Icons';

const AnimatedLogo = () => (
    <svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{stopColor: '#38bdf8', stopOpacity: 1}} />
                <stop offset="100%" style={{stopColor: '#6366f1', stopOpacity: 1}} />
            </linearGradient>
            <style>
                {`
                    @keyframes draw {
                        to { stroke-dashoffset: 0; }
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    .s-path {
                        stroke-dasharray: 200;
                        stroke-dashoffset: 200;
                        animation: draw 1.5s ease-out forwards;
                    }
                    .ai-circle {
                        animation: fadeIn 0.5s ease-in forwards 1.2s;
                        opacity: 0;
                    }
                `}
            </style>
        </defs>
        <path className="s-path" d="M 75,20 C 75,30 65,30 65,40 C 65,50 75,50 75,60 C 75,70 65,70 65,80" stroke="url(#grad1)" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="35" cy="50" r="10" fill="url(#grad1)" className="ai-circle" />
        <path d="M 35 25 V 75" stroke="url(#grad1)" strokeWidth="8" fill="none" className="ai-circle" strokeLinecap="round" />
    </svg>
);


export default function LoginPage() {
  const { login } = useAppContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    login(email, password);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100 dark:bg-slate-900 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.1),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.15),rgba(255,255,255,0))]">
      <div className="w-full max-w-md p-8 space-y-8 bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl dark:bg-slate-800/80">
        <div className="text-center">
            <div className="inline-block mb-4">
                <AnimatedLogo />
            </div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
            S4Carlisle AI Tools
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Sign in to your account
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-slate-300 placeholder-slate-500 text-slate-900 rounded-t-md focus:outline-none focus:ring-sky-500 focus:border-sky-500 focus:z-10 sm:text-sm dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password-input" className="sr-only">Password</label>
              <input
                id="password-input"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-slate-300 placeholder-slate-500 text-slate-900 rounded-b-md focus:outline-none focus:ring-sky-500 focus:border-sky-500 focus:z-10 sm:text-sm dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                placeholder="Password"
              />
            </div>
          </div>
          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-lg font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 dark:focus:ring-offset-slate-800"
            >
              Sign In
            </button>
          </div>
        </form>
         <div className="mt-6 text-center">
            <div className="inline-flex items-center">
                <LockClosedIcon className="h-4 w-4 text-green-500 mr-2" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Secure SSL/TLS Connection</span>
            </div>
        </div>
      </div>
    </div>
  );
}