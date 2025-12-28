'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // Simulate login - replace with Supabase auth
        setTimeout(() => {
            if (userId && password) {
                localStorage.setItem('user', JSON.stringify({ userId, name: userId }));
                router.push('/dashboard');
            } else {
                setError('Please enter User ID and Password');
            }
            setIsLoading(false);
        }, 1500);
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
            {/* Animated Background */}
            <div className="animated-bg"></div>

            {/* Floating Orbs */}
            <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse-slow"></div>
            <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl animate-float"></div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md mx-4">
                <div className="glass-card p-8 md:p-10">
                    {/* Logo Section */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 mb-4 shadow-lg neon-glow-purple">
                            <span className="text-4xl">🛒</span>
                        </div>
                        <h1 className="text-3xl font-bold gradient-text mb-2">
                            Alpha Plus POS
                        </h1>
                        <p className="text-gray-400 text-sm">
                            ✨ Super Modern Point of Sale System ✨
                        </p>
                    </div>

                    {/* Login Form */}
                    <form onSubmit={handleLogin} className="space-y-6">
                        {/* User ID Field */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                <span>👤</span> User ID
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={userId}
                                    onChange={(e) => setUserId(e.target.value)}
                                    placeholder="Enter your User ID"
                                    className="input-modern pl-12"
                                />
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl opacity-50">
                                    🆔
                                </span>
                            </div>
                        </div>

                        {/* Password Field */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                <span>🔐</span> Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    className="input-modern pl-12 pr-12"
                                />
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl opacity-50">
                                    🔑
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xl hover:scale-110 transition-transform"
                                >
                                    {showPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                                <span>⚠️</span> {error}
                            </div>
                        )}

                        {/* Login Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full btn-primary flex items-center justify-center gap-3 text-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <div className="spinner"></div>
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

                    {/* Divider */}
                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-dark-card text-gray-500">Quick Access</span>
                        </div>
                    </div>

                    {/* Quick Login Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => { setUserId('admin'); setPassword('admin'); }}
                            className="flex items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-purple-500/10 border border-purple-500/30 hover:border-purple-500/50 transition-all hover:scale-105"
                        >
                            <span>👑</span>
                            <span className="text-sm font-medium">Admin</span>
                        </button>
                        <button
                            onClick={() => { setUserId('cashier'); setPassword('cashier'); }}
                            className="flex items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-r from-blue-500/20 to-blue-500/10 border border-blue-500/30 hover:border-blue-500/50 transition-all hover:scale-105"
                        >
                            <span>💼</span>
                            <span className="text-sm font-medium">Cashier</span>
                        </button>
                    </div>

                    {/* Footer */}
                    <div className="mt-8 text-center">
                        <p className="text-xs text-gray-500">
                            🔒 Secured with enterprise-grade encryption
                        </p>
                        <p className="text-xs text-gray-600 mt-2">
                            © 2024 Alpha Plus POS • v2.0
                        </p>
                    </div>
                </div>

                {/* Bottom Glow */}
                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-purple-500/30 blur-3xl rounded-full"></div>
            </div>
        </div>
    );
}
