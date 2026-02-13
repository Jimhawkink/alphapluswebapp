// Login Theme Configurations - 4 switchable themes
// Each theme defines colors, backgrounds, and style overrides

export interface LoginTheme {
    id: string;
    name: string;
    bgImage: string;
    overlayGradient: string;
    brandSubtitle: string;
    features: { icon: string; label: string; iconBg: string }[];
    rightBg: string;
    tabBg: string;
    tabActiveBg: string;
    tabActiveColor: string;
    tabInactiveColor: string;
    tabBorder: string;
    welcomeEmoji: string;
    welcomeSubtext: string;
    titleColor: string;
    subtitleColor: string;
    inputBg: string;
    inputBorder: string;
    inputFocusBorder: string;
    inputFocusShadow: string;
    inputIconColor: string;
    labelColor: string;
    signInGradient: string;
    signInShadow: string;
    rememberStyle: 'checkbox' | 'toggle';
    rememberColor: string;
    accentColor: string;
    securityText: string;
    overlayColor: string;
    featureCardBg: string;
    featureCardBorder: string;
    brandTitleFont: string;
    footerAccentColor: string;
    showForgotPassword: boolean;
    showLabels: boolean;
    tabStyle: 'pill' | 'underline';
    adminLabel: string;
    waiterLabel: string;
}

