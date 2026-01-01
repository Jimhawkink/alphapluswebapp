'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Guest {
    guest_id: number;
    guest_code: string;
    title: string;
    first_name: string;
    last_name: string;
    full_name: string;
    gender: string;
    date_of_birth: string;
    email: string;
    phone: string;
    phone2: string;
    id_type: string;
    id_number: string;
    nationality: string;
    county: string;
    town: string;
    area_of_residence: string;
    address: string;
    postal_code: string;
    country: string;
    guest_type: string;
    sponsor_type: string;
    company_name: string;
    vehicle_type: string;
    vehicle_registration: string;
    vehicle_color: string;
    next_of_kin_name: string;
    next_of_kin_phone: string;
    next_of_kin_relationship: string;
    next_of_kin_address: string;
    preferences: string;
    special_requests: string;
    notes: string;
    loyalty_points: number;
    total_stays: number;
    total_spent: number;
    is_blacklisted: boolean;
    active: boolean;
    created_at: string;
}

const defaultGuest = {
    title: 'Mr.', first_name: '', last_name: '', gender: 'Male', date_of_birth: '',
    email: '', phone: '', phone2: '', id_type: 'National ID', id_number: '',
    nationality: 'Kenya', county: '', town: '', area_of_residence: '', address: '', postal_code: '', country: 'Kenya',
    guest_type: 'Regular', sponsor_type: 'Self Sponsored', company_name: '',
    vehicle_type: '', vehicle_registration: '', vehicle_color: '',
    next_of_kin_name: '', next_of_kin_phone: '', next_of_kin_relationship: '', next_of_kin_address: '',
    preferences: '', special_requests: '', notes: '',
};

const countries = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
    "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia",
    "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon",
    "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia",
    "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominican Republic", "DR Congo", "Ecuador", "Egypt",
    "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon",
    "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Guatemala", "Guinea", "Guyana", "Haiti", "Honduras", "Hungary",
    "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan",
    "Kenya", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Lithuania", "Luxembourg",
    "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Mauritania", "Mauritius", "Mexico", "Moldova", "Monaco",
    "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nepal", "Netherlands", "New Zealand", "Nicaragua",
    "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palestine", "Panama", "Papua New Guinea",
    "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saudi Arabia", "Senegal",
    "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Somalia", "South Africa", "South Korea",
    "South Sudan", "Spain", "Sri Lanka", "Sudan", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania",
    "Thailand", "Togo", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine", "United Arab Emirates",
    "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

const kenyanCounties = [
    "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado",
    "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
    "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi", "Nakuru",
    "Nandi", "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
    "Trans-Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot"
];

