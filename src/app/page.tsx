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
    const [licensedTo, setLicensedTo] = useState('');
    const [rememberMe, setRememberMe] = useState(false);

    // License state
    const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>({ valid: true });
    const [checkingLicense, setCheckingLicense] = useState(true);
    const [licenseKey, setLicenseKey] = useState('');
    const [activatingLicense, setActivatingLicense] = useState(false);

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
                const { data: anyLicense } = await supabase
                    .from('licenses')
                    .select('*')
                    .is('machine_id', null)
                    .eq('is_active', true)
                    .limit(1);

                if (anyLicense && anyLicense.length > 0) {
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
            setLicenseStatus({ valid: true });
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

        return () => {
            clearTimeout(timeoutId);
            events.forEach(event => window.removeEventListener(event, resetTimeout));
        };
    };

    useEffect(() => {
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
        checkLicense();
        const cleanupSession = setupSessionTimeout();

        return () => {
            cleanupSession();
        };
    }, []);

    const activateLicense = async () => {
        if (!licenseKey.trim()) {
            setError('Please enter a license key');
            return;
        }

        setActivatingLicense(true);
        setError('');

        try {
            const machineId = getMachineId();
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

            if (license.machine_id && license.machine_id !== machineId) {
                setError('This license is already activated on another device.');
                setActivatingLicense(false);
                return;
            }

            const now = new Date();
            const expiryDate = new Date(license.expiry_date);
            if (now > expiryDate) {
                setError('This license has expired.');
                setActivatingLicense(false);
                return;
            }

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

            await supabase.from('license_activations').insert({
                license_id: license.license_id,
                machine_id: machineId,
                activation_type: 'activate',
                success: true
            });

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
            const { data, error: dbError } = await supabase
                .from('users')
                .select('*')
                .eq('pin', pin)
                .eq('active', true)
                .eq('user_type', 'Waiter')
                .maybeSingle();

            if (dbError || !data) {
                setError(`Invalid PIN`);
                setIsLoading(false);
                setPin('');
                setShowPin(false);
                return;
            }

            localStorage.setItem('user', JSON.stringify({
                userId: data.user_id,
                userName: data.user_name,
                name: data.name,
                userType: data.user_type,
                email: data.email,
                isWaiter: true
            }));
            router.push('/dashboard/pos');
        } catch (err) {
            console.error('Login error:', err);
            setError('Connection error. Please try again.');
        }

        setIsLoading(false);
    };

    const handlePinInput = (digit: string) => {
        if (pin.length < 6) {
            setPin(pin + digit);
            setError('');
        }
    };

    const handlePinClear = () => {
        setPin('');
        setError('');
        setShowPin(false);
    };

    return (
        <div style={styles.root}>
            {/* ===== LEFT SIDE: BRANDING ===== */}
            <div style={styles.leftPanel}>
                {/* Background Image - Luxury hotel lobby */}
                <div style={styles.bgImage}></div>
                <div style={styles.bgOverlay}></div>

                {/* Branding Content */}
                <div style={styles.brandContent}>
                    <div style={styles.logoBox}>
                        <span style={{ fontSize: '2.2rem' }}>💎</span>
                    </div>

                    <h1 style={styles.brandTitle}>Alpha Plus Hotel</h1>
                    <p style={styles.brandSubtitle}>Premium Hotel Management</p>

                    {/* Feature Cards */}
                    <div style={styles.featuresContainer}>
                        <div style={styles.featureCard}>
                            <div style={{ ...styles.featureIconBox, background: 'linear-gradient(135deg, rgba(255,193,68,0.35), rgba(255,160,40,0.2))' }}>
                                <span style={{ fontSize: '1.2rem' }}>⚡</span>
                            </div>
                            <span style={styles.featureLabel}>Lightning Fast</span>
                        </div>
                        <div style={styles.featureCard}>
                            <div style={{ ...styles.featureIconBox, background: 'linear-gradient(135deg, rgba(100,180,255,0.35), rgba(60,130,240,0.2))' }}>
                                <span style={{ fontSize: '1.2rem' }}>🛡️</span>
                            </div>
                            <span style={styles.featureLabel}>Enterprise Security</span>
                        </div>
                        <div style={styles.featureCard}>
                            <div style={{ ...styles.featureIconBox, background: 'linear-gradient(135deg, rgba(255,130,150,0.35), rgba(240,90,120,0.2))' }}>
                                <span style={{ fontSize: '1.2rem' }}>📊</span>
                            </div>
                            <span style={styles.featureLabel}>Smart Analytics</span>
                        </div>
                    </div>

                    {licensedTo && (
                        <div style={styles.licensedToBox}>
                            <p style={styles.licensedToLabel}>LICENSED TO</p>
                            <p style={styles.licensedToName}>{licensedTo}</p>
                        </div>
                    )}
                </div>

                <div style={styles.leftFooter}>
                    &copy; 2026 Alpha Solutions. All rights reserved.
                </div>
            </div>

            {/* ===== RIGHT SIDE: LOGIN FORM ===== */}
            <div style={styles.rightPanel}>
                {/* Dotted decoration */}
                <div style={styles.dotsPattern}></div>

                {/* Mobile Header */}
                <div style={styles.mobileHeader}>
                    <div style={styles.mobileLogoBox}>
                        <span style={{ fontSize: '1.6rem' }}>💎</span>
                    </div>
                    <h2 style={styles.mobileTitle}>Alpha Plus Hotel</h2>
                </div>

                <div style={styles.formContainer}>
                    {/* License Warning */}
                    {!checkingLicense && !licenseStatus.valid && (
                        <div style={styles.licenseWarning}>
                            <p style={styles.licenseWarningText}>
                                ⚠️ {licenseStatus.error || 'Activation Required'}
                            </p>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="text"
                                    value={licenseKey}
                                    onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                                    placeholder="Enter Key: APS-XXXX..."
                                    style={styles.licenseInput}
                                />
                                <button
                                    onClick={activateLicense}
                                    disabled={activatingLicense}
                                    style={styles.licenseBtn}
                                >
                                    {activatingLicense ? '...' : 'Activate'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Tabs: Admin | Waiter */}
                    <div style={styles.tabsContainer}>
                        <button
                            onClick={() => { setLoginMode('admin'); setError(''); setPin(''); }}
                            style={loginMode === 'admin' ? styles.tabActive : styles.tab}
                        >
                            <span>👨‍💼</span> Admin
                        </button>
                        <button
                            onClick={() => { setLoginMode('waiter'); setError(''); setUsername(''); setPassword(''); }}
                            style={loginMode === 'waiter' ? styles.tabActive : styles.tab}
                        >
                            <span>🧑‍🍳</span> Waiter
                        </button>
                    </div>

                    {/* ADMIN LOGIN */}
                    {loginMode === 'admin' && (
                        <div style={{ animation: 'fadeInUp 0.4s ease-out' }}>
                            <h2 style={styles.welcomeTitle}>Welcome Back! 👋✨</h2>

                            <form onSubmit={handleAdminLogin}>
                                {/* Username */}
                                <div style={styles.fieldGroup}>
                                    <label style={styles.fieldLabel}>Username</label>
                                    <div style={styles.inputWrapper}>
                                        <span style={styles.inputIcon}>👤</span>
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            placeholder="e.g., john.doe"
                                            style={styles.textInput}
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div style={styles.fieldGroup}>
                                    <label style={styles.fieldLabel}>Password</label>
                                    <div style={styles.inputWrapper}>
                                        <span style={styles.inputIcon}>🔒</span>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            style={styles.textInput}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            style={styles.eyeBtn}
                                        >
                                            {showPassword ? '🙈' : '👁️'}
                                        </button>
                                    </div>
                                </div>

                                {/* Remember Me Toggle */}
                                <div style={styles.rememberRow} onClick={() => setRememberMe(!rememberMe)}>
                                    <div style={rememberMe ? styles.toggleOn : styles.toggleOff}>
                                        <div style={rememberMe ? styles.toggleKnobOn : styles.toggleKnobOff}></div>
                                    </div>
                                    <span style={styles.rememberText}>Remember me</span>
                                </div>

                                {error && (
                                    <div style={styles.errorBox}>
                                        ⚠️ {error}
                                    </div>
                                )}

                                {/* Sign In Button */}
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    style={styles.signInBtn}
                                >
                                    {isLoading ? (
                                        <div style={styles.spinner}></div>
                                    ) : (
                                        <span>Sign In ✨</span>
                                    )}
                                </button>
                            </form>

                            <p style={styles.securityBadge}>🔒 Protected by 256-bit encryption</p>
                        </div>
                    )}

                    {/* WAITER LOGIN */}
                    {loginMode === 'waiter' && (
                        <div style={{ animation: 'fadeInUp 0.4s ease-out' }}>
                            <h2 style={styles.welcomeTitle}>Waiter Access 🧑‍🍳</h2>
                            <p style={{ textAlign: 'center' as const, color: '#8b7355', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Enter your 6-digit PIN</p>

                            {/* PIN Display */}
                            <div style={styles.pinDisplay}>
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} style={pin[i] ? styles.pinDotActive : styles.pinDot}>
                                        {pin[i] ? (showPin ? pin[i] : '●') : '○'}
                                    </div>
                                ))}
                            </div>

                            <div style={{ textAlign: 'center' as const, marginBottom: '1rem' }}>
                                <button onClick={() => setShowPin(!showPin)} style={styles.pinToggle}>
                                    {showPin ? 'Hide PIN' : 'Show PIN'}
                                </button>
                            </div>

                            {error && (
                                <div style={styles.errorBox}>
                                    ⚠️ {error}
                                </div>
                            )}

                            {/* PIN Pad */}
                            <div style={styles.pinPad}>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                    <button key={num} onClick={() => handlePinInput(num.toString())} style={styles.pinKey}>
                                        {num}
                                    </button>
                                ))}
                                <button onClick={handlePinClear} style={styles.pinKeyClear}>⌫</button>
                                <button onClick={() => handlePinInput('0')} style={styles.pinKey}>0</button>
                                <button onClick={handleWaiterLogin} disabled={isLoading || pin.length !== 6} style={styles.pinKeySubmit}>
                                    {isLoading ? '...' : '✓'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* License Badge */}
                    {licenseStatus.valid && loginMode !== 'waiter' && (
                        <div style={styles.licenseBadge}>
                            <span style={styles.licenseDot}></span>
                            {licenseStatus.client || 'System Active'}
                            {licenseStatus.daysRemaining && ` (${licenseStatus.daysRemaining} days left)`}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={styles.footer}>
                    <div style={styles.footerInner}>
                        <p style={styles.footerText}>
                            System developed & maintained by <strong style={{ color: '#b8860b' }}>Jimhawkins Korir</strong>
                        </p>
                        <div style={styles.footerContacts}>
                            <span>📞 0720316175</span>
                            <span style={{ width: 3, height: 3, background: '#c9a96e', borderRadius: '50%', display: 'inline-block' }}></span>
                            <span>✉️ jimhaowkins@gmail.com</span>
                        </div>
                        <p style={styles.footerVersion}>v3.2 • Secure Enterprise Connection</p>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Playfair+Display:wght@400;500;600;700&display=swap');

                .login-root-styles * {
                    box-sizing: border-box;
                }
                
                body {
                    margin: 0;
                    padding: 0;
                }

                @media (max-width: 1023px) {
                    .login-left-hide {
                        display: none !important;
                    }
                    .login-right-full {
                        width: 100% !important;
                    }
                    .login-mobile-show {
                        display: flex !important;
                    }
                }

                @keyframes loginBgPan {
                    0% { transform: scale(1.05); }
                    100% { transform: scale(1.12); }
                }

                @keyframes loginSpinAnim {
                    to { transform: rotate(360deg); }
                }

                @keyframes loginShake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(15px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}

// ===== INLINE STYLES (GOLDEN PREMIUM THEME) =====
const styles: { [key: string]: React.CSSProperties } = {
    root: {
        display: 'flex',
        minHeight: '100vh',
        fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
        overflow: 'hidden',
    },

    // LEFT PANEL
    leftPanel: {
        width: '50%',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },

    bgImage: {
        position: 'absolute',
        inset: 0,
        backgroundImage: "url('https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transform: 'scale(1.05)',
        animation: 'loginBgPan 25s ease-in-out infinite alternate',
    },

    bgOverlay: {
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, rgba(180,140,50,0.40) 0%, rgba(140,100,30,0.35) 40%, rgba(100,70,20,0.45) 70%, rgba(60,40,15,0.55) 100%)',
        zIndex: 1,
    },

    brandContent: {
        position: 'relative',
        zIndex: 10,
        textAlign: 'center',
        padding: '2rem',
        maxWidth: '380px',
    },

    logoBox: {
        width: '72px',
        height: '72px',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 1.2rem auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    },

    brandTitle: {
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: '2.4rem',
        fontWeight: 700,
        color: 'white',
        textShadow: '0 2px 16px rgba(0,0,0,0.25)',
        marginBottom: '0.3rem',
        letterSpacing: '-0.01em',
    },

    brandSubtitle: {
        fontSize: '0.95rem',
        color: 'rgba(255,220,160,0.9)',
        fontWeight: 300,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        marginBottom: '2rem',
    },

    featuresContainer: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '0.7rem',
    },

    featureCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.9rem',
        padding: '0.85rem 1.2rem',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '14px',
        cursor: 'default',
        transition: 'all 0.3s ease',
    },

    featureIconBox: {
        width: '40px',
        height: '40px',
        borderRadius: '11px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(255,255,255,0.15)',
        flexShrink: 0,
    },

    featureLabel: {
        color: 'white',
        fontWeight: 600,
        fontSize: '0.9rem',
        letterSpacing: '0.01em',
    },

    licensedToBox: {
        marginTop: '1.8rem',
        paddingTop: '1.2rem',
        borderTop: '1px solid rgba(255,255,255,0.15)',
    },

    licensedToLabel: {
        fontSize: '0.65rem',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.15em',
        color: 'rgba(255,200,120,0.8)',
        marginBottom: '0.2rem',
    },

    licensedToName: {
        fontSize: '1.1rem',
        fontWeight: 700,
        color: 'white',
    },

    leftFooter: {
        position: 'absolute' as const,
        bottom: '1.5rem',
        left: 0,
        right: 0,
        textAlign: 'center' as const,
        fontSize: '0.65rem',
        color: 'rgba(255,255,255,0.35)',
        zIndex: 10,
        letterSpacing: '0.04em',
    },

    // RIGHT PANEL
    rightPanel: {
        width: '50%',
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 3rem',
        position: 'relative' as const,
        background: 'linear-gradient(155deg, #fefefe 0%, #fef8f0 30%, #fdf5ea 60%, #fffaf4 100%)',
        overflow: 'hidden',
    },

    dotsPattern: {
        position: 'absolute' as const,
        top: '1.5rem',
        right: '1.5rem',
        width: '70px',
        height: '70px',
        backgroundImage: 'radial-gradient(circle, rgba(200,165,80,0.3) 1.5px, transparent 1.5px)',
        backgroundSize: '9px 9px',
        zIndex: 1,
    },

    mobileHeader: {
        display: 'none',
        flexDirection: 'column' as const,
        alignItems: 'center',
        marginBottom: '1.5rem',
    },

    mobileLogoBox: {
        width: '50px',
        height: '50px',
        background: 'linear-gradient(135deg, #d4a052, #c08a3e)',
        borderRadius: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '0.6rem',
        boxShadow: '0 4px 16px rgba(180,130,50,0.25)',
    },

    mobileTitle: {
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: '1.4rem',
        fontWeight: 700,
        color: '#2d1810',
    },

    // FORM
    formContainer: {
        width: '100%',
        maxWidth: '400px',
        position: 'relative' as const,
        zIndex: 10,
    },

    licenseWarning: {
        marginBottom: '1rem',
        padding: '0.9rem',
        background: '#fef3c7',
        border: '1px solid #fbbf24',
        borderRadius: '12px',
    },

    licenseWarningText: {
        fontSize: '0.8rem',
        color: '#92400e',
        fontWeight: 700,
        marginBottom: '0.5rem',
    },

    licenseInput: {
        flex: 1,
        padding: '0.5rem 0.7rem',
        fontSize: '0.8rem',
        border: '1px solid #fbbf24',
        borderRadius: '8px',
        outline: 'none',
        fontFamily: 'monospace',
        textTransform: 'uppercase' as const,
        background: 'white',
        color: '#1e293b',
    },

    licenseBtn: {
        padding: '0.5rem 1rem',
        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontWeight: 700,
        fontSize: '0.8rem',
        cursor: 'pointer',
    },

    // TABS
    tabsContainer: {
        display: 'flex',
        background: '#f5f0e6',
        borderRadius: '12px',
        padding: '3px',
        marginBottom: '1.5rem',
        border: '1px solid rgba(210,180,120,0.2)',
    },

    tab: {
        flex: 1,
        padding: '0.65rem 0.8rem',
        border: 'none',
        borderRadius: '10px',
        fontSize: '0.88rem',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.35rem',
        color: '#9a8265',
        background: 'transparent',
        fontFamily: "'Inter', sans-serif",
        transition: 'all 0.25s ease',
    },

    tabActive: {
        flex: 1,
        padding: '0.65rem 0.8rem',
        border: 'none',
        borderRadius: '10px',
        fontSize: '0.88rem',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.35rem',
        color: '#2d1810',
        background: 'white',
        fontFamily: "'Inter', sans-serif",
        boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
    },

    // WELCOME
    welcomeTitle: {
        textAlign: 'center' as const,
        fontSize: '1.5rem',
        fontWeight: 800,
        color: '#1a1108',
        marginBottom: '1.5rem',
        letterSpacing: '-0.01em',
    },

    // FIELDS
    fieldGroup: {
        marginBottom: '1.1rem',
    },

    fieldLabel: {
        display: 'block',
        fontSize: '0.78rem',
        fontWeight: 600,
        color: '#5a4632',
        marginBottom: '0.35rem',
        marginLeft: '0.15rem',
        letterSpacing: '0.02em',
    },

    inputWrapper: {
        position: 'relative' as const,
        display: 'flex',
        alignItems: 'center',
    },

    inputIcon: {
        position: 'absolute' as const,
        left: '0.9rem',
        fontSize: '1rem',
        zIndex: 2,
        pointerEvents: 'none' as const,
    },

    textInput: {
        width: '100%',
        padding: '0.8rem 0.9rem 0.8rem 2.7rem',
        background: '#faf7f2',
        border: '1.5px solid #e8dcc8',
        borderRadius: '12px',
        fontSize: '0.9rem',
        fontFamily: "'Inter', sans-serif",
        color: '#1e293b',
        outline: 'none',
        transition: 'all 0.25s ease',
    },

    eyeBtn: {
        position: 'absolute' as const,
        right: '0.7rem',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: '1rem',
        padding: '0.2rem',
        zIndex: 2,
    },

    // REMEMBER ME
    rememberRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1.1rem',
        cursor: 'pointer',
        userSelect: 'none' as const,
    },

    toggleOff: {
        width: '38px',
        height: '22px',
        background: '#d9cdb8',
        borderRadius: '11px',
        position: 'relative' as const,
        transition: 'all 0.3s ease',
    },

    toggleOn: {
        width: '38px',
        height: '22px',
        background: 'linear-gradient(135deg, #f0c27f, #d4a052)',
        borderRadius: '11px',
        position: 'relative' as const,
        transition: 'all 0.3s ease',
    },

    toggleKnobOff: {
        position: 'absolute' as const,
        top: '3px',
        left: '3px',
        width: '16px',
        height: '16px',
        background: 'white',
        borderRadius: '50%',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        transition: 'all 0.3s ease',
    },

    toggleKnobOn: {
        position: 'absolute' as const,
        top: '3px',
        left: '19px',
        width: '16px',
        height: '16px',
        background: 'white',
        borderRadius: '50%',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        transition: 'all 0.3s ease',
    },

    rememberText: {
        fontSize: '0.82rem',
        color: '#5a4632',
        fontWeight: 500,
    },

    // ERROR
    errorBox: {
        padding: '0.6rem 0.9rem',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '10px',
        fontSize: '0.82rem',
        color: '#dc2626',
        fontWeight: 500,
        marginBottom: '0.8rem',
        animation: 'loginShake 0.4s ease',
    },

    // SIGN IN BUTTON
    signInBtn: {
        width: '100%',
        padding: '0.85rem',
        background: 'linear-gradient(135deg, #f0c27f 0%, #e8a849 35%, #d4943e 70%, #c77d35 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        fontSize: '1rem',
        fontWeight: 700,
        fontFamily: "'Inter', sans-serif",
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.4rem',
        boxShadow: '0 4px 20px rgba(212,148,62,0.3)',
        letterSpacing: '0.01em',
        transition: 'all 0.25s ease',
    },

    spinner: {
        width: '20px',
        height: '20px',
        border: '3px solid rgba(255,255,255,0.3)',
        borderTopColor: 'white',
        borderRadius: '50%',
        animation: 'loginSpinAnim 0.7s linear infinite',
    },

    // SECURITY BADGE
    securityBadge: {
        textAlign: 'center' as const,
        marginTop: '1.2rem',
        fontSize: '0.72rem',
        color: '#8b7355',
        fontWeight: 500,
        letterSpacing: '0.01em',
    },

    // LICENSE BADGE
    licenseBadge: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.4rem',
        marginTop: '1.2rem',
        padding: '0.5rem 1rem',
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: '999px',
        fontSize: '0.7rem',
        color: '#15803d',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.04em',
    },

    licenseDot: {
        width: '7px',
        height: '7px',
        background: #22c55e',
        borderRadius: '50%',
        display: 'inline-block',
    },

    // PIN
    pinDisplay: {
        display: 'flex',
        justifyContent: 'center',
        gap: '0.4rem',
        marginBottom: '0.5rem',
    },

    pinDot: {
        width: '40px',
        height: '48px',
        border: '2px solid #e8dcc8',
        borderRadius: '11px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.1rem',
        fontWeight: 700,
        color: '#b5a48a',
        background: '#faf7f2',
    },

    pinDotActive: {
        width: '40px',
        height: '48px',
        border: '2px solid #d4a052',
        borderRadius: '11px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.1rem',
        fontWeight: 700,
        color: '#8b5e1c',
        background: '#fef7ed',
        boxShadow: '0 2px 8px rgba(212,160,82,0.15)',
        transform: 'translateY(-2px)',
    },

    pinToggle: {
        background: 'none',
        border: 'none',
        fontSize: '0.72rem',
        color: '#8b7355',
        cursor: 'pointer',
        fontWeight: 500,
        fontFamily: "'Inter', sans-serif",
    },

    pinPad: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.5rem',
        maxWidth: '260px',
        margin: '0 auto',
    },

    pinKey: {
        height: '52px',
        border: '1.5px solid #e8dcc8',
        borderRadius: '12px',
        background: 'white',
        fontSize: '1.3rem',
        fontWeight: 700,
        color: '#2d1810',
        cursor: 'pointer',
        fontFamily: "'Inter', sans-serif',",
        transition: 'all 0.2s ease',
    },

    pinKeyClear: {
        height: '52px',
        border: '1.5px solid #fecaca',
        borderRadius: '12px',
        background: '#fef2f2',
        fontSize: '1.3rem',
        fontWeight: 700,
        color: '#ef4444',
        cursor: 'pointer',
        fontFamily: "'Inter', sans-serif",
    },

    pinKeySubmit: {
        height: '52px',
        border: 'none',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, #f0c27f, #d4a052)',
        fontSize: '1.3rem',
        fontWeight: 700,
        color: 'white',
        cursor: 'pointer',
        fontFamily: "'Inter', sans-serif",
        boxShadow: '0 4px 14px rgba(212,160,82,0.3)',
    },

    // FOOTER
    footer: {
        marginTop: '2rem',
        textAlign: 'center' as const,
        position: 'relative' as const,
        zIndex: 10,
    },

    footerInner: {
        display: 'inline-block',
        padding: '0.8rem 1.6rem',
        background: 'rgba(255,255,255,0.5)',
        backdropFilter: 'blur(6px)',
        borderRadius: '14px',
        border: '1px solid rgba(200,170,110,0.12)',
    },

    footerText: {
        fontSize: '0.7rem',
        color: '#8b7355',
        fontWeight: 500,
    },

    footerContacts: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.6rem',
        marginTop: '0.3rem',
        fontSize: '0.65rem',
        color: '#a08c6e',
        fontWeight: 500,
    },

    footerVersion: {
        fontSize: '0.6rem',
        color: '#c9bba0',
        marginTop: '0.3rem',
        fontFamily: 'monospace',
    },
};
