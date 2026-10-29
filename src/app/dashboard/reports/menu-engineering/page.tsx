'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

interface MenuDishMetric {
    pid: number;
    code: string;
    name: string;
    category: string;
    selling_price: number;
    cost_price: number;
    margin_per_unit: number;
    margin_percent: number;
    qty_sold: number;
    total_revenue: number;
    total_profit: number;
    quadrant: 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG';
    action_recommendation: string;
}

export default function MenuEngineeringMatrixPage() {
    const [dishes, setDishes] = useState<MenuDishMetric[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeQuadrantFilter, setActiveQuadrantFilter] = useState<'ALL' | 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG'>('ALL');
    const [selectedCategory, setSelectedCategory] = useState('ALL');

    // Live Clock
    const [liveTime, setLiveTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setLiveTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Load Menu Data and Sales History
    const loadMenuMatrix = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Fetch products
            const { data: productsData, error: pErr } = await supabase
                .from('product')
                .select('*');

            if (pErr) throw pErr;

            // 2. Fetch sales items
            const { data: salesItemsData } = await supabase
                .from('sales_items')
                .select('*');

            const pList = productsData || [];
            const sItems = salesItemsData || [];

            // Aggregate Sales Qty & Revenue per product
            const salesMap = new Map<string, { qty: number; revenue: number }>();
            sItems.forEach(item => {
                const nameKey = (item.product_name || item.dish_name || '').toLowerCase().trim();
                const current = salesMap.get(nameKey) || { qty: 0, revenue: 0 };
                const q = Number(item.quantity) || 1;
                const r = Number(item.subtotal) || (q * (Number(item.unit_price) || 0));
                current.qty += q;
                current.revenue += r;
                salesMap.set(nameKey, current);
            });

            // Map dish metrics
            const initialMetrics = pList.map(p => {
                const nameKey = (p.product_name || '').toLowerCase().trim();
                const salesInfo = salesMap.get(nameKey) || { qty: 0, revenue: 0 };
                const sellPrice = Number(p.sales_cost) || 0;
                const costPrice = Number(p.purchase_cost) || Math.round(sellPrice * 0.45);
                const margin = Math.max(0, sellPrice - costPrice);
                const marginPct = sellPrice > 0 ? Math.round((margin / sellPrice) * 100) : 0;
                const totalProfit = salesInfo.qty * margin;

                return {
                    pid: p.pid,
                    code: p.product_code || `DISH-${p.pid}`,
                    name: p.product_name,
                    category: p.category || 'Kitchen',
                    selling_price: sellPrice,
                    cost_price: costPrice,
                    margin_per_unit: margin,
                    margin_percent: marginPct,
                    qty_sold: salesInfo.qty,
                    total_revenue: salesInfo.revenue || (salesInfo.qty * sellPrice),
                    total_profit: totalProfit,
                    quadrant: 'DOG' as const,
                    action_recommendation: ''
                };
            });

            // Calculate Thresholds (Averages)
            const totalDishes = initialMetrics.length || 1;
            const avgVolume = initialMetrics.reduce((sum, d) => sum + d.qty_sold, 0) / totalDishes;
            const avgMargin = initialMetrics.reduce((sum, d) => sum + d.margin_per_unit, 0) / totalDishes;

            // Classify Quadrants
            const classified = initialMetrics.map(d => {
                const isHighVolume = d.qty_sold >= avgVolume;
                const isHighMargin = d.margin_per_unit >= avgMargin;

                let quad: 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG' = 'DOG';
                let rec = '';

                if (isHighVolume && isHighMargin) {
                    quad = 'STAR';
                    rec = '⭐ Flagship dish. Protect portion quality, position top of menu and train waiters to upsell drinks.';
                } else if (isHighVolume && !isHighMargin) {
                    quad = 'PLOWHORSE';
                    rec = '🐎 High sales but low profit. Consider raising price by KES 30-50 or re-engineering recipe costs.';
                } else if (!isHighVolume && isHighMargin) {
                    quad = 'PUZZLE';
                    rec = '🧩 High profit but slow orders. Redesign photo, create meal combo or offer waiter incentive to recommend.';
                } else {
                    quad = 'DOG';
                    rec = '🐕 Low profit & low orders. Consider removing from menu to eliminate dead prep time & waste.';
                }

                return {
                    ...d,
                    quadrant: quad,
                    action_recommendation: rec
                };
            });

            setDishes(classified);

        } catch (err) {
            console.error('Error computing menu matrix:', err);
            toast.error('Failed to load menu engineering analytics');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadMenuMatrix();
    }, [loadMenuMatrix]);

    // Categories
    const categories = useMemo(() => {
        return ['ALL', ...Array.from(new Set(dishes.map(d => d.category))).filter(Boolean)];
    }, [dishes]);

    // Filtered
    const filteredDishes = useMemo(() => {
        return dishes.filter(d => {
            if (activeQuadrantFilter !== 'ALL' && d.quadrant !== activeQuadrantFilter) return false;
            if (selectedCategory !== 'ALL' && d.category !== selectedCategory) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!d.name.toLowerCase().includes(q) && !d.code.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [dishes, activeQuadrantFilter, selectedCategory, searchQuery]);

    // Counts
    const starCount = dishes.filter(d => d.quadrant === 'STAR').length;
    const plowhorseCount = dishes.filter(d => d.quadrant === 'PLOWHORSE').length;
    const puzzleCount = dishes.filter(d => d.quadrant === 'PUZZLE').length;
    const dogCount = dishes.filter(d => d.quadrant === 'DOG').length;

    // Export CSV
    const exportCSV = () => {
        if (filteredDishes.length === 0) {
            toast.error('No dishes to export');
            return;
        }
        const headers = ['Code', 'Dish Name', 'Category', 'Selling Price (KES)', 'Cost (KES)', 'Margin (KES)', 'Margin %', 'Units Sold', 'Total Profit (KES)', 'Quadrant', 'Strategy'];
        const rows = filteredDishes.map(d => [
            d.code,
            `"${d.name}"`,
            `"${d.category}"`,
            d.selling_price.toFixed(2),
            d.cost_price.toFixed(2),
            d.margin_per_unit.toFixed(2),
            `${d.margin_percent}%`,
            d.qty_sold.toString(),
            d.total_profit.toFixed(2),
            d.quadrant,
            `"${d.action_recommendation.replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Menu_Engineering_Matrix_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Exported Menu Matrix CSV successfully!');
    };

    return (
        <div className="min-h-screen bg-[#05090d] text-white p-3 sm:p-5 -m-4 sm:-m-6 space-y-4 select-none font-sans relative overflow-x-hidden">
            <Toaster position="top-right" />

            {/* ==================================================================== */}
            {/* 1. TOP COMMAND BAR                                                   */}
            {/* ==================================================================== */}
            <header className="relative bg-[#080e14] border border-[#162a2e] rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-[#00e676]/15 border border-[#00e676]/50 flex items-center justify-center text-[#00e676] text-2xl shadow-[0_0_15px_rgba(0,230,118,0.3)] shrink-0 font-black">
                        🍽️
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
                                <span>AlphaPlus</span>
                                <span className="text-[#00e676] drop-shadow-[0_0_20px_rgba(0,230,118,0.8)]">Menu Engineering Matrix</span>
                            </h1>
                            <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-[#00e676] border border-[#00e676]/40 backdrop-blur-md flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,230,118,0.25)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] shadow-[0_0_6px_#00e676] animate-pulse" />
                                Profitability vs. Popularity Analyzer
                            </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1 flex items-center gap-2.5 font-mono flex-wrap">
                            <span className="text-[#00e676] font-black bg-[#0c161e] px-2.5 py-0.5 rounded-lg border border-[#00e676]/30 shadow-inner">
                                {liveTime.toLocaleTimeString('en-GB')} EAT
                            </span>
                            <span>•</span>
                            <span className="text-white font-bold">{dishes.length} Analyzed Dishes</span>
                            <span>•</span>
                            <span className="text-gray-300">Stars · Plowhorses · Puzzles · Dogs</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={exportCSV}
                        className="px-3.5 py-2 bg-[#0c161e] hover:bg-[#132230] text-gray-200 hover:text-white border border-[#162a2e] hover:border-[#00e676]/50 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                        📥 Export CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-3.5 py-2 bg-[#0c161e] hover:bg-[#132230] text-gray-200 hover:text-white border border-[#162a2e] hover:border-[#00e676]/50 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                        🖨️ Print
                    </button>
                    <Link
                        href="/dashboard/products"
                        className="px-4 py-2 bg-[#00e676] hover:bg-[#00c853] text-black font-black rounded-xl text-xs transition-all shadow-[0_0_15px_rgba(0,230,118,0.3)] flex items-center gap-1.5"
                    >
                        Menu Products →
                    </Link>
                </div>
            </header>

            {/* ==================================================================== */}
            {/* 2. THE 4-QUADRANT SUPER CARDS                                        */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                {/* 1. Stars */}
                <div
                    onClick={() => setActiveQuadrantFilter(activeQuadrantFilter === 'STAR' ? 'ALL' : 'STAR')}
                    className={`rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
                        activeQuadrantFilter === 'STAR'
                            ? 'bg-emerald-950/80 border-2 border-[#00e676] shadow-[0_0_25px_rgba(0,230,118,0.3)]'
                            : 'bg-[#0c161e] border-[#162a2e] hover:border-[#00e676]/50'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-[#00e676]">⭐ STARS</span>
                        <span className="text-[10px] bg-[#00e676]/20 text-[#00e676] px-1.5 py-0.5 rounded font-mono">High Profit · High Vol</span>
                    </div>
                    <div className="mt-3">
                        <p className="text-2xl font-black text-white font-mono">{starCount}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Top revenue earners. Protect recipes.</p>
                    </div>
                </div>

                {/* 2. Plowhorses */}
                <div
                    onClick={() => setActiveQuadrantFilter(activeQuadrantFilter === 'PLOWHORSE' ? 'ALL' : 'PLOWHORSE')}
                    className={`rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
                        activeQuadrantFilter === 'PLOWHORSE'
                            ? 'bg-blue-950/80 border-2 border-blue-400 shadow-[0_0_25px_rgba(96,165,250,0.3)]'
                            : 'bg-[#0c161e] border-[#162a2e] hover:border-blue-400/50'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-blue-400">🐎 PLOWHORSES</span>
                        <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono">Low Profit · High Vol</span>
                    </div>
                    <div className="mt-3">
                        <p className="text-2xl font-black text-white font-mono">{plowhorseCount}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Crowd favorites. Raise price slightly.</p>
                    </div>
                </div>

                {/* 3. Puzzles */}
                <div
                    onClick={() => setActiveQuadrantFilter(activeQuadrantFilter === 'PUZZLE' ? 'ALL' : 'PUZZLE')}
                    className={`rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
                        activeQuadrantFilter === 'PUZZLE'
                            ? 'bg-amber-950/80 border-2 border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.3)]'
                            : 'bg-[#0c161e] border-[#162a2e] hover:border-amber-400/50'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-amber-400">🧩 PUZZLES</span>
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">High Profit · Low Vol</span>
                    </div>
                    <div className="mt-3">
                        <p className="text-2xl font-black text-white font-mono">{puzzleCount}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">High margin. Promote with combos.</p>
                    </div>
                </div>

                {/* 4. Dogs */}
                <div
                    onClick={() => setActiveQuadrantFilter(activeQuadrantFilter === 'DOG' ? 'ALL' : 'DOG')}
                    className={`rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
                        activeQuadrantFilter === 'DOG'
                            ? 'bg-rose-950/80 border-2 border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.3)]'
                            : 'bg-[#0c161e] border-[#162a2e] hover:border-rose-500/50'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-rose-400">🐕 DOGS</span>
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-mono">Low Profit · Low Vol</span>
                    </div>
                    <div className="mt-3">
                        <p className="text-2xl font-black text-white font-mono">{dogCount}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Dead weight. Consider removing.</p>
                    </div>
                </div>
            </div>

            {/* Neon Accent Line */}
            <div className="h-[2px] w-full bg-gradient-to-r from-[#00e676] via-amber-400 to-transparent shadow-[0_0_10px_#00e676] rounded-full" />

            {/* ==================================================================== */}
            {/* 3. SEARCH & CATEGORY STRIP                                           */}
            {/* ==================================================================== */}
            <div className="bg-[#080e14] border border-[#162a2e] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-md">
                <div className="flex items-center gap-2 flex-1">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search dish name or code..."
                        className="p-2.5 bg-[#0c161e] border border-[#162a2e] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00e676] w-full max-w-sm"
                    />

                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="p-2.5 bg-[#0c161e] border border-[#162a2e] rounded-xl text-xs text-gray-300 focus:outline-none focus:border-[#00e676]"
                    >
                        {categories.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>

                <div className="text-xs text-gray-400 font-mono">
                    Showing <strong className="text-white">{filteredDishes.length}</strong> dishes
                </div>
            </div>

            {/* ==================================================================== */}
            {/* 4. DISH MATRIX CARDS & TABLE                                         */}
            {/* ==================================================================== */}
            <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl overflow-hidden shadow-2xl">
                {isLoading ? (
                    <div className="p-16 text-center text-gray-400 space-y-3">
                        <div className="w-10 h-10 border-2 border-[#00e676] border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs font-mono">Computing menu popularity vs margin matrix...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-[#080e14] border-b border-[#162a2e] text-[11px] font-black uppercase text-gray-400 tracking-wider">
                                    <th className="p-3.5">Dish / Code</th>
                                    <th className="p-3.5">Category</th>
                                    <th className="p-3.5">Selling Price</th>
                                    <th className="p-3.5">Food Cost</th>
                                    <th className="p-3.5">Unit Margin</th>
                                    <th className="p-3.5">Units Sold</th>
                                    <th className="p-3.5">Total Profit</th>
                                    <th className="p-3.5">Quadrant</th>
                                    <th className="p-3.5">Chef &amp; Pricing Strategy</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-mono">
                                {filteredDishes.map(dish => (
                                    <tr key={dish.pid} className="hover:bg-[#101c26] transition-colors">
                                        <td className="p-3.5 font-sans">
                                            <p className="font-bold text-white text-xs">{dish.name}</p>
                                            <span className="text-[10px] text-gray-400 bg-[#060b0f] px-1.5 py-0.5 rounded border border-white/5 mt-0.5 inline-block font-mono">
                                                {dish.code}
                                            </span>
                                        </td>

                                        <td className="p-3.5 font-sans text-gray-300">
                                            {dish.category}
                                        </td>

                                        <td className="p-3.5 text-white font-bold">
                                            KES {dish.selling_price.toLocaleString()}
                                        </td>

                                        <td className="p-3.5 text-gray-400">
                                            KES {dish.cost_price.toLocaleString()}
                                        </td>

                                        <td className="p-3.5">
                                            <span className="text-[#00e676] font-bold">KES {dish.margin_per_unit.toLocaleString()}</span>
                                            <span className="text-[10px] text-gray-500 block">({dish.margin_percent}%)</span>
                                        </td>

                                        <td className="p-3.5 text-white font-bold font-sans">
                                            {dish.qty_sold} orders
                                        </td>

                                        <td className="p-3.5 text-white font-black">
                                            KES {dish.total_profit.toLocaleString()}
                                        </td>

                                        <td className="p-3.5 font-sans">
                                            {dish.quadrant === 'STAR' ? (
                                                <span className="inline-flex items-center gap-1 bg-[#00e676] text-black font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-md shadow-[#00e676]/30">
                                                    ⭐ STAR
                                                </span>
                                            ) : dish.quadrant === 'PLOWHORSE' ? (
                                                <span className="inline-flex items-center gap-1 bg-blue-500 text-black font-black text-[10px] px-2.5 py-0.5 rounded-full">
                                                    🐎 PLOWHORSE
                                                </span>
                                            ) : dish.quadrant === 'PUZZLE' ? (
                                                <span className="inline-flex items-center gap-1 bg-amber-400 text-black font-black text-[10px] px-2.5 py-0.5 rounded-full">
                                                    🧩 PUZZLE
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                                    🐕 DOG
                                                </span>
                                            )}
                                        </td>

                                        <td className="p-3.5 font-sans text-[11px] text-gray-300 max-w-xs leading-relaxed">
                                            {dish.action_recommendation}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

        </div>
    );
}