export const loginThemes: LoginTheme[] = [
    // THEME 1: Luxury Lobby (Blue/Purple) — Image 4 (chandelier/flowers)
    {
        id: 'luxury-lobby',
        name: '💎 Luxury',
        bgImage: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=85",
        overlayGradient: 'linear-gradient(160deg, rgba(255,255,255,0.05) 0%, rgba(200,210,240,0.10) 40%, rgba(160,180,220,0.15) 70%, rgba(120,140,200,0.20) 100%)',
        brandSubtitle: 'Premium Hotel Management System',
        features: [],
        rightBg: 'linear-gradient(155deg, #f8faff 0%, #f0f4ff 30%, #edf1fc 60%, #f5f7ff 100%)',
        tabBg: 'transparent',
        tabActiveBg: 'transparent',
        tabActiveColor: '#4a6cf7',
        tabInactiveColor: '#94a3b8',
        tabBorder: 'transparent',
        welcomeEmoji: '👋',
        welcomeSubtext: 'Sign in to your dashboard',
        titleColor: '#1a202c',
        subtitleColor: '#94a3b8',
        inputBg: '#ffffff',
        inputBorder: '#e2e8f0',
        inputFocusBorder: '#7fadf7',
        inputFocusShadow: 'rgba(127,173,247,0.15)',
        inputIconColor: '#a0aec0',
        labelColor: '#64748b',
        signInGradient: 'linear-gradient(135deg, #7fadf7 0%, #8b9cf7 40%, #a78bfa 70%, #b78bf7 100%)',
        signInShadow: 'rgba(127,173,247,0.35)',
        rememberStyle: 'checkbox',
        rememberColor: '#7fadf7',
        accentColor: '#6b8df7',
        securityText: '🔒 Secured by enterprise encryption',
        overlayColor: 'rgba(0,0,0,0)',
        featureCardBg: 'transparent',
        featureCardBorder: 'transparent',
        brandTitleFont: "'Playfair Display', Georgia, serif",
        footerAccentColor: '#6b8df7',
        showForgotPassword: true,
        showLabels: false,
        tabStyle: 'pill',
        adminLabel: 'Admin Portal',
        waiterLabel: 'Waiter Station',
    },
    // THEME 2: Beach Resort (Glassmorphism) — Image 2 (pool/beach)
    {
        id: 'beach-resort',
        name: '🏖️ Beach',
        bgImage: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=85",
        overlayGradient: 'linear-gradient(135deg, rgba(200,220,255,0.15) 0%, rgba(180,200,240,0.20) 50%, rgba(160,190,255,0.25) 100%)',
        brandSubtitle: '',
        features: [
            { icon: '🏖️', label: 'Beachfront', iconBg: 'rgba(255,255,255,0.6)' },
            { icon: '🍽️', label: 'Fine Dining', iconBg: 'rgba(255,255,255,0.6)' },
            { icon: '🧖', label: 'Spa & Wellness', iconBg: 'rgba(255,255,255,0.6)' },
            { icon: '⭐', label: 'Premium Service', iconBg: 'rgba(255,255,255,0.6)' },
        ],
        rightBg: 'linear-gradient(160deg, rgba(240,248,255,0.92) 0%, rgba(230,240,255,0.88) 50%, rgba(245,250,255,0.90) 100%)',
        tabBg: '#f1f5f9',
        tabActiveBg: '#3b82f6',
        tabActiveColor: '#ffffff',
        tabInactiveColor: '#64748b',
        tabBorder: '#e2e8f0',
        welcomeEmoji: '👋',
        welcomeSubtext: 'Sign in to your Alpha Plus Hotel account.',
        titleColor: '#1e293b',
        subtitleColor: '#64748b',
        inputBg: '#f8fafc',
        inputBorder: '#e2e8f0',
        inputFocusBorder: '#3b82f6',
        inputFocusShadow: 'rgba(59,130,246,0.15)',
        inputIconColor: '#94a3b8',
        labelColor: '#475569',
        signInGradient: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #7c3aed 100%)',
        signInShadow: 'rgba(59,130,246,0.3)',
        rememberStyle: 'checkbox',
        rememberColor: '#3b82f6',
        accentColor: '#3b82f6',
        securityText: "Don't have an account? Contact your administrator.",
        overlayColor: 'rgba(0,0,0,0)',
        featureCardBg: 'rgba(255,255,255,0.6)',
        featureCardBorder: 'rgba(255,255,255,0.5)',
        brandTitleFont: "'Playfair Display', Georgia, serif",
        footerAccentColor: '#3b82f6',
        showForgotPassword: true,
        showLabels: true,
        tabStyle: 'pill',
        adminLabel: 'Admin',
        waiterLabel: 'Waiter',
    },
    // THEME 3: Golden Premium — Image 3 (golden lobby)
    {
        id: 'golden-premium',
        name: '✨ Golden',
        bgImage: "https://images.unsplash.com/photo-1564501049412-61c2a3083791?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=85",
        overlayGradient: 'linear-gradient(135deg, rgba(180,140,50,0.35) 0%, rgba(140,100,30,0.30) 40%, rgba(100,70,20,0.40) 70%, rgba(60,40,15,0.50) 100%)',
        brandSubtitle: 'Premium Hotel Management',
        features: [
            { icon: '⚡', label: 'Lightning Fast', iconBg: 'linear-gradient(135deg, rgba(255,193,68,0.35), rgba(255,160,40,0.2))' },
            { icon: '🛡️', label: 'Enterprise Security', iconBg: 'linear-gradient(135deg, rgba(100,180,255,0.35), rgba(60,130,240,0.2))' },
            { icon: '📊', label: 'Smart Analytics', iconBg: 'linear-gradient(135deg, rgba(255,130,150,0.35), rgba(240,90,120,0.2))' },
        ],
        rightBg: 'linear-gradient(155deg, #fefefe 0%, #fef8f0 30%, #fdf5ea 60%, #fffaf4 100%)',
        tabBg: '#f5f0e6',
        tabActiveBg: '#ffffff',
        tabActiveColor: '#2d1810',
        tabInactiveColor: '#9a8265',
        tabBorder: 'rgba(210,180,120,0.2)',
        welcomeEmoji: '👋✨',
        welcomeSubtext: '',
        titleColor: '#1a1108',
        subtitleColor: '#8b7355',
        inputBg: '#faf7f2',
        inputBorder: '#e8dcc8',
        inputFocusBorder: '#d4a052',
        inputFocusShadow: 'rgba(212,160,82,0.15)',
        inputIconColor: '#b5a48a',
        labelColor: '#5a4632',
        signInGradient: 'linear-gradient(135deg, #f0c27f 0%, #e8a849 35%, #d4943e 70%, #c77d35 100%)',
        signInShadow: 'rgba(212,148,62,0.3)',
        rememberStyle: 'toggle',
        rememberColor: '#d4a052',
        accentColor: '#b8860b',
        securityText: '🔒 Protected by 256-bit encryption',
        overlayColor: 'rgba(0,0,0,0)',
        featureCardBg: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))',
        featureCardBorder: 'rgba(255,255,255,0.15)',
        brandTitleFont: "'Playfair Display', Georgia, serif",
        footerAccentColor: '#b8860b',
        showForgotPassword: false,
        showLabels: true,
        tabStyle: 'pill',
        adminLabel: 'Admin',
        waiterLabel: 'Waiter',
    },
    // THEME 4: Pool Paradise (Purple Gradient) — Image 1 (beach/pool)
    {
        id: 'pool-paradise',
        name: '🌴 Paradise',
        bgImage: "https://images.unsplash.com/photo-1582719508461-905c673771fd?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=85",
        overlayGradient: 'linear-gradient(160deg, rgba(200,220,255,0.10) 0%, rgba(160,180,240,0.15) 50%, rgba(130,150,220,0.20) 100%)',
        brandSubtitle: 'Premium Hotel\nManagement System',
        features: [
            { icon: '⚡', label: 'Fast & Reliable', iconBg: 'rgba(255,255,255,0.5)' },
            { icon: '🔒', label: 'Secure', iconBg: 'rgba(255,255,255,0.5)' },
        ],
        rightBg: 'linear-gradient(155deg, #fafbff 0%, #f4f6ff 30%, #eef2ff 60%, #f8f9ff 100%)',
        tabBg: '#f1f5f9',
        tabActiveBg: '#6366f1',
        tabActiveColor: '#ffffff',
        tabInactiveColor: '#64748b',
        tabBorder: '#e2e8f0',
        welcomeEmoji: '👋',
        welcomeSubtext: 'Please sign in to your dashboard',
        titleColor: '#1e293b',
        subtitleColor: '#64748b',
        inputBg: '#f8fafc',
        inputBorder: '#e2e8f0',
        inputFocusBorder: '#818cf8',
        inputFocusShadow: 'rgba(129,140,248,0.15)',
        inputIconColor: '#94a3b8',
        labelColor: '#475569',
        signInGradient: 'linear-gradient(135deg, #60a5fa 0%, #818cf8 40%, #a78bfa 70%, #c084fc 100%)',
        signInShadow: 'rgba(129,140,248,0.35)',
        rememberStyle: 'checkbox',
        rememberColor: '#818cf8',
        accentColor: '#6366f1',
        securityText: '● System Online',
        overlayColor: 'rgba(0,0,0,0)',
        featureCardBg: 'rgba(255,255,255,0.5)',
        featureCardBorder: 'rgba(255,255,255,0.4)',
        brandTitleFont: "'Inter', sans-serif",
        footerAccentColor: '#6366f1',
        showForgotPassword: true,
        showLabels: false,
        tabStyle: 'pill',
        adminLabel: 'Admin Portal',
        waiterLabel: 'Waiter Station',
    },
];
