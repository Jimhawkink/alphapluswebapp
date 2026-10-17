'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface StoreItem {
  pid: number;
  product_code: string;
  product_name: string;
  category: string;
  current_stock: number;
  base_unit: string;
  purchase_unit: string;
  reorder_point: number;
  cost_per_base_unit: number;
  supplier_name: string;
  purchase_cost: number;
  pack_size: number;
}

interface IssueRequest {
  id: number;
  request_no: string;
  requested_by: string;
  requested_at: string;
  issued_to: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Issued';
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  items: IssueRequestItem[];
}

interface IssueRequestItem {
  id?: number;
  request_id?: number;
  pid: number;
  product_name: string;
  base_unit: string;
  requested_qty: number;
  approved_qty: number | null;
  issued_qty: number | null;
  current_stock: number;
}

interface PurchaseArrival {
  purchase_id: number;
  purchase_no: string;
  purchase_date: string;
  supplier_name: string;
  grand_total: number;
  status: string;
  items: PurchaseArrivalItem[];
}

interface PurchaseArrivalItem {
  pp_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit: string;
  rate: number;
  total_amount: number;
}

const KITCHENS = ['Main Kitchen', 'Bar', 'Butchery', 'Pastry Section', 'Rooftop Kitchen', 'Cold Room', 'Staff Kitchen'];
const TABS = ['🏪 Store Stock', '📋 Issue to Kitchen', '✅ Approvals', '📦 Purchases Received', '📜 Issue History'] as const;
type Tab = typeof TABS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StockBadge({ qty, reorder }: { qty: number; reorder: number }) {
  if (qty <= 0) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">OUT</span>;
  if (qty <= reorder) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">LOW</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">OK</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Pending: 'bg-amber-100 text-amber-700 border-amber-200',
    Approved: 'bg-blue-100 text-blue-700 border-blue-200',
    Issued: 'bg-green-100 text-green-700 border-green-200',
    Rejected: 'bg-red-100 text-red-700 border-red-200',
  };
  const icons: Record<string, string> = { Pending: '⏳', Approved: '✅', Issued: '📦', Rejected: '❌' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${map[status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {icons[status]} {status}
    </span>
  );
}

export default function StoresPage() {
  const [activeTab, setActiveTab] = useState<Tab>('🏪 Store Stock');
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [issueRequests, setIssueRequests] = useState<IssueRequest[]>([]);
  const [purchases, setPurchases] = useState<PurchaseArrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [categories, setCategories] = useState<string[]>([]);

  // Issue form
  const [issueKitchen, setIssueKitchen] = useState(KITCHENS[0]);
  const [issueNote, setIssueNote] = useState('');
  const [issueItems, setIssueItems] = useState<IssueRequestItem[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addSelected, setAddSelected] = useState<StoreItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Approval
  const [selectedRequest, setSelectedRequest] = useState<IssueRequest | null>(null);
  const [approvalFilter, setApprovalFilter] = useState<'Pending' | 'All'>('Pending');

  // History
  const [historyFilter, setHistoryFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  // Current user
  const [currentUser, setCurrentUser] = useState('Manager');

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) { try { setCurrentUser(JSON.parse(u).name || JSON.parse(u).user_name || 'Manager'); } catch {} }
  }, []);

  // ─── Load store stock ──────────────────────────────────────────────────────
  const loadStock = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products_ingredients')
        .select('pid,product_code,product_name,category,current_stock,base_unit,purchase_unit,reorder_point,cost_per_base_unit,supplier_name,purchase_cost,pack_size')
        .eq('active', true)
        .order('product_name');
      if (error) throw error;
      const items = (data || []).map((d: any) => ({ ...d, current_stock: d.current_stock || 0 }));
      setStoreItems(items);
      const cats = Array.from(new Set(items.map((i: StoreItem) => i.category).filter(Boolean))) as string[];
      setCategories(cats);
    } catch { toast.error('Failed to load store stock'); }
    setLoading(false);
  }, []);

  // ─── Load issue requests ───────────────────────────────────────────────────
  const loadRequests = useCallback(async () => {
    try {
      let q = supabase
        .from('store_issue_requests')
        .select('*')
        .order('requested_at', { ascending: false })
        .limit(100);
      if (approvalFilter === 'Pending') q = q.eq('status', 'Pending');
      const { data: reqs, error } = await q;
      if (error) throw error;
      // Load items for each request
      const reqIds = (reqs || []).map((r: any) => r.id);
      let itemsMap: Record<number, IssueRequestItem[]> = {};
      if (reqIds.length > 0) {
        const { data: items } = await supabase
          .from('store_issue_request_items')
          .select('*')
          .in('request_id', reqIds);
        (items || []).forEach((item: any) => {
          if (!itemsMap[item.request_id]) itemsMap[item.request_id] = [];
          itemsMap[item.request_id].push(item);
        });
      }
      setIssueRequests((reqs || []).map((r: any) => ({ ...r, items: itemsMap[r.id] || [] })));
    } catch { toast.error('Failed to load issue requests'); }
  }, [approvalFilter]);

  // ─── Load purchases received ───────────────────────────────────────────────
  const loadPurchases = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('purchases')
        .select('purchase_id,purchase_no,purchase_date,supplier_name,grand_total,status')
        .order('purchase_id', { ascending: false })
        .limit(50);
      if (error) throw error;
      const pIds = (data || []).map((p: any) => p.purchase_id);
      let itemsMap: Record<number, PurchaseArrivalItem[]> = {};
      if (pIds.length > 0) {
        const { data: pitems } = await supabase
          .from('purchase_products')
          .select('pp_id,product_id,product_name,quantity,unit,rate,total_amount,purchase_id')
          .in('purchase_id', pIds);
        (pitems || []).forEach((item: any) => {
          if (!itemsMap[item.purchase_id]) itemsMap[item.purchase_id] = [];
          itemsMap[item.purchase_id].push(item);
        });
      }
      setPurchases((data || []).map((p: any) => ({ ...p, items: itemsMap[p.purchase_id] || [] })));
    } catch { toast.error('Failed to load purchases'); }
  }, []);

  useEffect(() => { loadStock(); loadRequests(); loadPurchases(); }, [loadStock, loadRequests, loadPurchases]);

  // ─── Generate request number ───────────────────────────────────────────────
  const genRequestNo = () => `SIR-${Date.now().toString().slice(-6)}`;

  // ─── Submit issue request ──────────────────────────────────────────────────
  const submitIssueRequest = async () => {
    if (issueItems.length === 0) { toast.error('Add at least one item'); return; }
    setIsSaving(true);
    try {
      const reqNo = genRequestNo();
      const { data: req, error: reqErr } = await supabase
        .from('store_issue_requests')
        .insert({ request_no: reqNo, requested_by: currentUser, issued_to: issueKitchen, status: 'Pending', notes: issueNote || null })
        .select()
        .single();
      if (reqErr) throw reqErr;
      const itemRows = issueItems.map(i => ({
        request_id: req.id, pid: i.pid, product_name: i.product_name,
        base_unit: i.base_unit, requested_qty: i.requested_qty,
        approved_qty: null, issued_qty: null, current_stock: i.current_stock
      }));
      const { error: itemErr } = await supabase.from('store_issue_request_items').insert(itemRows);
      if (itemErr) throw itemErr;
      toast.success(`✅ Issue request ${reqNo} submitted — awaiting manager approval`);
      setIssueItems([]); setIssueNote(''); setIssueKitchen(KITCHENS[0]);
      loadRequests();
    } catch (e: any) { toast.error(`Failed: ${e.message}`); }
    setIsSaving(false);
  };

  // ─── Approve / Reject ──────────────────────────────────────────────────────
  const approveRequest = async (req: IssueRequest, approved: boolean) => {
    setIsSaving(true);
    try {
      const status = approved ? 'Approved' : 'Rejected';
      const { error } = await supabase
        .from('store_issue_requests')
        .update({ status, approved_by: currentUser, approved_at: new Date().toISOString() })
        .eq('id', req.id);
      if (error) throw error;
      toast.success(approved ? `✅ Request ${req.request_no} Approved` : `❌ Request ${req.request_no} Rejected`);
      setSelectedRequest(null); loadRequests();
    } catch (e: any) { toast.error(`Failed: ${e.message}`); }
    setIsSaving(false);
  };

  // ─── Issue (deduct stock) ──────────────────────────────────────────────────
  const issueStock = async (req: IssueRequest) => {
    setIsSaving(true);
    try {
      // Update each item's current_stock
      for (const item of req.items) {
        const qty = item.approved_qty ?? item.requested_qty;
        const { data: ing } = await supabase.from('products_ingredients').select('current_stock').eq('pid', item.pid).single();
        const newStock = Math.max(0, (ing?.current_stock || 0) - qty);
        await supabase.from('products_ingredients').update({ current_stock: newStock }).eq('pid', item.pid);
        // Log movement
        await supabase.from('stock_movements').insert({
          movement_date: new Date().toISOString().split('T')[0],
          product_id: item.pid, product_name: item.product_name,
          movement_type: 'Issue', quantity: qty, unit: item.base_unit,
          reference_no: req.request_no, reference_type: 'Kitchen Issue',
          reason: `Issued to ${req.issued_to}`, created_by: currentUser
        });
        // Update issued_qty on the item
        await supabase.from('store_issue_request_items')
          .update({ issued_qty: qty }).eq('request_id', req.id).eq('pid', item.pid);
      }
      await supabase.from('store_issue_requests').update({ status: 'Issued' }).eq('id', req.id);
      toast.success(`📦 Stock issued to ${req.issued_to}!`);
      setSelectedRequest(null); loadStock(); loadRequests();
    } catch (e: any) { toast.error(`Failed: ${e.message}`); }
    setIsSaving(false);
  };

  // ─── Filtered stock ────────────────────────────────────────────────────────
  const filteredStock = storeItems.filter(i => {
    const matchSearch = !search || i.product_name.toLowerCase().includes(search.toLowerCase()) || (i.product_code || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === 'All' || i.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const pendingCount = issueRequests.filter(r => r.status === 'Pending').length;
  const lowStockCount = storeItems.filter(i => i.current_stock <= i.reorder_point && i.current_stock > 0).length;
  const outCount = storeItems.filter(i => i.current_stock <= 0).length;
  const totalValue = storeItems.reduce((s, i) => s + (i.current_stock * (i.cost_per_base_unit || 0)), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏪</span>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Stores Management</h1>
            <p className="text-xs text-gray-500">Inventory control · Issue to kitchen · Manager approval</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { loadStock(); loadRequests(); loadPurchases(); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
            🔄 Refresh
          </button>
          <a href="/dashboard/purchase" className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all">
            + New Purchase
          </a>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Items', value: storeItems.length, icon: '📦', color: 'bg-blue-50 border-blue-100', textColor: 'text-blue-700' },
          { label: 'Store Value', value: `Ksh ${Math.round(totalValue).toLocaleString()}`, icon: '💰', color: 'bg-emerald-50 border-emerald-100', textColor: 'text-emerald-700' },
          { label: 'Low Stock', value: lowStockCount, icon: '⚠️', color: 'bg-amber-50 border-amber-100', textColor: 'text-amber-700' },
          { label: 'Out of Stock', value: outCount, icon: '🔴', color: 'bg-red-50 border-red-100', textColor: 'text-red-700' },
        ].map(s => (
          <div key={s.label} className={`${s.color} border rounded-xl p-3 flex items-center gap-3`}>
            <span className="text-2xl">{s.icon}</span>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{s.label}</p>
              <p className={`text-lg font-extrabold ${s.textColor}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all relative ${activeTab === tab ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {tab}
            {tab === '✅ Approvals' && pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: STORE STOCK ────────────────────────────────────────────────── */}
      {activeTab === '🏪 Store Stock' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Filters */}
          <div className="p-3 border-b border-gray-100 bg-gray-50 flex gap-2 items-center">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search ingredient, code..." className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 bg-white" />
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="All">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">{filteredStock.length} items</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mr-3" />
              Loading store inventory...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Code', 'Ingredient / Item', 'Category', 'In Store', 'Unit', 'Reorder Pt', 'Cost/Unit', 'Stock Value', 'Supplier', 'Status'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider font-bold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredStock.map(item => (
                    <tr key={item.pid} className={`hover:bg-gray-50 transition-colors ${item.current_stock <= 0 ? 'bg-red-50/40' : item.current_stock <= item.reorder_point ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-3 py-2.5 text-[11px] text-gray-500 font-mono">{item.product_code || '—'}</td>
                      <td className="px-3 py-2.5">
                        <p className="text-sm font-semibold text-gray-800">{item.product_name}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{item.category || '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-sm font-extrabold ${item.current_stock <= 0 ? 'text-red-600' : item.current_stock <= item.reorder_point ? 'text-amber-600' : 'text-gray-900'}`}>
                          {item.current_stock?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{item.base_unit}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{item.reorder_point}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-700">Ksh {(item.cost_per_base_unit || 0).toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-indigo-700">Ksh {((item.current_stock || 0) * (item.cost_per_base_unit || 0)).toFixed(0)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{item.supplier_name || '—'}</td>
                      <td className="px-3 py-2.5"><StockBadge qty={item.current_stock} reorder={item.reorder_point} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredStock.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <span className="text-4xl block mb-2">📭</span>
                  <p className="text-sm">No items found</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: ISSUE TO KITCHEN ────────────────────────────────────────────── */}
      {activeTab === '📋 Issue to Kitchen' && (
        <div className="grid grid-cols-12 gap-4">
          {/* Issue Form */}
          <div className="col-span-7 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
              <span className="text-lg">📋</span>
              <h3 className="font-bold text-gray-800">New Issue Request</h3>
              <span className="ml-auto text-xs text-gray-500">Requires manager approval</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Kitchen + Requester */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block uppercase tracking-wider">Issue To (Kitchen/Section)</label>
                  <select value={issueKitchen} onChange={e => setIssueKitchen(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium bg-white focus:outline-none focus:border-indigo-400">
                    {KITCHENS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block uppercase tracking-wider">Requested By</label>
                  <input type="text" value={currentUser} readOnly
                    className="w-full px-3 py-2 border border-gray-100 rounded-lg text-sm bg-gray-50 text-gray-600" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block uppercase tracking-wider">Note / Reason</label>
                <input type="text" value={issueNote} onChange={e => setIssueNote(e.target.value)}
                  placeholder="e.g. Daily kitchen replenishment, special event..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 bg-white" />
              </div>

              {/* Items Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Items to Issue</label>
                  <button onClick={() => setShowAddItem(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all">
                    + Add Item
                  </button>
                </div>
                {issueItems.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl py-8 text-center text-gray-400">
                    <span className="text-3xl block mb-2">📦</span>
                    <p className="text-sm">No items added yet — click "Add Item"</p>
                  </div>
                ) : (
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-gray-500">Item</th>
                          <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-gray-500">In Store</th>
                          <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-gray-500">Request Qty</th>
                          <th className="text-center px-3 py-2 text-[10px] font-bold uppercase text-gray-500">Unit</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {issueItems.map((item, idx) => (
                          <tr key={idx} className={item.requested_qty > item.current_stock ? 'bg-red-50' : ''}>
                            <td className="px-3 py-2 text-sm font-medium text-gray-800">{item.product_name}</td>
                            <td className="px-3 py-2 text-right text-sm font-bold text-gray-600">{item.current_stock}</td>
                            <td className="px-3 py-2 text-right">
                              <input type="number" value={item.requested_qty} min="0.01" step="0.01"
                                onChange={e => setIssueItems(prev => prev.map((x, i) => i === idx ? { ...x, requested_qty: parseFloat(e.target.value) || 0 } : x))}
                                className={`w-20 px-2 py-1 border rounded text-right text-sm font-bold focus:outline-none ${item.requested_qty > item.current_stock ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 bg-white'}`} />
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-500">{item.base_unit}</td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => setIssueItems(prev => prev.filter((_, i) => i !== idx))}
                                className="w-6 h-6 bg-red-100 text-red-600 rounded-full text-xs hover:bg-red-200 flex items-center justify-center">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {issueItems.some(i => i.requested_qty > i.current_stock) && (
                      <div className="bg-red-50 border-t border-red-100 px-3 py-2 text-xs text-red-600 font-medium">
                        ⚠️ Some quantities exceed available stock — request will still be submitted for manager review
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Submit */}
              <button onClick={submitIssueRequest} disabled={isSaving || issueItems.length === 0}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-sm hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md">
                {isSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</> : '📤 Submit Issue Request for Approval'}
              </button>
            </div>
          </div>

          {/* Add Item Modal / Panel */}
          <div className="col-span-5 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-lg">🔍</span>
              <h3 className="font-bold text-gray-800">Select Item from Store</h3>
            </div>
            <div className="p-3 space-y-2">
              <input type="text" value={addSearch} onChange={e => setAddSearch(e.target.value)}
                placeholder="Search ingredient..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 bg-white" />
              <div className="max-h-[320px] overflow-y-auto space-y-1">
                {storeItems.filter(i => !addSearch || i.product_name.toLowerCase().includes(addSearch.toLowerCase())).map(item => {
                  const alreadyAdded = issueItems.some(x => x.pid === item.pid);
                  return (
                    <div key={item.pid}
                      onClick={() => !alreadyAdded && setAddSelected(item)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition-all ${alreadyAdded ? 'opacity-40 cursor-not-allowed bg-gray-50 border-gray-100' : addSelected?.pid === item.pid ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-gray-50 border-gray-100'}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{item.product_name}</p>
                          <p className="text-[10px] text-gray-400">{item.category}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${item.current_stock <= 0 ? 'text-red-600' : item.current_stock <= item.reorder_point ? 'text-amber-600' : 'text-green-600'}`}>
                            {item.current_stock} {item.base_unit}
                          </p>
                          {alreadyAdded && <p className="text-[9px] text-indigo-500 font-bold">ADDED</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {addSelected && (
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <div className="bg-indigo-50 rounded-lg p-2.5 border border-indigo-100">
                    <p className="text-xs font-bold text-indigo-800">{addSelected.product_name}</p>
                    <p className="text-[10px] text-indigo-500">Available: <strong>{addSelected.current_stock} {addSelected.base_unit}</strong></p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input type="number" value={addQty} onChange={e => setAddQty(e.target.value)}
                      placeholder="Qty" min="0.01" step="0.01"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-400" />
                    <span className="text-xs text-gray-500">{addSelected.base_unit}</span>
                    <button onClick={() => {
                      if (!addQty || parseFloat(addQty) <= 0) { toast.error('Enter a valid quantity'); return; }
                      setIssueItems(prev => [...prev, { pid: addSelected.pid, product_name: addSelected.product_name, base_unit: addSelected.base_unit, requested_qty: parseFloat(addQty), approved_qty: null, issued_qty: null, current_stock: addSelected.current_stock }]);
                      setAddSelected(null); setAddQty(''); setAddSearch('');
                      toast.success(`${addSelected.product_name} added`);
                    }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700">Add</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: APPROVALS ──────────────────────────────────────────────────── */}
      {activeTab === '✅ Approvals' && (
        <div className="grid grid-cols-12 gap-4">
          {/* Request List */}
          <div className="col-span-5 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-lg">📋</span>
              <h3 className="font-bold text-gray-800 text-sm">Issue Requests</h3>
              <div className="ml-auto flex gap-1">
                {(['Pending', 'All'] as const).map(f => (
                  <button key={f} onClick={() => { setApprovalFilter(f); loadRequests(); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${approvalFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{f}</button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
              {issueRequests.length === 0 ? (
                <div className="text-center py-12 text-gray-400"><span className="text-3xl block mb-2">📭</span><p className="text-sm">No requests found</p></div>
              ) : issueRequests.map(req => (
                <div key={req.id} onClick={() => setSelectedRequest(req)}
                  className={`p-3 cursor-pointer transition-all ${selectedRequest?.id === req.id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-indigo-600">{req.request_no}</span>
                    <StatusBadge status={req.status} />
                  </div>
                  <p className="text-sm font-semibold text-gray-800">→ {req.issued_to}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-gray-400">By {req.requested_by}</p>
                    <p className="text-[10px] text-gray-400">{new Date(req.requested_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">{req.items.length} item{req.items.length !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Request Detail + Actions */}
          <div className="col-span-7 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {selectedRequest ? (
              <>
                <div className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 ${selectedRequest.status === 'Pending' ? 'bg-amber-50' : selectedRequest.status === 'Approved' ? 'bg-blue-50' : selectedRequest.status === 'Issued' ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Request</p>
                    <p className="font-extrabold text-gray-900">{selectedRequest.request_no}</p>
                  </div>
                  <div className="ml-4">
                    <p className="text-xs text-gray-500">Issue To</p>
                    <p className="font-bold text-gray-800">🍳 {selectedRequest.issued_to}</p>
                  </div>
                  <div className="ml-4">
                    <p className="text-xs text-gray-500">Requested By</p>
                    <p className="font-bold text-gray-800">👤 {selectedRequest.requested_by}</p>
                  </div>
                  <div className="ml-auto"><StatusBadge status={selectedRequest.status} /></div>
                </div>

                <div className="p-4 space-y-3">
                  {selectedRequest.notes && (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm text-amber-700">
                      📝 {selectedRequest.notes}
                    </div>
                  )}

                  {/* Items Table */}
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-gray-500">Item</th>
                          <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-gray-500">In Store</th>
                          <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-gray-500">Requested</th>
                          <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-gray-500">Approved</th>
                          <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-gray-500">Issued</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {selectedRequest.items.map((item, idx) => {
                          const overStock = item.requested_qty > item.current_stock;
                          return (
                            <tr key={idx} className={overStock ? 'bg-red-50' : ''}>
                              <td className="px-3 py-2 text-sm font-medium text-gray-800">
                                {item.product_name}
                                {overStock && <span className="ml-1 text-[9px] text-red-500 font-bold">LOW STOCK</span>}
                              </td>
                              <td className="px-3 py-2 text-right text-sm text-gray-600">{item.current_stock} {item.base_unit}</td>
                              <td className="px-3 py-2 text-right text-sm font-bold text-gray-800">{item.requested_qty} {item.base_unit}</td>
                              <td className="px-3 py-2 text-right">
                                {selectedRequest.status === 'Pending' ? (
                                  <input type="number" defaultValue={Math.min(item.requested_qty, item.current_stock)} min="0" step="0.01"
                                    onChange={e => {
                                      const val = parseFloat(e.target.value);
                                      setSelectedRequest(prev => prev ? { ...prev, items: prev.items.map((x, i) => i === idx ? { ...x, approved_qty: val } : x) } : prev);
                                    }}
                                    className="w-20 px-2 py-1 border border-gray-200 rounded text-right text-sm font-bold focus:outline-none focus:border-blue-400" />
                                ) : (
                                  <span className="text-sm font-bold text-blue-700">{item.approved_qty ?? '—'} {item.base_unit}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right text-sm font-bold text-green-700">{item.issued_qty != null ? `${item.issued_qty} ${item.base_unit}` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Action Buttons */}
                  {selectedRequest.status === 'Pending' && (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button onClick={() => approveRequest(selectedRequest, false)} disabled={isSaving}
                        className="py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                        ❌ Reject Request
                      </button>
                      <button onClick={() => approveRequest(selectedRequest, true)} disabled={isSaving}
                        className="py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                        ✅ Approve Request
                      </button>
                    </div>
                  )}
                  {selectedRequest.status === 'Approved' && (
                    <div className="space-y-2">
                      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-blue-700">
                        ✅ Approved by <strong>{selectedRequest.approved_by}</strong>
                      </div>
                      <button onClick={() => issueStock(selectedRequest)} disabled={isSaving}
                        className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-extrabold text-sm hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md">
                        {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '📦'} Issue Stock to {selectedRequest.issued_to}
                      </button>
                    </div>
                  )}
                  {(selectedRequest.status === 'Issued' || selectedRequest.status === 'Rejected') && (
                    <div className={`rounded-lg px-3 py-2 text-sm font-medium ${selectedRequest.status === 'Issued' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                      {selectedRequest.status === 'Issued' ? '📦 Stock successfully issued to kitchen' : '❌ Request was rejected'}
                      {selectedRequest.approved_by && <span> by <strong>{selectedRequest.approved_by}</strong></span>}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <span className="text-5xl mb-3">👈</span>
                <p className="text-sm font-medium">Select a request to review</p>
                {pendingCount > 0 && <p className="text-xs text-amber-600 mt-1 font-semibold">⏳ {pendingCount} pending approval{pendingCount > 1 ? 's' : ''}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: PURCHASES RECEIVED ─────────────────────────────────────────── */}
      {activeTab === '📦 Purchases Received' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-lg">📦</span>
            <h3 className="font-bold text-gray-800 text-sm">Purchases Received into Store</h3>
            <span className="ml-auto text-xs text-gray-400">{purchases.length} records</span>
          </div>
          <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
            {purchases.length === 0 ? (
              <div className="text-center py-12 text-gray-400"><span className="text-4xl block mb-2">📭</span><p className="text-sm">No purchases found</p></div>
            ) : purchases.map(p => (
              <details key={p.purchase_id} className="group">
                <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-all list-none">
                  <span className="text-gray-400 group-open:rotate-90 transition-transform inline-block">▶</span>
                  <div className="flex-1 flex items-center gap-4">
                    <div>
                      <p className="text-xs font-bold text-indigo-600">{p.purchase_no}</p>
                      <p className="text-[10px] text-gray-400">{p.purchase_date}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{p.supplier_name}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-900">Ksh {p.grand_total?.toLocaleString()}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${p.status === 'Received' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                        {p.status === 'Received' ? '✅ Received' : '⏳ ' + p.status}
                      </span>
                      <span className="text-[10px] text-gray-400">{p.items.length} items</span>
                    </div>
                  </div>
                </summary>
                <div className="px-4 pb-3">
                  <table className="w-full border border-gray-100 rounded-lg overflow-hidden text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-gray-500">Item</th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-gray-500">Qty</th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-gray-500">Unit Cost</th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-gray-500">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {p.items.map((item, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-medium text-gray-800">{item.product_name}</td>
                          <td className="px-3 py-1.5 text-right text-gray-700">{item.quantity} {item.unit}</td>
                          <td className="px-3 py-1.5 text-right text-gray-600">Ksh {item.rate?.toFixed(2)}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-indigo-700">Ksh {item.total_amount?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: ISSUE HISTORY ──────────────────────────────────────────────── */}
      {activeTab === '📜 Issue History' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-lg">📜</span>
            <h3 className="font-bold text-gray-800 text-sm">Issue History</h3>
            <div className="ml-auto flex gap-2 items-center">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded text-xs bg-white" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded text-xs bg-white" />
              <select value={historyFilter} onChange={e => setHistoryFilter(e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded text-xs bg-white">
                <option value="All">All Status</option>
                <option value="Issued">Issued</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
          </div>
          <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
            {issueRequests
              .filter(r => historyFilter === 'All' || r.status === historyFilter)
              .filter(r => {
                const d = r.requested_at?.split('T')[0];
                return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
              }).length === 0 ? (
              <div className="text-center py-12 text-gray-400"><span className="text-4xl block mb-2">📭</span><p className="text-sm">No records in selected range</p></div>
            ) : issueRequests
              .filter(r => historyFilter === 'All' || r.status === historyFilter)
              .filter(r => {
                const d = r.requested_at?.split('T')[0];
                return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
              }).map(req => (
                <div key={req.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-indigo-600">{req.request_no}</span>
                      <StatusBadge status={req.status} />
                      <span className="text-sm font-semibold text-gray-800">→ {req.issued_to}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400">
                      <span>👤 {req.requested_by}</span>
                      {req.approved_by && <span>✅ {req.approved_by}</span>}
                      <span>{new Date(req.requested_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {req.items.map((item, i) => (
                      <span key={i} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-medium">
                        {item.product_name} · {item.issued_qty ?? item.approved_qty ?? item.requested_qty} {item.base_unit}
                      </span>
                    ))}
                  </div>
                  {req.notes && <p className="text-[10px] text-gray-400 mt-1 italic">📝 {req.notes}</p>}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
