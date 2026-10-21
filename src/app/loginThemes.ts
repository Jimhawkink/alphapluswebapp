// =========================================================================
// REAL RESTAURANT LOGIN THEMES & SCENERY CONFIGURATIONS
// Features 5 authentic real restaurant photographs:
// 1. Fine Dining & Grand Hall
// 2. Executive Chef's Culinary Pass
// 3. Luxury Cocktail Bar & Lounge
// 4. Alfresco Terrace & Sunset Patio
// 5. Imperial Grand Banquet Hall
// =========================================================================

export interface LoginTheme {
    id: string;
    name: string;
    tagline: string;
    bgImage: string;
    overlayGradient: string;
    brandSubtitle: string;
    features: { icon: string; label: string; desc?: string; iconBg: string }[];
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
    // SCENE 1: REAL FINE DINING & GRAND CANDLELIT HALL
    {
        id: 'fine-dining',
        name: '🍷 Fine Dining',
        tagline: 'Michelin Standard Dining & Crystal Stemware',
        bgImage: '/images/restaurant/real_fine_dining.jpg',
        overlayGradient: 'linear-gradient(160deg, rgba(15,23,42,0.55) 0%, rgba(30,27,75,0.65) 50%, rgba(15,23,42,0.85) 100%)',
        brandSubtitle: 'Fine Dining & Hospitality Management Suite',
        features: [
            { icon: '🍷', label: 'Fine Dining Service', desc: 'Table-side ordering & guest tabs', iconBg: 'rgba(239,68,68,0.25)' },
            { icon: '⚡', label: 'Rapid POS Checkout', desc: '0.2s thermal billing & M-Pesa STK', iconBg: 'rgba(59,130,246,0.25)' },
            { icon: '⭐', label: 'VIP Guest Ledger', desc: 'Room charge & corporate billing', iconBg: 'rgba(245,158,11,0.25)' },
        ],
        rightBg: 'linear-gradient(155deg, #f8faff 0%, #f0f4ff 35%, #edf1fc 70%, #f5f7ff 100%)',
        tabBg: '#eef2f9',
        tabActiveBg: '#3b82f6',
        tabActiveColor: '#ffffff',
        tabInactiveColor: '#64748b',
        tabBorder: '#e2e8f0',
        welcomeEmoji: '✨',
        welcomeSubtext: 'Welcome back! Sign in to manage floor, kitchen & cashier',
        titleColor: '#0f172a',
        subtitleColor: '#64748b',
        inputBg: '#ffffff',
        inputBorder: '#e2e8f0',
        inputFocusBorder: '#3b82f6',
        inputFocusShadow: 'rgba(59,130,246,0.18)',
        inputIconColor: '#94a3b8',
        labelColor: '#475569',
        signInGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)',
        signInShadow: 'rgba(37,99,235,0.35)',
        rememberStyle: 'checkbox',
        rememberColor: '#3b82f6',
        accentColor: '#2563eb',
        securityText: '🔒 256-Bit SSL Encrypted Enterprise Terminal',
        overlayColor: 'rgba(0,0,0,0)',
        featureCardBg: 'rgba(255,255,255,0.12)',
        featureCardBorder: 'rgba(255,255,255,0.18)',
        brandTitleFont: "'Playfair Display', Georgia, serif",
        footerAccentColor: '#2563eb',
        showForgotPassword: true,
        showLabels: true,
        tabStyle: 'pill',
        adminLabel: 'Manager / Cashier',
        waiterLabel: 'Waiter PIN Station',
    },

    // SCENE 2: REAL EXECUTIVE CHEF KITCHEN & PASS
    {
        id: 'chef-kitchen',
        name: '👨‍🍳 Chef Kitchen',
        tagline: 'High-Velocity Commercial Kitchen & KOT Pass',
        bgImage: '/images/restaurant/real_chef_kitchen.jpg',
        overlayGradient: 'linear-gradient(160deg, rgba(20,10,5,0.60) 0%, rgba(40,15,5,0.70) 50%, rgba(15,10,10,0.88) 100%)',
        brandSubtitle: 'Culinary Operations & Kitchen Expedite',
        features: [
            { icon: '🍳', label: 'Live KOT Kitchen Display', desc: 'Instant chef ticket dispatch', iconBg: 'rgba(249,115,22,0.25)' },
            { icon: '🥩', label: 'Recipe & Ingredient Stock', desc: 'Real-time portion deductions', iconBg: 'rgba(220,38,38,0.25)' },
            { icon: '⏱️', label: 'Rush Order Tracking', desc: 'Ticket timer & course pacing', iconBg: 'rgba(234,179,8,0.25)' },
        ],
        rightBg: 'linear-gradient(155deg, #fefbf6 0%, #fdf5ea 35%, #faf0df 70%, #fffdf8 100%)',
        tabBg: '#f5ebe0',
        tabActiveBg: '#ea580c',
        tabActiveColor: '#ffffff',
        tabInactiveColor: '#78350f',
        tabBorder: '#fed7aa',
        welcomeEmoji: '🔥',
        welcomeSubtext: 'Kitchen & Service Staff Login Portal',
        titleColor: '#1c1917',
        subtitleColor: '#78716c',
        inputBg: '#ffffff',
        inputBorder: '#fed7aa',
        inputFocusBorder: '#ea580c',
        inputFocusShadow: 'rgba(234,88,12,0.18)',
        inputIconColor: '#c2410c',
        labelColor: '#44403c',
        signInGradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%)',
        signInShadow: 'rgba(234,88,12,0.35)',
        rememberStyle: 'toggle',
        rememberColor: '#ea580c',
        accentColor: '#ea580c',
        securityText: '● High-Velocity Kitchen Network Active',
        overlayColor: 'rgba(0,0,0,0)',
        featureCardBg: 'rgba(255,255,255,0.12)',
        featureCardBorder: 'rgba(255,255,255,0.20)',
        brandTitleFont: "'Inter', sans-serif",
        footerAccentColor: '#ea580c',
        showForgotPassword: true,
        showLabels: true,
        tabStyle: 'pill',
        adminLabel: 'Head Chef / Admin',
        waiterLabel: 'Kitchen Waiter PIN',
    },

    // SCENE 3: REAL COCKTAIL BAR & NIGHT LOUNGE
    {
        id: 'cocktail-bar',
        name: '🍸 Cocktail Bar',
        tagline: 'Ambient Amber Lighting & Mixology Counter',
        bgImage: '/images/restaurant/real_cocktail_bar.jpg',
        overlayGradient: 'linear-gradient(160deg, rgba(10,5,20,0.65) 0%, rgba(25,10,40,0.75) 50%, rgba(5,2,15,0.90) 100%)',
        brandSubtitle: 'Bar, Lounge & Beverage Point of Sale',
        features: [
            { icon: '🍸', label: 'Bar Tab Splitting', desc: 'Hold, transfer & combine drinks', iconBg: 'rgba(168,85,247,0.25)' },
            { icon: '🍾', label: 'Bottle & Keg Inventory', desc: 'Milliliter and shot-level accuracy', iconBg: 'rgba(217,70,239,0.25)' },
            { icon: '🎵', label: 'Happy Hour Pricing', desc: 'Automated shift price rules', iconBg: 'rgba(99,102,241,0.25)' },
        ],
        rightBg: 'linear-gradient(155deg, #faf5ff 0%, #f3e8ff 35%, #ede9fe 70%, #faf5ff 100%)',
        tabBg: '#f3e8ff',
        tabActiveBg: '#9333ea',
        tabActiveColor: '#ffffff',
        tabInactiveColor: '#6b21a8',
        tabBorder: '#e9d5ff',
        welcomeEmoji: '🥂',
        welcomeSubtext: 'Sign in to access Bar Counter & Beverage Stations',
        titleColor: '#1e1b4b',
        subtitleColor: '#6b7280',
        inputBg: '#ffffff',
        inputBorder: '#e9d5ff',
        inputFocusBorder: '#9333ea',
        inputFocusShadow: 'rgba(147,51,234,0.18)',
        inputIconColor: '#9333ea',
        labelColor: '#374151',
        signInGradient: 'linear-gradient(135deg, #a855f7 0%, #9333ea 50%, #7e22ce 100%)',
        signInShadow: 'rgba(147,51,234,0.35)',
        rememberStyle: 'checkbox',
        rememberColor: '#9333ea',
        accentColor: '#9333ea',
        securityText: '🔒 Secured Bar Shift Register Ready',
        overlayColor: 'rgba(0,0,0,0)',
        featureCardBg: 'rgba(255,255,255,0.12)',
        featureCardBorder: 'rgba(255,255,255,0.20)',
        brandTitleFont: "'Playfair Display', Georgia, serif",
        footerAccentColor: '#9333ea',
        showForgotPassword: true,
        showLabels: true,
        tabStyle: 'pill',
        adminLabel: 'Bar Manager',
        waiterLabel: 'Bartender PIN',
    },

    // SCENE 4: REAL TERRACE & SUNSET PATIO
    {
        id: 'terrace-patio',
        name: '🌅 Sunset Patio',
        tagline: 'Alfresco Garden & Sunset Outdoor Dining',
        bgImage: '/images/restaurant/real_terrace_patio.jpg',
        overlayGradient: 'linear-gradient(160deg, rgba(15,25,20,0.55) 0%, rgba(20,40,30,0.65) 50%, rgba(10,20,15,0.85) 100%)',
        brandSubtitle: 'Outdoor Garden & Alfresco Hospitality',
        features: [
            { icon: '🌿', label: 'Table Layout Map', desc: 'Outdoor terrace & poolside seating', iconBg: 'rgba(16,185,129,0.25)' },
            { icon: '📱', label: 'Mobile Handheld POS', desc: 'Roaming waitstaff tablet support', iconBg: 'rgba(5,150,105,0.25)' },
            { icon: '🧾', label: 'Wireless 58mm Printing', desc: 'Bluetooth portable bill printers', iconBg: 'rgba(52,211,153,0.25)' },
        ],
        rightBg: 'linear-gradient(155deg, #f0fdf4 0%, #ecfdf5 35%, #e6fcf2 70%, #f4fdf8 100%)',
        tabBg: '#dcfce7',
        tabActiveBg: '#059669',
        tabActiveColor: '#ffffff',
        tabInactiveColor: '#065f46',
        tabBorder: '#bbf7d0',
        welcomeEmoji: '🌿',
        welcomeSubtext: 'Outdoor & Terrace Service Station Access',
        titleColor: '#064e3b',
        subtitleColor: '#047857',
        inputBg: '#ffffff',
        inputBorder: '#a7f3d0',
        inputFocusBorder: '#059669',
        inputFocusShadow: 'rgba(5,150,105,0.18)',
        inputIconColor: '#059669',
        labelColor: '#065f46',
        signInGradient: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
        signInShadow: 'rgba(5,150,105,0.35)',
        rememberStyle: 'checkbox',
        rememberColor: '#059669',
        accentColor: '#059669',
        securityText: '● Wireless Roaming Handhelds Connected',
        overlayColor: 'rgba(0,0,0,0)',
        featureCardBg: 'rgba(255,255,255,0.12)',
        featureCardBorder: 'rgba(255,255,255,0.20)',
        brandTitleFont: "'Inter', sans-serif",
        footerAccentColor: '#059669',
        showForgotPassword: true,
        showLabels: true,
        tabStyle: 'pill',
        adminLabel: 'Patio Manager',
        waiterLabel: 'Terrace Server PIN',
    },

    // SCENE 5: REAL LUXURY GRAND BANQUET HALL
    {
        id: 'luxury-hall',
        name: '🏛️ Grand Hall',
        tagline: 'Imperial Architecture & Fine Dining Chandeliers',
        bgImage: '/images/restaurant/real_luxury_hall.jpg',
        overlayGradient: 'linear-gradient(160deg, rgba(20,20,30,0.60) 0%, rgba(35,25,45,0.70) 50%, rgba(15,15,20,0.88) 100%)',
        brandSubtitle: 'Luxury Hotel Restaurant & Event Banquets',
        features: [
            { icon: '🏛️', label: 'Grand Banquet Service', desc: 'Buffet & plated event billing', iconBg: 'rgba(234,179,8,0.25)' },
            { icon: '📊', label: 'Real-Time Revenue Audit', desc: 'Live daily sales & covers count', iconBg: 'rgba(59,130,246,0.25)' },
            { icon: '🛡️', label: 'Multi-Cashier Float', desc: 'Shift opening & drop reconciliation', iconBg: 'rgba(16,185,129,0.25)' },
        ],
        rightBg: 'linear-gradient(155deg, #fdfbf7 0%, #f7f3ec 35%, #f2ece2 70%, #faf7f2 100%)',
        tabBg: '#ede5d8',
        tabActiveBg: '#78350f',
        tabActiveColor: '#ffffff',
        tabInactiveColor: '#92400e',
        tabBorder: '#e7d9c5',
        welcomeEmoji: '👑',
        welcomeSubtext: 'Enter your credentials to begin hotel restaurant shift',
        titleColor: '#1c1917',
        subtitleColor: '#57534e',
        inputBg: '#ffffff',
        inputBorder: '#e7d9c5',
        inputFocusBorder: '#78350f',
        inputFocusShadow: 'rgba(120,53,15,0.18)',
        inputIconColor: '#78350f',
        labelColor: '#44403c',
        signInGradient: 'linear-gradient(135deg, #b45309 0%, #78350f 50%, #451a03 100%)',
        signInShadow: 'rgba(120,53,15,0.35)',
        rememberStyle: 'toggle',
        rememberColor: '#78350f',
        accentColor: '#78350f',
        securityText: '🔒 Enterprise High-Volume Dining Security',
        overlayColor: 'rgba(0,0,0,0)',
        featureCardBg: 'rgba(255,255,255,0.12)',
        featureCardBorder: 'rgba(255,255,255,0.20)',
        brandTitleFont: "'Playfair Display', Georgia, serif",
        footerAccentColor: '#78350f',
        showForgotPassword: true,
        showLabels: true,
        tabStyle: 'pill',
        adminLabel: 'Banquet Director',
        waiterLabel: 'Service Staff PIN',
    }
];
