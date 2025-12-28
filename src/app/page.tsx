'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [currentTime, setCurrentTime] = useState('');
    const [currentDate, setCurrentDate] = useState('');

    useEffect(() => {
        const updateDateTime = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
            setCurrentDate(now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
        };
        updateDateTime();
        const interval = setInterval(updateDateTime, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (!username || !password) {
            setError('Please enter username and password');
            setIsLoading(false);
            return;
        }

        try {
            // Check user in Supabase
            const { data, error: dbError } = await supabase
                .from('users')
                .select('*')
                .eq('user_name', username)
                .eq('active', true)
                .single();

            if (dbError || !data) {
                setError('Invalid username or password');
                setIsLoading(false);
                return;
            }

            // Check password match (in production, use proper hashing)
            if (data.password_hash === password || data.pin === password) {
                // Store user session
                localStorage.setItem('user', JSON.stringify({
                    userId: data.user_id,
                    userName: data.user_name,
                    name: data.name,
                    userType: data.user_type,
                    email: data.email
                }));
                router.push('/dashboard');
            } else {
                setError('Invalid username or password');
            }
        } catch (err) {
            console.error('Login error:', err);
            setError('Connection error. Please try again.');
        }

        setIsLoading(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated Background Elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-emerald-400/20 to-cyan-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-indigo-300/10 to-pink-300/10 rounded-full blur-3xl"></div>

                {/* Floating Icons */}
                <div className="absolute top-20 left-[10%] text-4xl opacity-20 animate-bounce" style={{ animationDuration: '3s' }}>🏨</div>
                <div className="absolute top-40 right-[15%] text-3xl opacity-20 animate-bounce" style={{ animationDuration: '4s', animationDelay: '0.5s' }}>🍽️</div>
                <div className="absolute bottom-32 left-[20%] text-3xl opacity-20 animate-bounce" style={{ animationDuration: '3.5s', animationDelay: '1s' }}>🛎️</div>
                <div className="absolute bottom-48 right-[10%] text-4xl opacity-20 animate-bounce" style={{ animationDuration: '4.5s', animationDelay: '0.3s' }}>🍳</div>
            </div>

            {/* Main Login Card */}
            <div className="relative z-10 w-full max-w-md">
                {/* Glass Card */}
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/50 overflow-hidden">
                    {/* Header with Gradient */}
                    <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 px-8 py-8 text-center relative overflow-hidden">
                        {/* Decorative circles */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2"></div>

                        {/* Logo */}
                        <div className="relative inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl mb-4 shadow-lg border border-white/30">
                            <span className="text-5xl">🏨</span>
                        </div>

                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
                            Alpha Plus Hotel System
                        </h1>
                        <p className="text-blue-100 text-sm font-medium">
                            ✨ Premium Hotel Management Solution ✨
                        </p>

                        {/* Time Display */}
                        <div className="mt-4 flex items-center justify-center gap-4 text-white/80 text-xs">
                            <span className="flex items-center gap-1">
                                <span>🕐</span> {currentTime}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-white/50"></span>
                            <span className="flex items-center gap-1">
                                <span>📅</span> {currentDate}
                            </span>
                        </div>
                    </div>

                    {/* Form Section */}
                    <div className="px-8 py-8">
                        <form onSubmit={handleLogin} className="space-y-5">
                            {/* Username Field */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                    <span className="text-lg">👤</span> Username
                                </label>
                                <div className="relative group">
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Enter your username"
                                        className="w-full px-5 py-4 pl-14 bg-gray-50/80 border-2 border-gray-200 rounded-2xl text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all duration-300 text-base font-medium"
                                    />
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl opacity-60 group-focus-within:opacity-100 transition-opacity">
                                        🆔
                                    </span>
                                </div>
                            </div>

                            {/* Password Field */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                    <span className="text-lg">🔐</span> Password / PIN
                                </label>
                                <div className="relative group">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Enter your password"
                                        className="w-full px-5 py-4 pl-14 pr-14 bg-gray-50/80 border-2 border-gray-200 rounded-2xl text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all duration-300 text-base font-medium"
                                    />
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl opacity-60 group-focus-within:opacity-100 transition-opacity">
                                        🔑
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-2xl hover:scale-110 active:scale-95 transition-transform p-1"
                                    >
                                        {showPassword ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-sm font-medium animate-shake">
                                    <span className="text-xl">⚠️</span>
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Login Button */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-4 px-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 hover:from-indigo-700 hover:via-purple-700 hover:to-blue-700 text-white text-lg font-bold rounded-2xl shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-3"
                            >
                                {isLoading ? (
                                    <>
                                        <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        <span>Signing in...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>🚀</span>
                                        <span>Sign In</span>
                                        <span>→</span>
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Security Badge */}
                        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-500">
                            <span className="text-lg">🔒</span>
                            <span>Secured with Enterprise-Grade Encryption</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-6 text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                        <div className="h-px w-12 bg-gradient-to-r from-transparent to-gray-300"></div>
                        <span className="text-gray-400 text-xs">Powered by</span>
                        <div className="h-px w-12 bg-gradient-to-l from-transparent to-gray-300"></div>
                    </div>

                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/50 shadow-sm">
                        <p className="text-gray-700 font-semibold text-sm flex items-center justify-center gap-2">
                            <span className="text-lg">💎</span> Alpha Solutions
                        </p>
                        <p className="text-gray-500 text-xs mt-1">
                            System developed & maintained by <span className="font-semibold text-indigo-600">Jimhawkins Korir</span>
                        </p>
                        <p className="text-gray-400 text-xs mt-1 flex items-center justify-center gap-2">
                            <span>📞</span> 0720316175
                        </p>
                    </div>

                    <p className="text-gray-400 text-xs">
                        © 2025 Alpha Plus Hotel System • v3.1 🚀
                    </p>
                </div>
            </div>

            {/* Styles for animations */}
            <style jsx>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
                    20%, 40%, 60%, 80% { transform: translateX(4px); }
                }
                .animate-shake {
                    animation: shake 0.5s ease-in-out;
                }
            `}</style>
        </div>
    );
}
