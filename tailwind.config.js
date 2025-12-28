/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                // Dark Theme Colors
                dark: {
                    bg: '#0a0a0f',
                    card: '#12121a',
                    surface: '#1a1a24',
                    border: '#2a2a3a',
                    hover: '#252535',
                },
                // Accent Colors
                accent: {
                    purple: '#8b5cf6',
                    blue: '#3b82f6',
                    cyan: '#06b6d4',
                    emerald: '#10b981',
                    orange: '#f97316',
                    pink: '#ec4899',
                    red: '#ef4444',
                    yellow: '#eab308',
                },
                // Status Colors
                success: '#22c55e',
                warning: '#eab308',
                error: '#ef4444',
                info: '#3b82f6',
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
                'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
                'glass': 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                'neon-purple': 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 50%, #c084fc 100%)',
                'neon-blue': 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #93c5fd 100%)',
                'neon-emerald': 'linear-gradient(135deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)',
                'neon-orange': 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fdba74 100%)',
            },
            boxShadow: {
                'neon-purple': '0 0 20px rgba(139, 92, 246, 0.5)',
                'neon-blue': '0 0 20px rgba(59, 130, 246, 0.5)',
                'neon-emerald': '0 0 20px rgba(16, 185, 129, 0.5)',
                'neon-orange': '0 0 20px rgba(249, 115, 22, 0.5)',
                'glass': '0 8px 32px rgba(0, 0, 0, 0.4)',
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'gradient': 'gradient 8s ease infinite',
                'float': 'float 6s ease-in-out infinite',
            },
            keyframes: {
                gradient: {
                    '0%, 100%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' },
                },
            },
        },
    },
    plugins: [],
}
