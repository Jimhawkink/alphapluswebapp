'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
    const router = useRouter();
    const [loginMode, setLoginMode] = useState<'admin' | 'waiter'>('admin');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [currentTime, setCurrentTime] = useState('');
    const [currentDate, setCurrentDate] = useState('');
    const [licensedTo, setLicensedTo] = useState('');

    useEffect(() => {
        const updateDateTime = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
            setCurrentDate(now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
        };
        updateDateTime();
        const interval = setInterval(updateDateTime, 1000);

        // Load company name
        const loadCompanyName = async () => {
            try {
                const { data } = await supabase
                    .from('organisation_settings')
                    .select('setting_value')
                    .eq('setting_key', 'company_name')
                    .single();
                if (data?.setting_value) {
                    setLicensedTo(data.setting_value);
                }
            } catch (err) {
                console.log('Could not load company name');
            }
        };
        loadCompanyName();

        return () => clearInterval(interval);
    }, []);

    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (!username || !password) {
            setError('Please enter username and password');
            setIsLoading(false);
            return;
        }

        try {
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

            if (data.password_hash === password || data.pin === password) {
                localStorage.setItem('user', JSON.stringify({
                    userId: data.user_id,
                    userName: data.user_name,
                    name: data.name,
                    userType: data.user_type,
                    email: data.email,
                    isWaiter: false
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

    const handleWaiterLogin = async () => {
        if (pin.length !== 6) {
            setError('Please enter 6-digit PIN');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            console.log('🔍 Waiter login attempt:', { pin, pinLength: pin.length });

            const { data, error: dbError } = await supabase
                .from('users')
                .select('*')
                .eq('pin', pin)
                .eq('active', true)
                .eq('user_type', 'Waiter')
                .single();

            console.log('🔍 Query result:', { data, dbError });

            if (dbError || !data) {
                console.error('❌ Login failed:', dbError?.message || 'No user found');
                setError(`Invalid PIN or waiter not found. Error: ${dbError?.message || 'No match'}`);
                setIsLoading(false);
                setPin(''); // Clear PIN
                return;
            }

            console.log('✅ Waiter found:', data.name);
            localStorage.setItem('user', JSON.stringify({
                userId: data.user_id,
                userName: data.user_name,
                name: data.name,
                userType: data.user_type,
                email: data.email,
                isWaiter: true
            }));
            router.push('/dashboard/pos'); // Redirect to POS
        } catch (err) {
            console.error('Login error:', err);
            setError('Connection error. Please try again.');
        }

        setIsLoading(false);
    };

    const handlePinInput = (digit: string) => {
        if (pin.length < 6) {
            setPin(pin + digit);
        }
    };

    const handlePinClear = () => {
        setPin('');
        setError('');
    };

    const handlePinDelete = () => {
        setPin(pin.slice(0, -1));
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated Background */}
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
                    {/* Mode Toggle */}
                    <div className="px-6 pt-6">
                        <div className="flex gap-2 p-1.5 bg-gradient-to-r from-gray-100 to-gray-50 rounded-2xl border border-gray-200">
                            <button
                                onClick={() => { setLoginMode('admin'); setError(''); setPin(''); }}
                                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 ${loginMode === 'admin'
                                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/30'
                                    : 'text-gray-600 hover:text-gray-800'
                                    }`}
                            >
                                👨‍💼 Admin Login
                            </button>
                            <button
                                onClick={() => { setLoginMode('waiter'); setError(''); setUsername(''); setPassword(''); }}
                                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 ${loginMode === 'waiter'
                                    ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-lg shadow-emerald-500/30'
                                    : 'text-gray-600 hover:text-gray-800'
                                    }`}
                            >
                                🧑‍🍳 Waiter Login
                            </button>
                        </div>
                    </div>

                    {/* Header */}
                    <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 px-8 py-8 text-center relative overflow-hidden mt-4">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2"></div>

                        <div className="relative inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl mb-4 shadow-lg border border-white/30">
                            <span className="text-5xl">{loginMode === 'admin' ? '🏨' : '🧑‍🍳'}</span>
                        </div>

                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
                            Alpha Plus Hotel System
                        </h1>
                        <p className="text-blue-100 text-sm font-medium">
                            {loginMode === 'admin' ? '✨ Premium Hotel Management ✨' : '🍽️ Quick Waiter Access 🍽️'}
                        </p>

                        {/* Time */}
                        <div className="mt-4 flex items-center justify-center gap-4 text-white/80 text-xs">
                            <span className="flex items-center gap-1"><span>🕐</span> {currentTime}</span>
                            <span className="w-1 h-1 rounded-full bg-white/50"></span>
                            <span className="flex items-center gap-1"><span>📅</span> {currentDate}</span>
                        </div>

                        {licensedTo && (
                            <div className="mt-3 text-center">
                                <span className="text-white/60 text-xs">Licensed to:</span>
                                <p className="text-white font-semibold text-sm">{licensedTo}</p>
                            </div>
                        )}
                    </div>

                    {/* Form Section */}
                    <div className="px-8 py-8">
                        {loginMode === 'admin' ? (
                            // Admin Login Form
                            <form onSubmit={handleAdminLogin} className="space-y-5">
                                {/* Username */}
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
                                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl opacity-60 group-focus-within:opacity-100 transition-opacity">🆔</span>
                                    </div>
                                </div>

                                {/* Password */}
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
                                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl opacity-60 group-focus-within:opacity-100 transition-opacity">🔑</span>
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-2xl hover:scale-110 active:scale-95 transition-transform p-1"
                                        >
                                            {showPassword ? '🙈' : '👁️'}
                                        </button>
                                    </div>
                                </div>

                                {/* Error */}
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
                        ) : (
                            // Waiter PIN Login
                            <div className="space-y-6">
                                {/* PIN Display */}
                                <div className="text-center space-y-4">
                                    <label className="text-sm font-bold text-gray-700 flex items-center justify-center gap-2">
                                        <span className="text-xl">🔢</span> Enter 6-Digit PIN
                                    </label>
                                    <div className="flex items-center justify-center gap-3">
                                        {[0, 1, 2, 3, 4, 5].map((i) => (
                                            <div
                                                key={i}
                                                className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold transition-all duration-300 ${pin[i]
                                                    ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/30 scale-110'
                                                    : 'bg-gray-100 border-2 border-gray-200 text-gray-300'
                                                    }`}
                                            >
                                                {pin[i] ? '●' : '○'}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Error */}
                                {error && (
                                    <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-sm font-medium animate-shake">
                                        <span className="text-xl">⚠️</span>
                                        <span>{error}</span>
                                    </div>
                                )}

                                {/* Numeric Keypad - Rainbow Vibrant Design */}
                                <div className="grid grid-cols-3 gap-4">
                                    {/* Button 1 - Blue Gradient */}
                                    <button onClick={() => handlePinInput('1')} disabled={isLoading} className="group relative h-24 bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 border-2 border-blue-300 rounded-3xl text-3xl font-black text-white hover:from-blue-500 hover:via-blue-600 hover:to-blue-700 hover:scale-110 hover:shadow-2xl hover:shadow-blue-500/60 active:scale-95 transition-all duration-300 shadow-xl shadow-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                                        <span className="relative z-10 drop-shadow-lg">1</span>
                                    </button>
                                    {/* Button 2 - Indigo Gradient */}
                                    <button onClick={() => handlePinInput('2')} disabled={isLoading} className="group relative h-24 bg-gradient-to-br from-indigo-400 via-indigo-500 to-indigo-600 border-2 border-indigo-300 rounded-3xl text-3xl font-black text-white hover:from-indigo-500 hover:via-indigo-600 hover:to-indigo-700 hover:scale-110 hover:shadow-2xl hover:shadow-indigo-500/60 active:scale-95 transition-all duration-300 shadow-xl shadow-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                                        <span className="relative z-10 drop-shadow-lg">2</span>
                                    </button>
                                    {/* Button 3 - Purple Gradient */}
                                    <button onClick={() => handlePinInput('3')} disabled={isLoading} className="group relative h-24 bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 border-2 border-purple-300 rounded-3xl text-3xl font-black text-white hover:from-purple-500 hover:via-purple-600 hover:to-purple-700 hover:scale-110 hover:shadow-2xl hover:shadow-purple-500/60 active:scale-95 transition-all duration-300 shadow-xl shadow-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                                        <span className="relative z-10 drop-shadow-lg">3</span>
                                    </button>
                                    {/* Button 4 - Pink Gradient */}
                                    <button onClick={() => handlePinInput('4')} disabled={isLoading} className="group relative h-24 bg-gradient-to-br from-pink-400 via-pink-500 to-pink-600 border-2 border-pink-300 rounded-3xl text-3xl font-black text-white hover:from-pink-500 hover:via-pink-600 hover:to-pink-700 hover:scale-110 hover:shadow-2xl hover:shadow-pink-500/60 active:scale-95 transition-all duration-300 shadow-xl shadow-pink-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                                        <span className="relative z-10 drop-shadow-lg">4</span>
                                    </button>
                                    {/* Button 5 - Rose Gradient */}
                                    <button onClick={() => handlePinInput('5')} disabled={isLoading} className="group relative h-24 bg-gradient-to-br from-rose-400 via-rose-500 to-rose-600 border-2 border-rose-300 rounded-3xl text-3xl font-black text-white hover:from-rose-500 hover:via-rose-600 hover:to-rose-700 hover:scale-110 hover:shadow-2xl hover:shadow-rose-500/60 active:scale-95 transition-all duration-300 shadow-xl shadow-rose-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                                        <span className="relative z-10 drop-shadow-lg">5</span>
                                    </button>
                                    {/* Button 6 - Fuchsia Gradient */}
                                    <button onClick={() => handlePinInput('6')} disabled={isLoading} className="group relative h-24 bg-gradient-to-br from-fuchsia-400 via-fuchsia-500 to-fuchsia-600 border-2 border-fuchsia-300 rounded-3xl text-3xl font-black text-white hover:from-fuchsia-500 hover:via-fuchsia-600 hover:to-fuchsia-700 hover:scale-110 hover:shadow-2xl hover:shadow-fuchsia-500/60 active:scale-95 transition-all duration-300 shadow-xl shadow-fuchsia-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                                        <span className="relative z-10 drop-shadow-lg">6</span>
                                    </button>
                                    {/* Button 7 - Orange Gradient */}
                                    <button onClick={() => handlePinInput('7')} disabled={isLoading} className="group relative h-24 bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 border-2 border-orange-300 rounded-3xl text-3xl font-black text-white hover:from-orange-500 hover:via-orange-600 hover:to-orange-700 hover:scale-110 hover:shadow-2xl hover:shadow-orange-500/60 active:scale-95 transition-all duration-300 shadow-xl shadow-orange-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                                        <span className="relative z-10 drop-shadow-lg">7</span>
                                    </button>
                                    {/* Button 8 - Amber Gradient */}
                                    <button onClick={() => handlePinInput('8')} disabled={isLoading} className="group relative h-24 bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 border-2 border-amber-300 rounded-3xl text-3xl font-black text-white hover:from-amber-500 hover:via-amber-600 hover:to-amber-700 hover:scale-110 hover:shadow-2xl hover:shadow-amber-500/60 active:scale-95 transition-all duration-300 shadow-xl shadow-amber-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                                        <span className="relative z-10 drop-shadow-lg">8</span>
                                    </button>
                                    {/* Button 9 - Yellow Gradient */}
                                    <button onClick={() => handlePinInput('9')} disabled={isLoading} className="group relative h-24 bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 border-2 border-yellow-300 rounded-3xl text-3xl font-black text-white hover:from-yellow-500 hover:via-yellow-600 hover:to-yellow-700 hover:scale-110 hover:shadow-2xl hover:shadow-yellow-500/60 active:scale-95 transition-all duration-300 shadow-xl shadow-yellow-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                                        <span className="relative z-10 drop-shadow-lg">9</span>
                                    </button>
                                    {/* Clear Button - Premium Red */}
                                    <button
                                        onClick={handlePinClear}
                                        disabled={isLoading}
                                        className="group relative h-24 bg-gradient-to-br from-red-500 via-red-600 to-red-700 border-2 border-red-400 rounded-3xl text-2xl font-bold text-white hover:from-red-600 hover:via-red-700 hover:to-red-800 hover:scale-110 hover:shadow-2xl hover:shadow-red-500/60 active:scale-95 transition-all duration-300 shadow-xl shadow-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                                        <span className="relative z-10 drop-shadow-lg">⌫</span>
                                    </button>
                                    {/* 0 Button - Cyan Gradient */}
                                    <button onClick={() => handlePinInput('0')} disabled={isLoading} className="group relative h-24 bg-gradient-to-br from-cyan-400 via-cyan-500 to-cyan-600 border-2 border-cyan-300 rounded-3xl text-3xl font-black text-white hover:from-cyan-500 hover:via-cyan-600 hover:to-cyan-700 hover:scale-110 hover:shadow-2xl hover:shadow-cyan-500/60 active:scale-95 transition-all duration-300 shadow-xl shadow-cyan-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                                        <span className="relative z-10 drop-shadow-lg">0</span>
                                    </button>
                                    {/* Submit Button - Ultra Premium Green */}
                                    <button
                                        onClick={handleWaiterLogin}
                                        disabled={isLoading || pin.length !== 6}
                                        className="group relative h-24 bg-gradient-to-br from-emerald-500 via-green-600 to-teal-600 border-2 border-emerald-400 rounded-3xl text-3xl font-black text-white hover:from-emerald-600 hover:via-green-700 hover:to-teal-700 hover:scale-110 hover:shadow-2xl hover:shadow-emerald-500/60 active:scale-95 transition-all duration-300 shadow-xl shadow-emerald-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-300 disabled:via-gray-400 disabled:to-gray-400 disabled:border-gray-300 disabled:shadow-none disabled:hover:scale-100 overflow-hidden animate-pulse"
                                    >
                                        {/* Shimmer effect */}
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/0 to-teal-400/0 group-hover:from-emerald-400/30 group-hover:to-teal-400/30 rounded-3xl transition-all duration-300"></div>
                                        {isLoading ? (
                                            <div className="relative z-10 w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
                                        ) : (
                                            <span className="relative z-10 drop-shadow-lg">✓</span>
                                        )}
                                    </button>
                                </div>

                                {/* Delete Helper */}
                                <p className="text-center text-xs text-gray-500">
                                    Press ⌫ to clear all • Press number to delete last digit
                                </p>
                            </div>
                        )}

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
                        © 2025 Alpha Plus Hotel System • v3.2 🚀
                    </p>
                </div>
            </div>

            {/* Animations */}
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
