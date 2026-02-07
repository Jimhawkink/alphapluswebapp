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

            const { data, error: dbError } = await supabase
                .from('users')
                .select('*')
                .eq('pin', pin)
                .eq('active', true)
                .eq('user_type', 'Waiter')
                .maybeSingle();

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

    const togglePinVisibility = () => {
        setShowPin(!showPin);
    };

    return (
        <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden bg-gray-50 font-sans">

            {/* LEFT SIDE: BRANDING & ATMOSPHERE */}
            <div className="hidden lg:flex w-1/2 bg-[#0f172a] relative items-center justify-center text-white p-12 overflow-hidden">
                {/* Abstract Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900 to-slate-900 opacity-90"></div>
                {/* Hotel Interior Image */}
                <div
                    className="absolute inset-0 bg-cover bg-center mix-blend-overlay opacity-50 transition-opacity duration-1000"
                    style={{ backgroundImage: "url('https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-1.2.1&auto=format&fit=crop&w=1920&q=80')" }}
                ></div>

                <div className="relative z-10 max-w-lg text-center animate-fade-in-up">
                    <div className="mb-6 inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-2xl shadow-blue-900/50 transform hover:scale-105 transition-transform duration-300">
                        <span className="text-5xl text-white drop-shadow-md">💎</span>
                    </div>
                    <h1 className="text-6xl font-extrabold mb-4 tracking-tight drop-shadow-lg bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-white">Alpha Plus</h1>
                    <p className="text-2xl text-blue-100 font-light mb-8 tracking-wide">Premium Hotel Management System</p>

                    <div className="grid grid-cols-2 gap-6 text-left mt-12">
                        <div className="bg-white/10 p-5 rounded-2xl backdrop-blur-md border border-white/10 hover:bg-white/20 transition-colors duration-300">
                            <div className="text-3xl mb-3">🚀</div>
                            <div className="font-bold text-lg">Fast & Reliable</div>
                            <div className="text-sm text-blue-200 mt-1">Optimized for speed</div>
                        </div>
                        <div className="bg-white/10 p-5 rounded-2xl backdrop-blur-md border border-white/10 hover:bg-white/20 transition-colors duration-300">
                            <div className="text-3xl mb-3">🔒</div>
                            <div className="font-bold text-lg">Secure</div>
                            <div className="text-sm text-blue-200 mt-1">Enterprise encryption</div>
                        </div>
                    </div>

                    {licensedTo && (
                        <div className="mt-8 pt-6 border-t border-white/10">
                            <p className="text-xs uppercase tracking-widest text-blue-300 mb-2">Licensed To</p>
                            <p className="text-xl font-bold">{licensedTo}</p>
                        </div>
                    )}
                </div>

                <div className="absolute bottom-8 text-xs text-slate-400 font-medium tracking-wide">
                    &copy; 2026 Alpha Solutions. All rights reserved.
                </div>
            </div>

            {/* RIGHT SIDE: LOGIN FORM */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 lg:p-12 relative bg-gradient-to-br from-white via-indigo-50 to-blue-50">

                {/* Header for Mobile (visible only on small screens) */}
                <div className="lg:hidden text-center mb-8 pt-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl mb-4 shadow-lg">
                        <span className="text-3xl text-white">💎</span>
                    </div>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Alpha Plus</h2>
                    <p className="text-slate-500 text-sm mt-1">Premium Hotel Management</p>
                </div>

                <div className="w-full max-w-md bg-white/60 backdrop-blur-xl p-8 rounded-3xl shadow-xl border border-white/50 relative overflow-hidden">

                    {/* Decorative Blob */}
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
                    <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>

                    {/* License Warning Logic */}
                    {!checkingLicense && !licenseStatus.valid && (
                        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl animate-pulse">
                            <p className="text-sm text-amber-800 font-bold mb-2 flex items-center gap-2">
                                <span>⚠️</span> {licenseStatus.error || 'Activation Required'}
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={licenseKey}
                                    onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                                    placeholder="Enter Key: APS-XXXX..."
                                    className="flex-1 px-3 py-2 text-sm border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none uppercase font-mono"
                                />
                                <button
                                    onClick={activateLicense}
                                    disabled={activatingLicense}
                                    className="px-4 py-2 bg-amber-600 text-white rounded-lg font-bold text-sm hover:bg-amber-700 transition-colors disabled:opacity-50"
                                >
                                    {activatingLicense ? '...' : 'Activate'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TABS */}
                    <div className="flex p-1.5 bg-gray-100/80 rounded-xl mb-8 relative border border-gray-200/50">
                        <button
                            onClick={() => { setLoginMode('admin'); setError(''); setPin(''); }}
                            className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 ${loginMode === 'admin'
                                ? 'bg-white text-indigo-600 shadow-md ring-1 ring-black/5 transform scale-[1.02]'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-gray-200/50'}`}
                        >
                            <span>👨‍💼</span> Admin Portal
                        </button>
                        <button
                            onClick={() => { setLoginMode('waiter'); setError(''); setUsername(''); setPassword(''); }}
                            className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 ${loginMode === 'waiter'
                                ? 'bg-white text-emerald-600 shadow-md ring-1 ring-black/5 transform scale-[1.02]'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-gray-200/50'}`}
                        >
                            <span>🧑‍🍳</span> Waiter Station
                        </button>
                    </div>

                    {/* ADMIN FORM */}
                    {loginMode === 'admin' && (
                        <div className="space-y-6 animate-fade-in relative z-10">
                            <div className="text-center mb-6">
                                <h2 className="text-2xl font-bold text-slate-800">Welcome Back</h2>
                                <p className="text-slate-500 text-sm mt-2">Please sign in to your dashboard.</p>
                            </div>

                            <form onSubmit={handleAdminLogin} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Username</label>
                                    <div className="relative group">
                                        <span className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors text-lg">👤</span>
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium text-slate-700 placeholder-gray-400"
                                            placeholder="Enter username"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Password</label>
                                    <div className="relative group">
                                        <span className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors text-lg">🔒</span>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-12 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium text-slate-700 placeholder-gray-400"
                                            placeholder="Enter password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                                        >
                                            {showPassword ? '🙈' : '👁️'}
                                        </button>
                                    </div>
                                </div>

                                {error && (
                                    <div className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-lg border border-red-100 flex items-center gap-2 animate-pulse">
                                        <span>⚠️</span> {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-4 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white font-bold text-lg rounded-xl shadow-xl shadow-slate-900/20 transform hover:-translate-y-1 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    ) : (
                                        <>
                                            <span>Sign In</span>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* WAITER FORM */}
                    {loginMode === 'waiter' && (
                        <div className="space-y-6 animate-fade-in relative z-10">
                            <div className="text-center">
                                <h2 className="text-2xl font-bold text-slate-800">Waiter Access</h2>
                                <p className="text-slate-500 text-sm mt-1">Enter your 6-digit PIN.</p>
                            </div>

                            {/* PIN Display */}
                            <div className="flex justify-center gap-2 mb-2">
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className={`w-10 h-12 lg:w-12 lg:h-14 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all duration-300 ${pin[i] ? 'bg-emerald-50 border-emerald-500 text-emerald-600 shadow-sm transform -translate-y-1' : 'bg-gray-50 border-gray-200 text-gray-300'}`}>
                                        {pin[i] ? (showPin ? pin[i] : '●') : '○'}
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-center mb-4">
                                <button onClick={togglePinVisibility} className="text-xs text-slate-400 hover:text-slate-600 font-medium">
                                    {showPin ? 'Hide PIN' : 'Show PIN'}
                                </button>
                            </div>

                            {error && (
                                <div className="text-red-500 text-sm font-medium text-center bg-red-50 p-2 rounded-lg border border-red-100 animate-pulse">
                                    {error}
                                </div>
                            )}

                            {/* PIN Pad */}
                            <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                    <button
                                        key={num}
                                        onClick={() => handlePinInput(num.toString())}
                                        className="h-16 rounded-2xl bg-white border border-gray-200 text-2xl font-bold text-slate-700 shadow-sm hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 active:scale-95 transition-all duration-200"
                                    >
                                        {num}
                                    </button>
                                ))}
                                <button onClick={handlePinClear} className="h-16 rounded-2xl bg-rose-50 border border-rose-100 text-xl font-bold text-rose-500 shadow-sm hover:bg-rose-100 active:scale-95 transition-all duration-200">⌫</button>
                                <button onClick={() => handlePinInput('0')} className="h-16 rounded-2xl bg-white border border-gray-200 text-2xl font-bold text-slate-700 shadow-sm hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 active:scale-95 transition-all duration-200">0</button>
                                <button onClick={handleWaiterLogin} disabled={isLoading || pin.length !== 6} className="h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-2xl font-bold text-white shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-green-700 active:scale-95 transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isLoading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : '✓'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* License Badge */}
                    {licenseStatus.valid && loginMode !== 'waiter' && (
                        <div className="mt-8 pt-4 border-t border-gray-100 flex items-center justify-center gap-2">
                            <div className="px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full flex items-center gap-2 text-[10px] lg:text-xs text-emerald-700 font-bold uppercase tracking-wide">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                {licenseStatus.client || 'System Active'}
                                {licenseStatus.daysRemaining && ` (${licenseStatus.daysRemaining} days left)`}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer Credits */}
                <div className="mt-12 text-center relative z-10">
                    <div className="inline-block px-6 py-3 bg-white/40 backdrop-blur-sm rounded-2xl border border-white/40 shadow-sm">
                        <p className="text-xs text-slate-500 font-medium">
                            System developed & maintained by <span className="font-bold text-indigo-600">Jimhawkins Korir</span>
                        </p>
                        <div className="flex items-center justify-center gap-4 mt-2 text-[11px] text-slate-400 font-medium">
                            <span className="flex items-center gap-1 hover:text-indigo-500 transition-colors">📞 0720316175</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            <span className="flex items-center gap-1 hover:text-indigo-500 transition-colors">✉️ jimhaowkins@gmail.com</span>
                        </div>
                        <p className="text-[10px] text-slate-300 mt-2 font-mono">v3.2 • Secure Enterprise Connection</p>
                    </div>
                </div>

            </div>

            <style jsx>{`
                @keyframes blob {
                    0% { transform: translate(0px, 0px) scale(1); }
                    33% { transform: translate(30px, -50px) scale(1.1); }
                    66% { transform: translate(-20px, 20px) scale(0.9); }
                    100% { transform: translate(0px, 0px) scale(1); }
                }
                .animate-blob {
                    animation: blob 7s infinite;
                }
                .animation-delay-2000 {
                    animation-delay: 2s;
                }
                 .animate-fade-in-up {
                    animation: fadeInUp 0.8s ease-out;
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