export default function GuestsPage() {
    const router = useRouter();
    const [guests, setGuests] = useState<Guest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
    const [formData, setFormData] = useState(defaultGuest);
    const [isSaving, setIsSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('All');
    const [activeTab, setActiveTab] = useState('personal');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const loadGuests = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('hotel_guests').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setGuests(data || []);
        } catch (err) {
            console.error('Error loading guests:', err);
            toast.error('Failed to load guests');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadGuests(); }, [loadGuests]);

    const openAddModal = () => {
        setEditingGuest(null);
        setFormData(defaultGuest);
        setActiveTab('personal');
        setShowModal(true);
    };

    const openEditModal = (guest: Guest) => {
        setEditingGuest(guest);
        setFormData({
            title: guest.title || 'Mr.',
            first_name: guest.first_name || '',
            last_name: guest.last_name || '',
            gender: guest.gender || 'Male',
            date_of_birth: guest.date_of_birth || '',
            email: guest.email || '',
            phone: guest.phone || '',
            phone2: guest.phone2 || '',
            id_type: guest.id_type || 'National ID',
            id_number: guest.id_number || '',
            nationality: guest.nationality || 'Kenya',
            county: guest.county || '',
            town: guest.town || '',
            area_of_residence: guest.area_of_residence || '',
            address: guest.address || '',
            postal_code: guest.postal_code || '',
            country: guest.country || 'Kenya',
            guest_type: guest.guest_type || 'Regular',
            sponsor_type: guest.sponsor_type || 'Self Sponsored',
            company_name: guest.company_name || '',
            vehicle_type: guest.vehicle_type || '',
            vehicle_registration: guest.vehicle_registration || '',
            vehicle_color: guest.vehicle_color || '',
            next_of_kin_name: guest.next_of_kin_name || '',
            next_of_kin_phone: guest.next_of_kin_phone || '',
            next_of_kin_relationship: guest.next_of_kin_relationship || '',
            next_of_kin_address: guest.next_of_kin_address || '',
            preferences: guest.preferences || '',
            special_requests: guest.special_requests || '',
            notes: guest.notes || '',
        });
        setActiveTab('personal');
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.first_name.trim()) { toast.error('First name is required'); return; }
        if (!formData.phone.trim()) { toast.error('Phone number is required'); return; }
        setIsSaving(true);
        try {
            const fullName = `${formData.title} ${formData.first_name} ${formData.last_name}`.trim();

            // Build guest data with only the fields we're sending
            const guestData: Record<string, unknown> = {
                title: formData.title,
                first_name: formData.first_name,
                last_name: formData.last_name,
                full_name: fullName,
                email: formData.email || null,
                phone: formData.phone,
                phone2: formData.phone2 || null,
                id_type: formData.id_type,
                id_number: formData.id_number || null,
                nationality: formData.nationality,
                address: formData.address || null,
                country: formData.country,
                postal_code: formData.postal_code || null,
                guest_type: formData.guest_type,
                company_name: formData.company_name || null,
                preferences: formData.preferences || null,
                special_requests: formData.special_requests || null,
                notes: formData.notes || null,
                updated_at: new Date().toISOString(),
                // New fields - only include if they have values
                ...(formData.gender && { gender: formData.gender }),
                ...(formData.date_of_birth && { date_of_birth: formData.date_of_birth }),
                ...(formData.county && { county: formData.county }),
                ...(formData.town && { town: formData.town }),
                ...(formData.area_of_residence && { area_of_residence: formData.area_of_residence }),
                ...(formData.sponsor_type && { sponsor_type: formData.sponsor_type }),
                ...(formData.vehicle_type && { vehicle_type: formData.vehicle_type }),
                ...(formData.vehicle_registration && { vehicle_registration: formData.vehicle_registration }),
                ...(formData.vehicle_color && { vehicle_color: formData.vehicle_color }),
                ...(formData.next_of_kin_name && { next_of_kin_name: formData.next_of_kin_name }),
                ...(formData.next_of_kin_phone && { next_of_kin_phone: formData.next_of_kin_phone }),
                ...(formData.next_of_kin_relationship && { next_of_kin_relationship: formData.next_of_kin_relationship }),
                ...(formData.next_of_kin_address && { next_of_kin_address: formData.next_of_kin_address }),
            };

            if (editingGuest) {
                const { error } = await supabase.from('hotel_guests').update(guestData).eq('guest_id', editingGuest.guest_id);
                if (error) throw error;
                toast.success('Guest updated successfully ✓');
            } else {
                const guestCode = `G-${Date.now().toString().slice(-6)}`;
                const { error } = await supabase.from('hotel_guests').insert({ ...guestData, guest_code: guestCode, active: true });
                if (error) throw error;
                toast.success('Guest registered successfully ✓');
            }
            setShowModal(false);
            loadGuests();
        } catch (err: unknown) {
            console.error('Error saving guest:', err);
            const errorMessage = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Unknown error';
            toast.error(`Failed to save: ${errorMessage}`);
        }
        setIsSaving(false);
    };

    const deleteGuest = async (guest: Guest) => {
        if (!confirm(`Delete guest "${guest.full_name}"?`)) return;
        try {
            const { error } = await supabase.from('hotel_guests').delete().eq('guest_id', guest.guest_id);
            if (error) throw error;
            toast.success('Guest deleted');
            loadGuests();
        } catch (err) {
            console.error('Error deleting guest:', err);
            toast.error('Failed to delete');
        }
    };

    const filteredGuests = guests.filter(g => {
        const matchesSearch = (g.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (g.phone || '').includes(searchQuery) ||
            (g.guest_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (g.id_number || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === 'All' || g.guest_type === filterType;
        return matchesSearch && matchesType;
    });

    const stats = {
        total: guests.length,
        vip: guests.filter(g => g.guest_type === 'VIP').length,
        corporate: guests.filter(g => g.guest_type === 'Corporate').length,
        regular: guests.filter(g => g.guest_type === 'Regular').length,
        male: guests.filter(g => g.gender === 'Male').length,
        female: guests.filter(g => g.gender === 'Female').length,
        selfSponsored: guests.filter(g => g.sponsor_type === 'Self Sponsored').length,
        orgSponsored: guests.filter(g => g.sponsor_type === 'Organisation').length,
    };

    // Pagination
    const totalPages = Math.ceil(filteredGuests.length / itemsPerPage);
    const paginatedGuests = filteredGuests.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const tabs = [
        { id: 'personal', label: '👤 Personal Info', icon: '👤' },
        { id: 'identification', label: '🪪 Identification', icon: '🪪' },
        { id: 'address', label: '📍 Address & Location', icon: '📍' },
        { id: 'vehicle', label: '🚗 Vehicle Details', icon: '🚗' },
        { id: 'nextofkin', label: '👨‍👩‍👧 Next of Kin', icon: '👨‍👩‍👧' },
        { id: 'preferences', label: '⭐ Preferences', icon: '⭐' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">👥</span>
                        Guest Management
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Register and manage hotel guests</p>
                </div>
                <button onClick={openAddModal} className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all">
                    <span className="text-xl">➕</span> Register New Guest
                </button>
            </div>

            {/* Stats Cards - Matching Dashboard Style */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {/* Total Guests - Large Green */}
                <div className="md:col-span-1 lg:col-span-1 bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute top-4 right-4 px-2 py-1 bg-white/20 rounded-full text-xs font-medium">↑ 0%</div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
                            <span className="text-2xl">👥</span>
                        </div>
                        <p className="text-sm opacity-80 font-medium">Total Guests</p>
                        <p className="text-4xl font-bold mt-1">{stats.total}</p>
                        <p className="text-xs opacity-70 mt-1">Registered guests</p>
                    </div>
                </div>

                {/* VIP Guests */}
                <div className="bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                            <span className="text-xl">👑</span>
                        </div>
                        <p className="text-xs opacity-80 font-medium">VIP Guests</p>
                        <p className="text-3xl font-bold mt-1">{stats.vip}</p>
                    </div>
                </div>

                {/* Corporate */}
                <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                            <span className="text-xl">🏢</span>
                        </div>
                        <p className="text-xs opacity-80 font-medium">Corporate</p>
                        <p className="text-3xl font-bold mt-1">{stats.corporate}</p>
                    </div>
                </div>

                {/* Male Guests */}
                <div className="bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-600 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                            <span className="text-xl">👨</span>
                        </div>
                        <p className="text-xs opacity-80 font-medium">Male</p>
                        <p className="text-3xl font-bold mt-1">{stats.male}</p>
                    </div>
                </div>

                {/* Female Guests */}
                <div className="bg-gradient-to-br from-pink-400 via-pink-500 to-rose-600 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                            <span className="text-xl">👩</span>
                        </div>
                        <p className="text-xs opacity-80 font-medium">Female</p>
                        <p className="text-3xl font-bold mt-1">{stats.female}</p>
                    </div>
                </div>
            </div>

            {/* Second Row of Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                            <span className="text-xl">✨</span>
                        </div>
                        <p className="text-xs opacity-80 font-medium">Regular</p>
                        <p className="text-3xl font-bold mt-1">{stats.regular}</p>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-violet-400 via-purple-500 to-indigo-600 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                            <span className="text-xl">💳</span>
                        </div>
                        <p className="text-xs opacity-80 font-medium">Self Sponsored</p>
                        <p className="text-3xl font-bold mt-1">{stats.selfSponsored}</p>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-orange-400 via-amber-500 to-yellow-600 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                            <span className="text-xl">🏛️</span>
                        </div>
                        <p className="text-xs opacity-80 font-medium">Org. Sponsored</p>
                        <p className="text-3xl font-bold mt-1">{stats.orgSponsored}</p>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-slate-600 via-slate-700 to-gray-900 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                            <span className="text-xl">🚗</span>
                        </div>
                        <p className="text-xs opacity-80 font-medium">With Vehicles</p>
                        <p className="text-3xl font-bold mt-1">{guests.filter(g => g.vehicle_registration).length}</p>
                    </div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <input type="text" placeholder="🔍 Search by name, phone, guest code, or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-5 py-3 pl-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔎</span>
                    </div>
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500">
                        <option value="All">📋 All Types</option>
                        <option value="VIP">👑 VIP</option>
                        <option value="Corporate">🏢 Corporate</option>
                        <option value="Regular">✨ Regular</option>
                        <option value="Walk-in">🚶 Walk-in</option>
                    </select>
                    <button onClick={loadGuests} className="px-5 py-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 font-medium transition-all flex items-center gap-2">🔄 Refresh</button>
                </div>
            </div>

            {/* Guests Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
                                <th className="px-4 py-4 text-left text-sm font-semibold">Guest</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Contact</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">ID</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Gender</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Location</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Sponsor</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Vehicle</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Type</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={9} className="px-4 py-12 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-10 h-10 border-4 border-blue-400/30 border-t-blue-500 rounded-full animate-spin" />
                                        <span className="text-gray-500">Loading guests...</span>
                                    </div>
                                </td></tr>
                            ) : paginatedGuests.length === 0 ? (
                                <tr><td colSpan={9} className="px-4 py-12 text-center">
                                    <span className="text-5xl">👥</span>
                                    <p className="text-gray-500 mt-2">No guests found</p>
                                    <button onClick={openAddModal} className="mt-4 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:shadow-lg transition-all">Register First Guest</button>
                                </td></tr>
                            ) : (
                                paginatedGuests.map(guest => (
                                    <tr key={guest.guest_id} className="border-t border-gray-50 hover:bg-blue-50/50 transition-colors">
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${guest.gender === 'Female' ? 'bg-gradient-to-br from-pink-400 to-rose-500' : 'bg-gradient-to-br from-blue-400 to-indigo-500'}`}>
                                                    {(guest.first_name || 'G').charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-800">{guest.full_name || guest.first_name}</p>
                                                    <p className="text-xs text-blue-600 font-medium">{guest.guest_code}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <p className="text-gray-800">📞 {guest.phone}</p>
                                            <p className="text-xs text-gray-500">✉️ {guest.email || 'N/A'}</p>
                                        </td>
                                        <td className="px-4 py-4">
                                            <p className="text-sm text-gray-700">{guest.id_type}</p>
                                            <p className="text-xs font-mono text-gray-500">{guest.id_number || 'N/A'}</p>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${guest.gender === 'Female' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {guest.gender === 'Female' ? '👩 Female' : '👨 Male'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <p className="text-sm text-gray-700">{guest.county || 'N/A'}</p>
                                            <p className="text-xs text-gray-500">{guest.town || guest.area_of_residence || ''}</p>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${guest.sponsor_type === 'Organisation' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                                                {guest.sponsor_type === 'Organisation' ? '🏛️ Org' : '💳 Self'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            {guest.vehicle_registration ? (
                                                <div>
                                                    <p className="text-sm font-mono font-semibold text-gray-800">🚗 {guest.vehicle_registration}</p>
                                                    <p className="text-xs text-gray-500">{guest.vehicle_type} {guest.vehicle_color}</p>
                                                </div>
                                            ) : <span className="text-gray-400 text-sm">No vehicle</span>}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${guest.guest_type === 'VIP' ? 'bg-amber-100 text-amber-700' : guest.guest_type === 'Corporate' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                                                {guest.guest_type === 'VIP' ? '👑' : guest.guest_type === 'Corporate' ? '🏢' : '✨'} {guest.guest_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => router.push(`/dashboard/hotel/checkin?guestId=${guest.guest_id}`)} className="p-2 bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 text-white rounded-xl transition-all hover:scale-110 shadow-sm" title="Check-In">🔑</button>
                                                <button onClick={() => openEditModal(guest)} className="p-2 bg-gradient-to-r from-blue-400 to-indigo-500 hover:from-blue-500 hover:to-indigo-600 text-white rounded-xl transition-all hover:scale-110 shadow-sm" title="Edit">✏️</button>
                                                <button onClick={() => deleteGuest(guest)} className="p-2 bg-gradient-to-r from-red-400 to-rose-500 hover:from-red-500 hover:to-rose-600 text-white rounded-xl transition-all hover:scale-110 shadow-sm" title="Delete">🗑️</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Pagination Footer */}
                {filteredGuests.length > 0 && (
                    <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
                        <p className="text-sm text-gray-600">
                            Showing <span className="font-semibold text-gray-800">{((currentPage - 1) * itemsPerPage) + 1}</span> to <span className="font-semibold text-gray-800">{Math.min(currentPage * itemsPerPage, filteredGuests.length)}</span> of <span className="font-semibold text-gray-800">{filteredGuests.length}</span> guests
                        </p>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Page {currentPage} of {totalPages || 1}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 bg-gradient-to-r from-gray-200 to-gray-300 hover:from-gray-300 hover:to-gray-400 text-gray-700 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                ← Previous
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages || totalPages === 0}
                                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Guest Registration Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 px-6 py-5 text-white">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold">{editingGuest ? '✏️ Edit Guest Profile' : '➕ Register New Guest'}</h2>
                                    <p className="text-blue-100 text-sm mt-1">Complete guest registration with all details</p>
                                </div>
                                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-full transition-all">✕</button>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 overflow-x-auto">
                            <div className="flex gap-2 min-w-max">
                                {tabs.map(tab => (
                                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-500 text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Form Content */}
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
                            {/* Personal Info Tab */}
                            {activeTab === 'personal' && (
                                <div className="space-y-6">
                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
                                        <h3 className="text-lg font-bold text-blue-800 mb-4 flex items-center gap-2">👤 Personal Information</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">Title</label>
                                                <select value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500">
                                                    <option>Mr.</option><option>Mrs.</option><option>Ms.</option><option>Dr.</option><option>Prof.</option><option>Hon.</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">First Name *</label>
                                                <input type="text" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} placeholder="First Name" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" required />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">Last Name</label>
                                                <input type="text" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} placeholder="Last Name" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">Gender *</label>
                                                <div className="flex gap-3">
                                                    <button type="button" onClick={() => setFormData({ ...formData, gender: 'Male' })} className={`flex-1 py-3 rounded-xl font-semibold transition-all ${formData.gender === 'Male' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>👨 Male</button>
                                                    <button type="button" onClick={() => setFormData({ ...formData, gender: 'Female' })} className={`flex-1 py-3 rounded-xl font-semibold transition-all ${formData.gender === 'Female' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>👩 Female</button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">Date of Birth</label>
                                                <input type="date" value={formData.date_of_birth} onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">📞 Phone Number *</label>
                                                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="0712345678" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" required />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">📞 Alt. Phone</label>
                                                <input type="tel" value={formData.phone2} onChange={(e) => setFormData({ ...formData, phone2: e.target.value })} placeholder="Alternative Phone" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                                            </div>
                                        </div>
                                        <div className="mt-4">
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">✉️ Email Address</label>
                                            <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-5 border border-purple-100">
                                        <h3 className="text-lg font-bold text-purple-800 mb-4 flex items-center gap-2">🏷️ Guest Category & Sponsorship</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">Guest Type</label>
                                                <select value={formData.guest_type} onChange={(e) => setFormData({ ...formData, guest_type: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500">
                                                    <option value="Regular">✨ Regular</option>
                                                    <option value="VIP">👑 VIP</option>
                                                    <option value="Corporate">🏢 Corporate</option>
                                                    <option value="Walk-in">🚶 Walk-in</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">Sponsorship</label>
                                                <select value={formData.sponsor_type} onChange={(e) => setFormData({ ...formData, sponsor_type: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500">
                                                    <option value="Self Sponsored">💳 Self Sponsored</option>
                                                    <option value="Organisation">🏛️ Organisation Sponsored</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">Organisation Name</label>
                                                <input type="text" value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} placeholder="Company/Organisation name" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500" disabled={formData.sponsor_type !== 'Organisation'} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Identification Tab */}
                            {activeTab === 'identification' && (
                                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-5 border border-amber-100">
                                    <h3 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2">🪪 Identification Details</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">ID Type</label>
                                            <select value={formData.id_type} onChange={(e) => setFormData({ ...formData, id_type: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-amber-500">
                                                <option>National ID</option>
                                                <option>Passport</option>
                                                <option>Driving License</option>
                                                <option>Military ID</option>
                                                <option>Student ID</option>
                                                <option>Work Permit</option>
                                                <option>Alien ID</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">ID Number</label>
                                            <input type="text" value={formData.id_number} onChange={(e) => setFormData({ ...formData, id_number: e.target.value.toUpperCase() })} placeholder="e.g. 12345678" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-amber-500 font-mono" />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">🌍 Nationality</label>
                                            <select value={formData.nationality} onChange={(e) => setFormData({ ...formData, nationality: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-amber-500">
                                                {countries.map(country => (
                                                    <option key={country} value={country}>{country}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Address Tab */}
                            {activeTab === 'address' && (
                                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-5 border border-green-100">
                                    <h3 className="text-lg font-bold text-green-800 mb-4 flex items-center gap-2">📍 Address & Location</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">🌍 Country</label>
                                            <select value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500">
                                                {countries.map(country => (
                                                    <option key={country} value={country}>{country}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">🏛️ County</label>
                                            {formData.country === 'Kenya' ? (
                                                <select value={formData.county} onChange={(e) => setFormData({ ...formData, county: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500">
                                                    <option value="">Select County</option>
                                                    {kenyanCounties.map(county => (
                                                        <option key={county} value={county}>{county}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input type="text" value={formData.county} onChange={(e) => setFormData({ ...formData, county: e.target.value })} placeholder="State/Province" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">🏙️ Town/City</label>
                                            <input type="text" value={formData.town} onChange={(e) => setFormData({ ...formData, town: e.target.value })} placeholder="e.g. Nairobi" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">🏘️ Area of Residence</label>
                                            <input type="text" value={formData.area_of_residence} onChange={(e) => setFormData({ ...formData, area_of_residence: e.target.value })} placeholder="e.g. Westlands, Kilimani" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">📮 Postal Code</label>
                                            <input type="text" value={formData.postal_code} onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })} placeholder="e.g. 00100" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">🏠 Full Address</label>
                                            <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Street address, Building name" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Vehicle Tab */}
                            {activeTab === 'vehicle' && (
                                <div className="bg-gradient-to-r from-slate-50 to-gray-100 rounded-2xl p-5 border border-slate-200">
                                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">🚗 Vehicle Information</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Vehicle Type</label>
                                            <select value={formData.vehicle_type} onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-slate-500">
                                                <option value="">Select Vehicle Type</option>
                                                <option value="Sedan">🚗 Sedan</option>
                                                <option value="SUV">🚙 SUV</option>
                                                <option value="Pickup">🛻 Pickup</option>
                                                <option value="Van">🚐 Van</option>
                                                <option value="Bus">🚌 Bus</option>
                                                <option value="Motorcycle">🏍️ Motorcycle</option>
                                                <option value="Truck">🚛 Truck</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">🔢 Registration Number</label>
                                            <input type="text" value={formData.vehicle_registration} onChange={(e) => setFormData({ ...formData, vehicle_registration: e.target.value.toUpperCase() })} placeholder="e.g. KCB 123A" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-slate-500 font-mono text-lg tracking-wider" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">🎨 Vehicle Color</label>
                                            <input type="text" value={formData.vehicle_color} onChange={(e) => setFormData({ ...formData, vehicle_color: e.target.value })} placeholder="e.g. White, Black, Silver" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-slate-500" />
                                        </div>
                                    </div>
                                    <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                                        <p className="text-sm text-blue-700 flex items-center gap-2">
                                            <span className="text-lg">💡</span>
                                            Vehicle details are optional but recommended for security and parking management.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Next of Kin Tab */}
                            {activeTab === 'nextofkin' && (
                                <div className="bg-gradient-to-r from-rose-50 to-pink-50 rounded-2xl p-5 border border-rose-100">
                                    <h3 className="text-lg font-bold text-rose-800 mb-4 flex items-center gap-2">👨‍👩‍👧 Next of Kin / Emergency Contact</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name</label>
                                            <input type="text" value={formData.next_of_kin_name} onChange={(e) => setFormData({ ...formData, next_of_kin_name: e.target.value })} placeholder="Next of kin's full name" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">📞 Phone Number</label>
                                            <input type="tel" value={formData.next_of_kin_phone} onChange={(e) => setFormData({ ...formData, next_of_kin_phone: e.target.value })} placeholder="0712345678" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Relationship</label>
                                            <select value={formData.next_of_kin_relationship} onChange={(e) => setFormData({ ...formData, next_of_kin_relationship: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500">
                                                <option value="">Select Relationship</option>
                                                <option value="Spouse">💑 Spouse</option>
                                                <option value="Parent">👨‍👩‍👦 Parent</option>
                                                <option value="Sibling">👫 Sibling</option>
                                                <option value="Child">👶 Child</option>
                                                <option value="Friend">🧑‍🤝‍🧑 Friend</option>
                                                <option value="Colleague">💼 Colleague</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">📍 Address</label>
                                            <input type="text" value={formData.next_of_kin_address} onChange={(e) => setFormData({ ...formData, next_of_kin_address: e.target.value })} placeholder="Next of kin's address" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500" />
                                        </div>
                                    </div>
                                    <div className="mt-4 p-4 bg-rose-100 rounded-xl border border-rose-200">
                                        <p className="text-sm text-rose-700 flex items-center gap-2">
                                            <span className="text-lg">⚠️</span>
                                            Emergency contact information is important for guest safety.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Preferences Tab */}
                            {activeTab === 'preferences' && (
                                <div className="space-y-5">
                                    <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-2xl p-5 border border-cyan-100">
                                        <h3 className="text-lg font-bold text-cyan-800 mb-4 flex items-center gap-2">⭐ Guest Preferences</h3>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Room Preferences</label>
                                            <textarea value={formData.preferences} onChange={(e) => setFormData({ ...formData, preferences: e.target.value })} placeholder="e.g. Non-smoking room, high floor, away from elevator..." rows={3} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-500" />
                                        </div>
                                        <div className="mt-4">
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Special Requests</label>
                                            <textarea value={formData.special_requests} onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })} placeholder="e.g. Extra pillows, late checkout, dietary requirements..." rows={3} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-500" />
                                        </div>
                                    </div>
                                    <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-2xl p-5 border border-yellow-100">
                                        <h3 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2">📝 Additional Notes</h3>
                                        <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Any other important information about this guest..." rows={4} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-amber-500" />
                                    </div>
                                </div>
                            )}
                        </form>

                        {/* Modal Footer */}
                        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                            <div className="flex gap-4">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 transition-all">Cancel</button>
                                <button onClick={handleSubmit} disabled={isSaving} className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50">
                                    {isSaving ? '⏳ Saving...' : editingGuest ? '💾 Update Guest' : '✅ Register Guest'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
