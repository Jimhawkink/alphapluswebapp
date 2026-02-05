'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Session timeout (30 minutes in ms)
const SESSION_TIMEOUT = 30 * 60 * 1000;

// License status interface
interface LicenseStatus {
    valid: boolean;
    type?: string;
    client?: string;
    daysRemaining?: number;
    expired?: boolean;
    error?: string;
}

export default function LoginPage() {
    const router = useRouter();
    const [loginMode, setLoginMode] = useState<'admin' | 'waiter'>('admin');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [currentTime, setCurrentTime] = useState('');
    const [currentDate, setCurrentDate] = useState('');
    const [licensedTo, setLicensedTo] = useState('');
    // License state
    const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>({ valid: true });
    const [checkingLicense, setCheckingLicense] = useState(true);

    // Generate a simple machine ID for license binding
    const getMachineId = (): string => {
        let machineId = localStorage.getItem('machine_id');
        if (!machineId) {
            machineId = 'WEB-' + Math.random().toString(36).substring(2, 15) +
                '-' + Date.now().toString(36);
            localStorage.setItem('machine_id', machineId);
        }
        return machineId;
    };

    // Check license status
    const checkLicense = async () => {
        setCheckingLicense(true);
        try {
            const machineId = getMachineId();
            const { data, error } = await supabase
                .from('licenses')
                .select('*')
                .eq('machine_id', machineId)
                .eq('is_active', true)
                .single();

            if (error || !data) {
                // No license bound to this machine - check if there's any active license
                const { data: anyLicense } = await supabase
                    .from('licenses')
                    .select('*')
                    .is('machine_id', null)
                    .eq('is_active', true)
                    .limit(1);

                if (anyLicense && anyLicense.length > 0) {
                    // There's an unbound license available
                    setLicenseStatus({ valid: false, error: 'License not activated. Please enter your license key.' });
                } else {
                    setLicenseStatus({ valid: false, error: 'No valid license found.' });
                }
            } else {
                const now = new Date();
                const expiryDate = new Date(data.expiry_date);
                const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                if (now > expiryDate) {
                    setLicenseStatus({ valid: false, expired: true, error: 'License has expired.' });
                } else {
                    setLicenseStatus({
                        valid: true,
                        type: data.license_type,
                        client: data.client_name,
                        daysRemaining: daysRemaining
                    });
                }
            }
        } catch (err) {
            console.log('License check failed, allowing access');
            setLicenseStatus({ valid: true }); // Allow access if check fails
        } finally {
            setCheckingLicense(false);
        }
    };

    // Session timeout management
    const setupSessionTimeout = () => {
        let timeoutId: NodeJS.Timeout;

        const resetTimeout = () => {
            clearTimeout(timeoutId);
            const user = localStorage.getItem('user');
            if (user) {
                localStorage.setItem('last_activity', Date.now().toString());
                timeoutId = setTimeout(() => {
                    localStorage.removeItem('user');
                    localStorage.removeItem('last_activity');
                    window.location.href = '/';
                }, SESSION_TIMEOUT);
            }
        };

        // Check for session expiry on page load
        const lastActivity = localStorage.getItem('last_activity');
        if (lastActivity) {
            const elapsed = Date.now() - parseInt(lastActivity);
            if (elapsed > SESSION_TIMEOUT) {
                localStorage.removeItem('user');
                localStorage.removeItem('last_activity');
            }
        }

        // Listen for user activity
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        events.forEach(event => window.addEventListener(event, resetTimeout));

        return () => {
            clearTimeout(timeoutId);
            events.forEach(event => window.removeEventListener(event, resetTimeout));
        };
    };

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

        // Check license status
        checkLicense();

        // Setup session timeout
        const cleanupSession = setupSessionTimeout();

        return () => {
            clearInterval(interval);
            cleanupSession();
        };
    }, []);

    // License key input state
    const [licenseKey, setLicenseKey] = useState('');
    const [activatingLicense, setActivatingLicense] = useState(false);

    // Activate license with a key
    const activateLicense = async () => {
        if (!licenseKey.trim()) {
            setError('Please enter a license key');
            return;
        }

        setActivatingLicense(true);
        setError('');

        try {
            const machineId = getMachineId();

            // Find the license by key
            const { data: license, error: findError } = await supabase
                .from('licenses')
                .select('*')
                .eq('license_key', licenseKey.trim().toUpperCase())
                .single();

            if (findError || !license) {
                setError('Invalid license key. Please check and try again.');
                setActivatingLicense(false);
                return;
            }

            // Check if already bound
            if (license.machine_id && license.machine_id !== machineId) {
                setError('This license is already activated on another device.');
                setActivatingLicense(false);
                return;
            }

            // Check expiry
            const now = new Date();
            const expiryDate = new Date(license.expiry_date);
            if (now > expiryDate) {
                setError('This license has expired.');
                setActivatingLicense(false);
                return;
            }

            // Bind license to this machine
            const { error: updateError } = await supabase
                .from('licenses')
                .update({
                    machine_id: machineId,
                    activation_date: new Date().toISOString()
                })
                .eq('license_id', license.license_id);

            if (updateError) {
                setError('Failed to activate license. Please try again.');
                setActivatingLicense(false);
                return;
            }

            // Log activation
            await supabase.from('license_activations').insert({
                license_id: license.license_id,
                machine_id: machineId,
                activation_type: 'activate',
                success: true
            });

            // Re-check license
            await checkLicense();
            setLicenseKey('');
        } catch (err) {
            console.error('License activation error:', err);
            setError('Activation failed. Please try again.');
        } finally {
            setActivatingLicense(false);
        }
    };

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

            // First, check all waiters to debug
            const { data: allWaiters } = await supabase
                .from('users')
                .select('user_id, user_name, name, pin, user_type, active')
                .eq('user_type', 'Waiter')
                .eq('active', true);

            console.log('🔍 All active waiters in DB:', allWaiters);

            const { data, error: dbError } = await supabase
                .from('users')
                .select('*')
                .eq('pin', pin)
                .eq('active', true)
                .eq('user_type', 'Waiter')
                .maybeSingle();

            console.log('🔍 Query result:', { data, dbError });

            if (dbError || !data) {
                console.error('❌ Login failed:', dbError?.message || 'No user found');
                setError(`Invalid PIN. Error: ${dbError?.message || 'No waiter with this PIN'}`);
                setIsLoading(false);
                setPin('');
                setShowPin(false);
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
            setError(''); // Clear error on input
        }
    };

    const handlePinClear = () => {
        setPin('');
        setError('');
        setShowPin(false);
    };

    const handlePinDelete = () => {
        setPin(pin.slice(0, -1));
    };

    const togglePinVisibility = () => {
        setShowPin(!showPin);
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

                    {/* License Status Banner */}
                    {!checkingLicense && (
                        <div className={`px-4 py-2 text-center text-sm ${licenseStatus.valid
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                            {licenseStatus.valid ? (
                                <span>✅ Licensed: {licenseStatus.client || 'Active'}
                                    {licenseStatus.daysRemaining !== undefined && (
                                        <span className="ml-2">
                                            ({licenseStatus.daysRemaining} days remaining)
                                        </span>
                                    )}
                                </span>
                            ) : (
                                <span>⚠️ {licenseStatus.error || 'License Required'}</span>
                            )}
                        </div>
                    )}

                    {/* License Activation Form - Only show when license is invalid */}
                    {!checkingLicense && !licenseStatus.valid && (
                        <div className="px-6 pt-4 pb-4 bg-amber-50 border-b border-amber-200">
                            <p className="text-sm text-amber-800 mb-3 font-medium">
                                🔑 Enter your license key to activate this system:
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={licenseKey}
                                    onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                                    placeholder="APS-XXXX-XXXX-XXXX-XXXX"
                                    className="flex-1 px-4 py-3 rounded-xl border border-amber-300 bg-white text-gray-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                />
                                <button
                                    onClick={activateLicense}
                                    disabled={activatingLicense}
                                    className="px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 transition-all"
                                >
                                    {activatingLicense ? '...' : '✓'}
                                </button>
                            </div>
                        </div>
                    )}

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
                                    <div className="flex items-center justify-center gap-3">
                                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                            <span className="text-xl">🔢</span> Enter 6-Digit PIN
                                        </label>
                                        <button
                                            type="button"
                                            onClick={togglePinVisibility}
                                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                            title={showPin ? 'Hide PIN' : 'Show PIN'}
                                        >
                                            <span className="text-xl">{showPin ? '👁️' : '👁️‍🗨️'}</span>
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-center gap-3">
                                        {[0, 1, 2, 3, 4, 5].map((i) => (
                                            <div
                                                key={i}
                                                className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold transition-all duration-300 ${pin[i]
                                                    ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/30 scale-110'
                                                    : 'bg-gray-100 border-2 border-gray-200 text-gray-300'
                                                    }`}
                                            >
                                                {pin[i] ? (showPin ? pin[i] : '●') : '○'}
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

                                {/* Numeric Keypad - Clean Design (No hover scale to prevent mis-clicks) */}
                                <div className="grid grid-cols-3 gap-3">
                                    {/* Button 1 - Blue */}
                                    <button onClick={() => handlePinInput('1')} disabled={isLoading} className="h-20 bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 border-2 border-blue-300 rounded-2xl text-3xl font-black text-white active:scale-95 transition-colors duration-200 shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                                        <span className="drop-shadow-lg">1</span>
                                    </button>
                                    {/* Button 2 - Indigo */}
                                    <button onClick={() => handlePinInput('2')} disabled={isLoading} className="h-20 bg-gradient-to-br from-indigo-400 via-indigo-500 to-indigo-600 border-2 border-indigo-300 rounded-2xl text-3xl font-black text-white active:scale-95 transition-colors duration-200 shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                                        <span className="drop-shadow-lg">2</span>
                                    </button>
                                    {/* Button 3 - Purple */}
                                    <button onClick={() => handlePinInput('3')} disabled={isLoading} className="h-20 bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 border-2 border-purple-300 rounded-2xl text-3xl font-black text-white active:scale-95 transition-colors duration-200 shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                                        <span className="drop-shadow-lg">3</span>
                                    </button>
                                    {/* Button 4 - Pink */}
                                    <button onClick={() => handlePinInput('4')} disabled={isLoading} className="h-20 bg-gradient-to-br from-pink-400 via-pink-500 to-pink-600 border-2 border-pink-300 rounded-2xl text-3xl font-black text-white active:scale-95 transition-colors duration-200 shadow-lg shadow-pink-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                                        <span className="drop-shadow-lg">4</span>
                                    </button>
                                    {/* Button 5 - Rose */}
                                    <button onClick={() => handlePinInput('5')} disabled={isLoading} className="h-20 bg-gradient-to-br from-rose-400 via-rose-500 to-rose-600 border-2 border-rose-300 rounded-2xl text-3xl font-black text-white active:scale-95 transition-colors duration-200 shadow-lg shadow-rose-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                                        <span className="drop-shadow-lg">5</span>
                                    </button>
                                    {/* Button 6 - Fuchsia */}
                                    <button onClick={() => handlePinInput('6')} disabled={isLoading} className="h-20 bg-gradient-to-br from-fuchsia-400 via-fuchsia-500 to-fuchsia-600 border-2 border-fuchsia-300 rounded-2xl text-3xl font-black text-white active:scale-95 transition-colors duration-200 shadow-lg shadow-fuchsia-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                                        <span className="drop-shadow-lg">6</span>
                                    </button>
                                    {/* Button 7 - Orange */}
                                    <button onClick={() => handlePinInput('7')} disabled={isLoading} className="h-20 bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 border-2 border-orange-300 rounded-2xl text-3xl font-black text-white active:scale-95 transition-colors duration-200 shadow-lg shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                                        <span className="drop-shadow-lg">7</span>
                                    </button>
                                    {/* Button 8 - Amber */}
                                    <button onClick={() => handlePinInput('8')} disabled={isLoading} className="h-20 bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 border-2 border-amber-300 rounded-2xl text-3xl font-black text-white active:scale-95 transition-colors duration-200 shadow-lg shadow-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                                        <span className="drop-shadow-lg">8</span>
                                    </button>
                                    {/* Button 9 - Yellow */}
                                    <button onClick={() => handlePinInput('9')} disabled={isLoading} className="h-20 bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 border-2 border-yellow-300 rounded-2xl text-3xl font-black text-white active:scale-95 transition-colors duration-200 shadow-lg shadow-yellow-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                                        <span className="drop-shadow-lg">9</span>
                                    </button>
                                    {/* Clear Button - Red */}
                                    <button
                                        onClick={handlePinClear}
                                        disabled={isLoading}
                                        className="h-20 bg-gradient-to-br from-red-500 via-red-600 to-red-700 border-2 border-red-400 rounded-2xl text-2xl font-bold text-white active:scale-95 transition-colors duration-200 shadow-lg shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                    >
                                        <span className="drop-shadow-lg">⌫</span>
                                    </button>
                                    {/* 0 Button - Cyan */}
                                    <button onClick={() => handlePinInput('0')} disabled={isLoading} className="h-20 bg-gradient-to-br from-cyan-400 via-cyan-500 to-cyan-600 border-2 border-cyan-300 rounded-2xl text-3xl font-black text-white active:scale-95 transition-colors duration-200 shadow-lg shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                                        <span className="drop-shadow-lg">0</span>
                                    </button>
                                    {/* Submit Button - Green */}
                                    <button
                                        onClick={handleWaiterLogin}
                                        disabled={isLoading || pin.length !== 6}
                                        className="h-20 bg-gradient-to-br from-emerald-500 via-green-600 to-teal-600 border-2 border-emerald-400 rounded-2xl text-3xl font-black text-white active:scale-95 transition-colors duration-200 shadow-lg shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-300 disabled:via-gray-400 disabled:to-gray-400 disabled:border-gray-300 disabled:shadow-none flex items-center justify-center"
                                    >
                                        {isLoading ? (
                                            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        ) : (
                                            <span className="drop-shadow-lg">✓</span>
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
