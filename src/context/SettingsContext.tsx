'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

interface CompanySettings {
    company_name: string;
    address: string;
    city: string;
    country: string;
    phone: string;
    email: string;
    kra_pin: string;
    currency_code: string;
    currency_symbol: string;
    footer_note: string;
    receipt_header: string;
    receipt_footer: string;
    vat_rate: number;
}

const defaultSettings: CompanySettings = {
    company_name: 'Hotel System',
    address: '',
    city: '',
    country: 'Kenya',
    phone: '',
    email: '',
    kra_pin: '',
    currency_code: 'KES',
    currency_symbol: 'KSh',
    footer_note: 'Thank you for your business!',
    receipt_header: '',
    receipt_footer: 'Thank you for visiting us!',
    vat_rate: 16,
};

interface SettingsContextType {
    settings: CompanySettings;
    isLoading: boolean;
    refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
    settings: defaultSettings,
    isLoading: true,
    refreshSettings: async () => { },
});

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<CompanySettings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);

    const loadSettings = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('organisation_settings')
                .select('setting_key, setting_value');

            if (error) {
                console.error('Error loading settings:', error);
                return;
            }

            if (data && data.length > 0) {
                const loadedSettings = { ...defaultSettings };
                data.forEach((item: { setting_key: string; setting_value: string }) => {
                    const key = item.setting_key as keyof CompanySettings;
                    if (key in loadedSettings) {
                        if (typeof loadedSettings[key] === 'number') {
                            (loadedSettings as Record<string, unknown>)[key] = parseFloat(item.setting_value) || 0;
                        } else {
                            (loadedSettings as Record<string, unknown>)[key] = item.setting_value || '';
                        }
                    }
                });
                setSettings(loadedSettings);
            }
        } catch (err) {
            console.error('Failed to load company settings:', err);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    return (
        <SettingsContext.Provider value={{ settings, isLoading, refreshSettings: loadSettings }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    return useContext(SettingsContext);
}

export function useCompanyName() {
    const { settings } = useSettings();
    return settings.company_name || 'Hotel System';
}

export function useCurrency() {
    const { settings } = useSettings();
    return {
        code: settings.currency_code || 'KES',
        symbol: settings.currency_symbol || 'KSh',
    };
}
