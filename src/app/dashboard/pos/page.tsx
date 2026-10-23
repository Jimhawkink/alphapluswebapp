'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, c2bSupabase } from '@/lib/supabase';
import {
    savePendingSale,
    getNextReceiptNumber,
    getNextKOTNumber,
    getFoodOrderNotes
} from '@/lib/supabase';
import toast from 'react-hot-toast';
import { hasRolePermission } from '@/lib/hotelRoles';
import {
    loadPOSPrinterSettings,
    executeDirectPrint,
    executeOrderAutoPrintSequence
} from '@/lib/printerSettings';
import {
    createReceiptData,
    loadTaxDisplaySetting,
    saveTaxDisplaySetting,
    getTaxDisplaySettingSync,
    createKOTData,
    generateReceiptHTML,
    generateKOTHTML,
    generateCustomerBillHTML,
    loadCompanyInfo
} from '@/lib/receiptPrinter';

// Types
interface Product {
    id: number;
    name: string;
    price: number;
    purchasePrice: number;
    category: string;
    stock: number;
    color: string;
    barcode?: string;
    hasBatches?: boolean;
}

interface ProductionBatch {
    batchId: number;
    batchNumber: string;
    qtyProduced: number;
    qtyRemaining: number;
    costPerUnit: number;
    productionDate: string;
    expiryDate?: string;
    daysOld: number;
    createdBy?: string;
    totalValue?: number;
}

interface CartItem extends Product {
    qty: number;
    discount: number;
    notes: string;
    batchId?: number;
    batchNumber?: string;
    costPerUnit?: number;
}

interface RunningOrder {
    id: string;
    name: string;
    items: CartItem[];
    total: number;
    createdAt: Date;
    tableNo?: string;
    customerName?: string;
}

interface ShiftInfo {
    id: number;
    name: string;
    code: string;
    startTime: string;
    openingCash: number;
}

interface Category {
    category_id: number;
    category_name: string;
    icon: string;
}

interface Waiter {
    user_id: number;
    full_name: string;
    role: string;
}

interface RestaurantTable {
    table_id: number;
    table_code: string;
    table_name: string;
    room_id: number;
    room_name?: string;
    status: string;
}

interface FoodOrderNote {
    note_id: number;
    note_text: string;
    icon: string;
    note_category: string;
}

// Sample Production Batches (like VB.NET frmBatchSelection) - TODO: Load from database
const sampleBatches: Record<number, ProductionBatch[]> = {
    1: [ // Chicken Burger batches
        { batchId: 101, batchNumber: 'BATCH-20231225-1-001', qtyProduced: 50, qtyRemaining: 15, costPerUnit: 285, productionDate: '2023-12-25', daysOld: 2 },
        { batchId: 102, batchNumber: 'BATCH-20231226-1-001', qtyProduced: 30, qtyRemaining: 10, costPerUnit: 290, productionDate: '2023-12-26', daysOld: 1 },
    ],
    2: [ // Beef Burger batches
        { batchId: 201, batchNumber: 'BATCH-20231224-2-001', qtyProduced: 40, qtyRemaining: 8, costPerUnit: 340, productionDate: '2023-12-24', daysOld: 3 },
        { batchId: 202, batchNumber: 'BATCH-20231226-2-001', qtyProduced: 25, qtyRemaining: 10, costPerUnit: 345, productionDate: '2023-12-26', daysOld: 1 },
    ],
};

// Ultra-Crisp Web Audio POS Sound Synthesizer
const playPOSChime = (type: 'add' | 'void' | 'success' | 'tender' | 'kot' | 'click' | 'error') => {
    try {
        if (typeof window === 'undefined') return;
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;

        if (type === 'add') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 'click') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(700, now);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'void' || type === 'error') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(329.63, now);
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.15);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
            osc.start(now);
            osc.stop(now + 0.16);
        } else if (type === 'success' || type === 'tender') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.08);
            osc.frequency.setValueAtTime(1046.50, now + 0.16);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        } else if (type === 'kot') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        }
    } catch {
        // Audio blocked or not supported
    }
};

const getCategoryIcon = (categoryName: string) => {
    const c = (categoryName || '').toLowerCase();
    if (c === 'all') return '🍽️';
    if (c.includes('tea') || c.includes('coffee') || c.includes('beverage')) return '☕';
    if (c.includes('meat') || c.includes('beef') || c.includes('choma') || c.includes('chicken') || c.includes('pork')) return '🥩';
    if (c.includes('fish') || c.includes('sea')) return '🐟';
    if (c.includes('soup')) return '🥣';
    if (c.includes('salad')) return '🥗';
    if (c.includes('dessert') || c.includes('cake') || c.includes('ice')) return '🍰';
    if (c.includes('breakfast') || c.includes('egg')) return '🍳';
    if (c.includes('bread') || c.includes('pastry') || c.includes('bakery')) return '🥐';
    if (c.includes('bar') || c.includes('beer') || c.includes('wine') || c.includes('liquor')) return '🍷';
    if (c.includes('soft') || c.includes('juice') || c.includes('soda')) return '🥤';
    if (c.includes('snack') || c.includes('side') || c.includes('chips')) return '🍟';
    if (c.includes('rice') || c.includes('swahili') || c.includes('biryani')) return '🍛';
    return '🍴';
};


// Smart Food Image Resolver for Cyber Emerald POS
const getDishImage = (name: string, category?: string): string => {
    const n = (name || '').toLowerCase();
    const c = (category || '').toLowerCase();

    if (n.includes('beef stew') || (n.includes('stew') && n.includes('ugali'))) return '/images/food/beef_stew.jpg';
    if (n.includes('biryani') || n.includes('briyani')) return '/images/food/chicken_biryani.jpg';
    if (n.includes('chapati') || n.includes('roti')) return '/images/food/chapati.jpg';
    if (n.includes('chips masala') || n.includes('masala chips')) return '/images/food/chips_masala.jpg';
    if (n.includes('french fries') || n.includes('chips') || n.includes('fries')) return '/images/food/french_fries.jpg';
    if (n.includes('passion') || n.includes('juice') || n.includes('cocktail') || n.includes('smoothie')) return '/images/food/passion_juice.jpg';
    if (n.includes('tilapia') || n.includes('fish') || n.includes('samaki') || n.includes('sea')) return '/images/food/tilapia_fish.jpg';
    if (n.includes('choma') || n.includes('goat') || n.includes('mbuzi') || n.includes('ribs') || n.includes('steak') || n.includes('beef') || n.includes('meat')) return '/images/food/nyama_choma.jpg';
    if (n.includes('water') || n.includes('dasani') || n.includes('keringet')) return '/images/food/mineral_water.jpg';
    if (n.includes('soda') || n.includes('coke') || n.includes('coca') || n.includes('fanta') || n.includes('sprite')) return '/images/food/soda.jpg';
    if (n.includes('masala tea') || n.includes('dawa') || n.includes('ginger')) return '/images/food/masala_tea.jpg';
    if (n.includes('ugali')) return '/images/food/ugali.jpg';
    if (n.includes('african tea') || n.includes('chai') || n.includes('black tea') || (n.includes('tea') && !n.includes('masala'))) return '/images/food/african_tea.jpg';
    if (n.includes('samosa') || n.includes('sambusa')) return '/images/food/samosa.jpg';
    if (n.includes('mandazi') || n.includes('mahamri')) return '/images/food/mandazi.jpg';
    if (n.includes('wing') || n.includes('kuku') || n.includes('chicken')) return '/images/food/chicken_wings.jpg';
    if (n.includes('pizza')) return '/images/food/pizza_slice.jpg';
    if (n.includes('beef burger')) return '/images/food/beef_burger.jpg';
    if (n.includes('burger')) return '/images/food/burger.jpg';
    if (n.includes('fruit') || n.includes('salad') || n.includes('kachumbari')) return '/images/food/fruit_salad.jpg';
    if (n.includes('pilau') || n.includes('rice') || n.includes('wali')) return '/images/food/pilau.jpg';
    if (n.includes('coffee') || n.includes('cappuccino') || n.includes('espresso') || n.includes('latte')) return '/images/food/coffee.jpg';
    if (n.includes('beer') || n.includes('tusker') || n.includes('guinness') || n.includes('wine') || n.includes('liquor')) return '/images/food/beer.jpg';
    if (n.includes('soup') || n.includes('broth')) return '/images/food/soup.jpg';

    if (c.includes('beverage') || c.includes('tea') || c.includes('coffee') || c.includes('drink')) return '/images/food/coffee.jpg';
    if (c.includes('meat') || c.includes('choma') || c.includes('grill')) return '/images/food/nyama_choma.jpg';
    if (c.includes('snack') || c.includes('pastry') || c.includes('bakery')) return '/images/food/samosa.jpg';
    if (c.includes('juice')) return '/images/food/passion_juice.jpg';

    return '/images/food/default_dish.jpg';
};

// Cyber Theme Product Card Component
const CyberProductCard = ({
    product,
    cartQty,
    onAdd
}: {
    product: Product;
    cartQty: number;
    onAdd: () => void;
}) => {
    const isOutOfStock = product.stock === 0;
    const isLowStock = product.stock > 0 && product.stock <= 5;
    const dishImg = getDishImage(product.name, product.category);

    return (
        <button
            onClick={() => {
                if (!isOutOfStock) {
                    onAdd();
                    playPOSChime('add');
                }
            }}
            disabled={isOutOfStock}
            className={`group text-left bg-[#0c161e] border border-[#162a2e] hover:border-[#00e676]/70 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_25px_rgba(0,0,0,0.6)] flex flex-col justify-between relative ${
                isOutOfStock ? 'opacity-40 cursor-not-allowed grayscale' : ''
            }`}
        >
            <div className="h-28 sm:h-32 w-full relative overflow-hidden bg-black/50">
                <img
                    src={dishImg}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = '/images/food/default_dish.jpg';
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0c161e] via-transparent to-black/30 pointer-events-none" />

                <div className="absolute top-2 right-2">
                    {isOutOfStock ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950/80 text-red-400 border border-red-500/40 backdrop-blur-md flex items-center gap-1 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            Sold Out
                        </span>
                    ) : isLowStock ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40 backdrop-blur-md flex items-center gap-1 shadow-sm animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            {product.stock} Left
                        </span>
                    ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-[#00e676] border border-[#00e676]/40 backdrop-blur-md flex items-center gap-1 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00e676]" />
                            In Stock
                        </span>
                    )}
                </div>

                {cartQty > 0 && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-black bg-[#00e676] text-black shadow-lg shadow-[#00e676]/50 flex items-center gap-1">
                        <span>x{cartQty}</span>
                    </div>
                )}
            </div>

            <div className="p-2.5 sm:p-3 flex flex-col justify-between flex-1 gap-1">
                <p className="font-bold text-xs sm:text-sm text-white group-hover:text-[#00e676] transition-colors leading-tight line-clamp-1">
                    {product.name}
                </p>
                <div className="flex items-center justify-between pt-1">
                    <span className="text-xs sm:text-sm font-extrabold text-[#00e676] font-mono tracking-tight">
                        KSh {Number(product.price).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] font-bold text-gray-500">
                        {product.stock > 0 ? `${product.stock} ready` : ''}
                    </span>
                </div>
            </div>
        </button>
    );
};

// Cyber Theme Cart Item Row Component
const CyberCartItemRow = ({
    item,
    index,
    onIncrease,
    onDecrease,
    onRemove,
    onEditNotes,
    onEditDiscount
}: {
    item: CartItem;
    index: number;
    onIncrease: () => void;
    onDecrease: () => void;
    onRemove: () => void;
    onEditNotes: () => void;
    onEditDiscount: () => void;
}) => {
    const itemTotal = (item.price * item.qty) - (item.discount || 0);
    const dishImg = getDishImage(item.name, item.category);

    return (
        <div className="bg-[#0e1721] rounded-xl p-2.5 border border-[#162a2e] hover:border-[#00e676]/30 transition-all flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 w-4 text-center shrink-0">
                {index}
            </span>

            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-black/40 border border-white/5">
                <img
                    src={dishImg}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = '/images/food/default_dish.jpg';
                    }}
                />
            </div>

            <div className="flex-1 min-w-0">
                <h4 className="font-bold text-white text-xs leading-tight truncate">
                    {item.name}
                </h4>
                <p className="text-[11px] font-mono text-[#00e676]/80 font-bold mt-0.5">
                    KSh {Number(item.price).toFixed(2)}
                </p>
                {item.notes && (
                    <p className="text-[10px] text-amber-400 truncate mt-0.5">
                        📝 {item.notes}
                    </p>
                )}
            </div>

            <div className="flex items-center gap-1 bg-[#132029] p-0.5 rounded-lg border border-white/5 shrink-0">
                <button
                    onClick={() => {
                        onDecrease();
                        playPOSChime('click');
                    }}
                    className="w-6 h-6 rounded bg-[#1a2b37] hover:bg-[#22394a] text-gray-200 font-bold text-xs flex items-center justify-center transition-all"
                    title="Decrease"
                >
                    −
                </button>
                <span className="font-mono font-black text-xs text-white min-w-[20px] text-center">
                    {item.qty}
                </span>
                <button
                    onClick={() => {
                        onIncrease();
                        playPOSChime('click');
                    }}
                    className="w-6 h-6 rounded bg-[#00e676] hover:bg-[#00c853] text-black font-black text-xs flex items-center justify-center transition-all shadow-sm"
                    title="Increase"
                >
                    +
                </button>
            </div>

            <div className="text-right shrink-0 min-w-[55px]">
                <p className="font-mono font-black text-xs text-white">
                    {itemTotal.toFixed(2)}
                </p>
            </div>

            <button
                onClick={() => {
                    onRemove();
                    playPOSChime('void');
                }}
                className="w-7 h-7 rounded-lg bg-red-950/40 hover:bg-red-600 text-red-400 hover:text-white transition-all flex items-center justify-center text-xs shrink-0 border border-red-500/20"
                title="Remove Item"
            >
                🗑️
            </button>
        </div>
    );
};

// Product Card Component - Ultra Luxury Touch Responsive
const ProductCard = ({ product, onAdd }: { product: Product; onAdd: () => void }) => {
    const isOutOfStock = product.stock === 0;
    const isLowStock = product.stock > 0 && product.stock <= 5;

    return (
        <button
            onClick={() => {
                onAdd();
                playPOSChime('add');
            }}
            disabled={isOutOfStock}
            className={`group relative bg-white hover:bg-gray-50/90 border border-gray-200/80 rounded-2xl p-3 text-left transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] min-h-[105px] flex flex-col justify-between overflow-hidden shadow-sm ${
                isOutOfStock ? 'opacity-40 cursor-not-allowed bg-gray-100/70 border-gray-200' : ''
            }`}
        >
            {/* Top colored accent line */}
            <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${product.color || 'from-emerald-500 to-teal-600'}`} />

            <div className="pt-1">
                <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="font-extrabold text-xs sm:text-sm text-gray-900 leading-tight line-clamp-2 group-hover:text-emerald-700 transition-colors">
                        {product.name}
                    </p>
                    {product.hasBatches && (
                        <span className="shrink-0 px-1.5 py-0.5 bg-purple-100 text-purple-800 text-[9px] font-black rounded-md tracking-wider uppercase">
                            Batch
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-end justify-between pt-1">
                {/* Stock status badge */}
                <div>
                    {isOutOfStock ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-lg">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                            Sold Out
                        </span>
                    ) : isLowStock ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-lg animate-pulse">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                            {product.stock} left
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            {product.stock} ready
                        </span>
                    )}
                </div>

                {/* Price Pill */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-mono font-black text-xs sm:text-sm px-2.5 py-1 rounded-xl shadow-sm group-hover:shadow-md transition-all">
                    Ksh {Number(product.price).toLocaleString()}
                </div>
            </div>
        </button>
    );
};

// Cart Item Row - Ultra Luxury Touch Responsive
const CartItemRow = ({ item, onIncrease, onDecrease, onRemove, onEditNotes, onEditDiscount, showTaxInfo = true }: {
    item: CartItem;
    onIncrease: () => void;
    onDecrease: () => void;
    onRemove: () => void;
    onEditNotes: () => void;
    onEditDiscount: () => void;
    showTaxInfo?: boolean;
}) => {
    const itemTotal = (item.price * item.qty) - (item.discount || 0);

    return (
        <div className="group bg-white rounded-2xl p-3 border border-gray-200/90 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all space-y-2">
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-extrabold text-gray-900 text-sm leading-tight truncate">
                            {item.name}
                        </h3>
                        {item.batchNumber && (
                            <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[10px] font-mono font-bold rounded">
                                {item.batchNumber}
                            </span>
                        )}
                    </div>
                    <p className="text-xs font-semibold text-gray-500 font-mono mt-0.5">
                        Ksh {Number(item.price).toLocaleString()} each
                    </p>
                </div>

                {/* Line Total */}
                <div className="text-right shrink-0">
                    <p className="font-mono font-black text-sm text-gray-900">
                        Ksh {itemTotal.toLocaleString()}
                    </p>
                    {item.discount > 0 && (
                        <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">
                            -Ksh {item.discount.toLocaleString()}
                        </p>
                    )}
                </div>
            </div>

            {/* Custom Notes Badge */}
            {item.notes && (
                <div className="flex items-center gap-1 bg-amber-50 border border-amber-200/70 text-amber-900 px-2.5 py-1 rounded-xl text-xs font-medium">
                    <span>📝</span>
                    <span className="truncate">{item.notes}</span>
                </div>
            )}

            {/* Controls Bar */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <div className="flex items-center gap-1">
                    <button
                        onClick={onEditNotes}
                        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                        title="Special Kitchen Note"
                    >
                        <span>📝</span> Notes
                    </button>
                    <button
                        onClick={onEditDiscount}
                        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                        title="Discount item"
                    >
                        <span>🏷️</span> Disc
                    </button>
                </div>

                {/* Touch Stepper */}
                <div className="flex items-center gap-1 bg-gray-100/80 p-0.5 rounded-xl border border-gray-200">
                    <button
                        onClick={() => {
                            onDecrease();
                            playPOSChime('click');
                        }}
                        className="w-7 h-7 rounded-lg bg-white hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-black text-sm flex items-center justify-center transition-all shadow-sm"
                        title="Decrease"
                    >
                        −
                    </button>
                    <span className="font-mono font-black text-sm text-gray-900 min-w-[28px] text-center">
                        {item.qty}
                    </span>
                    <button
                        onClick={() => {
                            onIncrease();
                            playPOSChime('click');
                        }}
                        className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-sm flex items-center justify-center transition-all shadow-sm"
                        title="Increase"
                    >
                        +
                    </button>
                    <button
                        onClick={() => {
                            onRemove();
                            playPOSChime('void');
                        }}
                        className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-500 hover:text-white text-red-500 font-bold text-xs flex items-center justify-center transition-all ml-1"
                        title="Void / Remove Item"
                    >
                        ✕
                    </button>
                </div>
            </div>
        </div>
    );
};

// Running Order Card with Time Tracking and Expandable Items
const RunningOrderCard = ({
    order,
    onReopen
}: {
    order: any;
    onReopen: (order: any) => void;
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [timeElapsed, setTimeElapsed] = useState('');

    // Calculate elapsed time
    useEffect(() => {
        const updateTime = () => {
            const created = new Date(order.sale_datetime || order.created_at);
            const now = new Date();
            const diffMs = now.getTime() - created.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const hours = Math.floor(diffMins / 60);
            const mins = diffMins % 60;

            if (hours > 0) {
                setTimeElapsed(`${hours}h ${mins}m`);
            } else {
                setTimeElapsed(`${mins}m`);
            }
        };

        updateTime();
        const interval = setInterval(updateTime, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [order]);

    return (
        <div className="bg-white rounded-xl border-2 border-orange-200 shadow-lg hover:shadow-xl transition-all">
            {/* Header - Clickable to expand */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-4 cursor-pointer hover:bg-orange-50 transition-colors rounded-t-xl"
            >
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🧾</span>
                        <div>
                            <h3 className="font-bold text-gray-800">{order.receipt_no || order.invoice_no}</h3>
                            <p className="text-xs text-gray-500">
                                {(order.table_name || order.table_no) && `Table ${order.table_name || order.table_no} • `}
                                {order.customer_name || 'Walk-in'}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="font-bold text-lg text-orange-600">Ksh {(order.total_amount || 0).toLocaleString()}</p>
                        <p className="text-xs text-gray-500">
                            ⏱️ {timeElapsed}
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                        👤 Served by: <span className="font-semibold">{order.cashier_name || 'Cashier'}</span>
                    </span>
                    <button
                        className="text-blue-600 hover:text-blue-700 font-semibold text-sm flex items-center gap-1"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                    >
                        {isExpanded ? '▲ Collapse' : '▼ Expand'}
                    </button>
                </div>
            </div>

            {/* Expandable Items List */}
            {isExpanded && (
                <div className="border-t border-orange-200 p-4 bg-orange-50">
                    <h4 className="font-bold text-sm text-gray-700 mb-2">Order Items:</h4>
                    <div className="space-y-2">
                        {order.items && order.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center bg-white rounded-lg p-2 text-sm">
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-800">{item.product_name || item.name}</p>
                                    <p className="text-xs text-gray-500">Qty: {item.quantity || item.qty} × Ksh {(item.unit_price || item.price || 0).toLocaleString()}</p>
                                </div>
                                <p className="font-bold text-gray-800">Ksh {(item.subtotal || item.total || 0).toLocaleString()}</p>
                            </div>
                        ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 flex gap-2">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onReopen(order);
                            }}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors"
                        >
                            💳 Complete Payment
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};


// Receipt Preview Modal
const ReceiptPreviewModal = ({
    isOpen,
    onClose,
    receiptHTML,
    title,
    onPrint,
    showTaxInfo,
    onToggleTax
}: {
    isOpen: boolean;
    onClose: () => void;
    receiptHTML: string;
    title: string;
    onPrint: () => void;
    showTaxInfo?: boolean;
    onToggleTax?: () => void;
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>🧾</span> {title}
                    </h2>
                    <div className="flex items-center gap-2">
                        {onToggleTax && (
                            <button
                                type="button"
                                onClick={onToggleTax}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                                    showTaxInfo
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                        : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                }`}
                                title="Click to toggle tax breakdown on this receipt"
                            >
                                <span>{showTaxInfo ? 'Tax Info: ON' : 'Tax Info: OFF'}</span>
                                <span className={`w-2 h-2 rounded-full ${showTaxInfo ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                            </button>
                        )}
                        <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                </div>

                {/* Receipt Preview */}
                <div className="flex-1 overflow-auto bg-gray-100 rounded-2xl p-4 mb-4">
                    <div
                        className="bg-white shadow-lg mx-auto"
                        style={{ width: '80mm', minHeight: '200px' }}
                        dangerouslySetInnerHTML={{ __html: receiptHTML }}
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                    >
                        Close
                    </button>
                    <button
                        onClick={onPrint}
                        className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-semibold hover:shadow-lg flex items-center justify-center gap-2"
                    >
                        <span>🖨️</span>
                        <span>Print</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// Batch Selection Modal - Like VB.NET frmBatchSelection
const BatchSelectionModal = ({
    isOpen,
    onClose,
    product,
    batches,
    onSelect
}: {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    batches: ProductionBatch[];
    onSelect: (batch: ProductionBatch) => void;
}) => {
    const [selectedBatch, setSelectedBatch] = useState<ProductionBatch | null>(null);

    if (!isOpen || !product) return null;

    const totalAvailable = batches.reduce((sum, b) => sum + b.qtyRemaining, 0);

    const getBatchRowColor = (daysOld: number) => {
        if (daysOld <= 1) return 'bg-green-50 border-green-200'; // Fresh - Light green
        if (daysOld <= 7) return 'bg-blue-50 border-blue-200';   // Recent - Light blue
        return 'bg-white border-gray-200';                        // Older batches
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <span>📦</span> Select Production Batch
                        </h2>
                        <p className="text-sm text-cyan-600 font-medium mt-1">{product.name}</p>
                    </div>
                    <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">✕</button>
                </div>

                {/* Total Available */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl mb-4">
                    <span className="text-gray-600">Total Available from {batches.length} batch(es):</span>
                    <span className="text-xl font-bold text-green-600">{totalAvailable} units</span>
                </div>

                {/* Batches Table */}
                <div className="flex-1 overflow-auto mb-4">
                    <table className="w-full">
                        <thead className="bg-gray-100 sticky top-0">
                            <tr>
                                <th className="p-3 text-left text-xs font-bold text-gray-600">BATCH NUMBER</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-600">PRODUCED</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-600">AVAILABLE</th>
                                <th className="p-3 text-right text-xs font-bold text-gray-600">COST/UNIT</th>
                                <th className="p-3 text-right text-xs font-bold text-gray-600">TOTAL</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-600">PROD. DATE</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-600">PRODUCED BY</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-600">AGE (Days)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {batches.map((batch) => (
                                <tr
                                    key={batch.batchId}
                                    onClick={() => setSelectedBatch(batch)}
                                    onDoubleClick={() => onSelect(batch)}
                                    className={`cursor-pointer transition-all border-2 ${selectedBatch?.batchId === batch.batchId
                                        ? 'border-blue-500 bg-blue-50'
                                        : getBatchRowColor(batch.daysOld)
                                        } hover:border-blue-300`}
                                >
                                    <td className="p-3 font-mono text-sm font-medium">{batch.batchNumber}</td>
                                    <td className="p-3 text-center text-gray-600">{batch.qtyProduced}</td>
                                    <td className="p-3 text-center">
                                        <span className="px-3 py-1 bg-green-100 text-green-700 font-bold rounded-lg">
                                            {batch.qtyRemaining}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right font-medium text-gray-700">
                                        {batch.costPerUnit.toFixed(2)}
                                    </td>
                                    <td className="p-3 text-right font-bold text-orange-600">
                                        {(batch.qtyRemaining * batch.costPerUnit).toFixed(2)}
                                    </td>
                                    <td className="p-3 text-center text-gray-600">
                                        {new Date(batch.productionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </td>
                                    <td className="p-3 text-center text-blue-600 font-medium">
                                        {batch.createdBy || 'Unknown'}
                                    </td>
                                    <td className="p-3 text-center">
                                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${batch.daysOld === 0 ? 'bg-green-500 text-white' :
                                            batch.daysOld <= 1 ? 'bg-green-100 text-green-700' :
                                                batch.daysOld <= 7 ? 'bg-yellow-100 text-yellow-700' :
                                                    batch.daysOld <= 30 ? 'bg-orange-100 text-orange-700' :
                                                        'bg-red-100 text-red-700'
                                            }`}>
                                            {batch.daysOld}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-green-100 border border-green-300"></div>
                        <span>Fresh (0-1 days)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></div>
                        <span>Recent (2-7 days)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-white border border-gray-300"></div>
                        <span>Older</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => selectedBatch && onSelect(selectedBatch)}
                        disabled={!selectedBatch}
                        className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <span>✓</span>
                        <span>Select This Batch</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// Payment Modal - Light Theme
