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
    const [rememberMe, setRememberMe] = useState(false);
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
        <div className="login-page-root">
            {/* LEFT SIDE: BRANDING & ATMOSPHERE */}
            <div className="login-left-panel">
                {/* Luxury Hotel Lobby Background */}
                <div className="login-bg-image"></div>
                {/* Warm overlay */}
                <div className="login-bg-overlay"></div>
                {/* Floating golden particles */}
                <div className="login-particles">
                    {[...Array(20)].map((_, i) => (
                        <div key={i} className="login-particle" style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 5}s`,
                            animationDuration: `${3 + Math.random() * 4}s`,
                        }}></div>
                    ))}
                </div>

                {/* Branding Content */}
                <div className="login-brand-content">
                    {/* Diamond Logo */}
                    <div className="login-logo-wrapper">
                        <div className="login-logo-icon">
                            <span>💎</span>
                        </div>
                    </div>

                    <h1 className="login-brand-title">Alpha Plus Hotel</h1>
                    <p className="login-brand-subtitle">Premium Hotel Management</p>

                    {/* Feature Cards */}
                    <div className="login-features">
                        <div className="login-feature-card">
                            <div className="login-feature-icon">⚡</div>
                            <div className="login-feature-text">
                                <span className="login-feature-title">Lightning Fast</span>
                            </div>
                        </div>
                        <div className="login-feature-card">
                            <div className="login-feature-icon">🛡️</div>
                            <div className="login-feature-text">
                                <span className="login-feature-title">Enterprise Security</span>
                            </div>
                        </div>
                        <div className="login-feature-card">
                            <div className="login-feature-icon">📊</div>
                            <div className="login-feature-text">
                                <span className="login-feature-title">Smart Analytics</span>
                            </div>
                        </div>
                    </div>

                    {licensedTo && (
                        <div className="login-licensed-to">
                            <p className="login-licensed-label">Licensed To</p>
                            <p className="login-licensed-name">{licensedTo}</p>
                        </div>
                    )}
                </div>

                <div className="login-left-footer">
                    &copy; 2026 Alpha Solutions. All rights reserved.
                </div>
            </div>

            {/* RIGHT SIDE: LOGIN FORM */}
            <div className="login-right-panel">
                {/* Decorative dotted pattern */}
                <div className="login-dots-pattern"></div>

                {/* Mobile Header */}
                <div className="login-mobile-header">
                    <div className="login-mobile-logo">
                        <span>💎</span>
                    </div>
                    <h2 className="login-mobile-title">Alpha Plus Hotel</h2>
                    <p className="login-mobile-subtitle">Premium Hotel Management</p>
                </div>

                <div className="login-form-container">
                    {/* License Warning */}
                    {!checkingLicense && !licenseStatus.valid && (
                        <div className="login-license-warning">
                            <p className="login-license-warning-text">
                                <span>⚠️</span> {licenseStatus.error || 'Activation Required'}
                            </p>
                            <div className="login-license-input-row">
                                <input
                                    type="text"
                                    value={licenseKey}
                                    onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                                    placeholder="Enter Key: APS-XXXX..."
                                    className="login-license-input"
                                />
                                <button
                                    onClick={activateLicense}
                                    disabled={activatingLicense}
                                    className="login-license-btn"
                                >
                                    {activatingLicense ? '...' : 'Activate'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TABS */}
                    <div className="login-tabs">
                        <button
                            onClick={() => { setLoginMode('admin'); setError(''); setPin(''); }}
                            className={`login-tab ${loginMode === 'admin' ? 'login-tab-active' : ''}`}
                        >
                            <span className="login-tab-emoji">👨‍💼</span> Admin
                        </button>
                        <button
                            onClick={() => { setLoginMode('waiter'); setError(''); setUsername(''); setPassword(''); }}
                            className={`login-tab ${loginMode === 'waiter' ? 'login-tab-active' : ''}`}
                        >
                            <span className="login-tab-emoji">🧑‍🍳</span> Waiter
                        </button>
                    </div>

                    {/* ADMIN FORM */}
                    {loginMode === 'admin' && (
                        <div className="login-form-inner">
                            <div className="login-welcome">
                                <h2>Welcome Back! <span>👋</span><span className="login-sparkle">✨</span></h2>
                            </div>

                            <form onSubmit={handleAdminLogin} className="login-form-fields">
                                <div className="login-field-group">
                                    <label className="login-field-label">Username</label>
                                    <div className="login-input-wrapper">
                                        <span className="login-input-icon">👤</span>
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="login-input"
                                            placeholder="e.g., john.doe"
                                        />
                                    </div>
                                </div>

                                <div className="login-field-group">
                                    <label className="login-field-label">Password</label>
                                    <div className="login-input-wrapper">
                                        <span className="login-input-icon">🔒</span>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="login-input"
                                            placeholder="••••••••"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="login-eye-btn"
                                        >
                                            {showPassword ? '🙈' : '👁️'}
                                        </button>
                                    </div>
                                </div>

                                {/* Remember Me */}
                                <div className="login-remember-row">
                                    <label className="login-toggle-label" onClick={() => setRememberMe(!rememberMe)}>
                                        <div className={`login-toggle ${rememberMe ? 'login-toggle-on' : ''}`}>
                                            <div className="login-toggle-knob"></div>
                                        </div>
                                        <span>Remember me</span>
                                    </label>
                                </div>

                                {error && (
                                    <div className="login-error">
                                        <span>⚠️</span> {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="login-submit-btn"
                                >
                                    {isLoading ? (
                                        <div className="login-spinner"></div>
                                    ) : (
                                        <>
                                            <span>Sign In</span>
                                            <span className="login-sparkle-btn">✨</span>
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Security badge */}
                            <div className="login-security-badge">
                                <span>🔒</span> Protected by 256-bit encryption
                            </div>
                        </div>
                    )}

                    {/* WAITER FORM */}
                    {loginMode === 'waiter' && (
                        <div className="login-form-inner">
                            <div className="login-welcome">
                                <h2>Waiter Access <span>🧑‍🍳</span></h2>
                                <p className="login-welcome-sub">Enter your 6-digit PIN.</p>
                            </div>

                            {/* PIN Display */}
                            <div className="login-pin-display">
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className={`login-pin-dot ${pin[i] ? 'login-pin-dot-active' : ''}`}>
                                        {pin[i] ? (showPin ? pin[i] : '●') : '○'}
                                    </div>
                                ))}
                            </div>

                            <div className="login-pin-toggle-row">
                                <button onClick={togglePinVisibility} className="login-pin-toggle-btn">
                                    {showPin ? 'Hide PIN' : 'Show PIN'}
                                </button>
                            </div>

                            {error && (
                                <div className="login-error">
                                    <span>⚠️</span> {error}
                                </div>
                            )}

                            {/* PIN Pad */}
                            <div className="login-pin-pad">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                    <button
                                        key={num}
                                        onClick={() => handlePinInput(num.toString())}
                                        className="login-pin-key"
                                    >
                                        {num}
                                    </button>
                                ))}
                                <button onClick={handlePinClear} className="login-pin-key login-pin-key-clear">⌫</button>
                                <button onClick={() => handlePinInput('0')} className="login-pin-key">0</button>
                                <button onClick={handleWaiterLogin} disabled={isLoading || pin.length !== 6} className="login-pin-key login-pin-key-submit">
                                    {isLoading ? <div className="login-spinner-sm"></div> : '✓'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* License Badge */}
                    {licenseStatus.valid && loginMode !== 'waiter' && (
                        <div className="login-license-badge">
                            <div className="login-license-dot"></div>
                            {licenseStatus.client || 'System Active'}
                            {licenseStatus.daysRemaining && ` (${licenseStatus.daysRemaining} days left)`}
                        </div>
                    )}
                </div>

                {/* Footer Credits */}
                <div className="login-footer">
                    <div className="login-footer-inner">
                        <p className="login-footer-text">
                            System developed & maintained by <span className="login-footer-name">Jimhawkins Korir</span>
                        </p>
                        <div className="login-footer-contacts">
                            <span>📞 0720316175</span>
                            <span className="login-footer-dot"></span>
                            <span>✉️ jimhaowkins@gmail.com</span>
                        </div>
                        <p className="login-footer-version">v3.2 • Secure Enterprise Connection</p>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;500;600;700&display=swap');

                /* ====== ROOT CONTAINER ====== */
                .login-page-root {
                    display: flex;
                    min-height: 100vh;
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                    overflow: hidden;
                }

                /* ====== LEFT PANEL ====== */
                .login-left-panel {
                    display: none;
                    width: 50%;
                    position: relative;
                    overflow: hidden;
                    align-items: center;
                    justify-content: center;
                }

                @media (min-width: 1024px) {
                    .login-left-panel {
                        display: flex;
                    }
                }

                .login-bg-image {
                    position: absolute;
                    inset: 0;
                    background-image: url('https://images.unsplash.com/photo-1618773928121-c32242e63f39?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80');
                    background-size: cover;
                    background-position: center;
                    transform: scale(1.05);
                    animation: loginBgZoom 25s ease-in-out infinite alternate;
                }

                @keyframes loginBgZoom {
                    0% { transform: scale(1.05); }
                    100% { transform: scale(1.12); }
                }

                .login-bg-overlay {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(
                        135deg,
                        rgba(180, 140, 60, 0.55) 0%,
                        rgba(120, 80, 30, 0.45) 30%,
                        rgba(80, 50, 20, 0.50) 60%,
                        rgba(40, 25, 10, 0.65) 100%
                    );
                    z-index: 1;
                }

                /* Floating golden particles */
                .login-particles {
                    position: absolute;
                    inset: 0;
                    z-index: 2;
                    pointer-events: none;
                }

                .login-particle {
                    position: absolute;
                    width: 4px;
                    height: 4px;
                    background: radial-gradient(circle, rgba(255, 215, 100, 0.9), rgba(255, 180, 50, 0));
                    border-radius: 50%;
                    animation: loginParticleFloat 5s ease-in-out infinite;
                }

                @keyframes loginParticleFloat {
                    0%, 100% { transform: translateY(0) scale(1); opacity: 0; }
                    25% { opacity: 1; }
                    50% { transform: translateY(-40px) scale(1.5); opacity: 0.8; }
                    75% { opacity: 0.4; }
                }

                /* Brand Content */
                .login-brand-content {
                    position: relative;
                    z-index: 10;
                    text-align: center;
                    padding: 2rem;
                    max-width: 420px;
                }

                .login-logo-wrapper {
                    margin-bottom: 1.5rem;
                    display: flex;
                    justify-content: center;
                }

                .login-logo-icon {
                    width: 80px;
                    height: 80px;
                    background: linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 100%);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255,255,255,0.25);
                    border-radius: 22px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2.5rem;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3);
                    animation: loginLogoFloat 4s ease-in-out infinite;
                }

                @keyframes loginLogoFloat {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-8px); }
                }

                .login-brand-title {
                    font-family: 'Playfair Display', serif;
                    font-size: 2.8rem;
                    font-weight: 700;
                    color: white;
                    text-shadow: 0 2px 20px rgba(0,0,0,0.3);
                    margin-bottom: 0.5rem;
                    letter-spacing: -0.02em;
                }

                .login-brand-subtitle {
                    font-size: 1.1rem;
                    color: rgba(255, 220, 160, 0.9);
                    font-weight: 300;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    margin-bottom: 2.5rem;
                }

                /* Feature Cards */
                .login-features {
                    display: flex;
                    flex-direction: column;
                    gap: 0.8rem;
                }

                .login-feature-card {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 1rem 1.5rem;
                    background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 16px;
                    transition: all 0.3s ease;
                    cursor: default;
                }

                .login-feature-card:hover {
                    background: rgba(255,255,255,0.22);
                    transform: translateX(6px);
                    border-color: rgba(255,215,100,0.4);
                }

                .login-feature-icon {
                    width: 44px;
                    height: 44px;
                    background: linear-gradient(135deg, rgba(255,215,100,0.3), rgba(255,180,50,0.15));
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.3rem;
                    border: 1px solid rgba(255,215,100,0.25);
                    flex-shrink: 0;
                }

                .login-feature-title {
                    color: white;
                    font-weight: 600;
                    font-size: 0.95rem;
                    letter-spacing: 0.01em;
                }

                .login-licensed-to {
                    margin-top: 2rem;
                    padding-top: 1.5rem;
                    border-top: 1px solid rgba(255,255,255,0.15);
                }

                .login-licensed-label {
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    letter-spacing: 0.15em;
                    color: rgba(255,200,120,0.8);
                    margin-bottom: 0.3rem;
                }

                .login-licensed-name {
                    font-size: 1.2rem;
                    font-weight: 700;
                    color: white;
                }

                .login-left-footer {
                    position: absolute;
                    bottom: 2rem;
                    left: 0;
                    right: 0;
                    text-align: center;
                    font-size: 0.7rem;
                    color: rgba(255,255,255,0.4);
                    z-index: 10;
                    letter-spacing: 0.05em;
                }

                /* ====== RIGHT PANEL ====== */
                .login-right-panel {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 2rem;
                    position: relative;
                    background: linear-gradient(155deg, #fefefe 0%, #fef7ed 30%, #fdf4e8 60%, #fef9f2 100%);
                    overflow: hidden;
                }

                @media (min-width: 1024px) {
                    .login-right-panel {
                        width: 50%;
                        padding: 3rem;
                    }
                }

                /* Dotted Pattern */
                .login-dots-pattern {
                    position: absolute;
                    top: 2rem;
                    right: 2rem;
                    width: 80px;
                    height: 80px;
                    background-image: radial-gradient(circle, rgba(200, 160, 80, 0.25) 1.5px, transparent 1.5px);
                    background-size: 10px 10px;
                    z-index: 1;
                }

                /* Mobile Header */
                .login-mobile-header {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    margin-bottom: 2rem;
                    padding-top: 1rem;
                }

                @media (min-width: 1024px) {
                    .login-mobile-header {
                        display: none;
                    }
                }

                .login-mobile-logo {
                    width: 56px;
                    height: 56px;
                    background: linear-gradient(135deg, #d4a052, #c08a3e);
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.8rem;
                    box-shadow: 0 6px 24px rgba(180,130,50,0.3);
                    margin-bottom: 0.8rem;
                }

                .login-mobile-title {
                    font-family: 'Playfair Display', serif;
                    font-size: 1.6rem;
                    font-weight: 700;
                    color: #2d1810;
                }

                .login-mobile-subtitle {
                    font-size: 0.8rem;
                    color: #9a7b4f;
                    letter-spacing: 0.05em;
                }

                /* ====== FORM CONTAINER ====== */
                .login-form-container {
                    width: 100%;
                    max-width: 420px;
                    position: relative;
                    z-index: 10;
                }

                /* License Warning */
                .login-license-warning {
                    margin-bottom: 1.2rem;
                    padding: 1rem;
                    background: #fef3c7;
                    border: 1px solid #fbbf24;
                    border-radius: 14px;
                    animation: loginPulse 2s ease-in-out infinite;
                }

                @keyframes loginPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.2); }
                    50% { box-shadow: 0 0 0 6px rgba(251, 191, 36, 0); }
                }

                .login-license-warning-text {
                    font-size: 0.85rem;
                    color: #92400e;
                    font-weight: 700;
                    margin-bottom: 0.6rem;
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                }

                .login-license-input-row {
                    display: flex;
                    gap: 0.5rem;
                }

                .login-license-input {
                    flex: 1;
                    padding: 0.6rem 0.8rem;
                    font-size: 0.85rem;
                    border: 1px solid #fbbf24;
                    border-radius: 10px;
                    outline: none;
                    font-family: monospace;
                    text-transform: uppercase;
                    background: white;
                    color: #1e293b !important;
                }

                .login-license-input:focus {
                    border-color: #f59e0b;
                    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
                }

                .login-license-btn {
                    padding: 0.6rem 1.2rem;
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-weight: 700;
                    font-size: 0.85rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .login-license-btn:hover {
                    background: linear-gradient(135deg, #dc2626, #b91c1c);
                    transform: translateY(-1px);
                }

                .login-license-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                /* ====== TABS ====== */
                .login-tabs {
                    display: flex;
                    background: #f5f0e8;
                    border-radius: 14px;
                    padding: 4px;
                    margin-bottom: 1.8rem;
                    border: 1px solid rgba(200,170,110,0.2);
                }

                .login-tab {
                    flex: 1;
                    padding: 0.75rem 1rem;
                    border: none;
                    border-radius: 11px;
                    font-size: 0.9rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.4rem;
                    color: #8b7355;
                    background: transparent;
                    font-family: 'Inter', sans-serif;
                }

                .login-tab:hover:not(.login-tab-active) {
                    background: rgba(255,255,255,0.5);
                    color: #5a4632;
                }

                .login-tab-active {
                    background: white;
                    color: #2d1810;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
                    transform: scale(1.02);
                }

                .login-tab-emoji {
                    font-size: 1.1rem;
                }

                /* ====== FORM INNER ====== */
                .login-form-inner {
                    animation: loginFadeIn 0.4s ease-out;
                }

                @keyframes loginFadeIn {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .login-welcome {
                    text-align: center;
                    margin-bottom: 1.8rem;
                }

                .login-welcome h2 {
                    font-size: 1.7rem;
                    font-weight: 800;
                    color: #1a1108;
                    letter-spacing: -0.02em;
                }

                .login-welcome-sub {
                    font-size: 0.9rem;
                    color: #8b7355;
                    margin-top: 0.25rem;
                }

                .login-sparkle {
                    display: inline-block;
                    animation: loginSparkle 1.5s ease-in-out infinite;
                }

                @keyframes loginSparkle {
                    0%, 100% { transform: scale(1) rotate(0deg); }
                    50% { transform: scale(1.2) rotate(15deg); }
                }

                /* ====== FORM FIELDS ====== */
                .login-form-fields {
                    display: flex;
                    flex-direction: column;
                    gap: 1.2rem;
                }

                .login-field-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.4rem;
                }

                .login-field-label {
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: #5a4632;
                    letter-spacing: 0.03em;
                    margin-left: 0.2rem;
                }

                .login-input-wrapper {
                    position: relative;
                    display: flex;
                    align-items: center;
                }

                .login-input-icon {
                    position: absolute;
                    left: 1rem;
                    font-size: 1.1rem;
                    z-index: 2;
                    pointer-events: none;
                }

                .login-input {
                    width: 100%;
                    padding: 0.9rem 1rem 0.9rem 3rem;
                    background: #faf7f2;
                    border: 1.5px solid #e8dcc8;
                    border-radius: 14px;
                    font-size: 0.95rem;
                    font-family: 'Inter', sans-serif;
                    color: #1e293b !important;
                    outline: none;
                    transition: all 0.3s ease;
                }

                .login-input:focus {
                    border-color: #c9a96e;
                    background: #fffdf8;
                    box-shadow: 0 0 0 4px rgba(201, 169, 110, 0.12);
                }

                .login-input::placeholder {
                    color: #b5a48a !important;
                    font-weight: 400;
                }

                .login-eye-btn {
                    position: absolute;
                    right: 0.8rem;
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 1.1rem;
                    padding: 0.3rem;
                    transition: transform 0.2s;
                    z-index: 2;
                }

                .login-eye-btn:hover {
                    transform: scale(1.15);
                }

                /* ====== REMEMBER ME ====== */
                .login-remember-row {
                    display: flex;
                    align-items: center;
                }

                .login-toggle-label {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    cursor: pointer;
                    font-size: 0.85rem;
                    color: #5a4632;
                    font-weight: 500;
                    user-select: none;
                }

                .login-toggle {
                    width: 42px;
                    height: 24px;
                    background: #d9cdb8;
                    border-radius: 12px;
                    position: relative;
                    transition: all 0.3s ease;
                }

                .login-toggle-on {
                    background: linear-gradient(135deg, #f0c27f, #d4a052);
                }

                .login-toggle-knob {
                    position: absolute;
                    top: 3px;
                    left: 3px;
                    width: 18px;
                    height: 18px;
                    background: white;
                    border-radius: 50%;
                    transition: all 0.3s ease;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
                }

                .login-toggle-on .login-toggle-knob {
                    left: 21px;
                }

                /* ====== ERROR ====== */
                .login-error {
                    padding: 0.7rem 1rem;
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    border-radius: 12px;
                    font-size: 0.85rem;
                    color: #dc2626;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    animation: loginShake 0.4s ease;
                }

                @keyframes loginShake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-6px); }
                    75% { transform: translateX(6px); }
                }

                /* ====== SUBMIT BUTTON ====== */
                .login-submit-btn {
                    width: 100%;
                    padding: 1rem;
                    background: linear-gradient(135deg, #f0c27f 0%, #e8a849 30%, #d4943e 60%, #c77d35 100%);
                    color: white;
                    border: none;
                    border-radius: 14px;
                    font-size: 1.05rem;
                    font-weight: 700;
                    font-family: 'Inter', sans-serif;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    box-shadow: 0 6px 24px rgba(212, 148, 62, 0.35);
                    margin-top: 0.5rem;
                    letter-spacing: 0.02em;
                    position: relative;
                    overflow: hidden;
                }

                .login-submit-btn::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                    transition: left 0.5s ease;
                }

                .login-submit-btn:hover::before {
                    left: 100%;
                }

                .login-submit-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 32px rgba(212, 148, 62, 0.45);
                }

                .login-submit-btn:active {
                    transform: translateY(0);
                }

                .login-submit-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                }

                .login-sparkle-btn {
                    animation: loginSparkle 1.5s ease-in-out infinite;
                }

                .login-spinner {
                    width: 22px;
                    height: 22px;
                    border: 3px solid rgba(255,255,255,0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: loginSpin 0.7s linear infinite;
                }

                .login-spinner-sm {
                    width: 18px;
                    height: 18px;
                    border: 2px solid rgba(255,255,255,0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: loginSpin 0.7s linear infinite;
                }

                @keyframes loginSpin {
                    to { transform: rotate(360deg); }
                }

                /* ====== SECURITY BADGE ====== */
                .login-security-badge {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.4rem;
                    margin-top: 1.5rem;
                    font-size: 0.75rem;
                    color: #8b7355;
                    font-weight: 500;
                    letter-spacing: 0.02em;
                }

                /* ====== LICENSE BADGE ====== */
                .login-license-badge {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    margin-top: 1.5rem;
                    padding: 0.6rem 1.2rem;
                    background: #f0fdf4;
                    border: 1px solid #bbf7d0;
                    border-radius: 999px;
                    font-size: 0.75rem;
                    color: #15803d;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .login-license-dot {
                    width: 8px;
                    height: 8px;
                    background: #22c55e;
                    border-radius: 50%;
                    animation: loginPulse 2s infinite;
                }

                /* ====== PIN DISPLAY ====== */
                .login-pin-display {
                    display: flex;
                    justify-content: center;
                    gap: 0.5rem;
                    margin-bottom: 0.5rem;
                }

                .login-pin-dot {
                    width: 42px;
                    height: 52px;
                    border: 2px solid #e8dcc8;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.2rem;
                    font-weight: 700;
                    color: #b5a48a;
                    background: #faf7f2;
                    transition: all 0.3s ease;
                }

                .login-pin-dot-active {
                    background: #fef7ed;
                    border-color: #d4a052;
                    color: #8b5e1c;
                    box-shadow: 0 2px 8px rgba(212,160,82,0.15);
                    transform: translateY(-3px);
                }

                .login-pin-toggle-row {
                    text-align: center;
                    margin-bottom: 1rem;
                }

                .login-pin-toggle-btn {
                    background: none;
                    border: none;
                    font-size: 0.75rem;
                    color: #8b7355;
                    cursor: pointer;
                    font-weight: 500;
                    font-family: 'Inter', sans-serif;
                }

                .login-pin-toggle-btn:hover {
                    color: #5a4632;
                }

                /* ====== PIN PAD ====== */
                .login-pin-pad {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 0.6rem;
                    max-width: 280px;
                    margin: 0 auto;
                }

                .login-pin-key {
                    height: 56px;
                    border: 1.5px solid #e8dcc8;
                    border-radius: 14px;
                    background: white;
                    font-size: 1.4rem;
                    font-weight: 700;
                    color: #2d1810;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: 'Inter', sans-serif;
                }

                .login-pin-key:hover {
                    background: #fef7ed;
                    border-color: #d4a052;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.06);
                }

                .login-pin-key:active {
                    transform: scale(0.95);
                }

                .login-pin-key-clear {
                    background: #fef2f2;
                    border-color: #fecaca;
                    color: #ef4444;
                }

                .login-pin-key-clear:hover {
                    background: #fee2e2;
                    border-color: #ef4444;
                }

                .login-pin-key-submit {
                    background: linear-gradient(135deg, #f0c27f, #d4a052);
                    border: none;
                    color: white;
                    box-shadow: 0 4px 16px rgba(212,160,82,0.35);
                }

                .login-pin-key-submit:hover {
                    box-shadow: 0 6px 24px rgba(212,160,82,0.5);
                    background: linear-gradient(135deg, #e8a849, #c77d35);
                }

                .login-pin-key-submit:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                }

                /* ====== FOOTER ====== */
                .login-footer {
                    margin-top: 2.5rem;
                    text-align: center;
                    position: relative;
                    z-index: 10;
                }

                .login-footer-inner {
                    display: inline-block;
                    padding: 1rem 2rem;
                    background: rgba(255,255,255,0.5);
                    backdrop-filter: blur(8px);
                    border-radius: 18px;
                    border: 1px solid rgba(200,170,110,0.15);
                }

                .login-footer-text {
                    font-size: 0.75rem;
                    color: #8b7355;
                    font-weight: 500;
                }

                .login-footer-name {
                    font-weight: 700;
                    color: #b8860b;
                }

                .login-footer-contacts {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.8rem;
                    margin-top: 0.4rem;
                    font-size: 0.7rem;
                    color: #a08c6e;
                    font-weight: 500;
                }

                .login-footer-dot {
                    width: 3px;
                    height: 3px;
                    background: #c9a96e;
                    border-radius: 50%;
                }

                .login-footer-version {
                    font-size: 0.65rem;
                    color: #c9bba0;
                    margin-top: 0.4rem;
                    font-family: monospace;
                }
            `}</style>
        </div>
    );
}
