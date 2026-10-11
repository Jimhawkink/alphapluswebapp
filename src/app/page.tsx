'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
    const [loginMode, setLoginMode] = useState<'admin' | 'waiter'>('admin');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [licensedTo, setLicensedTo] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [themeIndex, setThemeIndex] = useState(0);
    const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>({ valid: true });
    const [checkingLicense, setCheckingLicense] = useState(true);
    const [licenseKey, setLicenseKey] = useState('');
    const [activatingLicense, setActivatingLicense] = useState(false);

    const theme = loginThemes[themeIndex];

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
                console.log('License table check skipped:', error.message);
                setLicenseStatus({ valid: true });
                return;
            }
            if (!data) {
                const { data: anyLicense, error: anyError } = await supabase.from('licenses').select('*').is('machine_id', null).eq('is_active', true).limit(1);
                if (!anyError && anyLicense && anyLicense.length > 0) {
                    setLicenseStatus({ valid: false, error: 'License not activated. Please enter your license key.' });
                } else if (!anyError) {
                    setLicenseStatus({ valid: false, error: 'No valid license found.' });
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
        } catch (err) {
            console.log('License check failed, allowing access');
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
            } catch (err) { console.log('Could not load company name'); }
        };
        loadCompanyName();
        checkLicense();
        const saved = localStorage.getItem('login_theme');
        if (saved) { const idx = parseInt(saved); if (idx >= 0 && idx < loginThemes.length) setThemeIndex(idx); }
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
        } catch (err) { console.error('License activation error:', err); setError('Activation failed.'); } finally { setActivatingLicense(false); }
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
        } catch (err) { console.error('Login error:', err); setError('Connection error. Please try again.'); }
        setIsLoading(false);
    };

    const handleWaiterLogin = async () => {
        if (pin.length !== 6) { setError('Please enter 6-digit PIN'); return; }
        setIsLoading(true); setError('');
        try {
            const { data, error: dbError } = await supabase.from('users').select('*').eq('pin', pin).eq('active', true).eq('user_type', 'Waiter').maybeSingle();
            if (dbError || !data) { setError('Invalid PIN'); setIsLoading(false); setPin(''); setShowPin(false); return; }
            localStorage.setItem('user', JSON.stringify({ userId: data.user_id, userName: data.user_name, name: data.name, userType: data.user_type, email: data.email, isWaiter: true }));
            router.push('/dashboard/pos');
        } catch (err) { console.error('Login error:', err); setError('Connection error. Please try again.'); }
        setIsLoading(false);
    };

    const handlePinInput = (digit: string) => { if (pin.length < 6) { setPin(pin + digit); setError(''); } };
    const handlePinClear = () => { setPin(''); setError(''); setShowPin(false); };

    // SVG Icons
    const UserIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.inputIconColor} strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
    const LockIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.inputIconColor} strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
    const EyeOffIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.inputIconColor} strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>);
    const EyeIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.inputIconColor} strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);
    const CheckIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>);

    return (
        <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", overflow: 'hidden' }}>
            {/* ===== LEFT PANEL ===== */}
            <div className="login-left-hide" style={{ width: '50%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${theme.bgImage}')`, backgroundSize: 'cover', backgroundPosition: 'center', transform: 'scale(1.05)', animation: 'loginBgPan 25s ease-in-out infinite alternate' }}></div>
                <div style={{ position: 'absolute', inset: 0, background: theme.overlayGradient, zIndex: 1 }}></div>

                <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '2rem', maxWidth: '380px' }}>
                    {/* Diamond logo */}
                    <div style={{ width: '72px', height: '72px', background: 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08))', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.2rem auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
                        <span style={{ fontSize: '2.2rem' }}>💎</span>
                    </div>

                    <h1 style={{ fontFamily: theme.brandTitleFont, fontSize: '2.4rem', fontWeight: 700, color: 'white', textShadow: '0 2px 16px rgba(0,0,0,0.25)', marginBottom: '0.3rem', letterSpacing: '-0.01em' }}>Alpha Plus{theme.id === 'pool-paradise' ? '' : ' Hotel'}</h1>
                    {theme.brandSubtitle && <p style={{ fontSize: '0.95rem', color: 'rgba(255,220,160,0.9)', fontWeight: 300, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '2rem', whiteSpace: 'pre-line' }}>{theme.brandSubtitle}</p>}

                    {/* Feature cards */}
                    {theme.features.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: theme.features.length <= 2 ? 'row' : 'column', gap: '0.7rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                            {theme.features.map((f, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.8rem 1.1rem', background: theme.featureCardBg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${theme.featureCardBorder}`, borderRadius: '14px', cursor: 'default' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: f.iconBg, border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0 }}>
                                        <span style={{ fontSize: '1.1rem' }}>{f.icon}</span>
                                    </div>
                                    <span style={{ color: 'white', fontWeight: 600, fontSize: '0.88rem' }}>{f.label}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {licensedTo && (
                        <div style={{ marginTop: '1.8rem', paddingTop: '1.2rem', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                            <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,200,120,0.8)', marginBottom: '0.2rem' }}>LICENSED TO</p>
                            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>{licensedTo}</p>
                        </div>
                    )}
                </div>

                <div style={{ position: 'absolute', bottom: '1.5rem', left: 0, right: 0, textAlign: 'center', fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', zIndex: 10 }}>&copy; 2026 Alpha Solutions. All rights reserved.</div>
            </div>

            {/* ===== RIGHT PANEL ===== */}
            <div className="login-right-full" style={{ width: '50%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem 3rem', position: 'relative', background: theme.rightBg, overflow: 'hidden' }}>
                {/* Theme Switcher */}
                <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.4rem', zIndex: 20, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', padding: '0.35rem', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                    {loginThemes.map((t, i) => (
                        <button key={t.id} onClick={() => switchTheme(i)} title={t.name} style={{ width: '32px', height: '32px', borderRadius: '8px', border: themeIndex === i ? `2px solid ${t.accentColor}` : '2px solid transparent', background: themeIndex === i ? 'white' : 'transparent', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', boxShadow: themeIndex === i ? '0 2px 8px rgba(0,0,0,0.1)' : 'none' }}>
                            {t.name.split(' ')[0]}
                        </button>
                    ))}
                </div>

                {/* Mobile header */}
                <div className="login-mobile-show" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ width: '50px', height: '50px', background: theme.signInGradient, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.6rem', boxShadow: `0 4px 16px ${theme.signInShadow}` }}>
                        <span style={{ fontSize: '1.6rem' }}>💎</span>
                    </div>
                    <h2 style={{ fontFamily: theme.brandTitleFont, fontSize: '1.4rem', fontWeight: 700, color: theme.titleColor }}>Alpha Plus Hotel</h2>
                </div>

                <div style={{ width: '100%', maxWidth: '400px', position: 'relative', zIndex: 10 }}>
                    {/* License Warning */}
                    {!checkingLicense && !licenseStatus.valid && (
                        <div style={{ marginBottom: '1rem', padding: '0.9rem', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '12px' }}>
                            <p style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 700, marginBottom: '0.5rem' }}>⚠️ {licenseStatus.error || 'Activation Required'}</p>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input type="text" value={licenseKey} onChange={(e) => setLicenseKey(e.target.value.toUpperCase())} placeholder="Enter Key: APS-XXXX..." style={{ flex: 1, padding: '0.5rem 0.7rem', fontSize: '0.8rem', border: '1px solid #fbbf24', borderRadius: '8px', outline: 'none', fontFamily: 'monospace', textTransform: 'uppercase', background: 'white', color: '#1e293b' }} />
                                <button onClick={activateLicense} disabled={activatingLicense} style={{ padding: '0.5rem 1rem', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>{activatingLicense ? '...' : 'Activate'}</button>
                            </div>
                        </div>
                    )}

                    {/* Logo for theme 1 (luxury-lobby) */}
                    {theme.id === 'luxury-lobby' && (
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ fontSize: '1.8rem', marginBottom: '0.2rem', display: 'inline-block', animation: 'loginFloat 3s ease-in-out infinite' }}>💎</div>
                            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#4a5568', letterSpacing: '0.02em' }}>Alpha Plus Hotel</div>
                        </div>
                    )}

                    {/* Tabs */}
                    <div style={{ display: 'flex', background: theme.tabBg, borderRadius: '14px', padding: '4px', marginBottom: '1.5rem', border: `1px solid ${theme.tabBorder}` }}>
                        <button onClick={() => { setLoginMode('admin'); setError(''); setPin(''); }} style={{ flex: 1, padding: '0.7rem 0.8rem', border: 'none', borderRadius: '10px', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: loginMode === 'admin' ? theme.tabActiveColor : theme.tabInactiveColor, background: loginMode === 'admin' ? theme.tabActiveBg : 'transparent', fontFamily: "'Inter', sans-serif", transition: 'all 0.25s ease', boxShadow: loginMode === 'admin' ? '0 2px 10px rgba(0,0,0,0.08)' : 'none' }}>
                            <span>{theme.id === 'golden-premium' ? '👨‍💼' : '🏢'}</span> {theme.adminLabel}
                        </button>
                        <button onClick={() => { setLoginMode('waiter'); setError(''); setUsername(''); setPassword(''); }} style={{ flex: 1, padding: '0.7rem 0.8rem', border: 'none', borderRadius: '10px', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: loginMode === 'waiter' ? theme.tabActiveColor : theme.tabInactiveColor, background: loginMode === 'waiter' ? theme.tabActiveBg : 'transparent', fontFamily: "'Inter', sans-serif", transition: 'all 0.25s ease', boxShadow: loginMode === 'waiter' ? '0 2px 10px rgba(0,0,0,0.08)' : 'none' }}>
                            <span>{theme.id === 'golden-premium' ? '🧑‍🍳' : '🍽️'}</span> {theme.waiterLabel}
                        </button>
                    </div>

                    {/* ADMIN LOGIN */}
                    {loginMode === 'admin' && (
                        <div style={{ animation: 'fadeInUp 0.4s ease-out' }}>
                            <h2 style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 800, color: theme.titleColor, marginBottom: '0.3rem' }}>Welcome Back! {theme.welcomeEmoji}</h2>
                            {theme.welcomeSubtext && <p style={{ textAlign: 'center', fontSize: '0.88rem', color: theme.subtitleColor, marginBottom: '1.8rem' }}>{theme.welcomeSubtext}</p>}
                            {!theme.welcomeSubtext && <div style={{ marginBottom: '1.5rem' }} />}

                            <form onSubmit={handleAdminLogin}>
                                <div style={{ marginBottom: '1.1rem' }}>
                                    {theme.showLabels && <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: theme.labelColor, marginBottom: '0.35rem', marginLeft: '0.15rem' }}>Username</label>}
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                        <span style={{ position: 'absolute', left: '0.9rem', zIndex: 2, pointerEvents: 'none', display: 'flex' }}><UserIcon /></span>
                                        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={theme.showLabels ? "e.g., john.doe" : "Username or Email Address"} style={{ width: '100%', padding: '0.85rem 0.9rem 0.85rem 2.8rem', background: theme.inputBg, border: `1.5px solid ${theme.inputBorder}`, borderRadius: '12px', fontSize: '0.9rem', fontFamily: "'Inter', sans-serif", color: '#1e293b', outline: 'none', transition: 'all 0.25s ease' }} onFocus={(e) => { e.target.style.borderColor = theme.inputFocusBorder; e.target.style.boxShadow = `0 0 0 3px ${theme.inputFocusShadow}`; }} onBlur={(e) => { e.target.style.borderColor = theme.inputBorder; e.target.style.boxShadow = 'none'; }} />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '1.1rem' }}>
                                    {theme.showLabels && <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: theme.labelColor, marginBottom: '0.35rem', marginLeft: '0.15rem' }}>Password</label>}
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                        <span style={{ position: 'absolute', left: '0.9rem', zIndex: 2, pointerEvents: 'none', display: 'flex' }}><LockIcon /></span>
                                        <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={{ width: '100%', padding: '0.85rem 2.8rem 0.85rem 2.8rem', background: theme.inputBg, border: `1.5px solid ${theme.inputBorder}`, borderRadius: '12px', fontSize: '0.9rem', fontFamily: "'Inter', sans-serif", color: '#1e293b', outline: 'none', transition: 'all 0.25s ease' }} onFocus={(e) => { e.target.style.borderColor = theme.inputFocusBorder; e.target.style.boxShadow = `0 0 0 3px ${theme.inputFocusShadow}`; }} onBlur={(e) => { e.target.style.borderColor = theme.inputBorder; e.target.style.boxShadow = 'none'; }} />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '0.7rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', zIndex: 2, display: 'flex' }}>{showPassword ? <EyeIcon /> : <EyeOffIcon />}</button>
                                    </div>
                                </div>

                                {/* Remember me + Forgot password */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.3rem' }}>
                                    <div onClick={() => setRememberMe(!rememberMe)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                                        {theme.rememberStyle === 'checkbox' ? (
                                            <div style={{ width: '18px', height: '18px', borderRadius: '5px', background: rememberMe ? theme.rememberColor : 'transparent', border: rememberMe ? 'none' : `2px solid ${theme.inputBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                                                {rememberMe && <CheckIcon />}
                                            </div>
                                        ) : (
                                            <div style={{ width: '38px', height: '22px', background: rememberMe ? `linear-gradient(135deg, ${theme.rememberColor}, ${theme.rememberColor})` : '#d1d5db', borderRadius: '11px', position: 'relative', transition: 'all 0.3s ease' }}>
                                                <div style={{ position: 'absolute', top: '3px', left: rememberMe ? '19px' : '3px', width: '16px', height: '16px', background: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'all 0.3s ease' }}></div>
                                            </div>
                                        )}
                                        <span style={{ fontSize: '0.82rem', color: theme.labelColor, fontWeight: 500 }}>Remember me</span>
                                    </div>
                                    {theme.showForgotPassword && <a style={{ fontSize: '0.82rem', color: theme.accentColor, fontWeight: 500, textDecoration: 'none', cursor: 'pointer' }}>Forgot password?</a>}
                                </div>

                                {error && <div style={{ padding: '0.6rem 0.9rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', fontSize: '0.82rem', color: '#dc2626', fontWeight: 500, marginBottom: '0.8rem', animation: 'loginShake 0.4s ease' }}>⚠️ {error}</div>}

                                <button type="submit" disabled={isLoading} style={{ width: '100%', padding: '0.9rem', background: theme.signInGradient, color: 'white', border: 'none', borderRadius: '14px', fontSize: '1rem', fontWeight: 700, fontFamily: "'Inter', sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', boxShadow: `0 4px 20px ${theme.signInShadow}`, letterSpacing: '0.02em', transition: 'all 0.25s ease' }}>
                                    {isLoading ? <div style={{ width: '20px', height: '20px', border: '3px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'loginSpinAnim 0.7s linear infinite' }}></div> : <span>Sign In →</span>}
                                </button>
                            </form>

                            <p style={{ textAlign: 'center', marginTop: '1.2rem', fontSize: '0.72rem', color: theme.subtitleColor, fontWeight: 500 }}>{theme.securityText}</p>
                        </div>
                    )}

                    {/* WAITER LOGIN */}
                    {loginMode === 'waiter' && (
                        <div style={{ animation: 'fadeInUp 0.4s ease-out' }}>
                            <h2 style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 800, color: theme.titleColor, marginBottom: '0.3rem' }}>Waiter Access 🧑‍🍳</h2>
                            <p style={{ textAlign: 'center', color: theme.subtitleColor, fontSize: '0.9rem', marginBottom: '1.5rem' }}>Enter your 6-digit PIN</p>

                            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} style={{ width: '40px', height: '48px', border: `2px solid ${pin[i] ? theme.accentColor : theme.inputBorder}`, borderRadius: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 700, color: pin[i] ? theme.titleColor : theme.inputIconColor, background: pin[i] ? `${theme.inputBg}` : theme.inputBg, boxShadow: pin[i] ? `0 2px 8px ${theme.inputFocusShadow}` : 'none', transform: pin[i] ? 'translateY(-2px)' : 'none', transition: 'all 0.2s' }}>
                                        {pin[i] ? (showPin ? pin[i] : '●') : '○'}
                                    </div>
                                ))}
                            </div>

                            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                                <button onClick={() => setShowPin(!showPin)} style={{ background: 'none', border: 'none', fontSize: '0.72rem', color: theme.subtitleColor, cursor: 'pointer', fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>{showPin ? 'Hide PIN' : 'Show PIN'}</button>
                            </div>

                            {error && <div style={{ padding: '0.6rem 0.9rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', fontSize: '0.82rem', color: '#dc2626', fontWeight: 500, marginBottom: '0.8rem', animation: 'loginShake 0.4s ease' }}>⚠️ {error}</div>}

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', maxWidth: '260px', margin: '0 auto' }}>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                    <button key={num} onClick={() => handlePinInput(num.toString())} style={{ height: '52px', border: `1.5px solid ${theme.inputBorder}`, borderRadius: '12px', background: 'white', fontSize: '1.3rem', fontWeight: 700, color: theme.titleColor, cursor: 'pointer', fontFamily: "'Inter', sans-serif", transition: 'all 0.2s ease' }}>{num}</button>
                                ))}
                                <button onClick={handlePinClear} style={{ height: '52px', border: '1.5px solid #fecaca', borderRadius: '12px', background: '#fef2f2', fontSize: '1.3rem', fontWeight: 700, color: '#ef4444', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>⌫</button>
                                <button onClick={() => handlePinInput('0')} style={{ height: '52px', border: `1.5px solid ${theme.inputBorder}`, borderRadius: '12px', background: 'white', fontSize: '1.3rem', fontWeight: 700, color: theme.titleColor, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>0</button>
                                <button onClick={handleWaiterLogin} disabled={isLoading || pin.length !== 6} style={{ height: '52px', border: 'none', borderRadius: '12px', background: theme.signInGradient, fontSize: '1.3rem', fontWeight: 700, color: 'white', cursor: 'pointer', fontFamily: "'Inter', sans-serif", boxShadow: `0 4px 14px ${theme.signInShadow}` }}>{isLoading ? '...' : '✓'}</button>
                            </div>
                        </div>
                    )}

                    {/* License Badge */}
                    {licenseStatus.valid && loginMode !== 'waiter' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '1.2rem', padding: '0.5rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '999px', fontSize: '0.7rem', color: '#15803d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            <span style={{ width: '7px', height: '7px', background: '#22c55e', borderRadius: '50%', display: 'inline-block' }}></span>
                            {licenseStatus.client || 'System Active'}{licenseStatus.daysRemaining && ` (${licenseStatus.daysRemaining} days left)`}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ marginTop: '2rem', textAlign: 'center', position: 'relative', zIndex: 10 }}>
                    <div style={{ display: 'inline-block', padding: '0.7rem 1.4rem', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(6px)', borderRadius: '14px', border: '1px solid rgba(0,0,0,0.04)' }}>
                        <p style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 500 }}>System developed & maintained by <strong style={{ color: theme.footerAccentColor }}>Jimhawkins Korir</strong></p>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginTop: '0.3rem', fontSize: '0.65rem', color: '#a0aec0', fontWeight: 500 }}>
                            <span>📞 0720316175</span>
                            <span style={{ width: 3, height: 3, background: '#a0aec0', borderRadius: '50%', display: 'inline-block' }}></span>
                            <span>✉️ jimhaowkins@gmail.com</span>
                        </div>
                        <p style={{ fontSize: '0.6rem', color: '#c4cdd8', marginTop: '0.3rem', fontFamily: 'monospace' }}>v3.2 • Secure Enterprise Connection</p>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Playfair+Display:wght@400;500;600;700&display=swap');
                .login-root-styles * { box-sizing: border-box; }
                body { margin: 0; padding: 0; }
                @media (max-width: 1023px) {
                    .login-left-hide { display: none !important; }
                    .login-right-full { width: 100% !important; }
                    .login-mobile-show { display: flex !important; }
                }
                @keyframes loginBgPan { 0% { transform: scale(1.05); } 100% { transform: scale(1.12); } }
                @keyframes loginSpinAnim { to { transform: rotate(360deg); } }
                @keyframes loginShake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes loginFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
            `}</style>
        </div>
    );
}
