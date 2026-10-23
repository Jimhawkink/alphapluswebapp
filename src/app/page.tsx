'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { loginThemes, LoginTheme } from './loginThemes';

const SESSION_TIMEOUT = 30 * 60 * 1000;

// SHA-256 password hashing using Web Crypto API
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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
    const [loginMode, setLoginMode] = useState<'admin' | 'waiter'>('waiter');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [isCapsLockOn, setIsCapsLockOn] = useState(false);
    const [licensedTo, setLicensedTo] = useState('ALPHA PLUS HOTEL & RESTAURANT');
    const [rememberMe, setRememberMe] = useState(true);
    const [themeIndex, setThemeIndex] = useState(0);
    const [isAutoPlaying, setIsAutoPlaying] = useState(true);
    const [currentTime, setCurrentTime] = useState<string>('');
    const [currentDate, setCurrentDate] = useState<string>('');

    // License State
    const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>({ valid: true });
    const [checkingLicense, setCheckingLicense] = useState(true);
    const [licenseKey, setLicenseKey] = useState('');
    const [activatingLicense, setActivatingLicense] = useState(false);

    const theme = loginThemes[themeIndex] || loginThemes[0];

    // Live Clock (EAT Nairobi Time)
    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
            setCurrentDate(now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
        };
        updateClock();
        const timer = setInterval(updateClock, 1000);
        return () => clearInterval(timer);
    }, []);

    // Auto-advance restaurant background scenery every 8 seconds
    useEffect(() => {
        if (!isAutoPlaying) return;
        const interval = setInterval(() => {
            setThemeIndex(prev => (prev + 1) % loginThemes.length);
        }, 8000);
        return () => clearInterval(interval);
    }, [isAutoPlaying]);

    const getMachineId = (): string => {
        let machineId = localStorage.getItem('machine_id');
        if (!machineId) {
            machineId = 'WEB-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
            localStorage.setItem('machine_id', machineId);
        }
        return machineId;
    };

    const checkLicense = async () => {
        setCheckingLicense(true);
        try {
            const machineId = getMachineId();
            const { data, error } = await supabase.from('licenses').select('*').eq('machine_id', machineId).eq('is_active', true).maybeSingle();
            if (error) {
                setLicenseStatus({ valid: true });
                return;
            }
            if (!data) {
                const { data: anyLicense, error: anyError } = await supabase.from('licenses').select('*').is('machine_id', null).eq('is_active', true).limit(1);
                if (!anyError && anyLicense && anyLicense.length > 0) {
                    setLicenseStatus({ valid: false, error: 'License not activated. Please enter your license key.' });
                } else {
                    setLicenseStatus({ valid: true });
                }
            } else {
                const now = new Date();
                const expiryDate = new Date(data.expiry_date);
                const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (now > expiryDate) {
                    setLicenseStatus({ valid: false, expired: true, error: 'License has expired.' });
                } else {
                    setLicenseStatus({ valid: true, type: data.license_type, client: data.client_name, daysRemaining });
                }
            }
        } catch {
            setLicenseStatus({ valid: true });
        } finally {
            setCheckingLicense(false);
        }
    };

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
        const lastActivity = localStorage.getItem('last_activity');
        if (lastActivity) {
            const elapsed = Date.now() - parseInt(lastActivity);
            if (elapsed > SESSION_TIMEOUT) {
                localStorage.removeItem('user');
                localStorage.removeItem('last_activity');
            }
        }
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        events.forEach(event => window.addEventListener(event, resetTimeout));
        return () => { clearTimeout(timeoutId); events.forEach(event => window.removeEventListener(event, resetTimeout)); };
    };

    useEffect(() => {
        const loadCompanyName = async () => {
            try {
                const { data } = await supabase.from('organisation_settings').select('setting_value').eq('setting_key', 'company_name').single();
                if (data?.setting_value) setLicensedTo(data.setting_value);
            } catch {
                console.log('Using default hotel name');
            }
        };
        loadCompanyName();
        checkLicense();
        const saved = localStorage.getItem('login_theme');
        if (saved) {
            const idx = parseInt(saved);
            if (idx >= 0 && idx < loginThemes.length) setThemeIndex(idx);
        }
        const cleanupSession = setupSessionTimeout();
        return () => { cleanupSession(); };
    }, []);

    const switchTheme = (idx: number) => {
        setThemeIndex(idx);
        localStorage.setItem('login_theme', idx.toString());
    };

    const activateLicense = async () => {
        if (!licenseKey.trim()) { setError('Please enter a license key'); return; }
        setActivatingLicense(true); setError('');
        try {
            const machineId = getMachineId();
            const { data: license, error: findError } = await supabase.from('licenses').select('*').eq('license_key', licenseKey.trim().toUpperCase()).single();
            if (findError || !license) { setError('Invalid license key.'); setActivatingLicense(false); return; }
            if (license.machine_id && license.machine_id !== machineId) { setError('License already activated on another device.'); setActivatingLicense(false); return; }
            const now = new Date(); const expiryDate = new Date(license.expiry_date);
            if (now > expiryDate) { setError('This license has expired.'); setActivatingLicense(false); return; }
            const { error: updateError } = await supabase.from('licenses').update({ machine_id: machineId, activation_date: new Date().toISOString() }).eq('license_id', license.license_id);
            if (updateError) { setError('Failed to activate license.'); setActivatingLicense(false); return; }
            await supabase.from('license_activations').insert({ license_id: license.license_id, machine_id: machineId, activation_type: 'activate', success: true });
            await checkLicense(); setLicenseKey('');
        } catch { setError('Activation failed.'); } finally { setActivatingLicense(false); }
    };

    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault(); setIsLoading(true); setError('');
        const trimmedUser = username.trim();
        const trimmedPass = password.trim();
        if (!trimmedUser || !trimmedPass) { setError('Please enter username and password'); setIsLoading(false); return; }
        try {
            const { data, error: dbError } = await supabase.from('users').select('*').ilike('user_name', trimmedUser).eq('active', true).maybeSingle();
            if (dbError) {
                console.error('Login DB Error:', dbError);
                setError(`Connection/DB Error: ${dbError.message}`);
                setIsLoading(false);
                return;
            }
            if (!data) {
                setError('Invalid username or password');
                setIsLoading(false);
                return;
            }
            const hashedPassword = await hashPassword(trimmedPass);
            if (data.password_hash === hashedPassword || data.password_hash === trimmedPass || data.pin === trimmedPass) {
                localStorage.setItem('user', JSON.stringify({ userId: data.user_id, userName: data.user_name, name: data.name, userType: data.user_type, email: data.email, isWaiter: false }));
                router.push('/dashboard');
            } else {
                setError('Invalid username or password');
            }
        } catch { setError('Connection error. Please try again.'); }
        setIsLoading(false);
    };

    const submitWaiterPin = async (pinToVerify: string) => {
        if (pinToVerify.length < 4 || pinToVerify.length > 6) { setError('Please enter your 4 to 6-digit PIN'); return; }
        setIsLoading(true); setError('');
        try {
            const { data, error: dbError } = await supabase
                .from('users')
                .select('*')
                .eq('pin', pinToVerify)
                .eq('active', true)
                .maybeSingle();

            if (dbError || !data) { 
                setError('Invalid PIN. Please check your 6-digit PIN or consult manager.'); 
                setIsLoading(false); 
                setPin(''); 
                setShowPin(false); 
                return; 
            }

            const isWaiter = data.user_type?.toLowerCase().includes('waiter') || data.is_waiter === true || data.user_type === 'Waitress';
            localStorage.setItem('user', JSON.stringify({ 
                userId: data.user_id, 
                userName: data.user_name, 
                name: data.name, 
                userType: data.user_type, 
                email: data.email, 
                isWaiter: isWaiter 
            }));
            router.push('/dashboard/pos');
        } catch { setError('Connection error. Please try again.'); }
        setIsLoading(false);
    };

    const handleWaiterLogin = async () => {
        submitWaiterPin(pin);
    };

    const handlePinInput = (digit: string) => {
        if (pin.length < 6) {
            const nextPin = pin + digit;
            setPin(nextPin);
            setError('');
            if (nextPin.length === 6) {
                setTimeout(() => {
                    submitWaiterPin(nextPin);
                }, 120);
            }
        }
    };
    const handlePinClear = () => { setPin(''); setError(''); setShowPin(false); };

    // Support physical numpad / keyboard typing in Waiter Quick PIN mode
    useEffect(() => {
        if (loginMode !== 'waiter') return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                handlePinInput(e.key);
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                setPin(prev => prev.slice(0, -1));
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handlePinClear();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (pin.length === 6) {
                    submitWaiterPin(pin);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [loginMode, pin]);

    // Fast-Fill Helper for Demo / Testing
    const handleFastFillAdmin = () => {
        setUsername('admin');
        setPassword('admin123');
        setError('');
    };

    const handleFastFillWaiter = () => {
        setPin('123456');
        setError('');
        setTimeout(() => {
            submitWaiterPin('123456');
        }, 120);
    };

    // Keyboard Caps Lock Handler
    const handleKeyEvent = (e: React.KeyboardEvent) => {
        if (e.getModifierState) {
            setIsCapsLockOn(e.getModifierState('CapsLock'));
        }
    };

    return (
        <div className="relative min-h-screen h-screen w-full flex flex-col lg:flex-row font-sans overflow-hidden bg-slate-950 text-slate-100">

            {/* ===== LEFT PANEL: REAL RESTAURANT SHOWCASE CAROUSEL ===== */}
            <div
                onMouseEnter={() => setIsAutoPlaying(false)}
                onMouseLeave={() => setIsAutoPlaying(true)}
                className="hidden lg:flex lg:w-7/12 relative overflow-hidden flex-col justify-between p-8 xl:p-12 select-none h-full"
            >
                {/* Background Image with Smooth Crossfade & Ken Burns Zoom */}
                {loginThemes.map((t, idx) => (
                    <div
                        key={t.id}
                        style={{
                            backgroundImage: `url('${t.bgImage}')`,
                            transition: 'opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1), transform 12s ease-out',
                            opacity: themeIndex === idx ? 1 : 0,
                            transform: themeIndex === idx ? 'scale(1.04)' : 'scale(1.0)',
                            zIndex: themeIndex === idx ? 1 : 0
                        }}
                        className="absolute inset-0 bg-cover bg-center"
                    />
                ))}

                {/* Gradient Overlays for High-Contrast Luxury Readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-900/40 z-[2]" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-950/30 to-slate-950 z-[2]" />

                {/* Top Brand & Clock Bar */}
                <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-2xl shadow-xl shadow-black/40">
                            🍷
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-white uppercase drop-shadow-md">
                                {licensedTo}
                            </h1>
                            <p className="text-xs text-amber-300 font-semibold tracking-wider uppercase">
                                World-Class Hotel & Culinary POS Suite
                            </p>
                        </div>
                    </div>

                    {/* Live EAT Clock & Status Badge */}
                    <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <div>
                            <span className="font-mono font-bold text-white">{currentTime || '12:00:00 PM'}</span>
                            <span className="text-[10px] text-gray-400 ml-1.5 font-medium">{currentDate}</span>
                        </div>
                    </div>
                </div>

                {/* Center Showcase: Tagline & Active Restaurant Features */}
                <div className="relative z-10 max-w-xl my-auto space-y-6">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-bold uppercase tracking-widest backdrop-blur-md">
                        <span>⭐</span>
                        <span>Authentic 5-Star Restaurant Photography</span>
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-4xl xl:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-lg">
                            {theme.name.replace(/[^\w\s]/gi, '').trim() || 'Culinary Excellence'}
                        </h2>
                        <p className="text-lg text-slate-200 font-light leading-relaxed drop-shadow">
                            {theme.tagline}
                        </p>
                    </div>

                    {/* Feature Cards with Glassmorphism */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                        {theme.features.map((feat, i) => (
                            <div
                                key={i}
                                className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 hover:bg-white/15 transition-all shadow-lg space-y-1"
                            >
                                <div className="text-2xl mb-1">{feat.icon}</div>
                                <h4 className="text-xs font-bold text-white">{feat.label}</h4>
                                {feat.desc && (
                                    <p className="text-[11px] text-slate-300 font-normal leading-snug">{feat.desc}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom Scenery Selector Pills */}
                <div className="relative z-10 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider">
                        <span>Real Restaurant Atmospheres:</span>
                        <span className="text-[10px] text-amber-300/80">Click any atmosphere to switch</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {loginThemes.map((t, idx) => (
                            <button
                                key={t.id}
                                onClick={() => switchTheme(idx)}
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 backdrop-blur-md border ${
                                    themeIndex === idx
                                        ? 'bg-white text-slate-950 border-white shadow-xl scale-105'
                                        : 'bg-black/40 text-slate-300 border-white/10 hover:bg-white/15 hover:text-white'
                                }`}
                            >
                                <span>{t.name}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-white/10 text-[11px] text-slate-400">
                        <span>© 2026 AlphaPlus Hospitality POS</span>
                        <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            Hardware Spooler & KOT Active
                        </span>
                    </div>
                </div>
            </div>

            {/* ===== RIGHT PANEL: ULTRA-PREMIUM LOGIN CARD ===== */}
            <div className="w-full lg:w-5/12 h-screen max-h-screen flex flex-col justify-between p-4 sm:p-6 lg:p-8 xl:p-10 relative z-20 bg-slate-900/90 backdrop-blur-2xl border-l border-white/10 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">

                {/* Top Terminal Status */}
                <div className="flex items-center justify-between text-xs text-slate-400 mb-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="font-bold text-slate-300">Terminal Node 01</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-slate-300 font-mono">
                        v3.2 PRO
                    </span>
                </div>

                {/* Main Auth Container */}
                <div className="max-w-md w-full mx-auto space-y-4 my-auto shrink-0">

                    {/* Logo & Welcome Title */}
                    <div className="text-center space-y-1">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 p-0.5 shadow-xl mx-auto flex items-center justify-center">
                            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-2xl">
                                🍽️
                            </div>
                        </div>

                        <div>
                            <h2 className="text-2xl font-black text-white tracking-tight">
                                Staff Portal
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Sign in to your restaurant station or waiter handheld
                            </p>
                        </div>
                    </div>

                    {/* Station Selector: Waiter Quick PIN vs Manager/Cashier */}
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-950/80 border border-white/10 shadow-inner">
                        <button
                            type="button"
                            onClick={() => { setLoginMode('waiter'); setError(''); setUsername(''); setPassword(''); }}
                            className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                                loginMode === 'waiter'
                                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <span>🧑‍🍳</span>
                            <span>Waiter Quick PIN</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => { setLoginMode('admin'); setError(''); setPin(''); }}
                            className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                                loginMode === 'admin'
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <span>🛡️</span>
                            <span>Manager / Cashier</span>
                        </button>
                    </div>

                    {/* License Expiry Warning (if any) */}
                    {!checkingLicense && !licenseStatus.valid && (
                        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs space-y-2">
                            <p className="font-bold text-amber-300">⚠️ {licenseStatus.error || 'Activation Required'}</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={licenseKey}
                                    onChange={e => setLicenseKey(e.target.value.toUpperCase())}
                                    placeholder="ENTER KEY: APS-XXXX..."
                                    style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff', caretColor: '#ffffff' }}
                                    className="login-input flex-1 px-3 py-2 bg-slate-950 border border-amber-400/40 rounded-xl font-mono text-xs text-white uppercase focus:outline-none caret-white"
                                />
                                <button
                                    onClick={activateLicense}
                                    disabled={activatingLicense}
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-colors"
                                >
                                    {activatingLicense ? '...' : 'Activate'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* MODE 1: MANAGER & ADMIN CREDENTIALS */}
                    {loginMode === 'admin' && (
                        <form onSubmit={handleAdminLogin} className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                                        Username or Staff ID
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleFastFillAdmin}
                                        className="text-[10px] text-blue-400 font-bold hover:underline"
                                    >
                                        ⚡ Fast Fill: admin
                                    </button>
                                </div>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">👤</span>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={e => setUsername(e.target.value)}
                                        placeholder="admin or manager"
                                        required
                                        style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff', caretColor: '#ffffff' }}
                                        className="login-input w-full pl-10 pr-4 py-3 bg-slate-950/70 border border-white/10 rounded-xl text-sm text-white font-medium placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all caret-white"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                                        Master Password
                                    </label>
                                    {isCapsLockOn && (
                                        <span className="text-[10px] text-amber-400 font-bold animate-pulse">
                                            ⚠️ CAPS LOCK IS ON
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔒</span>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        onKeyDown={handleKeyEvent}
                                        onKeyUp={handleKeyEvent}
                                        placeholder="••••••••••••"
                                        required
                                        style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff', caretColor: '#ffffff' }}
                                        className="login-input w-full pl-10 pr-11 py-3 bg-slate-950/70 border border-white/10 rounded-xl text-sm text-white font-medium placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-mono caret-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 text-sm"
                                        title={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? '👁️' : '👁️‍🗨️'}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-xs pt-1">
                                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={e => setRememberMe(e.target.checked)}
                                        className="w-4 h-4 rounded bg-slate-950 border-white/20 text-blue-600 focus:ring-0"
                                    />
                                    <span>Remember this terminal</span>
                                </label>
                                <a href="#help" onClick={() => toast.success('Please contact your Hotel System Administrator')} className="text-blue-400 hover:underline">
                                    Forgot password?
                                </a>
                            </div>

                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs font-bold animate-shake flex items-center gap-2">
                                    <span>⚠️</span>
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-sm font-black tracking-wide shadow-xl shadow-blue-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>Authenticating Staff...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Enter POS Dashboard</span>
                                        <span>→</span>
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {/* MODE 2: WAITER QUICK PIN TOUCHPAD */}
                    {loginMode === 'waiter' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-slate-300 font-bold uppercase tracking-wider">
                                    Enter 6-Digit Server PIN
                                </p>
                                <button
                                    type="button"
                                    onClick={handleFastFillWaiter}
                                    className="text-[10px] text-amber-400 font-bold hover:underline"
                                >
                                    ⚡ Fast Fill: 123456
                                </button>
                            </div>

                            {/* PIN Display Slots */}
                            <div className="flex justify-center gap-1.5 sm:gap-2 my-1">
                                {[0, 1, 2, 3, 4, 5].map(i => (
                                    <div
                                        key={i}
                                        className={`w-10 h-11 sm:w-11 sm:h-12 rounded-xl border-2 flex items-center justify-center text-lg font-mono font-black transition-all ${
                                            pin[i]
                                                ? 'border-amber-400 bg-amber-500/20 text-amber-300 shadow-md shadow-amber-500/20 scale-105'
                                                : 'border-white/10 bg-slate-950/80 text-slate-600'
                                        }`}
                                    >
                                        {pin[i] ? (showPin ? pin[i] : '●') : '○'}
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setShowPin(!showPin)}
                                    className="text-[10px] text-slate-400 hover:text-white"
                                >
                                    {showPin ? 'Hide PIN' : 'Reveal PIN digits'}
                                </button>
                            </div>

                            {error && (
                                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs font-bold animate-shake text-center">
                                    ⚠️ {error}
                                </div>
                            )}

                            {/* Touchpad 3x4 Grid */}
                            <div className="grid grid-cols-3 gap-1.5 max-w-xs mx-auto pt-0.5">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                    <button
                                        key={num}
                                        type="button"
                                        onClick={() => handlePinInput(num.toString())}
                                        className="h-11 sm:h-12 rounded-xl bg-white/5 hover:bg-white/15 active:bg-amber-500 active:text-white border border-white/10 text-lg font-bold text-white transition-all shadow-sm flex items-center justify-center font-mono"
                                    >
                                        {num}
                                    </button>
                                ))}

                                <button
                                    type="button"
                                    onClick={handlePinClear}
                                    className="h-11 sm:h-12 rounded-xl bg-red-500/10 hover:bg-red-500/20 active:bg-red-500 active:text-white border border-red-500/20 text-red-400 font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1"
                                    title="Clear PIN"
                                >
                                    <span>⌫</span>
                                    <span>Clear</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handlePinInput('0')}
                                    className="h-11 sm:h-12 rounded-xl bg-white/5 hover:bg-white/15 active:bg-amber-500 border border-white/10 text-lg font-bold text-white transition-all shadow-sm flex items-center justify-center font-mono"
                                >
                                    0
                                </button>

                                <button
                                    type="button"
                                    onClick={handleWaiterLogin}
                                    disabled={isLoading || pin.length < 4}
                                    className="h-11 sm:h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs sm:text-sm tracking-wide transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-1 disabled:opacity-40"
                                >
                                    {isLoading ? (
                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <span>Enter</span>
                                            <span>→</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Security Badges */}
                <div className="pt-3 border-t border-white/10 text-center space-y-1 mt-3 shrink-0">
                    <div className="flex items-center justify-center gap-3 text-[10px] text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                            <span>🔒</span> 256-Bit SSL Encrypted
                        </span>
                        <span>•</span>
                        <span>Nairobi Cloud Region</span>
                        <span>•</span>
                        <span className="text-amber-300 font-semibold">{licensedTo}</span>
                    </div>

                    <p className="text-[9px] text-slate-500">
                        AlphaPlus Restaurant & Hotel Management System • Built for high-volume service
                    </p>
                </div>
            </div>
        </div>
    );
}