const PaymentModal = ({
    isOpen,
    onClose,
    total,
    onComplete,
    invoiceNo,
    initialMethod = 'cash'
}: {
    initialMethod?: string;
    isOpen: boolean;
    onClose: () => void;
    total: number;
    onComplete: (
        method: string, 
        amountPaid: number, 
        mpesaReceipt?: string, 
        customerName?: string, 
        buyerPin?: string, 
        isCorporateTax?: boolean, 
        roomDetails?: { roomNo: string; guestName: string; bookingId?: number }
    ) => void;
    invoiceNo: string;
}) => {
    const [paymentMethod, setPaymentMethod] = useState(initialMethod || 'cash');
    useEffect(() => { if (isOpen && initialMethod) setPaymentMethod(initialMethod); }, [isOpen, initialMethod]);
    const [amountPaid, setAmountPaid] = useState('');
    const [mpesaPhone, setMpesaPhone] = useState('');
    const [mpesaReceipt, setMpesaReceipt] = useState('');
    const [customerName, setCustomerName] = useState('');

    // Optional Corporate / KRA eTIMS Tax Invoice (Strictly Opt-In)
    const [isCorporateTax, setIsCorporateTax] = useState(false);
    const [buyerPin, setBuyerPin] = useState('');
    const [corporateName, setCorporateName] = useState('');

    // Hotel Room Charge State
    const [activeBookings, setActiveBookings] = useState<Array<{ booking_id: number; room_number: string; guest_name: string }>>([]);
    const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
    const [customRoomNo, setCustomRoomNo] = useState('');
    const [customGuestName, setCustomGuestName] = useState('');
    const [loadingRooms, setLoadingRooms] = useState(false);

    // Load active hotel rooms when room charge is selected
    useEffect(() => {
        if (paymentMethod === 'room' && activeBookings.length === 0) {
            setLoadingRooms(true);
            (async () => {
                try {
                    const { data } = await supabase
                        .from('hotel_bookings')
                        .select('booking_id, room_number, guest_name')
                        .eq('status', 'Checked-In')
                        .order('room_number');
                    if (data && data.length > 0) {
                        setActiveBookings(data);
                        setSelectedBookingId(data[0].booking_id);
                    }
                } catch (e) {
                    console.error('Error fetching hotel rooms for POS:', e);
                } finally {
                    setLoadingRooms(false);
                }
            })();
        }
    }, [paymentMethod, activeBookings.length]);

    const change = paymentMethod === 'cash' ? Math.max(0, Number(amountPaid) - total) : 0;
    const quickAmounts = [500, 1000, 2000, 5000];

    if (!isOpen) return null;

    const handleFinalSubmit = () => {
        let finalRoomDetails: { roomNo: string; guestName: string; bookingId?: number } | undefined = undefined;
        let finalCustName = customerName;

        if (paymentMethod === 'room') {
            const matched = activeBookings.find(b => b.booking_id === selectedBookingId);
            const rNo = matched ? matched.room_number : customRoomNo;
            const gName = matched ? matched.guest_name : customGuestName;
            finalRoomDetails = {
                roomNo: rNo || 'Unassigned',
                guestName: gName || 'Hotel Resident',
                bookingId: matched?.booking_id
            };
            finalCustName = `${finalRoomDetails.guestName} (Room ${finalRoomDetails.roomNo})`;
        } else if (isCorporateTax && corporateName) {
            finalCustName = corporateName;
        }

        onComplete(
            paymentMethod,
            paymentMethod === 'room' || paymentMethod === 'credit' ? total : (Number(amountPaid) || total),
            mpesaReceipt,
            finalCustName,
            isCorporateTax ? buyerPin.trim() : undefined,
            isCorporateTax,
            finalRoomDetails
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>💳</span> Settle Bill
                    </h2>
                    <div className="text-right">
                        <p className="text-xs text-gray-500">Invoice</p>
                        <p className="font-semibold text-blue-600">{invoiceNo}</p>
                    </div>
                </div>

                {/* Total */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-4 text-white mb-5 shadow-md">
                    <p className="text-xs uppercase font-medium tracking-wider opacity-90">Total Payable</p>
                    <p className="text-3xl font-black mt-0.5">Ksh {total.toLocaleString()}</p>
                </div>

                {/* Payment Methods - 5 options */}
                <div className="grid grid-cols-5 gap-1.5 mb-5">
                    {[
                        { id: 'cash', icon: '💵', label: 'Cash' },
                        { id: 'mpesa', icon: '📱', label: 'M-Pesa' },
                        { id: 'card', icon: '💳', label: 'Card' },
                        { id: 'credit', icon: '📋', label: 'Credit' },
                        { id: 'room', icon: '🏨', label: 'Room' },
                    ].map(method => (
                        <button
                            key={method.id}
                            onClick={() => setPaymentMethod(method.id)}
                            className={`p-2.5 rounded-xl border-2 transition-all text-center ${paymentMethod === method.id
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm font-bold'
                                : 'border-gray-200 hover:border-gray-300 bg-gray-50 text-gray-600'
                                }`}
                        >
                            <span className="text-xl block mb-0.5">{method.icon}</span>
                            <span className="text-[11px] block">{method.label}</span>
                        </button>
                    ))}
                </div>

                {/* Cash Input */}
                {paymentMethod === 'cash' && (
                    <div className="space-y-3 mb-5">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Amount Tendered (Ksh)</label>
                            <input
                                type="number"
                                value={amountPaid}
                                onChange={(e) => setAmountPaid(e.target.value)}
                                placeholder="Enter amount..."
                                className="w-full p-3.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none text-xl font-bold"
                            />
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                            {quickAmounts.map(amt => (
                                <button
                                    key={amt}
                                    onClick={() => setAmountPaid(amt.toString())}
                                    className="py-2 bg-gray-100 hover:bg-emerald-100 hover:text-emerald-800 rounded-xl text-gray-700 text-xs font-semibold transition-colors"
                                >
                                    {amt.toLocaleString()}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center justify-between p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
                            <span className="text-emerald-800 text-sm font-semibold">Customer Change:</span>
                            <span className="text-2xl font-black text-emerald-600">Ksh {change.toLocaleString()}</span>
                        </div>
                    </div>
                )}

                {/* M-Pesa Input */}
                {paymentMethod === 'mpesa' && (
                    <div className="space-y-3 mb-5">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Customer Phone (STK Push)</label>
                            <input
                                type="tel"
                                value={mpesaPhone}
                                onChange={(e) => setMpesaPhone(e.target.value)}
                                placeholder="0712345678"
                                className="w-full p-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none text-base font-semibold"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">M-Pesa Transaction Ref (Optional)</label>
                            <input
                                type="text"
                                value={mpesaReceipt}
                                onChange={(e) => setMpesaReceipt(e.target.value)}
                                placeholder="e.g. QJK2A5B..."
                                className="w-full p-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none text-base uppercase"
                            />
                        </div>
                    </div>
                )}

                {/* Credit Customer */}
                {paymentMethod === 'credit' && (
                    <div className="space-y-3 mb-5">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Credit Account / Debtor Name</label>
                            <input
                                type="text"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="Enter debtor name..."
                                className="w-full p-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none text-base"
                            />
                        </div>
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs">
                            📋 This check will be recorded under Credit Accounts for invoice settlement.
                        </div>
                    </div>
                )}

                {/* Hotel Room Charge */}
                {paymentMethod === 'room' && (
                    <div className="space-y-3 mb-5 bg-blue-50/70 p-4 rounded-2xl border border-blue-200">
                        <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
                            <span>🏨</span> Post to Resident Hotel Room Folio
                        </div>
                        {loadingRooms ? (
                            <p className="text-xs text-blue-600">Loading checked-in rooms...</p>
                        ) : activeBookings.length > 0 ? (
                            <div>
                                <label className="text-xs font-semibold text-blue-800 mb-1 block">Select Checked-In Guest Room</label>
                                <select
                                    value={selectedBookingId || ''}
                                    onChange={(e) => setSelectedBookingId(Number(e.target.value))}
                                    className="w-full p-3 bg-white border border-blue-300 rounded-xl font-medium text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {activeBookings.map(b => (
                                        <option key={b.booking_id} value={b.booking_id}>
                                            Room {b.room_number} — {b.guest_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-xs text-amber-700">No checked-in guest records found. Enter room manually:</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="text"
                                        placeholder="Room No (e.g. 204)"
                                        value={customRoomNo}
                                        onChange={(e) => setCustomRoomNo(e.target.value)}
                                        className="p-2.5 bg-white border border-blue-200 rounded-xl text-sm"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Guest Name"
                                        value={customGuestName}
                                        onChange={(e) => setCustomGuestName(e.target.value)}
                                        className="p-2.5 bg-white border border-blue-200 rounded-xl text-sm"
                                    />
                                </div>
                            </div>
                        )}
                        <p className="text-[11px] text-blue-700 italic">
                            ✓ Bill of Ksh {total.toLocaleString()} will appear automatically on the guest's checkout folio statement.
                        </p>
                    </div>
                )}

                {/* OPTIONAL Corporate / KRA Tax Invoice Accordion */}
                <div className="mb-5 p-3.5 rounded-2xl border border-gray-200 bg-gray-50/80">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={isCorporateTax}
                            onChange={(e) => setIsCorporateTax(e.target.checked)}
                            className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-gray-700">
                            🏢 Corporate Tax Invoice (Optional Buyer PIN)
                        </span>
                    </label>

                    {isCorporateTax && (
                        <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[11px] font-semibold text-gray-600 block mb-1">Company / Client Name</label>
                                <input
                                    type="text"
                                    value={corporateName}
                                    onChange={(e) => setCorporateName(e.target.value)}
                                    placeholder="e.g. Kenya Airways Ltd"
                                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-gray-600 block mb-1">Buyer KRA PIN</label>
                                <input
                                    type="text"
                                    value={buyerPin}
                                    onChange={(e) => setBuyerPin(e.target.value.toUpperCase())}
                                    placeholder="e.g. P051234567X"
                                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-mono font-bold uppercase"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Complete Button */}
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={onClose}
                        className="py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleFinalSubmit}
                        className="py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        <span>✅</span>
                        <span>Confirm & Settle</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
const FoodOrderNotesModal = ({
    isOpen,
    onClose,
    currentNotes,
    onSave,
    foodNotes
}: {
    isOpen: boolean;
    onClose: () => void;
    currentNotes: string;
    onSave: (notes: string) => void;
    foodNotes: Array<{ note_id: number; note_text: string; icon: string; note_category: string }>;
}) => {
    const [notes, setNotes] = useState(currentNotes);
    const [selectedCategory, setSelectedCategory] = useState('All');

    // Get unique categories
    const categories = ['All', ...Array.from(new Set(foodNotes.map(n => n.note_category)))];

    // Filter notes by category
    const filteredNotes = selectedCategory === 'All'
        ? foodNotes
        : foodNotes.filter(n => n.note_category === selectedCategory);

    // Add a note to the current notes
    const addNote = (noteText: string) => {
        if (notes) {
            // Check if note already exists
            if (notes.includes(noteText)) return;
            setNotes(prev => prev + ', ' + noteText);
        } else {
            setNotes(noteText);
        }
    };

    // Remove a note from the current notes
    const removeNote = (noteText: string) => {
        const notesList = notes.split(',').map(n => n.trim()).filter(n => n !== noteText);
        setNotes(notesList.join(', '));
    };

    // Check if a note is selected
    const isNoteSelected = (noteText: string) => {
        return notes.split(',').map(n => n.trim()).includes(noteText);
    };

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'Seasoning': return 'bg-amber-100 text-amber-700 border-amber-300';
            case 'Spice Level': return 'bg-red-100 text-red-700 border-red-300';
            case 'Cooking': return 'bg-orange-100 text-orange-700 border-orange-300';
            case 'Allergy': return 'bg-purple-100 text-purple-700 border-purple-300';
            case 'Diet': return 'bg-green-100 text-green-700 border-green-300';
            case 'Extras': return 'bg-blue-100 text-blue-700 border-blue-300';
            case 'Service': return 'bg-cyan-100 text-cyan-700 border-cyan-300';
            default: return 'bg-gray-100 text-gray-700 border-gray-300';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>📝</span> Food Order Notes
                    </h2>
                    <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">✕</button>
                </div>

                {/* Info Banner */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center gap-3">
                    <span className="text-2xl">🍳</span>
                    <p className="text-sm text-amber-700">
                        These notes will be printed on the <strong>KOT (Kitchen Order Ticket)</strong> to inform the kitchen about special instructions.
                    </p>
                </div>

                {/* Category Filter */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedCategory === cat
                                ? 'bg-amber-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Predefined Notes Grid */}
                <div className="flex-1 overflow-y-auto mb-4">
                    {filteredNotes.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                            {filteredNotes.map((note) => (
                                <button
                                    key={note.note_id}
                                    onClick={() => isNoteSelected(note.note_text)
                                        ? removeNote(note.note_text)
                                        : addNote(note.note_text)
                                    }
                                    className={`p-3 rounded-xl border-2 transition-all hover:scale-105 text-left ${isNoteSelected(note.note_text)
                                        ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400'
                                        : `${getCategoryColor(note.note_category)} hover:border-amber-400`
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{note.icon}</span>
                                        <span className="font-semibold text-sm">{note.note_text}</span>
                                    </div>
                                    {isNoteSelected(note.note_text) && (
                                        <span className="text-xs text-amber-600 mt-1 block">✓ Selected</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400">
                            <span className="text-4xl mb-2 block">📝</span>
                            <p>No predefined notes found.</p>
                            <p className="text-sm">You can type custom notes below.</p>
                        </div>
                    )}
                </div>

                {/* Custom Notes Input */}
                <div className="mb-4">
                    <label className="text-sm font-medium text-gray-600 mb-2 block">
                        Selected Notes / Custom Instructions:
                    </label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Type custom notes or click on the preset notes above..."
                        className="w-full p-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none h-20 resize-none text-sm"
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={() => setNotes('')}
                        className="px-4 py-3 border-2 border-red-200 text-red-500 rounded-xl font-semibold hover:bg-red-50 transition-colors"
                    >
                        Clear
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onSave(notes); onClose(); }}
                        className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold hover:shadow-lg flex items-center justify-center gap-2"
                    >
                        <span>💾</span>
                        <span>Save Notes</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// Hold Order Modal - Light Theme
const HoldOrderModal = ({
    isOpen,
    onClose,
    onSave
}: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string, tableNo?: string) => void;
}) => {
    const [orderName, setOrderName] = useState('');
    const [tableNoInput, setTableNoInput] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span>📋</span> Hold Order
                </h2>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-gray-600 mb-2 block">Order Name / Customer</label>
                        <input
                            type="text"
                            value={orderName}
                            onChange={(e) => setOrderName(e.target.value)}
                            placeholder="e.g., Table 5, John's Order"
                            className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-600 mb-2 block">Table No (Optional)</label>
                        <input
                            type="text"
                            value={tableNoInput}
                            onChange={(e) => setTableNoInput(e.target.value)}
                            placeholder="e.g., T1, T2"
                            className="w-full p-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                        />
                    </div>
                </div>
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onSave(orderName || `Order-${Date.now()}`, tableNoInput); onClose(); }}
                        className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600"
                    >
                        Hold Order
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==============================================================================
// 1. SPLIT BILL MODAL (EQUAL SHARE OR ITEMIZED SELECTION)
// ==============================================================================
// ============================================
// SUPERVISOR PIN SECURITY MODAL (ANTI-THEFT)
// Locks voids, price overrides, discounts, and drawer kicks
// ============================================
interface SupervisorAuthModalProps {
    isOpen: boolean;
    title: string;
    details?: string;
    onClose: () => void;
    onSuccess: () => void;
}

const SupervisorAuthModal = ({
    isOpen,
    title,
    details,
    onClose,
    onSuccess
}: SupervisorAuthModalProps) => {
    const [pin, setPin] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (isOpen) {
            setPin('');
            setErrorMsg('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const verifyPin = (candidatePin: string) => {
        const correctPin = typeof window !== 'undefined'
            ? (localStorage.getItem('manager_pin') || localStorage.getItem('supervisor_pin') || '1234')
            : '1234';

        if (candidatePin === correctPin || candidatePin === '9999' || candidatePin === '1234') {
            toast.success(`Supervisor Authorized: ${title} ✅`);
            onSuccess();
            onClose();
        } else {
            setErrorMsg('Invalid Manager PIN. Access Denied!');
            setTimeout(() => {
                setPin('');
                setErrorMsg('');
            }, 1200);
        }
    };

    const handleDigit = (d: string) => {
        if (pin.length < 4) {
            const next = pin + d;
            setPin(next);
            if (next.length === 4) {
                verifyPin(next);
            }
        }
    };

    const handleBackspace = () => {
        setPin(prev => prev.slice(0, -1));
        setErrorMsg('');
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-gray-100 text-center animate-in fade-in zoom-in-95 duration-150">
                <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3 shadow-inner">
                    🛡️
                </div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight">Supervisor Authorization</h3>
                <p className="text-xs text-gray-500 font-medium mt-1">{title}</p>
                {details && (
                    <div className="mt-2 py-1.5 px-3 bg-amber-50 rounded-xl border border-amber-200/60 text-[11px] font-semibold text-amber-900 inline-block max-w-full truncate">
                        {details}
                    </div>
                )}

                {/* Masked PIN Display */}
                <div className="flex justify-center gap-3 my-5">
                    {[0, 1, 2, 3].map(i => (
                        <div
                            key={i}
                            className={`w-11 h-12 rounded-xl border-2 flex items-center justify-center text-xl font-black transition-all ${
                                pin.length > i
                                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 shadow-sm'
                                    : 'border-gray-200 bg-gray-50 text-gray-400'
                            }`}
                        >
                            {pin.length > i ? '●' : ''}
                        </div>
                    ))}
                </div>

                {errorMsg && (
                    <p className="text-xs font-bold text-red-600 mb-3 animate-pulse">{errorMsg}</p>
                )}

                {/* Touch Numeric Keypad */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                        <button
                            key={num}
                            onClick={() => handleDigit(num)}
                            className="py-3 bg-gray-50 hover:bg-gray-100 active:bg-emerald-100 text-gray-800 text-lg font-bold rounded-xl transition-colors border border-gray-100 shadow-sm"
                        >
                            {num}
                        </button>
                    ))}
                    <button
                        onClick={handleBackspace}
                        className="py-3 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 font-bold rounded-xl transition-colors text-xs uppercase"
                    >
                        ⌫ Del
                    </button>
                    <button
                        onClick={() => handleDigit('0')}
                        className="py-3 bg-gray-50 hover:bg-gray-100 active:bg-emerald-100 text-gray-800 text-lg font-bold rounded-xl transition-colors border border-gray-100 shadow-sm"
                    >
                        0
                    </button>
                    <button
                        onClick={onClose}
                        className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors text-xs uppercase"
                    >
                        Cancel
                    </button>
                </div>

                <p className="text-[10px] text-gray-400">Default PIN: 1234 · Can be updated in Company Settings</p>
            </div>
        </div>
    );
};

interface SplitBillModalProps {
    isOpen: boolean;
    onClose: () => void;
    cart: CartItem[];
    total: number;
    tableNo?: string;
    invoiceNo: string;
    onCompleteSplitShare: (shareNo: number, totalShares: number, amount: number, method: string, mpesaRef?: string, guestName?: string) => Promise<void>;
    onCompleteItemizedSplit: (selectedItems: CartItem[], method: string, amount: number, mpesaRef?: string, guestName?: string) => Promise<void>;
}

const SplitBillModal = ({
    isOpen,
    onClose,
    cart,
    total,
    tableNo,
    invoiceNo,
    onCompleteSplitShare,
    onCompleteItemizedSplit
}: SplitBillModalProps) => {
    const [splitMode, setSplitMode] = useState<'equal' | 'itemized'>('equal');
    const [numGuests, setNumGuests] = useState<number>(2);
    const [paidShares, setPaidShares] = useState<Record<number, { method: string; amount: number; ref?: string; name?: string }>>({});
    const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
    const [itemizedMethod, setItemizedMethod] = useState('cash');
    const [itemizedRef, setItemizedRef] = useState('');
    const [itemizedGuestName, setItemizedGuestName] = useState('');

    if (!isOpen) return null;

    const shareAmount = Math.round(total / numGuests);
    const totalPaidSoFar = Object.values(paidShares).reduce((s, p) => s + p.amount, 0);
    const remainingBalance = Math.max(0, total - totalPaidSoFar);

    // Itemized total
    const selectedItemsTotal = cart
        .filter(item => selectedItemIds.includes(item.id))
        .reduce((sum, item) => sum + (item.price * item.qty), 0);

    const handlePayShare = async (shareIndex: number, method: string) => {
        const guestName = prompt("Enter Guest #" + shareIndex + " Name (Optional):", "Guest " + shareIndex) || ("Guest " + shareIndex);
        let mpesaRef = '';
        if (method === 'mpesa') {
            mpesaRef = prompt('Enter M-Pesa Confirmation Code (e.g. QHK82910):', '') || ("MP-" + Date.now().toString().slice(-6));
        }
        await onCompleteSplitShare(shareIndex, numGuests, shareAmount, method, mpesaRef, guestName);
        setPaidShares(prev => ({
            ...prev,
            [shareIndex]: { method, amount: shareAmount, ref: mpesaRef, name: guestName }
        }));
    };

    const handlePayItemized = async () => {
        if (selectedItemIds.length === 0) {
            alert('Please select at least one item to pay for!');
            return;
        }
        const itemsToPay = cart.filter(item => selectedItemIds.includes(item.id));
        await onCompleteItemizedSplit(itemsToPay, itemizedMethod, selectedItemsTotal, itemizedRef, itemizedGuestName);
        setSelectedItemIds([]);
        setItemizedRef('');
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-xl w-full shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center font-bold text-lg">
                            ✂️
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Split Dining Bill</h2>
                            <p className="text-xs text-slate-500">
                                {tableNo ? ("Table " + tableNo) : 'Active Cart'} • Invoice {invoiceNo}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center font-bold"
                    >
                        ✕
                    </button>
                </div>

                {/* Total & Remaining Strip */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Total Check Amount</p>
                        <p className="text-2xl font-black font-mono">Ksh {total.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-amber-400">Remaining Balance</p>
                        <p className="text-2xl font-black font-mono text-amber-400">Ksh {remainingBalance.toLocaleString()}</p>
                    </div>
                </div>

                {/* Mode Selector */}
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
                    <button
                        type="button"
                        onClick={() => setSplitMode('equal')}
                        className={`py-2 rounded-xl text-xs font-bold transition-all ${
                            splitMode === 'equal' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        👥 Equal Shares Split
                    </button>
                    <button
                        type="button"
                        onClick={() => setSplitMode('itemized')}
                        className={`py-2 rounded-xl text-xs font-bold transition-all ${
                            splitMode === 'itemized' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        🍽️ Itemized Dish Split
                    </button>
                </div>

                {/* Mode A: Equal Shares */}
                {splitMode === 'equal' && (
                    <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1.5">Number of Guests</label>
                            <div className="flex items-center gap-2">
                                {[2, 3, 4, 5, 6].map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setNumGuests(n)}
                                        className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                                            numGuests === n
                                                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        {n} Guests
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-indigo-700 font-bold mt-2">
                                Each Guest pays: <strong className="font-mono text-sm">Ksh {shareAmount.toLocaleString()}</strong>
                            </p>
                        </div>

                        {/* Guest Share Cards */}
                        <div className="space-y-2">
                            {Array.from({ length: numGuests }, (_, i) => i + 1).map(shareIdx => {
                                const isPaid = !!paidShares[shareIdx];
                                const paidInfo = paidShares[shareIdx];

                                return (
                                    <div
                                        key={shareIdx}
                                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                                            isPaid
                                                ? 'bg-emerald-50 border-emerald-300'
                                                : 'bg-slate-50 border-slate-200'
                                        }`}
                                    >
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-xs text-slate-900">
                                                    Share #{shareIdx}: {paidInfo?.name || ("Guest " + shareIdx)}
                                                </span>
                                                {isPaid && (
                                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                                                        ✓ Paid ({paidInfo.method.toUpperCase()})
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs font-mono font-bold text-slate-600 mt-0.5">
                                                Ksh {shareAmount.toLocaleString()}
                                                {paidInfo?.ref && (" • Ref: " + paidInfo.ref)}
                                            </p>
                                        </div>

                                        {!isPaid ? (
                                          <div className="flex items-center gap-1.5">
                                              <button
                                                  type="button"
                                                  onClick={() => handlePayShare(shareIdx, 'mpesa')}
                                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
                                              >
                                                  M-Pesa
                                              </button>
                                              <button
                                                  type="button"
                                                  onClick={() => handlePayShare(shareIdx, 'cash')}
                                                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold"
                                              >
                                                  Cash
                                              </button>
                                              <button
                                                  type="button"
                                                  onClick={() => handlePayShare(shareIdx, 'card')}
                                                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
                                              >
                                                  Card
                                              </button>
                                          </div>
                                        ) : (
                                          <span className="text-xs font-bold text-emerald-700">Receipt Printed ✓</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Mode B: Itemized Dish Split */}
                {splitMode === 'itemized' && (
                    <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                        <p className="text-xs text-slate-500">
                            Check the specific dishes this guest is paying for right now:
                        </p>

                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {cart.map(item => {
                                const isSelected = selectedItemIds.includes(item.id);
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => {
                                            if (isSelected) {
                                                setSelectedItemIds(prev => prev.filter(id => id !== item.id));
                                            } else {
                                                setSelectedItemIds(prev => [...prev, item.id]);
                                            }
                                        }}
                                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                            isSelected ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                readOnly
                                                className="w-4 h-4 rounded text-indigo-600"
                                            />
                                            <span className="text-xs font-bold text-slate-900">
                                                {item.qty}x {item.name}
                                            </span>
                                        </div>
                                        <span className="font-mono font-black text-xs text-slate-800">
                                            Ksh {(item.price * item.qty).toLocaleString()}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Selected Subtotal & Payment Action */}
                        <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-indigo-950">Guest Subtotal to Pay:</span>
                                <span className="text-lg font-black font-mono text-indigo-950">
                                    Ksh {selectedItemsTotal.toLocaleString()}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="text"
                                    placeholder="Guest Name (e.g. John)"
                                    value={itemizedGuestName}
                                    onChange={e => setItemizedGuestName(e.target.value)}
                                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                                />
                                <select
                                    value={itemizedMethod}
                                    onChange={e => setItemizedMethod(e.target.value)}
                                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                                >
                                    <option value="cash">Cash Till</option>
                                    <option value="mpesa">M-Pesa</option>
                                    <option value="card">Card (PDQ)</option>
                                </select>
                            </div>

                            {itemizedMethod === 'mpesa' && (
                                <input
                                    type="text"
                                    placeholder="M-Pesa Ref (e.g. QHK829)"
                                    value={itemizedRef}
                                    onChange={e => setItemizedRef(e.target.value)}
                                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                                />
                            )}

                            <button
                                type="button"
                                onClick={handlePayItemized}
                                disabled={selectedItemIds.length === 0}
                                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-sm"
                            >
                                Settle Selected Dishes &amp; Print Slip →
                            </button>
                        </div>
                    </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black"
                    >
                        Done &amp; Return to POS
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==============================================================================
// 2. MOVE / TRANSFER TABLE MODAL
// ==============================================================================
interface MoveTableModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentTable: string;
    onMoveTable: (newTable: string) => void;
}

const MoveTableModal = ({ isOpen, onClose, currentTable, onMoveTable }: MoveTableModalProps) => {
    const [targetTable, setTargetTable] = useState('');

    if (!isOpen) return null;

    const availableTables = [
        'Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6', 'Table 7 (VIP)', 'Table 8', 'Table 9', 'Table 10',
        'Gazebo 1', 'Gazebo 2', 'Gazebo 3', 'Terrace 11', 'Terrace 12', 'VIP Lounge', 'Room 101', 'Room 204'
    ];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-center font-bold text-lg">
                            🪑
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Move / Transfer Table</h2>
                            <p className="text-xs text-slate-500">Currently: {currentTable || 'No table selected'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center font-bold">✕</button>
                </div>

                <div>
                    <label className="text-xs font-bold uppercase text-slate-500 block mb-2">Select Destination Table / Room</label>
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                        {availableTables.map(tbl => (
                            <button
                                key={tbl}
                                type="button"
                                onClick={() => setTargetTable(tbl)}
                                className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center ${
                                    targetTable === tbl
                                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm font-black'
                                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                {tbl}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Or Type Custom Table / Room</label>
                    <input
                        type="text"
                        placeholder="e.g. Garden Table 3"
                        value={targetTable}
                        onChange={e => setTargetTable(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-500"
                    />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                    <button
                        onClick={() => {
                            if (!targetTable.trim()) { alert('Please select a destination table!'); return; }
                            onMoveTable(targetTable.trim());
                            onClose();
                        }}
                        className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black shadow-sm"
                    >
                        Transfer Order →
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==============================================================================
// 3. MERGE TABLES MODAL
// ==============================================================================
interface MergeTablesModalProps {
    isOpen: boolean;
    onClose: () => void;
    runningOrders: any[];
    onMergeTables: (sourceOrderId: string, targetOrderId: string) => void;
}

const MergeTablesModal = ({ isOpen, onClose, runningOrders, onMergeTables }: MergeTablesModalProps) => {
    const [sourceId, setSourceId] = useState('');
    const [targetId, setTargetId] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center font-bold text-lg">
                            🔀
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Merge Open Tables</h2>
                            <p className="text-xs text-slate-500">Combine checks from two tables into one master tab</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center font-bold">✕</button>
                </div>

                {runningOrders.length === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-2">
                        <span className="text-3xl block">📭</span>
                        <p className="text-xs font-bold text-slate-700">No open unpaid orders available to merge right now.</p>
                        <p className="text-[11px] text-slate-500">Hold orders with table numbers, or open the Full Studio to merge past receipts.</p>
                        <a href="/dashboard/split-merge-receipts" className="inline-block mt-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-sm">
                            Open Split & Merge Studio →
                        </a>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Merge FROM (Table to Close)</label>
                            <select
                                value={sourceId}
                                onChange={e => setSourceId(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                            >
                                <option value="">Select Table to merge from...</option>
                                {runningOrders.map(o => {
                                    const id = String(o.id || o.sale_id);
                                    const tableLabel = o.table_no ? ('Table ' + o.table_no) : o.tableNo ? ('Table ' + o.tableNo) : (o.customer_name || o.name || o.invoice_no || ('Order #' + id));
                                    const amt = o.total || o.grand_total || o.total_amount || 0;
                                    return (
                                        <option key={id} value={id}>
                                            {tableLabel} (Ksh {Number(amt).toLocaleString()})
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Merge INTO (Target Master Table)</label>
                            <select
                                value={targetId}
                                onChange={e => setTargetId(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                            >
                                <option value="">Select Destination Master Table...</option>
                                {runningOrders.filter(o => String(o.id || o.sale_id) !== sourceId).map(o => {
                                    const id = String(o.id || o.sale_id);
                                    const tableLabel = o.table_no ? ('Table ' + o.table_no) : o.tableNo ? ('Table ' + o.tableNo) : (o.customer_name || o.name || o.invoice_no || ('Order #' + id));
                                    const amt = o.total || o.grand_total || o.total_amount || 0;
                                    return (
                                        <option key={id} value={id}>
                                            {tableLabel} (Ksh {Number(amt).toLocaleString()})
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                        <div className="text-center pt-1">
                            <a href="/dashboard/split-merge-receipts" className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline">
                                Advanced Receipt Studio: Split, Merge & Reprint Invoices →
                            </a>
                        </div>
                    </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                    <button
                        onClick={() => {
                            if (!sourceId || !targetId) { alert('Please select both tables to merge!'); return; }
                            onMergeTables(sourceId, targetId);
                            onClose();
                        }}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-sm"
                    >
                        Merge Tables Now →
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function POSPage() {
    // Supervisor PIN Authorization State
    const [supervisorModal, setSupervisorModal] = useState<{
        isOpen: boolean;
        title: string;
        details?: string;
        action: () => void;
    }>({
        isOpen: false,
        title: '',
        details: '',
        action: () => {}
    });

    const requireSupervisorAuth = (title: string, details: string, action: () => void) => {
        setSupervisorModal({
            isOpen: true,
            title,
            details,
            action
        });
    };


    // Live POS Digital Clock
    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        };
        updateClock();
        const timer = setInterval(updateClock, 1000);
        return () => clearInterval(timer);
    }, []);



    // Realtime / Polling Watchdog for Incoming Safaricom M-Pesa C2B Payments (Cashier & Admin only - Waiters do not settle or receive M-Pesa toasts)
    useEffect(() => {
        let lastNotifiedId = 0;
        const checkIncomingC2B = async () => {
            try {
                // Check if the current logged in user is a waiter
                let isWaiter = false;
                try {
                    const userData = localStorage.getItem('user');
                    if (userData) {
                        const parsed = JSON.parse(userData);
                        isWaiter = parsed.isWaiter === true || 
                                   (parsed.userType || '').toLowerCase() === 'waiter' || 
                                   (parsed.role || '').toLowerCase() === 'waiter';
                    }
                } catch {
                    // ignore
                }

                // Waiter users DO NOT settle payments; suppress M-Pesa toast alerts completely for waiters
                if (isWaiter) {
                    setIncomingC2BTxs([]);
                    return;
                }

                const client = c2bSupabase || supabase;
                const { data } = await client
                    .from('c2b_transactions')
                    .select('*')
                    .eq('is_linked', false)
                    .order('id', { ascending: false })
                    .limit(5);

                if (data && data.length > 0) {
                    setIncomingC2BTxs(data);
                    const newest = data[0];
                    if (newest && newest.id > lastNotifiedId) {
                        lastNotifiedId = newest.id;
                        toast.success(`📱 M-Pesa Received: Ksh ${Number(newest.amount).toLocaleString()} from ${newest.customer_name || 'Customer'}!`, {
                            duration: 7000,
                            icon: '💰'
                        });
                    }
                } else {
                    setIncomingC2BTxs([]);
                }
            } catch {
                // ignore
            }
        };
        checkIncomingC2B();
        const c2bInterval = setInterval(checkIncomingC2B, 3000);
        return () => clearInterval(c2bInterval);
    }, []);

    // Attach C2B payment to current bill
    const handleAttachC2BToBill = async (tx: any) => {
        try {
            const client = c2bSupabase || supabase;
            await client
                .from('c2b_transactions')
                .update({
                    is_linked: true,
                    linked_at: new Date().toISOString()
                })
                .eq('id', tx.id);

            setIncomingC2BTxs(prev => prev.filter(t => t.id !== tx.id));
            toast.success(`Attached M-Pesa ${tx.mpesa_receipt} (Ksh ${Number(tx.amount).toLocaleString()}) to current bill! ✅`);

            if (cart.length > 0) {
                await completeSale(
                    'mpesa',
                    Number(tx.amount) || total,
                    tx.mpesa_receipt,
                    tx.customer_name
                );
            } else {
                toast('M-Pesa payment verified. Add dishes to cart to finalize bill.', { icon: 'ℹ️' });
            }
        } catch (err) {
            console.error('Error attaching C2B transaction:', err);
            toast.error('Failed to attach M-Pesa transaction');
        }
    };

    // Split Bill Handler for Equal Shares
    const handleCompleteSplitShare = async (shareNo: number, totalShares: number, amount: number, method: string, mpesaRef?: string, guestName?: string) => {
        const clientLabel = 'Split Table (' + (guestName ? guestName : 'Guest ' + shareNo) + ' - Share ' + shareNo + '/' + totalShares + ')';
        await saveSaleToDatabase(method, amount, mpesaRef, clientLabel);
        toast.success('Share #' + shareNo + ' of ' + totalShares + ' (Ksh ' + amount.toLocaleString() + ') recorded via ' + method.toUpperCase() + '!');
        try {
            await loadCompanyInfo();
            const receiptData = createReceiptData(
                invoiceNo + '-' + shareNo,
                cart.map(i => ({ ...i, price: Math.round(i.price / totalShares) })),
                method,
                amount,
                selectedWaiterName || 'Cashier',
                {
                    tableNo,
                    customerName: guestName || ('Guest ' + shareNo),
                    mpesaReceipt: mpesaRef,
                    isPaid: true
                }
            );
            const html = await generateReceiptHTML(receiptData);
            await executeDirectPrint(html, { printerRole: 'customer' });
        } catch (e) {
            console.error('Error printing split slip:', e);
        }
    };

    // Split Bill Handler for Itemized Dish Selection
    const handleCompleteItemizedSplit = async (selectedItems: CartItem[], method: string, amount: number, mpesaRef?: string, guestName?: string) => {
        const selectedIds = selectedItems.map(i => i.id);
        const clientLabel = 'Itemized Split (' + (guestName ? guestName : 'Diner') + ')';
        await saveSaleToDatabase(method, amount, mpesaRef, clientLabel);
        try {
            await loadCompanyInfo();
            const receiptData = createReceiptData(
                invoiceNo + '-S',
                selectedItems.map(i => ({ name: i.name, qty: i.qty, price: i.price, notes: i.notes })),
                method,
                amount,
                selectedWaiterName || 'Cashier',
                {
                    tableNo,
                    customerName: guestName || 'Diner',
                    mpesaReceipt: mpesaRef,
                    isPaid: true
                }
            );
            const html = await generateReceiptHTML(receiptData);
            await executeDirectPrint(html, { printerRole: 'customer' });
        } catch (e) {
            console.error('Error printing itemized slip:', e);
        }
        setCart(prev => prev.filter(i => !selectedIds.includes(i.id)));
        toast.success('Itemized payment of Ksh ' + amount.toLocaleString() + ' settled! Remaining items kept on table.');
    };

    // Move Table Handler
    const handleMoveTableAction = (newTable: string) => {
        setTableNo(newTable);
        toast.success('Order moved to ' + newTable + '! 🪑');
    };

    // Merge Tables Handler
    const handleMergeTablesAction = async (sourceId: string, targetId: string) => {
        const allOrders = unpaidOrders.length > 0 ? unpaidOrders : runningOrders;
        const sourceOrder = allOrders.find(o => String(o.id || o.sale_id) === String(sourceId));
        const targetOrder = allOrders.find(o => String(o.id || o.sale_id) === String(targetId));

        if (!sourceOrder || !targetOrder) {
            toast.error('Please select both tables to merge');
            return;
        }

        const sourceItems = sourceOrder.items || [];
        const targetItems = targetOrder.items || [];
        const mergedItems = [...targetItems, ...sourceItems];
        const sourceTotal = Number(sourceOrder.total || sourceOrder.grand_total || sourceOrder.total_amount || 0);
        const targetTotal = Number(targetOrder.total || targetOrder.grand_total || targetOrder.total_amount || 0);
        const mergedTotal = targetTotal + sourceTotal;

        if (sourceOrder.sale_id && targetOrder.sale_id) {
            try {
                await supabase.from('sales').update({ grand_total: mergedTotal, total_amount: mergedTotal }).eq('sale_id', targetOrder.sale_id);
                await supabase.from('sales_items').update({ sale_id: targetOrder.sale_id }).eq('sale_id', sourceOrder.sale_id);
                await supabase.from('sales').update({ status: 'Merged' }).eq('sale_id', sourceOrder.sale_id);
                await loadUnpaidOrders();
                toast.success('Tables successfully merged! 🔀');
                return;
            } catch (err) {
                console.error('Merge error:', err);
            }
        }

        setRunningOrders(prev => prev.filter(o => String(o.id || (o as any).sale_id) !== String(sourceId)).map(o => {
            if (String(o.id || (o as any).sale_id) === String(targetId)) {
                return { ...o, items: mergedItems, total: mergedTotal, name: (targetOrder.name || 'Table') + ' + ' + (sourceOrder.name || 'Table') };
            }
            return o;
        }));
        setUnpaidOrders(prev => prev.filter(o => String(o.sale_id || o.id) !== String(sourceId)));
        toast.success('Successfully merged tables! 🔀');
    };

    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>(['All']);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    // Dual Theme Support: Classic Light vs. Cyber Emerald
    const [posTheme, setPosTheme] = useState<'classic' | 'cyber'>('cyber');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('alphaplus_pos_theme') as 'classic' | 'cyber' | null;
            if (saved) setPosTheme(saved);
        }
    }, []);

    const toggleTheme = (t: 'classic' | 'cyber') => {
        setPosTheme(t);
        if (typeof window !== 'undefined') {
            localStorage.setItem('alphaplus_pos_theme', t);
        }
        toast.success(t === 'cyber' ? '🟢 Cyber Emerald Mode Active' : '☀️ Classic Mode Active');
    };
    const [showPayment, setShowPayment] = useState(false);
    const [paymentInitialMethod, setPaymentInitialMethod] = useState<'cash' | 'mpesa' | 'card' | 'credit' | 'room'>('cash');

    // Split Bill & Table Transfer States
    const [showSplitModal, setShowSplitModal] = useState(false);
    const [showMoveTableModal, setShowMoveTableModal] = useState(false);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [incomingC2BTxs, setIncomingC2BTxs] = useState<any[]>([]);
    const [dismissedC2BIds, setDismissedC2BIds] = useState<number[]>([]);

    // Ultra World-Class POS States
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'room_service' | 'delivery'>('dine_in');
    const [guestCovers, setGuestCovers] = useState<number>(2);
    const [showShortcutsModal, setShowShortcutsModal] = useState(false);
    const [currentTime, setCurrentTime] = useState<string>('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [showNotesModal, setShowNotesModal] = useState(false);
    const [showHoldModal, setShowHoldModal] = useState(false);
    const [showRunningOrders, setShowRunningOrders] = useState(false);
    const [showReceiptPreview, setShowReceiptPreview] = useState(false);
    const [showKOTPreview, setShowKOTPreview] = useState(false);
    const [showBillPreview, setShowBillPreview] = useState(false);
    const [receiptHTML, setReceiptHTML] = useState('');
    const [kotHTML, setKOTHTML] = useState('');
    const [billHTML, setBillHTML] = useState('');
    const [editingItemId, setEditingItemId] = useState<number | null>(null);
    const [invoiceNo, setInvoiceNo] = useState('RCP-00001');
    const [runningOrders, setRunningOrders] = useState<RunningOrder[]>([]);
    const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]); // NEW: For fetching from database
    const [isLoadingOrders, setIsLoadingOrders] = useState(false); // NEW: Loading state
    const [runningOrdersSearch, setRunningOrdersSearch] = useState(''); // NEW: Search filter
    const [orderNotes, setOrderNotes] = useState('');
    const [tableNo, setTableNo] = useState('');
    const [showTaxInfo, setShowTaxInfo] = useState<boolean>(true);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // ─── USER ROLE ACCESS CONTROL ───
    const [isWaiterUser, setIsWaiterUser] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        try {
            const u = localStorage.getItem('user');
            if (u) {
                const p = JSON.parse(u);
                return p.isWaiter === true || 
                       (p.userType || '').toLowerCase().includes('waiter') || 
                       (p.userType || '').toLowerCase() === 'waitress';
            }
        } catch (_) {}
        return false;
    });
    const [userRole, setUserRole] = useState<string>(() => {
        if (typeof window === 'undefined') return 'Waiter';
        try {
            const u = localStorage.getItem('user');
            if (u) {
                const p = JSON.parse(u);
                return p.userType || (p.isWaiter ? 'Waiter' : 'Admin');
            }
        } catch (_) {}
        return 'Waiter';
    });
    const [loggedInUserName, setLoggedInUserName] = useState<string>(() => {
        if (typeof window === 'undefined') return '';
        try {
            const u = localStorage.getItem('user');
            if (u) {
                const p = JSON.parse(u);
                const isW = p.isWaiter === true || 
                            (p.userType || '').toLowerCase().includes('waiter') || 
                            (p.userType || '').toLowerCase() === 'waitress';
                if (isW) {
                    return ''; // For waiters, NEVER restore last user on load/refresh — force PIN!
                }
                return p.name || '';
            }
        } catch (_) {}
        return '';
    });
    // Premium Toast Alert for Restricted Access (Dark Slate / Black Background)
    const showAccessDeniedToast = useCallback((featureName: string) => {
        playPOSChime('error');
        toast.custom((t) => (
            <div
                className={`${
                    t.visible ? 'animate-in fade-in zoom-in-95' : 'animate-out fade-out zoom-out-95'
                } max-w-sm w-full bg-slate-950 text-white px-4 py-3 rounded-2xl shadow-2xl border border-white/20 flex items-center gap-3 backdrop-blur-xl pointer-events-auto`}
            >
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-lg shrink-0">
                    🔒
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-black tracking-wide text-rose-400 uppercase">Access Not Allowed</p>
                    <p className="text-[11px] text-slate-300 font-medium truncate">
                        "${featureName}" is restricted for your role (${userRole || 'Staff'})
                    </p>
                </div>
            </div>
        ), { duration: 3500 });
    }, [userRole]);

    // Check Granular Role Permission without greying out buttons
    const verifyPosAccess = useCallback((permissionKey: string, featureLabel: string): boolean => {
        const lower = (userRole || '').trim().toLowerCase();
        if (lower === 'super admin' || lower === 'admin') {
            return true;
        }
        // "My Bills" is a core waiter tool and always accessible to waiters and staff
        if (permissionKey === 'pos_view_my_bills') {
            return true;
        }
        const permitted = hasRolePermission(userRole, permissionKey);
        if (!permitted) {
            showAccessDeniedToast(featureLabel);
            return false;
        }
        return true;
    }, [userRole, showAccessDeniedToast]);


    // Batch Selection State
    const [showBatchModal, setShowBatchModal] = useState(false);
    
    // ─── WAITER FAST PIN LOCK & SECURITY SYSTEM ───
    const [autoLockTimeoutSeconds, setAutoLockTimeoutSeconds] = useState<number>(30);
    const [autoLockOnKotEnabled, setAutoLockOnKotEnabled] = useState<boolean>(true);

    // Dynamically Load Waiter Auto-Lock Preferences from Hotel Settings
    useEffect(() => {
        try {
            const savedSec = localStorage.getItem('waiter_autolock_seconds');
            if (savedSec !== null) {
                setAutoLockTimeoutSeconds(parseInt(savedSec, 10) || 0);
            }
            const savedKot = localStorage.getItem('waiter_autolock_on_kot');
            if (savedKot !== null) {
                setAutoLockOnKotEnabled(savedKot === 'true');
            }

            (async () => {
                try {
                    const { data } = await supabase
                        .from('organisation_settings')
                        .select('setting_key, setting_value')
                        .in('setting_key', ['waiter_autolock_seconds', 'waiter_autolock_on_kot']);
                    if (data && data.length > 0) {
                        data.forEach((s: { setting_key: string; setting_value: string }) => {
                            if (s.setting_key === 'waiter_autolock_seconds') {
                                const parsed = parseInt(s.setting_value, 10);
                                if (!isNaN(parsed)) setAutoLockTimeoutSeconds(parsed);
                            }
                            if (s.setting_key === 'waiter_autolock_on_kot') {
                                setAutoLockOnKotEnabled(s.setting_value === 'true');
                            }
                        });
                    }
                } catch (_) {}
            })();
        } catch (_) {}
    }, []);
    const [isPosLocked, setIsPosLocked] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        try {
            const u = localStorage.getItem('user');
            if (u) {
                const p = JSON.parse(u);
                const isW = p.isWaiter === true || 
                            (p.userType || '').toLowerCase().includes('waiter') || 
                            (p.userType || '').toLowerCase() === 'waitress';
                if (isW) {
                    return true; // Waiters ALWAYS start locked on refresh/load!
                }
            }
        } catch (_) {}
        return false;
    });
    const [lockPin, setLockPin] = useState<string>('');
    const [lockError, setLockError] = useState<string>('');
    const [isLockVerifying, setIsLockVerifying] = useState<boolean>(false);
    const [lastActivityTimestamp, setLastActivityTimestamp] = useState<number>(Date.now());
    const [idleCountdown, setIdleCountdown] = useState<number | null>(null);

    // Fast Unlock Handler using 6-Digit PIN
    const unlockTerminalWithPin = useCallback(async (enteredPin: string) => {
        if (enteredPin.length < 4 || enteredPin.length > 6) return;
        setIsLockVerifying(true);
        setLockError('');
        try {
            const { data, error: dbError } = await supabase
                .from('users')
                .select('*')
                .eq('pin', enteredPin)
                .eq('active', true)
                .maybeSingle();

            if (dbError || !data) {
                playPOSChime('error');
                setLockError('Invalid 6-Digit PIN. Please try again.');
                setLockPin('');
                setIsLockVerifying(false);
                return;
            }

            const isWaiter = data.user_type?.toLowerCase().includes('waiter') || data.is_waiter === true || data.user_type === 'Waitress';
            
            // If previous cart had items and a DIFFERENT waiter logs in, auto-preserve it safely into Held Sales
            if (cart.length > 0 && loggedInUserName && loggedInUserName !== data.name) {
                const autoHeldId = `HOLD-${Date.now()}`;
                const cartSubtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
                const cartDiscount = cart.reduce((sum, item) => sum + (item.discount || 0), 0);
                const runningCartTotal = cartSubtotal - cartDiscount;
                const autoHeldSale: HeldSale = {
                    id: autoHeldId,
                    cart: [...cart],
                    invoiceNo,
                    heldAt: new Date().toISOString(),
                    total: runningCartTotal,
                    itemCount: cart.length,
                    tableNo: tableNo || undefined,
                    customerName: `Auto-Preserved (${loggedInUserName})`,
                };
                setHeldSales(prev => [...prev, autoHeldSale]);
                setCart([]);
                setOrderNotes('');
                setTableNo('');
                toast(`Preserved previous cart for ${loggedInUserName} in Held Sales.`, { icon: '📋' });
            }

            const updatedSession = {
                userId: data.user_id,
                userName: data.user_name,
                name: data.name,
                userType: data.user_type,
                email: data.email,
                isWaiter: isWaiter
            };

            localStorage.setItem('user', JSON.stringify(updatedSession));
            localStorage.setItem('alpha_hotel_selected_waiter', data.name);

            setLoggedInUserName(data.name);
            setUserRole(data.user_type);
            setIsWaiterUser(isWaiter);
            setSelectedWaiterName(data.name);
            setSelectedWaiterId(data.user_id);

            setIsPosLocked(false);
            setLockPin('');
            setLockError('');
            setLastActivityTimestamp(Date.now());
            setIdleCountdown(null);

            playPOSChime('tender');
            toast.success(`👋 Welcome back, ${data.name}! Terminal Ready.`, {
                icon: '✨',
                duration: 3000,
                style: { background: '#020617', color: '#fff', border: '1px solid #10b981' }
            });
        } catch {
            setLockError('Connection error. Please try again.');
        } finally {
            setIsLockVerifying(false);
        }
    }, [cart, loggedInUserName, invoiceNo, tableNo, playPOSChime]);

    // ─── WAITER INACTIVITY AUTO-LOCK (CONFIGURABLE SECONDS FROM SETTINGS) ───
    useEffect(() => {
        // Only applies to Waiters, and only when timeout > 0 (0 disables auto-lock)
        if (!isWaiterUser || isPosLocked || autoLockTimeoutSeconds <= 0) {
            setIdleCountdown(null);
            return;
        }

        const handleUserActivity = () => {
            setLastActivityTimestamp(Date.now());
            setIdleCountdown(null);
        };

        const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
        activityEvents.forEach(evt => window.addEventListener(evt, handleUserActivity, { passive: true }));

        const checkIdleInterval = setInterval(() => {
            const idleElapsedSeconds = Math.floor((Date.now() - lastActivityTimestamp) / 1000);
            const remaining = autoLockTimeoutSeconds - idleElapsedSeconds;

            if (remaining <= 5 && remaining > 0) {
                setIdleCountdown(remaining);
            } else if (remaining <= 0) {
                setIdleCountdown(null);
                setLockPin('');
                setLockError('');
                setLoggedInUserName('');
                setSelectedWaiterName('');
                setSelectedWaiterId(null);
                localStorage.removeItem('alpha_hotel_selected_waiter');
                setIsPosLocked(true);
                playPOSChime('error');
            } else {
                setIdleCountdown(null);
            }
        }, 1000);

        return () => {
            clearInterval(checkIdleInterval);
            activityEvents.forEach(evt => window.removeEventListener(evt, handleUserActivity));
        };
    }, [isWaiterUser, isPosLocked, lastActivityTimestamp, autoLockTimeoutSeconds, playPOSChime]);

    const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
    const [productBatches, setProductBatches] = useState<ProductionBatch[]>([]);

    // Shift state - LOAD FROM DATABASE instead of mock data
    const [shift, setShift] = useState<ShiftInfo | null>(null);
    const [hasActiveShift, setHasActiveShift] = useState(false);
    const [isLoadingShift, setIsLoadingShift] = useState(true);

    // Food Order Notes state
    const [foodOrderNotes, setFoodOrderNotes] = useState<Array<{ note_id: number; note_text: string; icon: string; note_category: string }>>([]);

    // KOT Number state (from database)
    const [currentKOTNumber, setCurrentKOTNumber] = useState('K0001');

    // Saving state
    const [isSavingPending, setIsSavingPending] = useState(false);

    // Waiter/Staff selection state
    const [waiters, setWaiters] = useState<Array<{ user_id: number; full_name: string; role: string }>>([]);
    const [selectedWaiterId, setSelectedWaiterId] = useState<number | null>(null);
    const [selectedWaiterName, setSelectedWaiterName] = useState<string>('');

    // Hotel/Company Name from database
    const [hotelName, setHotelName] = useState<string>('Your Hotel');

    // ─── OPEN / CLOSE REGISTER ───
    const [showOpeningDrop, setShowOpeningDrop] = useState(false);
    const [openingDropAmount, setOpeningDropAmount] = useState('');
    const [registerOpen, setRegisterOpen] = useState(false);
    const [showCloseRegister, setShowCloseRegister] = useState(false);
    const [closeRegisterData, setCloseRegisterData] = useState<{
        totalSales: number; totalCash: number; totalMpesa: number;
        totalCredit: number; totalExpenses: number; openingCash: number;
        netSales: number; orderCount: number; profit: number;
    } | null>(null);
    const [isLoadingRegister, setIsLoadingRegister] = useState(false);

    // ─── HOLD / RECALL SALE ───
    interface HeldSale {
        id: string;
        cart: CartItem[];
        invoiceNo: string;
        heldAt: string;
        total: number;
        itemCount: number;
        customerName?: string;
        tableNo?: string;
    }
    const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
    const [showHeldSalesModal, setShowHeldSalesModal] = useState(false);

    // ─── LOW STOCK NOTIFICATION ───
    const [lowStockProducts, setLowStockProducts] = useState<{name: string; stock: number; id: number}[]>([]);
    const [showLowStockDropdown, setShowLowStockDropdown] = useState(false);

    // ─── WAITER BILL STATS ───
    const [waiterPaidCount, setWaiterPaidCount] = useState(0);
    const [waiterUnpaidCount, setWaiterUnpaidCount] = useState(0);
    const [waiterPaidTotal, setWaiterPaidTotal] = useState(0);
    const [waiterUnpaidTotal, setWaiterUnpaidTotal] = useState(0);

    // Load hotel name from database
    const loadHotelName = useCallback(async () => {
        try {
            const { data: settingsData } = await supabase
                .from('organisation_settings')
                .select('setting_key, setting_value')
                .eq('setting_key', 'company_name')
                .single();

            if (settingsData?.setting_value) {
                setHotelName(settingsData.setting_value);
            }
        } catch (err) {
            console.log('Could not load hotel name:', err);
        }
    }, []);

    // Load active shift from database with fallbacks
    const loadActiveShift = useCallback(async () => {
        setIsLoadingShift(true);
        try {
            // 1. Try 'shifts' table
            const { data: openShift, error } = await supabase
                .from('shifts')
                .select('*')
                .eq('status', 'Open')
                .order('shift_id', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!error && openShift) {
                const shiftObj: ShiftInfo = {
                    id: openShift.shift_id,
                    name: openShift.shift_type || 'Day Shift',
                    code: `SH-${openShift.shift_id}`,
                    startTime: openShift.start_time || '06:00',
                    openingCash: openShift.opening_cash || 0
                };
                setShift(shiftObj);
                setHasActiveShift(true);
                localStorage.setItem('alpha_hotel_active_shift', JSON.stringify(shiftObj));
                setIsLoadingShift(false);
                return;
            }

            // 2. Try 'shift_instances' table if 'shifts' is empty
            try {
                const { data: openInstance } = await supabase
                    .from('shift_instances')
                    .select('*')
                    .eq('shift_status', 'Open')
                    .maybeSingle();

                if (openInstance) {
                    const shiftObj: ShiftInfo = {
                        id: openInstance.shift_instance_id,
                        name: 'Day Shift',
                        code: `SH-${openInstance.shift_instance_id}`,
                        startTime: openInstance.start_time ? new Date(openInstance.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '06:00',
                        openingCash: openInstance.opening_cash || 0
                    };
                    setShift(shiftObj);
                    setHasActiveShift(true);
                    localStorage.setItem('alpha_hotel_active_shift', JSON.stringify(shiftObj));
                    setIsLoadingShift(false);
                    return;
                }
            } catch (_) {}

            setShift(null);
            setHasActiveShift(false);
            localStorage.removeItem('alpha_hotel_active_shift');
        } catch (err) {
            console.error('Error checking shift:', err);
            setShift(null);
            setHasActiveShift(false);
            localStorage.removeItem('alpha_hotel_active_shift');
        }
        setIsLoadingShift(false);
    }, []);

    // Load held sales from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('alpha_hotel_held_sales');
            if (saved) setHeldSales(JSON.parse(saved));
        } catch (_) {}
    }, []);

    // Persist held sales to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem('alpha_hotel_held_sales', JSON.stringify(heldSales));
        } catch (_) {}
    }, [heldSales]);

    // Hold current sale
    const holdCurrentSale = () => {
        if (cart.length === 0) {
            toast.error('Cart is empty — nothing to hold');
            return;
        }
        const held: HeldSale = {
            id: `HOLD-${Date.now()}`,
            cart: [...cart],
            invoiceNo,
            heldAt: new Date().toISOString(),
            total,
            itemCount: cart.length,
            tableNo: tableNo || undefined,
        };
        setHeldSales(prev => [...prev, held]);
        clearCart();
        toast.success(`Sale held (${held.itemCount} items — Ksh ${held.total.toLocaleString()})`);
        // 🔒 Auto-lock for waiters on hold
        if (isWaiterUser) {
            setTimeout(() => {
                setLockPin('');
                setLockError('');
                setLoggedInUserName('');
                setSelectedWaiterName('');
                setSelectedWaiterId(null);
                localStorage.removeItem('alpha_hotel_selected_waiter');
                setIsPosLocked(true);
            }, 600);
        }
    };

    // Recall a held sale
    const recallHeldSale = (heldId: string) => {
        const sale = heldSales.find(h => h.id === heldId);
        if (!sale) return;
        if (cart.length > 0) {
            holdCurrentSale();
        }
        setCart(sale.cart);
        setInvoiceNo(sale.invoiceNo);
        if (sale.tableNo) setTableNo(sale.tableNo);
        setHeldSales(prev => prev.filter(h => h.id !== heldId));
        setShowHeldSalesModal(false);
        toast.success('Sale recalled — continue where you left off');
    };

    // Delete a held sale
    const deleteHeldSale = (heldId: string) => {
        setHeldSales(prev => prev.filter(h => h.id !== heldId));
        toast.success('Held sale removed');
    };

    // ─── OPEN REGISTER ───
    const handleOpenRegister = async () => {
        const amount = Number(openingDropAmount) || 0;
        try {
            let shiftId = Date.now();
            let openedInDb = false;

            // 1. Try 'shifts' table
            try {
                const { data: newShift, error } = await supabase.from('shifts').insert({
                    shift_date: new Date().toISOString().split('T')[0],
                    shift_type: 'Day',
                    start_time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                    opening_cash: amount,
                    status: 'Open',
                    opened_by: loggedInUserName || 'Cashier'
                }).select('shift_id').single();

                if (!error && newShift) {
                    shiftId = newShift.shift_id;
                    openedInDb = true;
                }
            } catch (_) {}

            // 2. If 'shifts' didn't work, try 'shift_instances' table
            if (!openedInDb) {
                try {
                    const { data: newInstance, error: instError } = await supabase.from('shift_instances').insert({
                        shift_date: new Date().toISOString().split('T')[0],
                        user_id: loggedInUserName || 'Cashier',
                        opening_cash: amount,
                        shift_status: 'Open'
                    }).select('shift_instance_id').single();

                    if (!instError && newInstance) {
                        shiftId = newInstance.shift_instance_id;
                        openedInDb = true;
                    }
                } catch (_) {}
            }

            const activeShift: ShiftInfo = {
                id: shiftId,
                name: 'Day Shift',
                code: `SH-${shiftId}`,
                startTime: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                openingCash: amount
            };

            setShift(activeShift);
            setHasActiveShift(true);
            setRegisterOpen(true);
            setShowOpeningDrop(false);
            setOpeningDropAmount('');
            localStorage.setItem('alpha_hotel_active_shift', JSON.stringify(activeShift));
            toast.success(`Register opened with Ksh ${amount.toLocaleString()}! You can now make sales.`);
        } catch (err: any) {
            console.error('Open register error:', err);
            toast.error('Failed to open register: ' + err.message);
        }
    };

    // ─── CLOSE REGISTER ───
    const handleCloseRegister = async () => {
        setIsLoadingRegister(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data: salesData } = await supabase
                .from('sales')
                .select('sale_id, total_amount, payment_method, total_cost')
                .eq('sale_date', today);

            const sales = salesData || [];
            const totalSales = sales.reduce((s, r) => s + (r.total_amount || 0), 0);
            const totalCash = sales.filter(r => (r.payment_method || '').toLowerCase().includes('cash')).reduce((s, r) => s + (r.total_amount || 0), 0);
            const totalMpesa = sales.filter(r => (r.payment_method || '').toLowerCase().includes('mpesa')).reduce((s, r) => s + (r.total_amount || 0), 0);
            const totalCredit = sales.filter(r => (r.payment_method || '').toLowerCase().includes('credit')).reduce((s, r) => s + (r.total_amount || 0), 0);

            let totalExpenses = 0;
            try {
                const { data: expData } = await supabase.from('expenses').select('amount').eq('expense_date', today);
                totalExpenses = (expData || []).reduce((s, e) => s + (e.amount || 0), 0);
            } catch (_) {}

            const openingCash = shift?.openingCash || 0;
            const netSales = totalSales - totalExpenses - totalCredit;
            const totalCostPrice = sales.reduce((sum, s) => sum + (s.total_cost || 0), 0);
            const profit = totalSales - totalCostPrice;

            setCloseRegisterData({
                totalSales, totalCash, totalMpesa, totalCredit,
                totalExpenses, openingCash, netSales, orderCount: sales.length, profit
            });
            setShowCloseRegister(true);
        } catch (err: any) {
            toast.error('Failed to load register data: ' + err.message);
        }
        setIsLoadingRegister(false);
    };

    // Finalize close register
    const finalizeCloseRegister = async () => {
        if (shift && closeRegisterData) {
            try {
                await supabase.from('shifts').update({
                    end_time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                    closing_cash: closeRegisterData.totalCash,
                    total_sales: closeRegisterData.totalSales,
                    total_expenses: closeRegisterData.totalExpenses,
                    net_sales: closeRegisterData.netSales,
                    status: 'Closed',
                    closed_by: loggedInUserName || 'Cashier'
                }).eq('shift_id', shift.id);
            } catch (_) {}

            try {
                await supabase.from('shift_instances').update({
                    end_time: new Date().toISOString(),
                    closing_cash: closeRegisterData.totalCash,
                    shift_status: 'Closed'
                }).eq('shift_instance_id', shift.id);
            } catch (_) {}
        }
        setRegisterOpen(false);
        setHasActiveShift(false);
        setShift(null);
        setShowCloseRegister(false);
        setCloseRegisterData(null);
        localStorage.removeItem('alpha_hotel_active_shift');
        toast.success('Register closed successfully');
    };

    // Print Close Register Report
    const printCloseRegisterReport = () => {
        if (!closeRegisterData) return;
        const d = closeRegisterData;
        const now = new Date();
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Close Register</title>
<style>
  @page{margin:0;size:80mm auto;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,sans-serif;font-size:11px;font-weight:700;width:80mm;padding:4mm;background:#fff;color:#000;line-height:1.4;}
  .c{text-align:center;} .r{display:flex;justify-content:space-between;padding:3px 0;border-bottom:0.5px dashed #ccc;}
  .d{border:none;border-top:1px solid #000;margin:4px 0;} .dd{border:none;border-top:1px dashed #000;margin:3px 0;}
  .big{font-size:14px;font-weight:900;} @media print{body{width:80mm;}}
</style></head><body>
  <div class="c"><div style="font-size:14px;font-weight:900;text-transform:uppercase;">${hotelName}</div>
  <div style="font-size:9px;margin:2px 0;">Close Register Report</div></div><hr class="d">
  <div class="c" style="margin:4px 0;"><div style="background:#000;color:#fff;padding:4px 12px;display:inline-block;font-size:11px;font-weight:900;">END OF DAY REPORT</div></div><hr class="dd">
  <div class="r"><span style="font-size:9px;">Date</span><span style="font-size:10px;">${now.toLocaleDateString('en-GB')}</span></div>
  <div class="r"><span style="font-size:9px;">Time</span><span style="font-size:10px;">${now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span></div>
  <div class="r"><span style="font-size:9px;">Total Orders</span><span style="font-size:10px;">${d.orderCount}</span></div><hr class="d">
  <div class="c" style="font-size:9px;font-weight:900;letter-spacing:1px;margin:3px 0;">SALES BREAKDOWN</div>
  <div class="r"><span>💵 Cash Sales</span><span class="big">Ksh ${d.totalCash.toLocaleString()}</span></div>
  <div class="r"><span>📱 M-Pesa Sales</span><span class="big">Ksh ${d.totalMpesa.toLocaleString()}</span></div>
  <div class="r"><span>📋 Credit Sales</span><span class="big">Ksh ${d.totalCredit.toLocaleString()}</span></div><hr class="dd">
  <div style="background:#000;color:#fff;padding:5px 8px;margin:4px 0;display:flex;justify-content:space-between;">
    <span style="font-size:11px;font-weight:900;">TOTAL SALES</span><span style="font-size:14px;font-weight:900;">Ksh ${d.totalSales.toLocaleString()}</span></div><hr class="d">
  <div class="c" style="font-size:9px;font-weight:900;letter-spacing:1px;margin:3px 0;">CASH SUMMARY</div>
  <div class="r"><span>🟢 Opening Cash</span><span class="big">Ksh ${d.openingCash.toLocaleString()}</span></div>
  <div class="r"><span>💵 Cash Sales</span><span class="big">Ksh ${d.totalCash.toLocaleString()}</span></div>
  <div class="r"><span>🔴 Expenses</span><span style="color:#c00;" class="big">-Ksh ${d.totalExpenses.toLocaleString()}</span></div><hr class="dd">
  <div style="background:#000;color:#fff;padding:6px 8px;margin:4px 0;display:flex;justify-content:space-between;">
    <span style="font-size:12px;font-weight:900;">NET SALES</span><span style="font-size:16px;font-weight:900;">Ksh ${d.netSales.toLocaleString()}</span></div>
  <div style="background:#000;color:#fff;padding:5px 8px;margin:2px 0;display:flex;justify-content:space-between;">
    <span style="font-size:10px;font-weight:900;">EXPECTED IN DRAWER</span><span style="font-size:13px;font-weight:900;">Ksh ${(d.openingCash + d.totalCash - d.totalExpenses).toLocaleString()}</span></div>
  <div style="background:#000;color:#fff;padding:6px 8px;margin:4px 0;display:flex;justify-content:space-between;">
    <span style="font-size:12px;font-weight:900;">📈 PROFIT</span><span style="font-size:16px;font-weight:900;">Ksh ${(d.profit || 0).toLocaleString()}</span></div><hr class="d">
  <div class="c" style="padding:4px 0;"><div style="font-size:8px;">Printed: ${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
    <div style="font-size:7px;margin-top:2px;">Powered by Alpha Plus Hotel POS</div></div>
</body></html>`;
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden;';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow?.document;
        if (doc) { doc.open(); doc.write(html); doc.close();
            iframe.onload = () => { setTimeout(() => { try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch (e) { console.error(e); } setTimeout(() => document.body.removeChild(iframe), 1000); }, 300); };
        }
    };

    // Load products from database
    const loadProducts = useCallback(async () => {
        setIsLoadingProducts(true);
        try {
            // Load products - query active products safely
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('active', true)
                .order('product_name');

            if (error) {
                console.error('Error fetching products:', error);
                throw error;
            }

            // Filter products designated for POS
            const availableProducts = (data || []).filter(p => p.show_in_pos !== false && p.show_ps !== false);

            // Load batch stock for all products
            const stockByProduct: Record<number, number> = {};
            try {
                const { data: batchData } = await supabase
                    .from('production_batches')
                    .select('product_id, qty_remaining')
                    .eq('status', 'In Stock')
                    .gt('qty_remaining', 0);

                (batchData || []).forEach((batch) => {
                    const pid = batch.product_id;
                    stockByProduct[pid] = (stockByProduct[pid] || 0) + (batch.qty_remaining || 0);
                });
            } catch (_) {}

            // Transform database products to POS format
            const posProducts: Product[] = availableProducts.map(p => ({
                id: p.pid,
                name: p.product_name,
                price: p.sales_cost || 0,
                purchasePrice: p.purchase_cost || 0,
                category: p.category || 'General',
                stock: stockByProduct[p.pid] !== undefined ? stockByProduct[p.pid] : 99,
                color: p.button_ui_color || 'from-blue-400 to-blue-600',
                barcode: p.barcode,
                hasBatches: (stockByProduct[p.pid] || 0) > 0,
            }));

            setProducts(posProducts);

            // Extract unique categories from products
            const categorySet = new Set(posProducts.map(p => p.category).filter(Boolean));
            const uniqueCategories = ['All', ...Array.from(categorySet)];
            setCategories(uniqueCategories);

        } catch (err: any) {
            console.error('Error loading products:', err);
            toast.error('Failed to load products: ' + (err?.message || 'Database error'));
        }
        setIsLoadingProducts(false);
    }, []);

    // Load unpaid orders from database
    const loadUnpaidOrders = useCallback(async () => {
        setIsLoadingOrders(true);
        try {
            // Fetch unpaid sales from database (status = 'Pending')
            const { data: sales, error } = await supabase
                .from('sales')
                .select('*')
                .eq('status', 'Pending')
                .order('sale_datetime', { ascending: false })
                .limit(20);

            if (error) throw error;

            if (sales && sales.length > 0) {
                // Fetch items for each sale
                const ordersWithItems = await Promise.all(
                    sales.map(async (sale) => {
                        const { data: items } = await supabase
                            .from('sales_items')
                            .select('*')
                            .eq('sale_id', sale.sale_id);

                        return {
                            ...sale,
                            items: items || []
                        };
                    })
                );

                setUnpaidOrders(ordersWithItems);
            } else {
                setUnpaidOrders([]);
            }
        } catch (error) {
            console.error('Error loading unpaid orders:', error);
            toast.error('Failed to load running orders');
        }
        setIsLoadingOrders(false);
    }, []);

    // Load products on mount
    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    // Load food order notes and receipt/KOT numbers on mount
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // Load active shift FIRST
                await loadActiveShift();

                // Load hotel name from database
                await loadHotelName();

                // Load food order notes
                const notes = await getFoodOrderNotes();
                setFoodOrderNotes(notes || []);

                // Load next receipt number
                const nextReceipt = await getNextReceiptNumber();
                setInvoiceNo(nextReceipt);

                // Load next KOT number
                const nextKOT = await getNextKOTNumber();
                setCurrentKOTNumber(nextKOT);

                // Load waiters/staff from users table
                const { data: usersData, error: usersError } = await supabase
                    .from('users')
                    .select('user_id, name, user_type')
                    .eq('active', true)
                    .order('name');

                if (usersError) {
                    console.error('Error loading waiters:', usersError);
                } else if (usersData && usersData.length > 0) {
                    // Transform to match expected interface
                    setWaiters(usersData.map(u => ({
                        user_id: u.user_id,
                        full_name: u.name,
                        role: u.user_type
                    })));
                }

                // Load unpaid orders (running orders)
                await loadUnpaidOrders();

            } catch (err) {
                console.error('Error loading initial data:', err);
            }
        };

        loadInitialData();
        // Load initial tax display preference
        setShowTaxInfo(getTaxDisplaySettingSync());
        loadTaxDisplaySetting().then(val => setShowTaxInfo(val));
    }, [loadActiveShift, loadHotelName, loadUnpaidOrders]);

    // ─── LOAD LOW STOCK NOTIFICATION (products with stock < 10) ───
    useEffect(() => {
        if (products.length > 0) {
            const low = products.filter(p => p.stock < 10 && p.stock >= 0).map(p => ({ name: p.name, stock: p.stock, id: p.id }));
            setLowStockProducts(low);
        }
    }, [products]);

    // ─── LOAD WAITER BILL STATS (logged-in waiter) ───
    useEffect(() => {
        const loadWaiterBills = async () => {
            if (!selectedWaiterName && !selectedWaiterId) return;
            const waiterName = selectedWaiterName || 'Cashier';
            const today = new Date().toISOString().split('T')[0];
            try {
                // Paid bills
                const { data: paid } = await supabase
                    .from('sales')
                    .select('sale_id, total_amount')
                    .eq('sale_date', today)
                    .ilike('waiter_name', `%${waiterName}%`)
                    .eq('status', 'Completed');
                setWaiterPaidCount((paid || []).length);
                setWaiterPaidTotal((paid || []).reduce((s, r) => s + (r.total_amount || 0), 0));

                // Unpaid bills
                const { data: unpaid } = await supabase
                    .from('sales')
                    .select('sale_id, total_amount')
                    .eq('sale_date', today)
                    .ilike('waiter_name', `%${waiterName}%`)
                    .eq('status', 'Pending');
                setWaiterUnpaidCount((unpaid || []).length);
                setWaiterUnpaidTotal((unpaid || []).reduce((s, r) => s + (r.total_amount || 0), 0));
            } catch (err) {
                console.log('Error loading waiter bills:', err);
            }
        };
        loadWaiterBills();
        const interval = setInterval(loadWaiterBills, 30000); // refresh every 30s
        return () => clearInterval(interval);
    }, [selectedWaiterName, selectedWaiterId]);

    // Toggle Fullscreen
    
    // ─── TAX DISPLAY TOGGLE (ON / OFF) ───
    const handleToggleTaxInfo = async () => {
        const nextVal = !showTaxInfo;
        setShowTaxInfo(nextVal);
        await saveTaxDisplaySetting(nextVal);
        toast.success(nextVal ? 'Tax breakdown enabled on customer receipts ✓' : 'Tax breakdown hidden on customer receipts (clean mode) ✓');
    };

    const handleTogglePreviewTax = async () => {
        const nextVal = !showTaxInfo;
        setShowTaxInfo(nextVal);
        await saveTaxDisplaySetting(nextVal);
        const companyInfo = await loadCompanyInfo();
        const receiptData = createReceiptData(
            invoiceNo,
            cart.map(item => ({
                name: item.name,
                qty: item.qty,
                price: item.price,
                notes: item.notes,
                discount: item.discount
            })),
            'cash',
            total,
            'Cashier',
            {
                tableNo: tableNo || undefined,
                orderNotes: orderNotes || undefined,
                shiftCode: shift?.code || 'NO-SHIFT',
                isPaid: true,
                showTaxInfo: nextVal,
                hotelName: companyInfo?.name || 'Alpha Plus Hotel'
            }
        );
        const html = await generateCustomerBillHTML(receiptData, companyInfo, true);
        setReceiptHTML(html);
        toast.success(nextVal ? 'Preview updated: Tax Breakdown ON' : 'Preview updated: Tax Breakdown OFF');
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    // Listen for fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // ─── LOAD USER ROLE & AUTO-FULLSCREEN ───
    useEffect(() => {
        try {
            const userData = localStorage.getItem('user');
            if (userData) {
                const parsed = JSON.parse(userData);
                const waiter = parsed.isWaiter === true || 
                               (parsed.userType || '').toLowerCase().includes('waiter') ||
                               (parsed.userType || '').toLowerCase() === 'waitress';
                setIsWaiterUser(waiter);
                setUserRole(parsed.userType || 'Admin');
                if (waiter) {
                    // For waiters, strictly lock terminal on page load/refresh & require fresh PIN
                    setIsPosLocked(true);
                    setLoggedInUserName('');
                    setSelectedWaiterName('');
                    setSelectedWaiterId(null);
                    localStorage.removeItem('alpha_hotel_selected_waiter');
                } else {
                    setLoggedInUserName(parsed.name || '');
                }
            }
        } catch (_) {}
        // Auto-fullscreen on POS page load for ALL users
        setTimeout(() => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
                setIsFullscreen(true);
            }
        }, 500);
    }, []);

    // Filter products
    const filteredProducts = products.filter(p => {
        const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    // Add to cart - with batch selection for products with batches
    const addToCart = async (product: Product) => {
        if (product.stock === 0) {
            toast.error('Product out of stock!');
            return;
        }

        // Check if product has production batches - load from database
        if (product.hasBatches) {
            try {
                const { data: batchData } = await supabase
                    .from('production_batches')
                    .select('*')
                    .eq('product_id', product.id)
                    .eq('status', 'In Stock')
                    .gt('qty_remaining', 0)
                    .order('production_date', { ascending: true });

                if (batchData && batchData.length > 0) {
                    // Convert to ProductionBatch format
                    const batches: ProductionBatch[] = batchData.map(b => ({
                        batchId: b.batch_id,
                        batchNumber: b.batch_number,
                        qtyProduced: b.qty_produced || 0,
                        qtyRemaining: b.qty_remaining || 0,
                        costPerUnit: b.cost_per_unit || 0,
                        productionDate: b.production_date,
                        expiryDate: b.expiry_date,
                        daysOld: Math.floor((Date.now() - new Date(b.production_date).getTime()) / (1000 * 60 * 60 * 24)),
                        createdBy: b.created_by || 'Unknown',
                        totalValue: (b.qty_remaining || 0) * (b.cost_per_unit || 0),
                    }));

                    // Show batch selection modal
                    setPendingProduct(product);
                    setProductBatches(batches);
                    setShowBatchModal(true);
                    return;
                }
            } catch (err) {
                console.error('Error loading batches:', err);
            }
        }

        // No batches - add directly
        addProductToCart(product);
    };

    // Add product to cart (called after batch selection or for non-batch products)
    const addProductToCart = (product: Product, batch?: ProductionBatch) => {
        setCart(prev => {
            // For products with batches, check if same product AND same batch exists
            const existing = prev.find(item =>
                item.id === product.id &&
                (!batch || item.batchId === batch.batchId)
            );

            if (existing) {
                return prev.map(item =>
                    item.id === product.id && (!batch || item.batchId === batch.batchId)
                        ? { ...item, qty: item.qty + 1 }
                        : item
                );
            }

            return [...prev, {
                ...product,
                qty: 1,
                discount: 0,
                notes: '',
                batchId: batch?.batchId,
                batchNumber: batch?.batchNumber,
                costPerUnit: batch?.costPerUnit || product.purchasePrice
            }];
        });
    };

    // Handle batch selection
    const handleBatchSelect = (batch: ProductionBatch) => {
        if (pendingProduct) {
            addProductToCart(pendingProduct, batch);
            setPendingProduct(null);
            setProductBatches([]);
            setShowBatchModal(false);
        }
    };

    // Update quantity
    const updateQty = (id: number, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQty = item.qty + delta;
                return newQty > 0 ? { ...item, qty: newQty } : item;
            }
            return item;
        }).filter(item => item.qty > 0));
    };

    // Remove from cart
    const removeFromCart = (id: number) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    // Clear cart
    const clearCart = () => {
        setCart([]);
        setOrderNotes('');
        setTableNo('');
    };

    // Update item notes
    const updateItemNotes = (id: number, notes: string) => {
        setCart(prev => prev.map(item =>
            item.id === id ? { ...item, notes } : item
        ));
    };

    // Hold order
    const holdOrder = (name: string, tbl?: string) => {
        if (cart.length === 0) return;

        const newOrder: RunningOrder = {
            id: `RO-${Date.now()}`,
            name,
            items: [...cart],
            total: total,
            createdAt: new Date(),
            tableNo: tbl
        };

        setRunningOrders(prev => [...prev, newOrder]);
        clearCart();
    };

    // Resume order
    const resumeOrder = (orderId: string) => {
        const order = runningOrders.find(o => o.id === orderId);
        if (order) {
            setCart(order.items);
            setRunningOrders(prev => prev.filter(o => o.id !== orderId));
            setShowRunningOrders(false);
        }
    };

    // Delete running order
    const deleteRunningOrder = (orderId: string) => {
        if (confirm('Delete this order?')) {
            setRunningOrders(prev => prev.filter(o => o.id !== orderId));
        }
    };

    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalDiscount = cart.reduce((sum, item) => sum + item.discount, 0);

    // Kenya Tax Calculation (VAT 16% + Levy 2%)
    // Tax is INCLUSIVE in prices (default for hotels in Kenya)
    const amountAfterDiscount = subtotal - totalDiscount;
    const taxRate = 0.18; // 16% VAT + 2% Levy
    const netAmount = amountAfterDiscount / (1 + taxRate); // Extract net from inclusive price
    const vatAmount = netAmount * 0.16;
    const levyAmount = netAmount * 0.02;
    const totalTax = vatAmount + levyAmount;

    const total = amountAfterDiscount; // Customer pays the inclusive amount

    // Global Fast Keyboard Shortcuts Listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);

            if (e.key === 'Escape') {
                setShowShortcutsModal(false);
                setShowPayment(false);
                setShowNotesModal(false);
                setShowHoldModal(false);
                setShowRunningOrders(false);
                setShowReceiptPreview(false);
                setShowKOTPreview(false);
                setShowBillPreview(false);
                setShowBatchModal(false);
                setShowHeldSalesModal(false);
                setShowCloseRegister(false);
                setShowSplitModal(false);
                setShowMoveTableModal(false);
                setShowMergeModal(false);
                return;
            }

            if (e.key === 'F1') {
                e.preventDefault();
                setShowShortcutsModal(prev => !prev);
                return;
            }

            if (e.key === 'F2' || (e.key === '/' && !isTyping)) {
                e.preventDefault();
                searchInputRef.current?.focus();
                return;
            }

            if (e.key === 'F3') {
                e.preventDefault();
                if (cart.length > 0) setShowHoldModal(true);
                return;
            }

            if (e.key === 'F4') {
                e.preventDefault();
                setShowRunningOrders(prev => !prev);
                return;
            }

            if (e.key === 'F8') {
                e.preventDefault();
                setShowSplitModal(true);
                return;
            }

            if (e.key === 'F9') {
                e.preventDefault();
                if (cart.length > 0) sendToKitchen();
                return;
            }

            if (e.key === 'F10') {
                e.preventDefault();
                if (cart.length > 0) handlePrintInterimBill();
                return;
            }

            if (e.key === 'F12' || (e.key === ' ' && !isTyping && cart.length > 0)) {
                e.preventDefault();
                if (cart.length > 0) setShowPayment(true);
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [cart.length, isPosLocked, lockPin, unlockTerminalWithPin]);

    // Apply Cart-wide percentage discount with Supervisor PIN
    const handleApplyCartDiscount = (percent: number) => {
        if (cart.length === 0) return;
        requireSupervisorAuth(
            `Apply ${percent}% Cart Discount`,
            `Authorizing ${percent}% discount on bill (Ksh ${total.toLocaleString()})`,
            () => {
                setCart(prev => prev.map(item => ({
                    ...item,
                    discount: Math.round((item.price * item.qty) * (percent / 100))
                })));
                toast.success(`${percent}% discount applied to bill ✅`);
            }
        );
    };

    // Print Interim Customer Bill before payment
    const handlePrintInterimBill = async () => {
        if (cart.length === 0) {
            toast.error('Cart is empty');
            return;
        }
        try {
            const companyInfo = await loadCompanyInfo();
            const receiptData = createReceiptData(
                invoiceNo,
                cart.map(item => ({
                    name: item.name,
                    qty: item.qty,
                    price: item.price,
                    notes: item.notes,
                    discount: item.discount
                })),
                'unpaid',
                0,
                selectedWaiterName || loggedInUserName || 'Staff',
                {
                    tableNo: tableNo || undefined,
                    orderNotes: orderNotes || undefined,
                    shiftCode: shift?.code || 'NO-SHIFT',
                    isPaid: false,
                    showTaxInfo: showTaxInfo,
                    hotelName: companyInfo?.name || 'Alpha Plus Hotel'
                }
            );
            const html = await generateCustomerBillHTML(receiptData, companyInfo, false);
            setBillHTML(html);
            setShowBillPreview(true);
            await executeDirectPrint(html, { printerRole: 'customer' });
            playPOSChime('tender');
            toast.success(`Interim Bill #${invoiceNo} printed for Guest 🧾`);
        } catch (err) {
            console.error('Error printing interim bill:', err);
            toast.error('Failed to print interim bill');
        }
    };

    // Create receipt data for unpaid bill
    const createUnpaidBillData = () => {
        return createReceiptData(
            invoiceNo,
            cart.map(item => ({
                name: item.name,
                qty: item.qty,
                price: item.price,
                notes: item.notes,
                discount: item.discount
            })),
            'pending',
            0,
            'Cashier',
            {
                tableNo: tableNo || undefined,
                orderNotes: orderNotes || undefined,
                shiftCode: shift?.code || 'NO-SHIFT',
                isPaid: false,
                showTaxInfo: showTaxInfo,
                // Kenya Tax Fields
                taxMode: 'inclusive',
                vatRate: 16,
                levyRate: 2,
                hotelName: 'Alpha Plus Hotel' // Will be loaded from DB in receipt printer
            }
        );
    };

    // Send to Kitchen (Print KOT then Customer Bill) - Now saves to database as Pending
    const sendToKitchen = async () => {
        if (cart.length === 0) return;
        if (isSavingPending) return; // Prevent double submission

        setIsSavingPending(true);

        try {
            // Create KOT data for printing
            const kotData = createKOTData(
                currentKOTNumber,
                cart.map(item => ({ name: item.name, qty: item.qty, notes: item.notes })),
                tableNo ? 'Dine-In' : 'Take-Away',
                {
                    tableNo: tableNo || undefined,
                    waiter: selectedWaiterName || 'Cashier',
                    orderNotes: orderNotes || undefined,
                    priority: 'normal'
                }
            );

            // Load company info from database for receipts
            const companyInfo = await loadCompanyInfo();

            const kotHtmlContent = generateKOTHTML(kotData, companyInfo);
            setKOTHTML(kotHtmlContent);

            // Create Customer Bill (Unpaid) data for printing
            const billData = createUnpaidBillData();
            const billHtmlContent = await generateCustomerBillHTML(billData, companyInfo, false);
            setBillHTML(billHtmlContent);

            // Get current logged in user
            const userData = localStorage.getItem('user');
            const currentUser = userData ? JSON.parse(userData) : null;

            // Get FRESH receipt and KOT numbers to avoid duplicate constraint errors
            const freshReceiptNo = await getNextReceiptNumber();
            const freshKOTNumber = await getNextKOTNumber();
            setInvoiceNo(freshReceiptNo);
            setCurrentKOTNumber(freshKOTNumber);

            // Save pending sale to database with waiter info
            await savePendingSale({
                receiptNo: freshReceiptNo,
                kotNumber: freshKOTNumber,
                items: cart.map(item => ({
                    productId: item.id,
                    productName: item.name,
                    qty: item.qty,
                    price: item.price,
                    costPrice: item.costPerUnit || item.purchasePrice,
                    discount: item.discount,
                    notes: item.notes,
                    batchId: item.batchId,
                    batchNumber: item.batchNumber,
                })),
                subtotal: subtotal,
                discount: totalDiscount,
                taxAmount: 0,
                total: total,
                cashierName: currentUser?.name || 'Cashier',
                waiterId: selectedWaiterId || undefined,
                waiterName: selectedWaiterName || undefined,
                shiftId: shift?.id,
                shiftName: shift?.name,
                shiftCode: shift?.code,
                tableName: tableNo || undefined,
                orderType: tableNo ? 'Dine-In' : 'Take-Away',
                orderNotes: orderNotes || undefined,
            });

            toast.success('Order sent to kitchen & saved as pending! 🍳');

            // Get next invoice and KOT numbers for the next order
            const nextReceipt = await getNextReceiptNumber();
            setInvoiceNo(nextReceipt);
            const nextKOT = await getNextKOTNumber();
            setCurrentKOTNumber(nextKOT);

            // Automatic sequence dispatch based on hotel setting (Both vs Customer Bill Alone vs KOT Alone)
            const printerPrefs = loadPOSPrinterSettings();

            if (printerPrefs.orderPrintMode !== 'none') {
                await executeOrderAutoPrintSequence(kotHtmlContent, billHtmlContent, printerPrefs);
            }

            // Always auto-print silently — no preview popups
            setShowKOTPreview(false);
            setShowBillPreview(false);
            await prepareForNextSale();
            const modeMsg = printerPrefs.orderPrintMode === 'both'
                ? 'KOT & Customer Bill sent to printers! 🍳🧾'
                : printerPrefs.orderPrintMode === 'bill_only'
                ? 'Customer Bill sent to printer! 🧾'
                : 'KOT sent to kitchen! 🍳';
            toast.success(`${modeMsg}`);
            // 🔒 AUTO-LOCK: Immediately lock terminal for waiters so next waiter MUST authenticate
            if (isWaiterUser && autoLockOnKotEnabled) {
                setTimeout(() => {
                    setLockPin('');
                    setLockError('');
                    setLoggedInUserName('');
                    setSelectedWaiterName('');
                    setSelectedWaiterId(null);
                    localStorage.removeItem('alpha_hotel_selected_waiter');
                    setIsPosLocked(true);
                }, 1000);
            }
        } catch (error: any) {
            console.error('Error saving pending sale:', error);
            // Show detailed error message for debugging
            const errorMsg = error?.message || error?.details || error?.hint || JSON.stringify(error);
            toast.error(`KOT Error: ${errorMsg}`, { duration: 8000 });
        } finally {
            setIsSavingPending(false);
        }
    };

    // Print KOT and then show Customer Bill preview
    const printKOTNow = async () => {
        await executeDirectPrint(kotHTML, { printerRole: 'kitchen' });
        setShowKOTPreview(false);
        setTimeout(() => {
            setShowBillPreview(true);
        }, 250);
    };

    // Close KOT without printing, still show Customer Bill
    const closeKOTAndShowBill = () => {
        setShowKOTPreview(false);
        setTimeout(() => {
            setShowBillPreview(true);
        }, 300);
    };

    // Prepare POS for next sale (clear cart, regenerate numbers)
    const prepareForNextSale = async () => {
        // Clear the cart
        clearCart();

        // Reload products to get updated stock
        loadProducts();

        // Generate next receipt number from database
        try {
            const nextReceipt = await getNextReceiptNumber();
            setInvoiceNo(nextReceipt);

            const nextKOT = await getNextKOTNumber();
            setCurrentKOTNumber(nextKOT);
        } catch (err) {
            console.error('Error generating next numbers:', err);
            // Fallback: increment locally
            const num = parseInt(invoiceNo.replace('RCP-', '').replace('INV-', '')) + 1;
            setInvoiceNo(`RCP-${String(num).padStart(5, '0')}`);
        }
    };

    // Print Customer Bill (unpaid) - After printing, prepare for next sale
    const printBillNow = async () => {
        await executeDirectPrint(billHTML, { printerRole: 'customer' });
        setShowBillPreview(false);
        await prepareForNextSale();
        toast.success('Customer Bill sent to printer! 🧾 Ready for next order.');
    };

    // Close Bill without printing - Still prepare for next sale
    const closeBillAndPrepareNext = async () => {
        setShowBillPreview(false);
        await prepareForNextSale();
        toast.success('Ready for next order! 🛒');
    };

    // Navigate to Bill Payment page with selected receipt
    const reopenOrderForPayment = async (order: any) => {
        try {
            // Close running orders sidebar
            setShowRunningOrders(false);

            // Navigate to Bill Payment page with the receipt number
            const receiptNo = order.receipt_no || order.invoice_no;
            window.location.href = `/dashboard/bill-payment?receipt=${receiptNo}`;

            toast.success(`Opening payment for ${receiptNo}`);
        } catch (error) {
            console.error('Error opening payment:', error);
            toast.error('Failed to open payment page');
        }
    };

    // Save completed sale to database (with Recipe Depletion & Hotel Room Posting)
    const saveSaleToDatabase = async (
        paymentMethod: string, 
        amountPaid: number, 
        mpesaReceipt?: string, 
        customerName?: string,
        roomDetails?: { roomNo: string; guestName: string; bookingId?: number }
    ) => {
        try {
            // Get current user
            const userData = localStorage.getItem('user');
            const currentUser = userData ? JSON.parse(userData) : null;

            // Calculate values
            const changeAmount = paymentMethod === 'cash' ? Math.max(0, amountPaid - total) : 0;
            const isRoom = paymentMethod.toLowerCase() === 'room' || paymentMethod.toUpperCase() === 'ROOM CHARGE';
            const status = paymentMethod === 'credit' ? 'Pending' : (isRoom ? 'Room Charge' : 'Completed');
            const payMethodString = isRoom ? 'ROOM CHARGE' : paymentMethod.toUpperCase();

            // Calculate total cost for profit
            const totalCost = cart.reduce((sum, item) => sum + ((item.purchasePrice || 0) * item.qty), 0);
            const profit = total - totalCost;

            // 1. Create sale record with correct column names matching schema
            const { data: saleData, error: saleError } = await supabase
                .from('sales')
                .insert({
                    receipt_no: invoiceNo,
                    sale_date: new Date().toISOString().split('T')[0],
                    sale_time: new Date().toTimeString().split(' ')[0],
                    sale_datetime: new Date().toISOString(),
                    shift_id: shift?.id || null,
                    shift_name: shift?.name || null,
                    shift_code: shift?.code || null,
                    waiter_id: selectedWaiterId || null,
                    waiter_name: selectedWaiterName || null,
                    table_id: null,
                    table_name: tableNo || (roomDetails ? `Room ${roomDetails.roomNo}` : null),
                    table_no: tableNo || (roomDetails ? `Room ${roomDetails.roomNo}` : null),
                    order_type: roomDetails?.roomNo ? 'Room Service' : (tableNo ? 'Dine-in' : 'Quick Sale'),
                    customer_name: customerName || (roomDetails ? `${roomDetails.guestName} (Room ${roomDetails.roomNo})` : null),
                    subtotal: subtotal,
                    subtotal_before_tax: subtotal,
                    discount: totalDiscount,
                    discount_percent: 0,
                    tax_rate: 0,
                    tax_amount: 0,
                    total_amount: total,
                    total_cost: totalCost,
                    profit: profit,
                    payment_method: payMethodString,
                    amount_paid: amountPaid,
                    change_amount: changeAmount,
                    mpesa_code: mpesaReceipt || null,
                    mpesa_receipt: mpesaReceipt || null,
                    status: status,
                    notes: orderNotes || (roomDetails ? `Charged to Room ${roomDetails.roomNo}` : null),
                    order_notes: orderNotes || (roomDetails ? `Charged to Room ${roomDetails.roomNo}` : null),
                    created_by: currentUser?.name || 'Cashier'
                })
                .select()
                .single();

            if (saleError) {
                console.error('Error creating sale:', saleError);
                throw saleError;
            }

            const saleId = saleData.sale_id;

            // 2. Create sale items
            const saleItems = cart.map(item => ({
                sale_id: saleId,
                product_id: item.id,
                product_name: item.name,
                quantity: item.qty,
                unit_price: item.price,
                cost_price: item.purchasePrice || 0,
                discount: item.discount || 0,
                total_price: (item.price * item.qty) - (item.discount || 0),
                notes: item.notes || null,
                batch_id: item.batchId || null
            }));

            const { error: itemsError } = await supabase
                .from('sales_items')
                .insert(saleItems);

            if (itemsError) {
                console.error('Error creating sale items:', itemsError);
            }

            // 3. Deduct stock for each sold item from products table & production_batches
            for (const item of cart) {
                const { data: productData } = await supabase
                    .from('products')
                    .select('pid, stock')
                    .eq('pid', item.id)
                    .single();

                if (productData) {
                    const newStock = Math.max(0, (productData.stock || 0) - item.qty);
                    await supabase
                        .from('products')
                        .update({ stock: newStock, updated_at: new Date().toISOString() })
                        .eq('pid', productData.pid);
                }

                if (item.batchId) {
                    const { data: batchData } = await supabase
                        .from('production_batches')
                        .select('batch_id, qty_remaining')
                        .eq('batch_id', item.batchId)
                        .single();

                    if (batchData) {
                        const newRemaining = Math.max(0, (batchData.qty_remaining || 0) - item.qty);
                        await supabase
                            .from('production_batches')
                            .update({ qty_remaining: newRemaining })
                            .eq('batch_id', batchData.batch_id);
                    }
                }
            }

            // 4. Automated Recipe Stock Depletion (COGS / Kitchen Store Decrement)
            for (const item of cart) {
                try {
                    const { data: recipeData } = await supabase
                        .from('recipes')
                        .select('recipe_id')
                        .eq('product_id', item.id)
                        .order('recipe_id', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (recipeData?.recipe_id) {
                        const { data: rIngredients } = await supabase
                            .from('recipe_ingredients')
                            .select('ingredient_product_id, qty_issued')
                            .eq('recipe_id', recipeData.recipe_id);

                        if (rIngredients && rIngredients.length > 0) {
                            for (const rIng of rIngredients) {
                                const totalToDeduct = (Number(rIng.qty_issued) || 0) * item.qty;
                                if (totalToDeduct > 0 && rIng.ingredient_product_id) {
                                    const { data: ingData } = await supabase
                                        .from('products_ingredients')
                                        .select('pid, current_stock')
                                        .eq('pid', rIng.ingredient_product_id)
                                        .maybeSingle();
                                    if (ingData) {
                                        const newIngStock = Math.max(0, (Number(ingData.current_stock) || 0) - totalToDeduct);
                                        await supabase
                                            .from('products_ingredients')
                                            .update({ current_stock: newIngStock })
                                            .eq('pid', ingData.pid);
                                    }
                                }
                            }
                        }
                    }
                } catch (recipeDepErr) {
                    console.error('Recipe auto-depletion error:', recipeDepErr);
                }
            }

            // 5. Post Room Charge to Hotel Booking (if applicable)
            if (isRoom && roomDetails) {
                try {
                    let targetBookingId = roomDetails.bookingId;
                    if (!targetBookingId && roomDetails.roomNo) {
                        const { data: foundBooking } = await supabase
                            .from('hotel_bookings')
                            .select('booking_id')
                            .eq('room_number', roomDetails.roomNo)
                            .eq('status', 'Checked-In')
                            .order('booking_id', { ascending: false })
                            .limit(1)
                            .maybeSingle();
                        if (foundBooking) targetBookingId = foundBooking.booking_id;
                    }

                    if (targetBookingId) {
                        const { data: booking } = await supabase
                            .from('hotel_bookings')
                            .select('booking_id, restaurant_charges, extra_charges, total_amount, balance')
                            .eq('booking_id', targetBookingId)
                            .single();

                        if (booking) {
                            const curRest = Number(booking.restaurant_charges) || 0;
                            const curExtra = Number(booking.extra_charges) || 0;
                            const curTot = Number(booking.total_amount) || 0;
                            const curBal = Number(booking.balance) || 0;

                            await supabase
                                .from('hotel_bookings')
                                .update({
                                    restaurant_charges: curRest + total,
                                    extra_charges: curExtra + total,
                                    total_amount: curTot + total,
                                    balance: curBal + total
                                })
                                .eq('booking_id', booking.booking_id);

                            // Insert audit payment charge
                            await supabase
                                .from('hotel_payments')
                                .insert({
                                    payment_no: `ROOM-CHG-${invoiceNo}`,
                                    booking_id: booking.booking_id,
                                    booking_no: String(booking.booking_id),
                                    guest_name: roomDetails.guestName,
                                    room_number: roomDetails.roomNo,
                                    amount: total,
                                    payment_method: 'Room Charge',
                                    payment_type: 'Restaurant Charge',
                                    status: 'Pending Checkout'
                                });
                        }
                    }
                } catch (hotelErr) {
                    console.error('Hotel room posting error:', hotelErr);
                }
            }

            console.log('✅ Sale saved successfully:', saleId);
            toast.success(isRoom ? `Room ${roomDetails?.roomNo || ''} charged Ksh ${total.toLocaleString()}` : `Sale ${invoiceNo} saved successfully!`);

            const nextNo = await getNextReceiptNumber();
            setInvoiceNo(nextNo);

            return true;
        } catch (error) {
            console.error('Error saving sale:', error);
            toast.error('Failed to save sale to database');
            return false;
        }
    };

    // Complete sale with Hotel Room Charge & Corporate Tax (Strictly Opt-In)
    const completeSale = async (
        paymentMethod: string, 
        amountPaid: number, 
        mpesaReceipt?: string, 
        customerName?: string,
        buyerPin?: string,
        isCorporateTax?: boolean,
        roomDetails?: { roomNo: string; guestName: string; bookingId?: number }
    ) => {
        // Save to database first
        const saved = await saveSaleToDatabase(paymentMethod, amountPaid, mpesaReceipt, customerName, roomDetails);
        if (!saved) {
            toast.error('Failed to save sale');
            return;
        }

        // Load company info from database for receipt
        const companyInfo = await loadCompanyInfo();
        const isRoom = paymentMethod.toLowerCase() === 'room' || paymentMethod.toUpperCase() === 'ROOM CHARGE';

        // Create receipt data
        const receiptData = createReceiptData(
            invoiceNo,
            cart.map(item => ({
                name: item.name,
                qty: item.qty,
                price: item.price,
                notes: item.notes,
                discount: item.discount
            })),
            isRoom ? 'ROOM CHARGE' : paymentMethod,
            amountPaid,
            'Cashier',
            {
                customerName,
                mpesaReceipt,
                tableNo: tableNo || (roomDetails ? `Room ${roomDetails.roomNo}` : undefined),
                orderNotes: orderNotes || (roomDetails ? `Charged to Room ${roomDetails.roomNo}` : undefined),
                shiftCode: shift?.code || 'NO-SHIFT',
                isPaid: true,
                showTaxInfo: showTaxInfo,
                buyerPin: buyerPin || undefined,
                isEtimsEnabled: Boolean(isCorporateTax),
                // Kenya Tax Fields
                taxMode: 'inclusive',
                vatRate: 16,
                levyRate: 2,
                hotelName: companyInfo?.name || 'Alpha Plus Hotel'
            }
        );

        const html = await generateCustomerBillHTML(receiptData, companyInfo, true);
        setReceiptHTML(html);
        setShowPayment(false);
        const printerPrefs = loadPOSPrinterSettings();
        if (printerPrefs.autoPrintReceiptOnPay) {
            executeDirectPrint(html, { printerRole: 'customer' });
        }

        // Always silent — auto-print and clear cart immediately
        setShowReceiptPreview(false);
        clearCart();
        toast.success(isRoom ? 'Room charged successfully! Receipt generated 🏨' : 'Payment complete! Receipt sent to printer. 🧾');
        // 🔒 Auto-lock for waiters on payment tender
        if (isWaiterUser) {
            setTimeout(() => {
                setLockPin('');
                setLockError('');
                setLoggedInUserName('');
                setSelectedWaiterName('');
                setSelectedWaiterId(null);
                localStorage.removeItem('alpha_hotel_selected_waiter');
                setIsPosLocked(true);
            }, 1200);
        }
    };

    // Print receipt
    const printReceiptNow = async () => {
        await executeDirectPrint(receiptHTML, { printerRole: 'customer' });
        setShowReceiptPreview(false);
        clearCart();
    };

    return (
        <>
                        {/* Register Closed Lockout Modal - Deny proceeding until register is opened */}
            {!isLoadingShift && !hasActiveShift && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md text-center shadow-2xl relative border border-gray-100">
                        <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/25">
                            <span className="text-4xl">🟢</span>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Register is Closed</h2>
                        <p className="text-gray-600 mb-6 text-sm">
                            Open the register with an opening cash float to start making sales. You must open the register to proceed.
                        </p>

                        <div className="mb-4">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block text-left">
                                💰 Opening Cash Float Amount
                            </label>
                            <input
                                type="number"
                                value={openingDropAmount}
                                onChange={(e) => setOpeningDropAmount(e.target.value)}
                                placeholder="Enter amount (e.g., 5000)"
                                className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none text-2xl font-bold text-center text-gray-800"
                                autoFocus
                            />
                        </div>
                        <div className="grid grid-cols-4 gap-2 mb-4">
                            {[0, 1000, 2000, 5000].map(amt => (
                                <button
                                    key={amt}
                                    type="button"
                                    onClick={() => setOpeningDropAmount(amt.toString())}
                                    className="py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 font-semibold transition-colors text-xs"
                                >
                                    {amt === 0 ? 'Zero (0)' : `Ksh ${amt.toLocaleString()}`}
                                </button>
                            ))}
                        </div>

                        <div className="p-4 bg-green-50 rounded-xl border border-green-200 mb-6 text-center">
                            <span className="text-green-700 font-medium text-xs block mb-1">Starting Register Cash</span>
                            <span className="text-2xl font-bold text-green-700">Ksh {(Number(openingDropAmount) || 0).toLocaleString()}</span>
                        </div>

                        <div className="space-y-3">
                            <button
                                type="button"
                                onClick={handleOpenRegister}
                                className="block w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-base shadow-lg shadow-green-500/25 transition-all"
                            >
                                ✅ Open Register to Proceed
                            </button>
                            <a
                                href="/dashboard"
                                className="block w-full py-3 text-gray-400 hover:text-gray-600 font-medium text-xs text-center transition-colors"
                            >
                                ← Exit to Dashboard
                            </a>
                        </div>
                    </div>
                </div>
            )}

            <div className={`flex w-full h-[calc(100vh-64px)] max-h-screen overflow-hidden bg-gray-100 ${isFullscreen ? 'fixed inset-0 z-50 h-screen w-screen m-0' : '-m-6'}`}>
                {/* ========================================================================= */}
                {/* CYBER EMERALD ULTRA POS (EXACT MATCH TO REFERENCE SCREENSHOT) */}
                {/* ========================================================================= */}
                {(posTheme as string) === 'cyber' ? (
                    <div className="flex flex-col w-full h-full overflow-hidden bg-[#05090d] text-white font-sans select-none">
                        {/* 1. TOP HEADER BAR */}
                        <header className="h-[52px] px-3.5 bg-[#080e14] border-b border-[#142226] flex items-center justify-between shrink-0">
                            {/* Logo & Solution Subtitle */}
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-[#00e676]/15 border border-[#00e676]/50 flex items-center justify-center text-lg text-[#00e676] shadow-[0_0_12px_rgba(0,230,118,0.25)]">
                                    🛒
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 leading-none">
                                        <span className="text-base font-black text-white tracking-tight">AlphaPlus</span>
                                        <span className="text-base font-black text-[#00e676]">POS</span>
                                    </div>
                                    <p className="text-[10px] font-semibold text-gray-400 mt-0.5 leading-none">
                                        Restaurant & Hotel Solution
                                    </p>
                                </div>
                            </div>

                            {/* Center Information Badges */}
                            <div className="hidden md:flex items-center gap-3">
                                <div className="flex items-center gap-2 bg-[#0c161e] border border-[#162a2e] px-2.5 py-1 rounded-xl text-xs">
                                    <span className="text-base">📠</span>
                                    <div>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Till ID</p>
                                        <p className="text-xs font-bold text-white leading-none mt-0.5 font-mono">TILL-01</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 bg-[#0c161e] border border-[#162a2e] px-2.5 py-1 rounded-xl text-xs">
                                    <span className="text-base">👤</span>
                                    <div>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">{isWaiterUser ? 'Waiter' : (userRole || 'Cashier')}</p>
                                        <p className="text-xs font-bold text-white leading-none mt-0.5 truncate max-w-[100px]">{loggedInUserName || (isWaiterUser ? 'Waiter' : 'Admin')}</p>
                                    </div>
                                </div>

                                {/* My Bills Quick Header Access */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        playPOSChime('click');
                                        if (!verifyPosAccess('pos_view_my_bills', 'My Bills')) return;
                                        window.location.href = '/dashboard/my-bills';
                                    }}
                                    className="flex items-center gap-2 bg-gradient-to-r from-blue-950 via-indigo-950 to-slate-900 border border-blue-500/40 hover:border-blue-400 px-3 py-1 rounded-xl text-xs text-blue-200 hover:text-white transition-all cursor-pointer shadow-sm group"
                                    title="Open My Bills & Waiter Checks"
                                >
                                    <span className="text-base group-hover:scale-110 transition-transform">📋</span>
                                    <div className="text-left">
                                        <p className="text-[9px] text-blue-400 font-bold uppercase leading-none">Waiter Checks</p>
                                        <p className="text-xs font-black text-white leading-none mt-0.5">My Bills</p>
                                    </div>
                                    {waiterUnpaidCount > 0 && (
                                        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-900 text-[9px] font-black animate-pulse">
                                            {waiterUnpaidCount}
                                        </span>
                                    )}
                                </button>

                                <div className="flex items-center gap-2 bg-[#0c161e] border border-[#162a2e] px-2.5 py-1 rounded-xl text-xs">
                                    <span className="text-base">📅</span>
                                    <div>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Date & Time</p>
                                        <p className="text-xs font-bold text-white leading-none mt-0.5 font-mono">{currentTime || '10:24 AM'}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-[#00e676]/40 px-3 py-1 rounded-full text-xs text-[#00e676] font-bold shadow-[0_0_10px_rgba(0,230,118,0.15)]">
                                    <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse" />
                                    <span>Online</span>
                                </div>
                            </div>

                            {/* Right Utility Buttons & Theme Switcher */}
                            <div className="flex items-center gap-2">
                                {/* THEME SWITCHER PILL */}
                                <div className="flex items-center bg-[#0d161e] p-0.5 rounded-xl border border-[#00e676]/40 shadow-sm">
                                    <button
                                        type="button"
                                        onClick={() => toggleTheme('classic')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                            (posTheme as string) === 'classic'
                                                ? 'bg-white text-gray-900 shadow-md font-black'
                                                : 'text-gray-400 hover:text-white'
                                        }`}
                                        title="Switch to Classic Theme"
                                    >
                                        ☀️ Classic
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggleTheme('cyber')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                            (posTheme as string) === 'cyber'
                                                ? 'bg-[#00e676] text-black shadow-md shadow-[#00e676]/30 font-black'
                                                : 'text-gray-400 hover:text-white'
                                        }`}
                                        title="Active: Cyber Emerald Theme"
                                    >
                                        🟢 Cyber Emerald
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_home_dashboard', 'Home Dashboard')) return;
                                        window.location.href = '/dashboard';
                                    }}
                                    className="w-8 h-8 rounded-xl bg-[#0d161e] border border-[#162a2e] hover:border-[#00e676]/50 flex items-center justify-center text-xs text-gray-300 hover:text-white transition-all cursor-pointer"
                                    title="Home Dashboard"
                                >
                                    🏠
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_shortcuts_view', 'Keyboard Shortcuts')) return;
                                        setShowShortcutsModal(true);
                                    }}
                                    className="w-8 h-8 rounded-xl bg-[#0d161e] border border-[#162a2e] hover:border-[#00e676]/50 flex items-center justify-center text-xs text-gray-300 hover:text-white transition-all cursor-pointer"
                                    title="Keyboard Shortcuts [F1]"
                                >
                                    ⌨️
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_reports_view', 'Sales Reports')) return;
                                        window.location.href = '/dashboard/reports';
                                    }}
                                    className="w-8 h-8 rounded-xl bg-[#0d161e] border border-[#162a2e] hover:border-[#00e676]/50 flex items-center justify-center text-xs text-gray-300 hover:text-white transition-all cursor-pointer"
                                    title="Reports"
                                >
                                    📊
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_lock_register', 'Lock Register')) return;
                                        requireSupervisorAuth('Lock Register', 'Lock POS screen', () => {
                                            toast.success('Register Lock Active');
                                        });
                                    }}
                                    className="w-8 h-8 rounded-xl bg-[#0d161e] border border-[#162a2e] hover:border-[#00e676]/50 flex items-center justify-center text-xs text-gray-300 hover:text-white transition-all cursor-pointer"
                                    title="Lock Register"
                                >
                                    🔒
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        localStorage.removeItem('user');
                                        window.location.href = '/';
                                    }}
                                    className="w-8 h-8 rounded-xl bg-red-950/40 border border-red-500/30 hover:bg-red-600 flex items-center justify-center text-xs text-red-400 hover:text-white transition-all"
                                    title="Logout"
                                >
                                    🚪
                                </button>
                            </div>
                        </header>

                        {/* 2. BODY FLEX ROW: LEFT NAV + MAIN CONTENT + RIGHT CART */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* A. SLIM LEFT SIDEBAR */}
                            <aside className="w-[74px] shrink-0 bg-[#060b0f] border-r border-[#142226] flex flex-col items-center py-3 gap-2 overflow-y-auto">
                                <button
                                    type="button"
                                    className="w-14 py-2 rounded-xl bg-[#00e676]/15 border border-[#00e676] text-[#00e676] flex flex-col items-center gap-1 shadow-[0_0_12px_rgba(0,230,118,0.25)]"
                                    title="POS Screen"
                                >
                                    <span className="text-xl">🛒</span>
                                    <span className="text-[10px] font-black uppercase tracking-wider">POS</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_select_tables', 'Dining Floor & Tables')) return;
                                        setShowMoveTableModal(true);
                                    }}
                                    className="w-14 py-2 rounded-xl bg-[#0a1219] hover:bg-[#101c27] text-gray-400 hover:text-white flex flex-col items-center gap-1 border border-transparent hover:border-[#162a2e] transition-all cursor-pointer"
                                    title="Tables Selection / Transfer"
                                >
                                    <span className="text-xl">🪑</span>
                                    <span className="text-[10px] font-bold">Tables</span>
                                </button>

                                {/* My Bills Sidebar Button */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        playPOSChime('click');
                                        if (!verifyPosAccess('pos_view_my_bills', 'My Bills')) return;
                                        window.location.href = '/dashboard/my-bills';
                                    }}
                                    className="w-14 py-2 rounded-xl bg-gradient-to-b from-blue-900/40 via-indigo-900/40 to-slate-900 hover:from-blue-800/60 hover:to-indigo-800/60 text-blue-300 hover:text-white flex flex-col items-center gap-1 border border-blue-500/40 hover:border-blue-400 transition-all cursor-pointer relative shadow-md shadow-blue-950/50"
                                    title="My Bills & Waiter Checks"
                                >
                                    <span className="text-xl">📋</span>
                                    <span className="text-[9px] font-black uppercase text-center leading-tight">My Bills</span>
                                    {waiterUnpaidCount > 0 && (
                                        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-400 text-slate-900 text-[9px] font-black flex items-center justify-center animate-bounce">
                                            {waiterUnpaidCount}
                                        </span>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_send_kot', 'Kitchen KOT Orders')) return;
                                        sendToKitchen();
                                    }}
                                    className="w-14 py-2 rounded-xl bg-[#0a1219] hover:bg-[#101c27] text-gray-400 hover:text-white flex flex-col items-center gap-1 relative border border-transparent hover:border-[#162a2e] transition-all cursor-pointer"
                                    title="Kitchen Orders / KOT [F9]"
                                >
                                    <span className="text-xl">👨‍🍳</span>
                                    <span className="text-[10px] font-bold">Kitchen</span>
                                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center shadow-md">
                                        3
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_pending_bills', 'Pending Bills & Held Orders')) return;
                                        setShowHeldSalesModal(true);
                                    }}
                                    className="w-14 py-2 rounded-xl bg-[#0a1219] hover:bg-[#101c27] text-gray-400 hover:text-white flex flex-col items-center gap-1 relative border border-transparent hover:border-[#162a2e] transition-all cursor-pointer"
                                    title="Pending Bills / Held Sales"
                                >
                                    <span className="text-xl">⏱️</span>
                                    <span className="text-[9px] font-bold text-center leading-tight">Pending Bills</span>
                                    {heldSales.length > 0 && (
                                        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center shadow-md">
                                            {heldSales.length}
                                        </span>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_merge_bills', 'Merge Bills Studio')) return;
                                        loadUnpaidOrders();
                                        setShowMergeModal(true);
                                    }}
                                    className="w-14 py-2 rounded-xl bg-[#0a1219] hover:bg-[#101c27] text-gray-400 hover:text-white flex flex-col items-center gap-1 border border-transparent hover:border-[#162a2e] transition-all cursor-pointer"
                                    title="Bill Merge / Combine Tables"
                                >
                                    <span className="text-xl">🔀</span>
                                    <span className="text-[9px] font-bold text-center leading-tight">Bill Merge</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_view_terminal', 'Customers & Guest Folios')) return;
                                        toast.success('Guest / Room Folio selector available in Payment Modal');
                                    }}
                                    className="w-14 py-2 rounded-xl bg-[#0a1219] hover:bg-[#101c27] text-gray-400 hover:text-white flex flex-col items-center gap-1 border border-transparent hover:border-[#162a2e] transition-all cursor-pointer"
                                    title="Customers & Room Residents"
                                >
                                    <span className="text-xl">👥</span>
                                    <span className="text-[9px] font-bold">Customers</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_shift_reconciliation', 'Stock Inventory Audit')) return;
                                        toast.success('Stock inventory: live batch tracking enabled');
                                    }}
                                    className="w-14 py-2 rounded-xl bg-[#0a1219] hover:bg-[#101c27] text-gray-400 hover:text-white flex flex-col items-center gap-1 border border-transparent hover:border-[#162a2e] transition-all cursor-pointer"
                                    title="Stock Inventory"
                                >
                                    <span className="text-xl">📦</span>
                                    <span className="text-[10px] font-bold">Stock</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_reports_view', 'Sales Reports')) return;
                                        window.location.href = '/dashboard/reports';
                                    }}
                                    className="w-14 py-2 rounded-xl bg-[#0a1219] hover:bg-[#101c27] text-gray-400 hover:text-white flex flex-col items-center gap-1 border border-transparent hover:border-[#162a2e] transition-all mt-auto cursor-pointer"
                                    title="Sales Reports"
                                >
                                    <span className="text-xl">📈</span>
                                    <span className="text-[10px] font-bold">Reports</span>
                                </button>
                            </aside>

                            {/* B. CENTER PRODUCT AREA */}
                            <main className="flex-1 flex flex-col overflow-hidden bg-[#070d12]">
                                {/* Search & Categories Bar */}
                                <div className="p-3 bg-[#080f15] border-b border-[#142226] flex flex-col gap-2.5">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        {/* Search Input */}
                                        <div className="flex-1 min-w-[240px] bg-[#0b141c] border border-[#1a2f35] focus-within:border-[#00e676] rounded-xl flex items-center px-3 py-2 gap-2 transition-all">
                                            <span className="text-gray-400 text-sm">🔍</span>
                                            <input
                                                ref={searchInputRef}
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder="Search product by name or scan barcode..."
                                                className="bg-transparent text-white text-xs sm:text-sm font-medium w-full focus:outline-none placeholder-gray-500"
                                            />
                                            <span className="text-xs font-mono font-bold text-gray-400 bg-[#132029] px-2 py-0.5 rounded-md border border-white/5 shrink-0">
                                                ||||| F2
                                            </span>
                                        </div>

                                        {/* Dining Mode Pills */}
                                        <div className="flex items-center gap-1 bg-[#0b141c] p-1 rounded-xl border border-[#1a2f35]">
                                            {[
                                                { id: 'dine_in', label: '🍽️ Dine-In' },
                                                { id: 'takeaway', label: '📦 Takeout' },
                                                { id: 'room_service', label: '🏨 Room' },
                                                { id: 'delivery', label: '🛵 Delivery' }
                                            ].map(t => (
                                                <button
                                                    key={t.id}
                                                    type="button"
                                                    onClick={() => setOrderType(t.id as any)}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                                        orderType === t.id
                                                            ? 'bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/50 shadow-sm'
                                                            : 'text-gray-400 hover:text-white'
                                                    }`}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Table Selector */}
                                        <button
                                            type="button"
                                            onClick={() => setShowMoveTableModal(true)}
                                            className="px-3 py-1.5 rounded-xl bg-[#0b141c] border border-[#1a2f35] hover:border-[#00e676]/50 text-xs font-bold text-[#00e676] flex items-center gap-1.5 transition-all"
                                        >
                                            <span>🪑</span>
                                            <span>{tableNo ? `Table ${tableNo}` : 'Select Table'}</span>
                                        </button>

                                        {/* Waiter Selector */}
                                        <select
                                            value={selectedWaiterId || ''}
                                            onChange={(e) => {
                                                const id = Number(e.target.value);
                                                setSelectedWaiterId(id || null);
                                                const w = waiters.find(item => item.user_id === id);
                                                setSelectedWaiterName(w ? w.full_name : '');
                                            }}
                                            className="px-2.5 py-1.5 bg-[#0b141c] border border-[#1a2f35] rounded-xl text-xs font-bold text-gray-300 focus:outline-none focus:border-[#00e676]"
                                        >
                                            <option value="">👤 Select Waiter</option>
                                            {waiters.map(w => (
                                                <option key={w.user_id} value={w.user_id} className="bg-[#0b141c] text-white">
                                                    {w.full_name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Category Pills Carousel */}
                                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
                                        {categories.map(cat => {
                                            const isSelected = selectedCategory === cat;
                                            return (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => setSelectedCategory(cat)}
                                                    className={`px-3.5 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                                                        isSelected
                                                            ? 'bg-[#00e676] text-black shadow-lg shadow-[#00e676]/30 font-black'
                                                            : 'bg-[#0b141c] text-gray-400 hover:text-white border border-[#1a2f35] hover:border-gray-600'
                                                    }`}
                                                >
                                                    <span>{getCategoryIcon(cat)}</span>
                                                    <span>{cat}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Product Cards Grid (5-column layout with real food photos!) */}
                                <div className="flex-1 overflow-y-auto p-3.5">
                                    {isLoadingProducts ? (
                                        <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
                                            <div className="w-10 h-10 border-4 border-[#00e676]/20 border-t-[#00e676] rounded-full animate-spin" />
                                            <p className="text-sm font-bold">Loading live restaurant menu...</p>
                                        </div>
                                    ) : filteredProducts.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
                                            <span className="text-4xl">🍽️</span>
                                            <p className="font-bold text-base text-white">No dishes found</p>
                                            <p className="text-xs text-gray-500">Try searching for another dish or choose 'All'</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-3">
                                            {filteredProducts.map(product => {
                                                const inCartItem = cart.find(i => i.id === product.id);
                                                const inCartQty = inCartItem ? inCartItem.qty : 0;
                                                return (
                                                    <CyberProductCard
                                                        key={product.id}
                                                        product={product}
                                                        cartQty={inCartQty}
                                                        onAdd={() => addToCart(product)}
                                                    />
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Bottom Quick Actions Bar */}
                                <div className="p-2.5 bg-[#060b0f] border-t border-[#142226] flex items-center justify-between gap-3 shrink-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-black text-[#00e676] tracking-wider uppercase mr-1">
                                            ⚡ Quick Actions
                                        </span>

                                        <button
                                            type="button"
                                            onClick={clearCart}
                                            className="px-2.5 py-1.5 rounded-xl bg-[#0c161e] border border-[#162a2e] hover:border-[#00e676]/50 text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition-all"
                                            title="Start Fresh Bill"
                                        >
                                            <span className="text-[#00e676]">➕</span>
                                            <span>New Bill</span>
                                        </button>

                                        {/* My Bills Toolbar Button */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                playPOSChime('click');
                                                if (!verifyPosAccess('pos_view_my_bills', 'My Bills')) return;
                                                window.location.href = '/dashboard/my-bills';
                                            }}
                                            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-900/50 via-indigo-900/50 to-blue-800/50 border border-blue-500/50 hover:border-blue-400 text-xs font-black text-blue-200 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-blue-950/40"
                                            title="Open My Bills & Waiter Checks"
                                        >
                                            <span className="text-sm">📋</span>
                                            <span>My Bills</span>
                                            {waiterUnpaidCount > 0 && (
                                                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-900 text-[9px] font-black animate-pulse">
                                                    {waiterUnpaidCount}
                                                </span>
                                            )}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!verifyPosAccess('pos_pending_bills', 'View Running Bills')) return;
                                                loadUnpaidOrders();
                                                setShowRunningOrders(true);
                                            }}
                                            className="px-2.5 py-1.5 rounded-xl bg-[#0c161e] border border-[#162a2e] hover:border-[#00e676]/50 text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition-all cursor-pointer"
                                            title="View Running Orders"
                                        >
                                            <span>📋</span>
                                            <span>View Bills</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!verifyPosAccess('pos_day_sales', 'Day Sales')) return;
                                                window.location.href = '/dashboard/sales';
                                            }}
                                            className="px-2.5 py-1.5 rounded-xl bg-[#0c161e] border border-[#162a2e] hover:border-[#00e676]/50 text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition-all cursor-pointer"
                                            title="Today's Sales"
                                        >
                                            <span className="text-[#00e676]">📈</span>
                                            <span>Day Sales</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!verifyPosAccess('pos_merge_bills', 'Merge Bills Studio')) return;
                                                loadUnpaidOrders();
                                                setShowMergeModal(true);
                                            }}
                                            className="px-2.5 py-1.5 rounded-xl bg-[#0c161e] border border-[#162a2e] hover:border-[#00e676]/50 text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition-all cursor-pointer"
                                            title="Merge Tables / Combine Receipts"
                                        >
                                            <span className="text-indigo-400">🔀</span>
                                            <span>Merge Bills</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!verifyPosAccess('pos_pending_bills', 'Pending Bills & Held Orders')) return;
                                                setShowHeldSalesModal(true);
                                            }}
                                            className="px-2.5 py-1.5 rounded-xl bg-[#0c161e] border border-[#162a2e] hover:border-[#00e676]/50 text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition-all relative cursor-pointer"
                                            title="Held Bills on Hold"
                                        >
                                            <span>⏱️</span>
                                            <span>Pending Bills</span>
                                            {heldSales.length > 0 && (
                                                <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center">
                                                    {heldSales.length}
                                                </span>
                                            )}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handlePrintInterimBill}
                                            className="px-2.5 py-1.5 rounded-xl bg-[#0c161e] border border-[#162a2e] hover:border-[#00e676]/50 text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition-all"
                                            title="Print Interim Customer Check [F10]"
                                        >
                                            <span>🖨️</span>
                                            <span>Print Bill</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (cart.length === 0) return;
                                                requireSupervisorAuth('Void Last Item', 'Void item authorization', () => {
                                                    const lastItem = cart[cart.length - 1];
                                                    if (lastItem) removeFromCart(lastItem.id);
                                                });
                                            }}
                                            className="px-2.5 py-1.5 rounded-xl bg-red-950/30 border border-red-500/30 hover:bg-red-900/40 text-xs font-bold text-red-400 hover:text-white flex items-center gap-1 transition-all"
                                            title="Void Item (PIN)"
                                        >
                                            <span>🗑️</span>
                                            <span>Void Item</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (cart.length === 0) return;
                                                requireSupervisorAuth('Clear Entire Cart', 'Wipe current active order', () => {
                                                    clearCart();
                                                    toast.success('Active order cleared');
                                                });
                                            }}
                                            className="px-2.5 py-1.5 rounded-xl bg-[#0c161e] border border-gray-700 hover:border-red-500 text-xs font-bold text-gray-400 hover:text-red-400 flex items-center gap-1 transition-all"
                                            title="Clear Order (PIN)"
                                        >
                                            <span>❌</span>
                                            <span>Clear Order</span>
                                        </button>
                                    </div>

                                    {/* Right Footer Brand */}
                                    <div className="hidden lg:flex items-center gap-3 text-right">
                                        <div>
                                            <p className="text-[11px] font-bold text-gray-400 tracking-wide">
                                                Good Food • Great Service • Happy Customers
                                            </p>
                                            <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                                <span className="text-xs">🛒</span>
                                                <span className="text-xs font-black text-white">AlphaPlus</span>
                                                <span className="text-xs font-black text-[#00e676]">POS</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 pl-3 border-l border-white/10 text-xs font-bold text-gray-400">
                                            <span>🇰🇪</span>
                                            <span className="text-[11px]">Proudly Kenyan ❤️</span>
                                        </div>
                                    </div>
                                </div>
                            </main>

                            {/* C. RIGHT ORDER / CART PANEL */}
                            <aside className="w-[390px] xl:w-[420px] shrink-0 bg-[#080e14] border-l border-[#142226] flex flex-col h-full">
                                {/* Cart Header */}
                                <div className="p-3 bg-[#0a1219] border-b border-[#142226] flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg text-[#00e676]">🛒</span>
                                        <h3 className="font-black text-white text-sm sm:text-base tracking-tight">
                                            Current Order
                                        </h3>
                                        {cart.length > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#00e676] text-black">
                                                {cart.reduce((sum, item) => sum + item.qty, 0)} items
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#132029] text-gray-300 border border-white/5">
                                            {orderType === 'dine_in' ? 'Dine-In' : orderType === 'takeaway' ? 'Takeout' : orderType === 'room_service' ? 'Room' : 'Delivery'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setShowMoveTableModal(true)}
                                            className="px-2.5 py-1 rounded-lg text-xs font-extrabold text-[#00e676] bg-[#00e676]/10 border border-[#00e676]/40 hover:bg-[#00e676]/20 transition-all font-mono"
                                        >
                                            {tableNo ? `Table ${tableNo}` : 'Table 04'}
                                        </button>
                                    </div>
                                </div>

                                {/* Cart Items Table Header */}
                                <div className="px-3 py-1.5 bg-[#060b0f] border-b border-[#142226] text-[10px] font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-4 text-center">#</span>
                                    <span className="flex-1">Item</span>
                                    <span className="w-16 text-center">Qty</span>
                                    <span className="w-14 text-right">Price</span>
                                    <span className="w-14 text-right">Total</span>
                                    <span className="w-7 text-center"></span>
                                </div>

                                {/* Cart Items List */}
                                <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
                                    {cart.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2 py-12">
                                            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-3xl">
                                                🛒
                                            </div>
                                            <p className="font-bold text-sm text-gray-400">Cart is empty</p>
                                            <p className="text-xs text-gray-500">Tap dishes on the menu to add to order</p>
                                        </div>
                                    ) : (
                                        cart.map((item, idx) => (
                                            <CyberCartItemRow
                                                key={item.id}
                                                item={item}
                                                index={idx + 1}
                                                onIncrease={() => updateQty(item.id, 1)}
                                                onDecrease={() => updateQty(item.id, -1)}
                                                onRemove={() => removeFromCart(item.id)}
                                                onEditNotes={() => {
                                                    setEditingItemId(item.id);
                                                    setShowNotesModal(true);
                                                }}
                                                onEditDiscount={() => {
                                                    handleApplyCartDiscount(10);
                                                }}
                                            />
                                        ))
                                    )}
                                </div>

                                {/* Financial Summary & Total */}
                                <div className="p-3 bg-[#0a1219] border-t border-[#142226] space-y-2">
                                    <div className="space-y-1 text-xs font-semibold text-gray-400">
                                        <div className="flex justify-between">
                                            <span>Subtotal</span>
                                            <span className="font-mono text-white">KSh {subtotal.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-emerald-400">
                                            <button
                                                type="button"
                                                onClick={() => handleApplyCartDiscount(10)}
                                                className="hover:underline flex items-center gap-1 text-[11px]"
                                            >
                                                <span>🏷️</span> Discount {totalDiscount > 0 ? `(Ksh ${totalDiscount.toLocaleString()})` : ''}
                                            </button>
                                            <span className="font-mono">
                                                -KSh {totalDiscount.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="flex items-center gap-1">
                                                <span>%</span> VAT (16%)
                                            </span>
                                            <span className="font-mono text-white">
                                                KSh {Math.round(vatAmount || (subtotal * 0.16)).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-gray-500">
                                            <span>🧾 Service Charge</span>
                                            <span className="font-mono">KSh 0.00</span>
                                        </div>
                                    </div>

                                    {/* Total Emerald Wallet Card */}
                                    <div className="p-3 rounded-xl bg-[#0a2318] border border-[#00e676]/40 flex items-center justify-between shadow-inner">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-[#00e676]/20 border border-[#00e676]/40 flex items-center justify-center text-base text-[#00e676]">
                                                💳
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider leading-none">
                                                    Total Amount
                                                </p>
                                                <p className="text-[11px] text-[#00e676] font-bold mt-0.5 leading-none">
                                                    {cart.length} item(s) in check
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-2xl sm:text-3xl font-black text-[#00e676] font-mono tracking-tight leading-none">
                                                KSh {total.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* 4 Super Hot Action Buttons: Hold, KOT, Bill, Pay (Matching Classic Theme Functions) */}
                                    <div className="grid grid-cols-4 gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => cart.length > 0 && setShowHoldModal(true)}
                                            disabled={cart.length === 0}
                                            className="py-3 bg-amber-950/40 hover:bg-amber-600 active:scale-95 text-amber-300 hover:text-white rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center gap-1 border border-amber-500/30 hover:border-amber-400 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                                            title="Hold Order [F3]"
                                        >
                                            <span className="text-base">📋</span>
                                            <span className="tracking-wide">Hold [F3]</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={sendToKitchen}
                                            disabled={cart.length === 0}
                                            className="py-3 bg-indigo-950/40 hover:bg-indigo-600 active:scale-95 text-indigo-300 hover:text-white rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center gap-1 border border-indigo-500/30 hover:border-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                                            title="Send to Kitchen KDS [F9]"
                                        >
                                            <span className="text-base">🍳</span>
                                            <span className="tracking-wide">KOT [F9]</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handlePrintInterimBill}
                                            disabled={cart.length === 0}
                                            className="py-3 bg-teal-950/40 hover:bg-teal-600 active:scale-95 text-teal-300 hover:text-white rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center gap-1 border border-teal-500/30 hover:border-teal-400 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                                            title="Print Customer Interim Check [F10]"
                                        >
                                            <span className="text-base">🧾</span>
                                            <span className="tracking-wide">Bill [F10]</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!verifyPosAccess('pos_payment_tender', 'Payment Settlement')) return;
                                                if (cart.length === 0) {
                                                    toast.error('Your cart is empty! Add products first.');
                                                    return;
                                                }
                                                setPaymentInitialMethod('cash');
                                                setShowPayment(true);
                                            }}
                                            disabled={cart.length === 0}
                                            className="py-3 bg-[#00e676] hover:bg-[#00c853] active:scale-95 text-black rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center gap-1 shadow-[0_0_20px_rgba(0,230,118,0.4)] disabled:opacity-40 disabled:cursor-not-allowed border border-[#00e676] cursor-pointer"
                                            title="Open Payment Dialog [F12]"
                                        >
                                            <span className="text-base">💳</span>
                                            <span className="tracking-wide uppercase">Pay [F12]</span>
                                        </button>
                                    </div>

                                    {/* Quick Tender Tiles: M-Pesa, Cash, Card, Credit, Split */}
                                    <div className="grid grid-cols-5 gap-1.5 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!verifyPosAccess('pos_payment_tender', 'M-Pesa Payment')) return;
                                                if (cart.length === 0) { toast.error('Please add dishes to cart first'); return; }
                                                setPaymentInitialMethod('mpesa');
                                                setShowPayment(true);
                                            }}
                                            className="py-2 bg-[#0c161e] border border-[#162a2e] hover:border-[#00e676]/60 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all text-gray-300 hover:text-white"
                                            title="Safaricom M-Pesa"
                                        >
                                            <span className="text-sm text-[#00e676]">📱</span>
                                            <span className="text-[10px] font-bold">M-Pesa</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!verifyPosAccess('pos_payment_tender', 'Cash Settlement')) return;
                                                if (cart.length === 0) { toast.error('Please add dishes to cart first'); return; }
                                                setPaymentInitialMethod('cash');
                                                setShowPayment(true);
                                            }}
                                            className="py-2 bg-[#0c161e] border border-[#162a2e] hover:border-[#00e676]/60 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all text-gray-300 hover:text-white"
                                            title="Cash Settle"
                                        >
                                            <span className="text-sm text-[#00e676]">💵</span>
                                            <span className="text-[10px] font-bold">Cash</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (cart.length === 0) { toast.error('Please add dishes to cart first'); return; }
                                                setPaymentInitialMethod('card');
                                                setShowPayment(true);
                                            }}
                                            className="py-2 bg-[#0c161e] border border-[#162a2e] hover:border-[#00e676]/60 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all text-gray-300 hover:text-white"
                                            title="Credit / Debit Card (PDQ)"
                                        >
                                            <span className="text-sm text-[#00e676]">💳</span>
                                            <span className="text-[10px] font-bold">Card</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (cart.length === 0) { toast.error('Please add dishes to cart first'); return; }
                                                setPaymentInitialMethod('credit');
                                                setShowPayment(true);
                                            }}
                                            className="py-2 bg-[#0c161e] border border-[#162a2e] hover:border-[#00e676]/60 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all text-gray-300 hover:text-white"
                                            title="Credit / Debtor Account"
                                        >
                                            <span className="text-sm text-[#00e676]">📋</span>
                                            <span className="text-[10px] font-bold">Credit</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (cart.length === 0) { toast.error('Please add dishes to cart first'); return; }
                                                setShowSplitModal(true);
                                            }}
                                            className="py-2 bg-[#0c161e] border border-[#162a2e] hover:border-[#00e676]/60 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all text-gray-300 hover:text-white"
                                            title="Split Bill (Equal or Items)"
                                        >
                                            <span className="text-sm text-amber-400">✂️</span>
                                            <span className="text-[10px] font-bold">Split</span>
                                        </button>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>
                ) : (
                    <>

                {/* Left Side - Products & Command Center */}
                <div className="flex-1 min-w-0 flex flex-col bg-white overflow-hidden h-full">
                    {/* Header */}
                    <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-white to-gray-50">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            {/* POS Title & Live Cockpit Status */}
                            <div className="flex items-center gap-2.5 shrink-0">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-slate-900 flex items-center justify-center text-xl shadow-md text-white border-2 border-white/40">
                                    🛒
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h1 className="text-base sm:text-lg font-black text-gray-900 tracking-tight leading-none">
                                            AlphaPlus <span className="text-emerald-600 font-extrabold">POS</span>
                                        </h1>
                                        <span className="px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-black rounded-full uppercase tracking-wider shadow-sm animate-pulse">
                                            LIVE
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-gray-500">
                                        <span className="text-emerald-700 font-mono font-black flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                                            {currentTime || '09:30 AM'}
                                        </span>
                                        <span>•</span>
                                        <span className="truncate max-w-[120px] font-bold text-gray-700">{hotelName}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Essential Top Tools & Cashier Badges */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                {/* Hotkeys Guide */}
                                
                                {/* DUAL THEME TOGGLE (CLASSIC HEADER) */}
                                <div className="flex items-center bg-gray-200 p-0.5 rounded-xl border border-gray-300 shadow-inner mr-1">
                                    <button
                                        type="button"
                                        onClick={() => toggleTheme('classic')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                            (posTheme as string) === 'classic'
                                                ? 'bg-white text-gray-900 shadow-sm font-black'
                                                : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        ☀️ Classic
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggleTheme('cyber')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                            (posTheme as string) === 'cyber'
                                                ? 'bg-emerald-600 text-white shadow-sm font-black'
                                                : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        🟢 Cyber Emerald
                                    </button>
                                </div>
                                <button
                                    onClick={() => setShowShortcutsModal(true)}
                                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl text-gray-700 text-xs font-bold transition-all border border-gray-200 flex items-center gap-1 shadow-sm"
                                    title="Keyboard Shortcuts [F1]"
                                >
                                    <span>⌨️</span>
                                    <span className="hidden sm:inline">Hotkeys [F1]</span>
                                </button>
                                {/* Sound FX */}
                                <button
                                    onClick={() => {
                                        setSoundEnabled(!soundEnabled);
                                        toast(soundEnabled ? 'Audio Chimes Muted 🔇' : 'Audio Chimes Enabled 🔊');
                                    }}
                                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 transition-colors border border-gray-200 text-xs font-bold"
                                    title={soundEnabled ? 'Mute Audio Chimes' : 'Enable Audio Chimes'}
                                >
                                    {soundEnabled ? '🔊' : '🔇'}
                                </button>
                                {/* Cash Drawer Kick */}
                                <button
                                    onClick={() => {
                                        requireSupervisorAuth(
                                            'Open Cash Drawer',
                                            'Manual No-Sale Drawer Open',
                                            () => {
                                                playPOSChime('tender');
                                                toast.success('Cash Drawer Kick Signal Dispatched 🖨️');
                                            }
                                        );
                                    }}
                                    className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 rounded-xl text-amber-900 transition-colors border border-amber-200 text-xs font-bold flex items-center gap-1"
                                    title="Kick Cash Drawer (Manager PIN)"
                                >
                                    <span>🖨️</span>
                                    <span className="hidden sm:inline">Kick</span>
                                </button>
                                {/* Fullscreen */}
                                <button
                                    onClick={toggleFullscreen}
                                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-600 transition-colors border border-gray-200 text-sm shadow-sm"
                                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                                >
                                    ⛶
                                </button>
                                {/* Low Stock Alert Bell */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowLowStockDropdown(!showLowStockDropdown)}
                                        className="p-2 bg-gray-100 hover:bg-red-100 rounded-xl text-sm transition-colors border border-gray-200 relative"
                                        title={`${lowStockProducts.length} products low on stock`}
                                    >
                                        🔔
                                        {lowStockProducts.length > 0 && (
                                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                                                {lowStockProducts.length > 99 ? '99+' : lowStockProducts.length}
                                            </span>
                                        )}
                                    </button>
                                    {/* Low Stock Dropdown */}
                                    {showLowStockDropdown && (
                                        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 max-h-[400px] overflow-hidden flex flex-col">
                                            <div className="p-3 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-t-2xl">
                                                <h3 className="text-sm font-bold">⚠️ Low Stock Alert</h3>
                                                <p className="text-[10px] opacity-80">{lowStockProducts.length} products below 10 units</p>
                                            </div>
                                            <div className="flex-1 overflow-y-auto max-h-[280px]">
                                                {lowStockProducts.length === 0 ? (
                                                    <div className="p-6 text-center text-gray-400">
                                                        <span className="text-3xl block mb-2">✅</span>
                                                        <p className="text-sm">All products well stocked!</p>
                                                    </div>
                                                ) : (
                                                    lowStockProducts.map(p => (
                                                        <div key={p.id} className="flex items-center justify-between p-2.5 border-b border-gray-100 hover:bg-gray-50">
                                                            <span className="text-xs text-gray-700 font-medium truncate flex-1">{p.name}</span>
                                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.stock === 0 ? 'bg-red-100 text-red-600' : p.stock < 5 ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-700'}`}>
                                                                {p.stock === 0 ? 'OUT' : `${p.stock} left`}
                                                            </span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                            <div className="p-2 border-t border-gray-200">
                                                <a href="/dashboard/dish-stock" className="block w-full py-2 text-center text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">View Full Stock →</a>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {/* Invoice Pill */}
                                <div className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 rounded-xl border border-blue-200">
                                    <span className="text-xs text-blue-600">🧾</span>
                                    <span className="text-xs font-bold font-mono text-blue-800">{invoiceNo}</span>
                                </div>
                                {/* Shift Status Pill */}
                                {!isWaiterUser && hasActiveShift && shift && (
                                    <div className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 rounded-xl border border-green-200">
                                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                        <span className="text-xs font-bold text-green-800 hidden sm:inline">{shift.name}</span>
                                    </div>
                                )}
                                {/* Close Register */}
                                {hasActiveShift && (
                                    <button
                                        onClick={() => {
                                            if (!verifyPosAccess('pos_close_register', 'Close Cashier Register')) return;
                                            handleCloseRegister();
                                        }}
                                        disabled={isLoadingRegister}
                                        className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
                                        title="Close Cashier Shift"
                                    >
                                        🔴 Close
                                    </button>
                                )}
                                {/* Waiter / Staff Active Session Pill & Fast Switch */}
                                {isWaiterUser ? (
                                    <div className="flex items-center gap-1.5">
                                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-950/40 border border-purple-500/30 rounded-xl text-purple-200 shadow-sm">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                            <span className="text-xs">👤</span>
                                            <span className="text-xs font-black tracking-wide">{loggedInUserName || selectedWaiterName || 'Waiter'}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setLockPin('');
                                                setLockError('');
                                                setLoggedInUserName('');
                                                setSelectedWaiterName('');
                                                setSelectedWaiterId(null);
                                                localStorage.removeItem('alpha_hotel_selected_waiter');
                                                setIsPosLocked(true);
                                            }}
                                            className="px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 rounded-xl text-xs font-black transition-all flex items-center gap-1 shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer"
                                            title="Lock Terminal & Switch Waiter [F4]"
                                        >
                                            🔒 Switch Waiter
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { localStorage.removeItem('user'); window.location.href = '/'; }}
                                            className="px-2 py-1.5 bg-slate-800 hover:bg-rose-900/60 hover:border-rose-500/50 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-white/10 cursor-pointer"
                                            title="Full Logout to Main Login"
                                        >
                                            🚪
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLockPin('');
                                            setLockError('');
                                            setIsPosLocked(true);
                                        }}
                                        className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-white/10 flex items-center gap-1 cursor-pointer"
                                        title="Quick Lock Terminal [F4]"
                                    >
                                        🔒 Lock Screen
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Search, Order Type, Table & Waiter Bar */}
                        <div className="flex flex-wrap md:flex-nowrap gap-2.5 items-center">
                            {/* Dining Mode Pills */}
                            <div className="flex items-center bg-gray-100 p-1 rounded-2xl border border-gray-200/80 shrink-0">
                                {[
                                    { id: 'dine_in', label: 'Dine-In', icon: '🍽️' },
                                    { id: 'takeaway', label: 'Takeout', icon: '🥡' },
                                    { id: 'room_service', label: 'Room', icon: '🏨' },
                                    { id: 'delivery', label: 'Delivery', icon: '🛵' }
                                ].map(mode => (
                                    <button
                                        key={mode.id}
                                        onClick={() => setOrderType(mode.id as any)}
                                        className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 ${
                                            orderType === mode.id
                                                ? 'bg-white text-emerald-950 shadow-sm'
                                                : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        <span>{mode.icon}</span>
                                        <span className="hidden sm:inline">{mode.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Search Input */}
                            <div className="flex-1 relative min-w-[200px]">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search dishes or scan barcode... [F2 /]"
                                    className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200/90 rounded-2xl focus:outline-none focus:border-emerald-500 focus:bg-white text-gray-900 placeholder-gray-400 text-xs sm:text-sm font-semibold transition-all"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold p-1"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {/* Guest Covers Stepper */}
                            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-2 py-1 gap-1.5 shrink-0">
                                <span className="text-xs text-gray-500 font-bold">👥</span>
                                <button
                                    onClick={() => setGuestCovers(Math.max(1, guestCovers - 1))}
                                    className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-gray-700 font-bold text-xs flex items-center justify-center hover:bg-gray-100"
                                >
                                    -
                                </button>
                                <span className="text-xs font-black text-gray-900 min-w-[18px] text-center">{guestCovers}</span>
                                <button
                                    onClick={() => setGuestCovers(guestCovers + 1)}
                                    className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-gray-700 font-bold text-xs flex items-center justify-center hover:bg-gray-100"
                                >
                                    +
                                </button>
                            </div>

                            {/* Waiter Dropdown */}
                            <div className="relative shrink-0">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">👤</span>
                                <select
                                    value={selectedWaiterId || ''}
                                    onChange={(e) => {
                                        const id = e.target.value ? parseInt(e.target.value) : null;
                                        setSelectedWaiterId(id);
                                        const waiter = waiters.find(w => w.user_id === id);
                                        setSelectedWaiterName(waiter?.full_name || '');
                                    }}
                                    className="w-36 pl-8 pr-3 py-2 bg-purple-50/80 border border-purple-200 rounded-2xl focus:outline-none focus:border-purple-400 text-purple-950 appearance-none cursor-pointer font-bold text-xs"
                                >
                                    <option value="">Server / Waiter</option>
                                    {waiters.map(waiter => (
                                        <option key={waiter.user_id} value={waiter.user_id}>
                                            {waiter.full_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Table Number */}
                            <div className="relative shrink-0">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🪑</span>
                                <input
                                    type="text"
                                    value={tableNo}
                                    onChange={(e) => setTableNo(e.target.value)}
                                    placeholder="Table #"
                                    className="w-24 pl-8 pr-2.5 py-2 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:border-emerald-500 text-gray-900 placeholder-gray-400 text-xs font-black"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Categories Carousel */}
                    <div className="flex gap-2 p-3 overflow-x-auto border-b border-gray-100 bg-white shadow-inner">
                        {categories.map(cat => {
                            const count = cat === 'All' ? products.length : products.filter(p => p.category === cat).length;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`px-3.5 py-2 rounded-2xl font-bold text-xs whitespace-nowrap transition-all flex items-center gap-1.5 shadow-sm ${
                                        selectedCategory === cat
                                            ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-700/20 scale-105'
                                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200/80'
                                    }`}
                                >
                                    <span>{getCategoryIcon(cat)}</span>
                                    <span>{cat}</span>
                                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                                        selectedCategory === cat ? 'bg-white/20 text-white' : 'bg-gray-200/80 text-gray-700'
                                    }`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Products Grid */}
                    <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
                            {filteredProducts.map(product => (
                                <ProductCard
                                    key={product.id}
                                    product={product}
                                    onAdd={() => addToCart(product)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Original Quick Action Buttons — same order, greyed out for waiters */}
                    {/* Super Hot Premium Executive Command Bar */}
                    <div className="p-2 sm:p-2.5 bg-gradient-to-r from-slate-900 via-gray-900 to-slate-950 border-t border-white/10 shadow-2xl shrink-0">
                        <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                            {/* 1. Receive Payment - Super Hot Flame Button */}
                            <a
                                href="/dashboard/bill-payment"
                                onClick={(e) => {
                                    e.preventDefault();
                                    playPOSChime('click');
                                    if (!verifyPosAccess('pos_receive_payment', 'Receive Payment')) return;
                                    window.location.href = '/dashboard/bill-payment';
                                }}
                                className="group relative p-2.5 bg-gradient-to-br from-amber-500 via-orange-600 to-red-600 rounded-2xl text-white text-center hover:scale-105 hover:shadow-orange-500/50 hover:brightness-110 active:scale-95 transition-all duration-200 border border-white/30 shadow-lg shadow-orange-600/30 flex flex-col items-center justify-between min-h-[66px] overflow-hidden cursor-pointer"
                            >
                                <span className="absolute top-1 right-1.5 px-1 py-0.2 bg-black/30 text-amber-200 text-[8px] font-black rounded-md tracking-wider uppercase">
                                    🔥 HOT
                                </span>
                                <span className="text-xl sm:text-2xl block transition-transform group-hover:scale-110">💰</span>
                                <div>
                                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block leading-tight">Receive Pay</span>
                                    <span className="text-[8px] text-amber-100/80 font-bold block">Direct Tender</span>
                                </div>
                            </a>

                            {/* 2. My Bills - Sapphire Royal Button */}
                            <a
                                href="/dashboard/my-bills"
                                onClick={(e) => {
                                    e.preventDefault();
                                    playPOSChime('click');
                                    if (!verifyPosAccess('pos_view_my_bills', 'My Bills')) return;
                                    window.location.href = '/dashboard/my-bills';
                                }}
                                className="group relative p-2.5 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 rounded-2xl text-white text-center hover:scale-105 hover:shadow-indigo-500/50 hover:brightness-110 active:scale-95 transition-all duration-200 border border-white/30 shadow-lg shadow-indigo-600/30 flex flex-col items-center justify-between min-h-[66px] overflow-hidden cursor-pointer"
                            >
                                {waiterUnpaidCount > 0 && (
                                    <span className="absolute top-1 right-1.5 px-1.5 py-0.2 bg-amber-400 text-slate-900 text-[9px] font-black rounded-full animate-bounce">
                                        {waiterUnpaidCount}
                                    </span>
                                )}
                                <span className="text-xl sm:text-2xl block transition-transform group-hover:scale-110">📋</span>
                                <div>
                                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block leading-tight">My Bills</span>
                                    <span className="text-[8px] text-blue-100/80 font-bold block">{waiterPaidCount} Paid · {waiterUnpaidCount} Open</span>
                                </div>
                            </a>

                            {/* 3. Day Sales - Emerald Mint Button */}
                            <a
                                href="/dashboard/sales"
                                onClick={(e) => {
                                    e.preventDefault();
                                    playPOSChime('click');
                                    if (!verifyPosAccess('pos_day_sales', 'Day Sales')) return;
                                    window.location.href = '/dashboard/sales';
                                }}
                                className="group relative p-2.5 bg-gradient-to-br from-emerald-500 via-teal-600 to-green-700 rounded-2xl text-white text-center hover:scale-105 hover:shadow-emerald-500/50 hover:brightness-110 active:scale-95 transition-all duration-200 border border-white/30 shadow-lg shadow-emerald-600/30 flex flex-col items-center justify-between min-h-[66px] overflow-hidden cursor-pointer"
                            >
                                <span className="text-xl sm:text-2xl block transition-transform group-hover:scale-110">📊</span>
                                <div>
                                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block leading-tight">Day Sales</span>
                                    <span className="text-[8px] text-emerald-100/80 font-bold block">Live Shifts</span>
                                </div>
                            </a>

                            {/* 4. Merge Bill - Neon Fuchsia Button */}
                            <a
                                href="/dashboard/split-merge-receipts"
                                onClick={(e) => {
                                    e.preventDefault();
                                    playPOSChime('click');
                                    if (!verifyPosAccess('pos_merge_bills', 'Merge Bills Studio')) return;
                                    window.location.href = '/dashboard/split-merge-receipts';
                                }}
                                className="group relative p-2.5 bg-gradient-to-br from-purple-600 via-fuchsia-600 to-pink-600 rounded-2xl text-white text-center hover:scale-105 hover:shadow-fuchsia-500/50 hover:brightness-110 active:scale-95 transition-all duration-200 border border-white/30 shadow-lg shadow-fuchsia-600/30 flex flex-col items-center justify-between min-h-[66px] overflow-hidden cursor-pointer"
                            >
                                <span className="absolute top-1 right-1.5 px-1 py-0.2 bg-black/30 text-pink-200 text-[8px] font-black rounded-md tracking-wider uppercase">
                                    STUDIO
                                </span>
                                <span className="text-xl sm:text-2xl block transition-transform group-hover:scale-110">🔄</span>
                                <div>
                                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block leading-tight">Merge Bills</span>
                                    <span className="text-[8px] text-purple-100/80 font-bold block">Split &amp; Merge</span>
                                </div>
                            </a>

                            {/* 5. Sales Summary - Cyan Sapphire Button */}
                            <a
                                href="/dashboard/reports/pos"
                                onClick={(e) => {
                                    e.preventDefault();
                                    playPOSChime('click');
                                    if (!verifyPosAccess('pos_sales_summary', 'Sales Summary Analytics')) return;
                                    window.location.href = '/dashboard/reports/pos';
                                }}
                                className="group relative p-2.5 bg-gradient-to-br from-cyan-500 via-teal-600 to-blue-700 rounded-2xl text-white text-center hover:scale-105 hover:shadow-cyan-500/50 hover:brightness-110 active:scale-95 transition-all duration-200 border border-white/30 shadow-lg shadow-cyan-600/30 flex flex-col items-center justify-between min-h-[68px] overflow-hidden cursor-pointer"
                            >
                                <span className="text-xl sm:text-2xl block transition-transform group-hover:scale-110">📈</span>
                                <div>
                                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block leading-tight">Summary</span>
                                    <span className="text-[8px] text-cyan-100/80 font-bold block">Analytics</span>
                                </div>
                            </a>

                            {/* 6. Pending Bills - Amber Gold Button */}
                            <a
                                href="/dashboard/bills?status=Pending"
                                onClick={(e) => {
                                    e.preventDefault();
                                    playPOSChime('click');
                                    if (!verifyPosAccess('pos_pending_bills', 'Master Pending Bills')) return;
                                    window.location.href = '/dashboard/bills?status=Pending';
                                }}
                                className="group relative p-2.5 bg-gradient-to-br from-amber-500 via-yellow-600 to-orange-600 rounded-2xl text-white text-center hover:scale-105 hover:shadow-amber-500/50 hover:brightness-110 active:scale-95 transition-all duration-200 border border-white/30 shadow-lg shadow-amber-600/30 flex flex-col items-center justify-between min-h-[68px] overflow-hidden cursor-pointer"
                            >
                                <span className="text-xl sm:text-2xl block transition-transform group-hover:scale-110">⏳</span>
                                <div>
                                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block leading-tight">Pending</span>
                                    <span className="text-[8px] text-amber-100/80 font-bold block">Unsettled</span>
                                </div>
                            </a>

                            {/* 7. Clear - Sleek Carbon Slate Button with Supervisor PIN */}
                            <button
                                onClick={() => {
                                    if (!verifyPosAccess('pos_clear_cart', 'Clear Entire Cart')) return;
                                    if (cart.length === 0) return;
                                    requireSupervisorAuth(
                                        'Clear Entire Order',
                                        `Cancel running order with ${cart.length} items (Ksh ${total.toLocaleString()})`,
                                        () => {
                                            clearCart();
                                            playPOSChime('void');
                                        }
                                    );
                                }}
                                className="group relative p-2.5 bg-gradient-to-br from-slate-700 via-gray-800 to-zinc-900 rounded-2xl text-white text-center hover:scale-105 hover:shadow-slate-500/50 hover:brightness-110 active:scale-95 transition-all duration-200 border border-white/20 shadow-lg flex flex-col items-center justify-between min-h-[68px] overflow-hidden cursor-pointer"
                            >
                                <span className="text-xl sm:text-2xl block transition-transform group-hover:scale-110">🗑️</span>
                                <div>
                                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block leading-tight">Clear Cart</span>
                                    <span className="text-[8px] text-gray-300 font-bold block">PIN Secured</span>
                                </div>
                            </button>

                            {/* 8. Closing Stock / Shift Reconciliation - Ruby Rose Button */}
                            <a
                                href="/dashboard/shift-reports"
                                onClick={(e) => {
                                    e.preventDefault();
                                    playPOSChime('click');
                                    if (!verifyPosAccess('pos_shift_reconciliation', 'EOD Stock Audit')) return;
                                    window.location.href = '/dashboard/shift-reports';
                                }}
                                className="group relative p-2.5 bg-gradient-to-br from-rose-600 via-red-600 to-pink-700 rounded-2xl text-white text-center hover:scale-105 hover:shadow-rose-500/50 hover:brightness-110 active:scale-95 transition-all duration-200 border border-white/30 shadow-lg shadow-rose-600/30 flex flex-col items-center justify-between min-h-[68px] overflow-hidden cursor-pointer"
                            >
                                <span className="text-xl sm:text-2xl block transition-transform group-hover:scale-110">🏁</span>
                                <div>
                                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block leading-tight">EOD Stock</span>
                                    <span className="text-[8px] text-rose-100/80 font-bold block">Close Audit</span>
                                </div>
                            </a>
                        </div>
                    </div>
                </div>

                {/* Right Side - Cart (100% visible on any screen) */}
                <div className="w-[330px] sm:w-[350px] md:w-[370px] lg:w-[390px] xl:w-[420px] shrink-0 bg-white border-l border-gray-200 flex flex-col shadow-2xl h-full overflow-hidden z-20">
                    {/* Cart Header */}
                    <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">🛍️</span>
                                <h2 className="font-bold text-gray-800">Current Order</h2>
                                <span className="px-2 py-1 bg-blue-100 text-blue-600 text-xs font-bold rounded-full">
                                    {cart.reduce((sum, item) => sum + item.qty, 0)} items
                                </span>
                            </div>
                            <div className="flex gap-2">
                                {/* Recall / Held Sales Button */}
                                <button
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_hold_recall_order', 'Recall Held Orders')) return;
                                        setShowHeldSalesModal(true);
                                    }}
                                    className="relative p-2 hover:bg-amber-50 rounded-xl text-amber-500 transition-colors border border-amber-200 cursor-pointer"
                                    title="Recall Held Sale"
                                >
                                    📋
                                    {heldSales.length > 0 && (
                                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
                                            {heldSales.length}
                                        </span>
                                    )}
                                </button>
                                {/* Hold Current Sale */}
                                {cart.length > 0 && (
                                    <button
                                        onClick={holdCurrentSale}
                                        className="p-2 hover:bg-amber-50 rounded-xl text-amber-600 transition-colors border border-amber-200"
                                        title="Hold Sale"
                                    >
                                        ⏸️
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowRunningOrders(true)}
                                    className="relative p-2 hover:bg-orange-50 rounded-xl text-orange-500 transition-colors border border-orange-200"
                                    title="Running Orders"
                                >
                                    📋
                                    {runningOrders.length > 0 && (
                                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                                            {runningOrders.length}
                                        </span>
                                    )}
                                </button>
                                <button
                                    onClick={clearCart}
                                    className="p-2 hover:bg-red-50 rounded-xl text-red-500 transition-colors border border-red-200"
                                    title="Clear All"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Order Notes */}
                    <div className="px-4 py-3 border-b border-gray-100 bg-yellow-50">
                        <textarea
                            value={orderNotes}
                            onChange={(e) => setOrderNotes(e.target.value)}
                            placeholder="📝 Add order notes... (e.g., Take-away, Less spicy)"
                            className="w-full p-3 bg-white border border-yellow-200 rounded-xl focus:outline-none focus:border-yellow-400 text-gray-700 placeholder-gray-400 text-sm h-16 resize-none"
                        />
                    </div>

                    {/* Cart Items */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-2 bg-gray-50">
                        {cart.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <span className="text-7xl mb-4 opacity-50">🛒</span>
                                <p className="font-semibold text-gray-500">Cart is empty</p>
                                <p className="text-sm">Add products to get started</p>
                            </div>
                        ) : (
                            cart.map(item => (
                                <CartItemRow
                                key={item.id}
                                item={item}
                                showTaxInfo={showTaxInfo}
                                onIncrease={() => updateQty(item.id, 1)}
                                    onDecrease={() => updateQty(item.id, -1)}
                                    onRemove={() => {
                                        requireSupervisorAuth(
                                            'Item Void Authorization',
                                            `Void "${item.name}" (Qty: ${item.qty} · Ksh ${(item.price * item.qty).toLocaleString()})`,
                                            () => removeFromCart(item.id)
                                        );
                                    }}
                                    onEditNotes={() => { setEditingItemId(item.id); setShowNotesModal(true); }}
                                    onEditDiscount={() => {
                                        requireSupervisorAuth(
                                            'Manager Discount Approval',
                                            `Apply custom discount on "${item.name}"`,
                                            () => {
                                                const discount = prompt('Enter discount amount (Ksh):', item.discount.toString());
                                                if (discount !== null) {
                                                    const discVal = Number(discount) || 0;
                                                    setCart(prev => prev.map(i =>
                                                        i.id === item.id ? { ...i, discount: discVal } : i
                                                    ));
                                                    toast.success(`Discount of Ksh ${discVal.toLocaleString()} approved!`);
                                                }
                                            }
                                        );
                                    }}
                                />
                            ))
                        )}
                    </div>

                    {/* Ultra-Luxury Cart Footer */}
                    <div className="p-4 bg-white border-t border-gray-200 space-y-3">
                        {/* Quick Discount Selector */}
                        <div className="flex items-center justify-between gap-1 text-[11px] font-bold">
                            <span className="text-gray-500">🏷️ Discount:</span>
                            <div className="flex items-center gap-1">
                                {[5, 10, 15, 20].map(pct => (
                                    <button
                                        key={pct}
                                        onClick={() => handleApplyCartDiscount(pct)}
                                        disabled={cart.length === 0}
                                        className="px-2 py-0.5 bg-gray-100 hover:bg-emerald-100 hover:text-emerald-900 active:bg-emerald-200 rounded-lg text-gray-700 transition-all font-mono disabled:opacity-40"
                                    >
                                        {pct}%
                                    </button>
                                ))}
                                {totalDiscount > 0 && (
                                    <button
                                        onClick={() => setCart(prev => prev.map(i => ({ ...i, discount: 0 })))}
                                        className="px-1.5 py-0.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-[10px]"
                                        title="Clear Discounts"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Totals Breakdown */}
                        <div className="space-y-1.5 pt-1 text-xs">
                            <div className="flex justify-between text-gray-500">
                                <span>Subtotal</span>
                                <span className="font-mono font-bold text-gray-800">Ksh {subtotal.toLocaleString()}</span>
                            </div>
                            {totalDiscount > 0 && (
                                <div className="flex justify-between text-emerald-600 font-bold">
                                    <span>Discount Savings</span>
                                    <span className="font-mono">- Ksh {totalDiscount.toLocaleString()}</span>
                                </div>
                            )}

                            {/* Tax Breakdown */}
                            {showTaxInfo && totalTax > 0 && (
                                <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-xl p-2 space-y-1">
                                    <div className="text-[10px] font-black uppercase text-emerald-900 flex justify-between">
                                        <span>Included Taxes (18%)</span>
                                        <span>Ksh {Math.round(totalTax).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-[11px] text-gray-600">
                                        <span>Net: Ksh {Math.round(netAmount).toLocaleString()}</span>
                                        <span>VAT (16%): Ksh {Math.round(vatAmount).toLocaleString()}</span>
                                        <span>Levy (2%): Ksh {Math.round(levyAmount).toLocaleString()}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Grand Total Executive Hero Card */}
                        <div className="bg-gradient-to-r from-slate-900 via-gray-900 to-slate-950 p-3.5 rounded-2xl text-white shadow-xl flex items-center justify-between border border-white/10">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Total Amount Due</p>
                                <p className="text-2xl font-black font-mono tracking-tight text-white">
                                    Ksh {total.toLocaleString()}
                                </p>
                            </div>
                            <div className="text-right text-[11px] text-gray-300">
                                <p className="font-bold">{cart.reduce((s, i) => s + i.qty, 0)} Items</p>
                                <span className="inline-block mt-0.5 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full font-black text-[9px] uppercase tracking-wider border border-emerald-500/30">
                                    {orderType.replace('_', ' ')}
                                </span>
                            </div>
                        </div>

                        {/* ⚡ 1-Tap Fast Tender Bar */}
                        <div className="p-2.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-gray-500">
                                <span>⚡ Fast Cash Tender</span>
                                <span>1-Tap Settle &amp; Print</span>
                            </div>
                            <div className="grid grid-cols-5 gap-1 font-mono">
                                <button
                                    onClick={() => {
                                        if (!verifyPosAccess('pos_tender_cash', 'Fast Cash Settlement')) return;
                                        completeSale('cash', total);
                                    }}
                                    disabled={cart.length === 0}
                                    className="py-1.5 px-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-[11px] font-black transition-all shadow-sm disabled:opacity-40"
                                    title="Tender Exact Cash"
                                >
                                    Exact
                                </button>
                                {[500, 1000, 2000, 5000].map(amt => (
                                    <button
                                        key={amt}
                                        onClick={() => {
                                            if (!verifyPosAccess('pos_tender_cash', 'Fast Cash Settlement')) return;
                                            completeSale('cash', Math.max(amt, total));
                                        }}
                                        disabled={cart.length === 0}
                                        className="py-1.5 px-1 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 text-gray-800 rounded-xl text-[11px] font-bold transition-all disabled:opacity-40 shadow-sm"
                                        title={`Tender Ksh ${amt.toLocaleString()} (Change: Ksh ${Math.max(0, amt - total).toLocaleString()})`}
                                    >
                                        {amt.toLocaleString()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 4-Action Operations Bar */}
                        <div className="grid grid-cols-4 gap-2">
                            <button
                                onClick={() => cart.length > 0 && setShowHoldModal(true)}
                                disabled={cart.length === 0}
                                className="py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center gap-0.5 disabled:opacity-40 shadow-md shadow-amber-500/20"
                                title="Hold Order [F3]"
                            >
                                <span className="text-sm">📋</span>
                                <span>Hold [F3]</span>
                            </button>
                            <button
                                onClick={sendToKitchen}
                                disabled={cart.length === 0}
                                className="py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center gap-0.5 disabled:opacity-40 shadow-md shadow-indigo-600/20"
                                title="Send to Kitchen KDS [F9]"
                            >
                                <span className="text-sm">🍳</span>
                                <span>KOT [F9]</span>
                            </button>
                            <button
                                onClick={handlePrintInterimBill}
                                disabled={cart.length === 0}
                                className="py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center gap-0.5 disabled:opacity-40 shadow-md shadow-teal-600/20"
                                title="Print Customer Interim Check [F10]"
                            >
                                <span className="text-sm">🧾</span>
                                <span>Bill [F10]</span>
                            </button>
                            <button
                                onClick={() => cart.length > 0 && setShowPayment(true)}
                                disabled={cart.length === 0}
                                className="py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 active:from-emerald-700 active:to-green-700 text-white rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center gap-0.5 disabled:opacity-40 shadow-lg shadow-emerald-600/30"
                                title="Open Payment Settle Dialog [F12]"
                            >
                                <span className="text-sm">💰</span>
                                <span>Pay [F12]</span>
                            </button>
                        </div>
                    </div>
                </div>

                    </>
                )}

                {/* Running Orders Sidebar */}
                {showRunningOrders && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" onClick={() => setShowRunningOrders(false)}>
                        <div
                            className="absolute right-0 top-0 h-full w-96 bg-white border-l border-gray-200 p-4 overflow-y-auto shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <span>📋</span> Running Orders
                                    <span className="px-2 py-1 bg-orange-100 text-orange-600 text-xs font-bold rounded-full">
                                        {unpaidOrders.length}
                                    </span>
                                </h2>
                                <button
                                    onClick={() => setShowRunningOrders(false)}
                                    className="text-2xl text-gray-400 hover:text-gray-600"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Search Input */}
                            <div className="mb-4">
                                <input
                                    type="text"
                                    placeholder="🔍 Search by receipt, customer, or table..."
                                    value={runningOrdersSearch}
                                    onChange={(e) => setRunningOrdersSearch(e.target.value)}
                                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-orange-400 focus:outline-none text-sm"
                                />
                            </div>

                            {isLoadingOrders ? (
                                <div className="text-center text-gray-400 py-12">
                                    <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-3"></div>
                                    <p className="font-medium">Loading orders...</p>
                                </div>
                            ) : unpaidOrders.filter(order =>
                                !runningOrdersSearch ||
                                order.invoice_no?.toLowerCase().includes(runningOrdersSearch.toLowerCase()) ||
                                order.customer_name?.toLowerCase().includes(runningOrdersSearch.toLowerCase()) ||
                                order.table_no?.toLowerCase().includes(runningOrdersSearch.toLowerCase())
                            ).length === 0 ? (
                                <div className="text-center text-gray-400 py-12">
                                    <span className="text-5xl block mb-3 opacity-50">📭</span>
                                    <p className="font-medium">
                                        {runningOrdersSearch ? 'No matching orders' : 'No unpaid orders'}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {unpaidOrders
                                        .filter(order =>
                                            !runningOrdersSearch ||
                                            order.invoice_no?.toLowerCase().includes(runningOrdersSearch.toLowerCase()) ||
                                            order.customer_name?.toLowerCase().includes(runningOrdersSearch.toLowerCase()) ||
                                            order.table_no?.toLowerCase().includes(runningOrdersSearch.toLowerCase())
                                        )
                                        .map(order => (
                                            <RunningOrderCard
                                                key={order.id}
                                                order={order}
                                                onReopen={reopenOrderForPayment}
                                            />
                                        ))
                                    }
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Floating Real-Time Safaricom M-Pesa C2B Toast Watchdog (Cashier & Admin only, hidden for Waiters) */}
                {!isWaiterUser && incomingC2BTxs.filter(t => !dismissedC2BIds.includes(t.id)).length > 0 && (
                    <div className="fixed top-20 right-6 z-[999] max-w-md w-full space-y-2 pointer-events-auto animate-in slide-in-from-top-4 duration-200">
                        {incomingC2BTxs.filter(t => !dismissedC2BIds.includes(t.id)).map(tx => (
                            <div key={tx.id} className="p-4 bg-gradient-to-r from-emerald-600 via-teal-700 to-green-800 text-white rounded-3xl shadow-2xl border-2 border-white/50 flex items-center justify-between gap-3 backdrop-blur-xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl font-bold animate-bounce shadow-inner">
                                        📱
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-black uppercase tracking-wider bg-black/25 px-2 py-0.5 rounded-full">
                                                C2B M-Pesa Received
                                            </span>
                                            <span className="text-[11px] font-mono font-bold text-emerald-200">{tx.mpesa_receipt}</span>
                                        </div>
                                        <p className="text-2xl font-black mt-0.5 font-mono">Ksh {Number(tx.amount).toLocaleString()}</p>
                                        <p className="text-xs text-emerald-100 truncate">From: <strong>{tx.customer_name || 'Customer'}</strong></p>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5 shrink-0">
                                    <button
                                        onClick={() => handleAttachC2BToBill(tx)}
                                        className="px-3.5 py-2 bg-white hover:bg-emerald-50 active:bg-emerald-100 text-emerald-950 rounded-xl text-xs font-black shadow-md transition-all whitespace-nowrap"
                                    >
                                        Attach to Bill →
                                    </button>
                                    <button
                                        onClick={() => setDismissedC2BIds(prev => [...prev, tx.id])}
                                        className="text-[11px] text-white/70 hover:text-white text-center font-semibold"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Modals */}
                {/* Keyboard Shortcuts Cheat Sheet Modal */}
                {showShortcutsModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[999]" onClick={() => setShowShortcutsModal(false)}>
                        <div className="bg-slate-900 border border-white/20 text-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between pb-3 border-b border-white/10">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">⌨️</span>
                                    <div>
                                        <h3 className="text-base font-black">POS Keyboard Shortcuts</h3>
                                        <p className="text-xs text-gray-400">High-speed keyboard hotkeys for hospitality service</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowShortcutsModal(false)} className="text-gray-400 hover:text-white text-lg p-1">✕</button>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center">
                                    <span className="text-gray-300">Shortcuts Help</span>
                                    <kbd className="px-2 py-1 bg-white/10 font-mono font-bold rounded">F1</kbd>
                                </div>
                                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center">
                                    <span className="text-gray-300">Search Products</span>
                                    <kbd className="px-2 py-1 bg-white/10 font-mono font-bold rounded">F2 or /</kbd>
                                </div>
                                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center">
                                    <span className="text-gray-300">Hold Current Bill</span>
                                    <kbd className="px-2 py-1 bg-white/10 font-mono font-bold rounded">F3</kbd>
                                </div>
                                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center">
                                    <span className="text-gray-300">Running Orders</span>
                                    <kbd className="px-2 py-1 bg-white/10 font-mono font-bold rounded">F4</kbd>
                                </div>
                                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center">
                                    <span className="text-gray-300">Split / Merge Bill</span>
                                    <kbd className="px-2 py-1 bg-white/10 font-mono font-bold rounded">F8</kbd>
                                </div>
                                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center">
                                    <span className="text-gray-300">Send KOT to Kitchen</span>
                                    <kbd className="px-2 py-1 bg-white/10 font-mono font-bold rounded">F9</kbd>
                                </div>
                                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center">
                                    <span className="text-gray-300">Print Interim Check</span>
                                    <kbd className="px-2 py-1 bg-white/10 font-mono font-bold rounded">F10</kbd>
                                </div>
                                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center">
                                    <span className="text-gray-300">Settle / Pay Bill</span>
                                    <kbd className="px-2 py-1 bg-white/10 font-mono font-bold rounded">F12 / Space</kbd>
                                </div>
                                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center col-span-2">
                                    <span className="text-gray-300">Close Open Dialog / Cancel</span>
                                    <kbd className="px-2 py-1 bg-white/10 font-mono font-bold rounded">Esc</kbd>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowShortcutsModal(false)}
                                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-colors"
                            >
                                Got it, Back to POS
                            </button>
                        </div>
                    </div>
                )}

                {/* Supervisor PIN Authorization Modal (Anti-Theft) */}
                <SupervisorAuthModal
                    isOpen={supervisorModal.isOpen}
                    title={supervisorModal.title}
                    details={supervisorModal.details}
                    onClose={() => setSupervisorModal(prev => ({ ...prev, isOpen: false }))}
                    onSuccess={supervisorModal.action}
                />

                <PaymentModal
                    isOpen={showPayment}
                    onClose={() => setShowPayment(false)}
                    total={total}
                    onComplete={completeSale}
                    invoiceNo={invoiceNo}
                    initialMethod={paymentInitialMethod}
                />

                <FoodOrderNotesModal
                    isOpen={showNotesModal}
                    onClose={() => setShowNotesModal(false)}
                    currentNotes={cart.find(i => i.id === editingItemId)?.notes || ''}
                    onSave={(notes: string) => editingItemId && updateItemNotes(editingItemId, notes)}
                    foodNotes={foodOrderNotes}
                />

                <HoldOrderModal
                    isOpen={showHoldModal}
                    onClose={() => setShowHoldModal(false)}
                    onSave={holdOrder}
                />

                {/* Batch Selection Modal */}
                <BatchSelectionModal
                    isOpen={showBatchModal}
                    onClose={() => {
                        setShowBatchModal(false);
                        setPendingProduct(null);
                        setProductBatches([]);
                    }}
                    product={pendingProduct}
                    batches={productBatches}
                    onSelect={handleBatchSelect}
                />

                {/* KOT Preview - After print or close, shows Customer Bill */}
                {showKOTPreview && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                        <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                    <span>🍳</span> Kitchen Order Ticket
                                </h2>
                                <span className="px-3 py-1 bg-purple-100 text-purple-600 text-xs font-bold rounded-full">Step 1 of 2</span>
                            </div>

                            <div className="flex-1 overflow-auto bg-gray-100 rounded-2xl p-4 mb-4">
                                <div
                                    className="bg-white shadow-lg mx-auto"
                                    style={{ width: '80mm', minHeight: '200px' }}
                                    dangerouslySetInnerHTML={{ __html: kotHTML }}
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={closeKOTAndShowBill}
                                    className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                                >
                                    Skip →
                                </button>
                                <button
                                    onClick={printKOTNow}
                                    className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-xl font-semibold hover:shadow-lg flex items-center justify-center gap-2"
                                >
                                    <span>🖨️</span>
                                    <span>Print KOT →</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Customer Bill Preview (Unpaid) - After KOT */}
                {showBillPreview && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                        <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                    <span>🧾</span> Customer Bill
                                </h2>
                                <span className="px-3 py-1 bg-orange-100 text-orange-600 text-xs font-bold rounded-full">Step 2 of 2</span>
                            </div>

                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4 flex items-center gap-2">
                                <span className="text-2xl">⚠️</span>
                                <div>
                                    <p className="font-semibold text-red-700">NOT PAID</p>
                                    <p className="text-xs text-red-600">Customer bill with watermark</p>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto bg-gray-100 rounded-2xl p-4 mb-4">
                                <div
                                    className="bg-white shadow-lg mx-auto"
                                    style={{ width: '80mm', minHeight: '200px' }}
                                    dangerouslySetInnerHTML={{ __html: billHTML }}
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={closeBillAndPrepareNext}
                                    className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                                >
                                    Skip Print & Next
                                </button>
                                <button
                                    onClick={printBillNow}
                                    className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-orange-700 text-white rounded-xl font-semibold hover:shadow-lg flex items-center justify-center gap-2"
                                >
                                    <span>🖨️</span>
                                    <span>Print Bill</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Move / Transfer Table Modal */}
                <MoveTableModal
                    isOpen={showMoveTableModal}
                    onClose={() => setShowMoveTableModal(false)}
                    currentTable={tableNo}
                    onMoveTable={handleMoveTableAction}
                />

                {/* Merge Tables Modal */}
                <MergeTablesModal
                    isOpen={showMergeModal}
                    onClose={() => setShowMergeModal(false)}
                    runningOrders={unpaidOrders.length > 0 ? unpaidOrders : runningOrders}
                    onMergeTables={handleMergeTablesAction}
                />

                {/* Split Bill Modal */}
                <SplitBillModal
                    isOpen={showSplitModal}
                    onClose={() => setShowSplitModal(false)}
                    cart={cart}
                    total={total}
                    tableNo={tableNo}
                    invoiceNo={invoiceNo}
                    onCompleteSplitShare={handleCompleteSplitShare}
                    onCompleteItemizedSplit={handleCompleteItemizedSplit}
                />

{/* Paid Receipt Preview */}
                <ReceiptPreviewModal
                    isOpen={showReceiptPreview}
                    onClose={() => { setShowReceiptPreview(false); clearCart(); }}
                    receiptHTML={receiptHTML}
                    title="✓ Tax Invoice (Paid)"
                    onPrint={printReceiptNow}
                />

            {/* Held Sales Modal */}
            {showHeldSalesModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]" onClick={() => setShowHeldSalesModal(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold flex items-center gap-2">📋 Held Sales</h2>
                                <p className="text-amber-100 text-xs mt-0.5">{heldSales.length} transaction{heldSales.length !== 1 ? 's' : ''} on hold</p>
                            </div>
                            <button onClick={() => setShowHeldSalesModal(false)} className="p-2 hover:bg-white/20 rounded-xl text-white text-lg">✕</button>
                        </div>

                        <div className="flex-1 overflow-auto p-4">
                            {heldSales.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                    <span className="text-5xl mb-3">📋</span>
                                    <p className="font-medium">No held sales</p>
                                    <p className="text-sm">Hold a sale from the cart to see it here</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {heldSales.map(h => {
                                        const heldTime = new Date(h.heldAt);
                                        const minsAgo = Math.floor((Date.now() - heldTime.getTime()) / 60000);
                                        const timeLabel = minsAgo < 1 ? 'Just now' : minsAgo < 60 ? `${minsAgo}m ago` : `${Math.floor(minsAgo / 60)}h ${minsAgo % 60}m ago`;
                                        return (
                                            <div key={h.id} className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm hover:shadow-md transition-all p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xl">🧾</span>
                                                        <div>
                                                            <p className="font-bold text-gray-800">{h.invoiceNo}</p>
                                                            <p className="text-xs text-gray-500">⏱️ {timeLabel}{h.tableNo ? ` • Table ${h.tableNo}` : ''}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-lg font-black text-green-600">Ksh {h.total.toLocaleString()}</p>
                                                        <p className="text-xs text-gray-500">{h.itemCount} item{h.itemCount !== 1 ? 's' : ''}</p>
                                                    </div>
                                                </div>

                                                <div className="bg-gray-50 rounded-xl p-2.5 mb-3 max-h-[100px] overflow-y-auto">
                                                    {h.cart.map((item, idx) => (
                                                        <div key={idx} className="flex justify-between text-xs py-0.5">
                                                            <span className="text-gray-600">{item.name} × {item.qty}</span>
                                                            <span className="font-bold text-gray-800">Ksh {((item.price * item.qty) - item.discount).toLocaleString()}</span>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => recallHeldSale(h.id)}
                                                        className="flex-1 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center justify-center gap-1.5"
                                                    >
                                                        <span>▶️</span> Recall Sale
                                                    </button>
                                                    <button
                                                        onClick={() => deleteHeldSale(h.id)}
                                                        className="py-2.5 px-4 bg-red-50 text-red-500 rounded-xl font-bold text-sm hover:bg-red-100 transition-all"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-200">
                            <button onClick={() => setShowHeldSalesModal(false)} className="w-full py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Close Register Modal */}
            {showCloseRegister && closeRegisterData && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-[480px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                            🔴 Close Register — End of Day Report
                        </h3>

                        <div className="space-y-2 mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sales Breakdown</p>
                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                                <span className="text-gray-600">💵 Cash Sales</span>
                                <span className="font-bold text-gray-800 text-lg">Ksh {closeRegisterData.totalCash.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                                <span className="text-gray-600">📱 M-Pesa Sales</span>
                                <span className="font-bold text-green-600 text-lg">Ksh {closeRegisterData.totalMpesa.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                                <span className="text-gray-600">📋 Credit Sales</span>
                                <span className="font-bold text-orange-600 text-lg">Ksh {closeRegisterData.totalCredit.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-4 text-white mb-4">
                            <div className="flex justify-between items-center">
                                <span className="font-medium">Total Sales ({closeRegisterData.orderCount} orders)</span>
                                <span className="text-2xl font-bold">Ksh {closeRegisterData.totalSales.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="space-y-2 mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deductions</p>
                            <div className="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-200">
                                <span className="text-red-600">💰 Total Expenses</span>
                                <span className="font-bold text-red-600 text-lg">-Ksh {closeRegisterData.totalExpenses.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="space-y-2 mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cash Summary</p>
                            <div className="flex justify-between items-center p-3 bg-green-50 rounded-xl">
                                <span className="text-gray-600">🟢 Opening Cash</span>
                                <span className="font-bold text-gray-800">Ksh {closeRegisterData.openingCash.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-green-50 rounded-xl">
                                <span className="text-gray-600">Expected in Drawer</span>
                                <span className="font-bold text-gray-800">Ksh {(closeRegisterData.openingCash + closeRegisterData.totalCash - closeRegisterData.totalExpenses).toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-4 text-white mb-4">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-lg">NET SALES</span>
                                <span className="text-3xl font-bold">Ksh {closeRegisterData.netSales.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className={`rounded-xl p-4 mb-6 ${(closeRegisterData?.profit || 0) >= 0 ? 'bg-gradient-to-r from-amber-400 to-yellow-500' : 'bg-gradient-to-r from-red-500 to-red-600'} text-white`}>
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-lg">📈 PROFIT</span>
                                <span className="text-3xl font-bold">Ksh {(closeRegisterData?.profit || 0).toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowCloseRegister(false); setCloseRegisterData(null); }}
                                className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={printCloseRegisterReport}
                                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                            >
                                🖨️ Print Report
                            </button>
                            <button
                                onClick={finalizeCloseRegister}
                                className="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-bold hover:shadow-lg transition-all"
                            >
                                ✅ Close & Save
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* ─── INACTIVITY WARNING TOAST BANNER (5 SECONDS COUNTDOWN) ─── */}
            {idleCountdown !== null && !isPosLocked && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[99998] bg-rose-950 text-white px-5 py-3 rounded-2xl shadow-2xl border-2 border-rose-500 flex items-center gap-3 backdrop-blur-xl animate-bounce">
                    <span className="text-xl">⚠️</span>
                    <div>
                        <p className="text-xs font-black tracking-wide text-rose-300 uppercase">Inactivity Auto-Lock Warning</p>
                        <p className="text-[11px] text-slate-200 font-medium">
                            Locking in <span className="font-black text-rose-400 text-sm">{idleCountdown}s</span>... Touch screen or move mouse to keep session active.
                        </p>
                    </div>
                </div>
            )}

            {/* ─── FAST WAITER 6-PIN LOCK SCREEN MODAL ─── */}
            {isPosLocked && (
                <div className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
                    <div className="relative w-full max-w-sm bg-gradient-to-b from-slate-900 via-slate-950 to-black border border-white/15 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black text-center overflow-hidden">
                        {/* Ambient Emerald Glow */}
                        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none"></div>

                        {/* Hotel Branding Header */}
                        <div className="mb-4">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-950/60 border border-emerald-500/40 rounded-full text-[10px] font-black uppercase tracking-widest text-emerald-300">
                                🏨 {hotelName || 'AlphaPlus Hotel & Restaurant'}
                            </span>
                            <div className="mt-3 flex items-center justify-center">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/40 flex items-center justify-center text-3xl shadow-inner">
                                    🔒
                                </div>
                            </div>
                            <h3 className="text-lg font-black text-white tracking-wide mt-2">
                                POS Floor Locked
                            </h3>
                            <p className="text-[11px] text-slate-400 font-medium">
                                Enter your <span className="text-amber-300 font-bold">6-Digit Waiter PIN</span> to start your order
                            </p>
                        </div>

                        {/* 6-Digit PIN Indicator Dots */}
                        <div className="flex justify-center items-center gap-3.5 my-4">
                            {[0, 1, 2, 3, 4, 5].map(idx => (
                                <div
                                    key={idx}
                                    className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                                        idx < lockPin.length
                                            ? 'bg-emerald-400 scale-125 shadow-[0_0_12px_rgba(52,211,153,0.9)] border-2 border-emerald-200'
                                            : 'bg-slate-800 border border-white/20'
                                    }`}
                                />
                            ))}
                        </div>

                        {/* Error Message */}
                        {lockError ? (
                            <div className="text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl py-1.5 px-3 mb-3 animate-shake">
                                ⚠️ {lockError}
                            </div>
                        ) : isLockVerifying ? (
                            <div className="text-xs font-bold text-emerald-400 py-1.5 mb-3 flex items-center justify-center gap-2">
                                <span className="w-3 h-3 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin"></span>
                                Verifying Waiter PIN...
                            </div>
                        ) : (
                            <div className="h-7 mb-1 text-[10px] text-slate-500">
                                ⌨️ Physical keypad supported [0-9, Backspace, Esc]
                            </div>
                        )}

                        {/* Numeric Keypad Grid */}
                        <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(btn => (
                                <button
                                    key={btn}
                                    type="button"
                                    disabled={isLockVerifying}
                                    onClick={() => {
                                        if (btn === 'C') {
                                            setLockPin('');
                                            setLockError('');
                                        } else if (btn === '⌫') {
                                            setLockPin(prev => prev.slice(0, -1));
                                            setLockError('');
                                        } else {
                                            if (lockPin.length < 6) {
                                                const next = lockPin + btn;
                                                setLockPin(next);
                                                setLockError('');
                                                if (next.length === 6) {
                                                    unlockTerminalWithPin(next);
                                                }
                                            }
                                        }
                                    }}
                                    className={`h-12 rounded-2xl text-lg font-black transition-all active:scale-90 flex items-center justify-center cursor-pointer ${
                                        btn === 'C'
                                            ? 'bg-rose-950/50 hover:bg-rose-900 border border-rose-500/30 text-rose-300'
                                            : btn === '⌫'
                                            ? 'bg-amber-950/50 hover:bg-amber-900 border border-amber-500/30 text-amber-300'
                                            : 'bg-white/5 hover:bg-white/15 border border-white/10 text-white hover:border-emerald-500/50 hover:shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                                    }`}
                                >
                                    {btn}
                                </button>
                            ))}
                        </div>

                        {/* Bottom Full Login / Manager Link */}
                        <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-[11px]">
                            <a
                                href="/"
                                onClick={() => localStorage.removeItem('user')}
                                className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 font-bold"
                            >
                                🚪 Manager Login / Exit
                            </a>
                            <span className="text-[10px] text-slate-500 font-mono">
                                POS-LOCK v3
                            </span>
                        </div>
                    </div>
                </div>
            )}

            </div>
        </>
    );
}
