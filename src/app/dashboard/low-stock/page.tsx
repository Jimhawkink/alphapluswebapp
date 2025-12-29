'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface LowStockItem {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    current_stock: number;
    reorder_point: number;
    base_unit: string;
}

export default function LowStockPage() {
    const [activeTab, setActiveTab] = useState<'dishes' | 'ingredients'>('dishes');
    const [dishes, setDishes] = useState<LowStockItem[]>([]);
    const [ingredients, setIngredients] = useState<LowStockItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const { data: dishData } = await supabase
                .from('products')
                .select('pid, product_code, product_name, category, stock, reorder_level')
                .eq('active', true)
                .lte('stock', 10)
                .order('stock');
            setDishes((dishData || []).map(d => ({ ...d, current_stock: d.stock, reorder_point: d.reorder_level || 10, base_unit: 'PCS' })));

            const { data: ingredientData } = await supabase
                .from('products_ingredients')
                .select('pid, product_code, product_name, category, current_stock, reorder_point, base_unit')
                .eq('active', true)
                .order('current_stock');
            setIngredients((ingredientData || []).filter(i => (i.current_stock || 0) <= (i.reorder_point || 10)));
        } catch (err) {
            toast.error('Failed to load');
        }
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-600 rounded-2xl flex items-center justify-center text-white text-2xl">⚠️</span>
                    Low Stock Alerts
                </h1>
                <button onClick={loadData} className="px-5 py-2.5 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl font-semibold">🔄 Refresh</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🍽️</span>
                    <p className="text-sm opacity-80 mt-2">Low Stock Dishes</p>
                    <p className="text-3xl font-bold">{dishes.length}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🥬</span>
                    <p className="text-sm opacity-80 mt-2">Low Stock Ingredients</p>
                    <p className="text-3xl font-bold">{ingredients.length}</p>
                </div>
            </div>

            <div className="flex gap-2">
                <button onClick={() => setActiveTab('dishes')} className={`px-6 py-3 rounded-xl font-semibold ${activeTab === 'dishes' ? 'bg-red-500 text-white' : 'bg-gray-100'}`}>🍽️ Dishes</button>
                <button onClick={() => setActiveTab('ingredients')} className={`px-6 py-3 rounded-xl font-semibold ${activeTab === 'ingredients' ? 'bg-orange-500 text-white' : 'bg-gray-100'}`}>🥬 Ingredients</button>
            </div>

            <div className="bg-white rounded-2xl border overflow-hidden">
                {isLoading ? <div className="p-16 text-center">Loading...</div> : (
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="text-left py-4 px-4 font-semibold">Code</th>
                                <th className="text-left py-4 px-4 font-semibold">Name</th>
                                <th className="text-center py-4 px-4 font-semibold">Current</th>
                                <th className="text-center py-4 px-4 font-semibold">Reorder</th>
                                <th className="text-center py-4 px-4 font-semibold">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(activeTab === 'dishes' ? dishes : ingredients).map((item) => (
                                <tr key={item.pid} className="border-t hover:bg-red-50/30">
                                    <td className="py-3 px-4 font-mono text-sm">{item.product_code}</td>
                                    <td className="py-3 px-4 font-semibold">{item.product_name}</td>
                                    <td className="py-3 px-4 text-center"><span className={`px-3 py-1 rounded-lg font-bold ${item.current_stock === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{item.current_stock} {item.base_unit}</span></td>
                                    <td className="py-3 px-4 text-center text-gray-600">{item.reorder_point}</td>
                                    <td className="py-3 px-4 text-center">
                                        <a href={activeTab === 'dishes' ? '/dashboard/batches' : '/dashboard/purchase'} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-xs">+ Order</a>
                                    </td>
                                </tr>
                            ))}
                            {(activeTab === 'dishes' ? dishes : ingredients).length === 0 && (
                                <tr><td colSpan={5} className="py-16 text-center text-gray-500">✅ All stock levels are good!</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
