'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Room {
    room_id: number;
    room_name: string;
    room_code: string;
    description: string;
    max_tables: number;
    floor_number: number;
    active: boolean;
}

interface Table {
    table_id: number;
    table_code: string;
    table_name: string;
    room_id: number;
    capacity: number;
    status: string;
    active: boolean;
}

const roomColors = [
    { name: 'Main Restaurant', color: 'from-blue-500 to-blue-600', icon: '🍽️' },
    { name: 'Bar Area', color: 'from-purple-500 to-purple-600', icon: '🍸' },
    { name: 'VIP Lounge', color: 'from-amber-500 to-amber-600', icon: '👑' },
    { name: 'Outdoor Area', color: 'from-green-500 to-green-600', icon: '🌳' },
    { name: 'Rooftop', color: 'from-cyan-500 to-cyan-600', icon: '🌅' },
    { name: 'Private Room', color: 'from-rose-500 to-rose-600', icon: '🚪' },
];

export default function TablesRoomsPage() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [tables, setTables] = useState<Table[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showRoomModal, setShowRoomModal] = useState(false);
    const [showTableModal, setShowTableModal] = useState(false);
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [editingTable, setEditingTable] = useState<Table | null>(null);
    const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [roomForm, setRoomForm] = useState({
        room_name: '',
        room_code: '',
        description: '',
        max_tables: 10,
        floor_number: 1,
        active: true,
    });

    const [tableForm, setTableForm] = useState({
        table_name: '',
        room_id: 0,
        capacity: 4,
        status: 'Available',
        active: true,
    });

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [roomsRes, tablesRes] = await Promise.all([
                supabase.from('restaurant_rooms').select('*').order('room_name'),
                supabase.from('restaurant_tables').select('*').order('table_name'),
            ]);

            if (roomsRes.error) throw roomsRes.error;
            if (tablesRes.error) throw tablesRes.error;

            setRooms(roomsRes.data || []);
            setTables(tablesRes.data || []);
        } catch (err) {
            console.error('Error loading data:', err);
            toast.error('Failed to load data');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const generateRoomCode = (name: string) => {
        return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 5);
    };

    const generateTableCode = (roomCode: string, tableNum: number) => {
        return `${roomCode}-T${tableNum}`;
    };

    const getTablesForRoom = (roomId: number) => tables.filter(t => t.room_id === roomId);

    const getRoomColor = (roomName: string) => {
        const found = roomColors.find(r => roomName.includes(r.name) || r.name.includes(roomName));
        return found?.color || 'from-gray-500 to-gray-600';
    };

    const getRoomIcon = (roomName: string) => {
        const found = roomColors.find(r => roomName.includes(r.name) || r.name.includes(roomName));
        return found?.icon || '🏠';
    };

    const openAddRoomModal = () => {
        setEditingRoom(null);
        setRoomForm({
            room_name: '',
            room_code: '',
            description: '',
            max_tables: 10,
            floor_number: 1,
            active: true,
        });
        setShowRoomModal(true);
    };

    const openEditRoomModal = (room: Room) => {
        setEditingRoom(room);
        setRoomForm({
            room_name: room.room_name,
            room_code: room.room_code,
            description: room.description || '',
            max_tables: room.max_tables || 10,
            floor_number: room.floor_number || 1,
            active: room.active !== false,
        });
        setShowRoomModal(true);
    };

    const openAddTableModal = (roomId?: number) => {
        setEditingTable(null);
        const room = rooms.find(r => r.room_id === roomId);
        const roomTables = tables.filter(t => t.room_id === roomId);
        const nextNum = roomTables.length + 1;

        setTableForm({
            table_name: `Table ${nextNum}`,
            room_id: roomId || (rooms[0]?.room_id || 0),
            capacity: 4,
            status: 'Available',
            active: true,
        });
        setShowTableModal(true);
    };

    const openEditTableModal = (table: Table) => {
        setEditingTable(table);
        setTableForm({
            table_name: table.table_name,
            room_id: table.room_id,
            capacity: table.capacity || 4,
            status: table.status || 'Available',
            active: table.active !== false,
        });
        setShowTableModal(true);
    };

    const handleRoomSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomForm.room_name.trim()) {
            toast.error('Room name required!');
            return;
        }

        setIsSaving(true);
        try {
            const code = roomForm.room_code || generateRoomCode(roomForm.room_name);

            if (editingRoom) {
                const { error } = await supabase
                    .from('restaurant_rooms')
                    .update({ ...roomForm, room_code: code })
                    .eq('room_id', editingRoom.room_id);

                if (error) throw error;
                toast.success('Room updated! ✓');
            } else {
                const { error } = await supabase
                    .from('restaurant_rooms')
                    .insert({ ...roomForm, room_code: code });

                if (error) throw error;
                toast.success('Room created! ✓');
            }

            setShowRoomModal(false);
            loadData();
        } catch (err) {
            console.error('Error saving room:', err);
            toast.error('Failed to save room');
        }
        setIsSaving(false);
    };

    const handleTableSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tableForm.table_name.trim()) {
            toast.error('Table name required!');
            return;
        }

        setIsSaving(true);
        try {
            const room = rooms.find(r => r.room_id === tableForm.room_id);
            const roomTables = tables.filter(t => t.room_id === tableForm.room_id);
            const nextNum = editingTable ? parseInt(editingTable.table_code.split('-T')[1]) : roomTables.length + 1;
            const code = generateTableCode(room?.room_code || 'TBL', nextNum);

            if (editingTable) {
                const { error } = await supabase
                    .from('restaurant_tables')
                    .update({ ...tableForm })
                    .eq('table_id', editingTable.table_id);

                if (error) throw error;
                toast.success('Table updated! ✓');
            } else {
                const { error } = await supabase
                    .from('restaurant_tables')
                    .insert({ ...tableForm, table_code: code });

                if (error) throw error;
                toast.success('Table created! ✓');
            }

            setShowTableModal(false);
            loadData();
        } catch (err) {
            console.error('Error saving table:', err);
            toast.error('Failed to save table');
        }
        setIsSaving(false);
    };

    const deleteRoom = async (room: Room) => {
        const roomTables = getTablesForRoom(room.room_id);
        if (roomTables.length > 0) {
            toast.error(`Cannot delete ${room.room_name} - has ${roomTables.length} tables`);
            return;
        }
        if (!confirm(`Delete "${room.room_name}"?`)) return;

        try {
            const { error } = await supabase
                .from('restaurant_rooms')
                .delete()
                .eq('room_id', room.room_id);

            if (error) throw error;
            toast.success('Room deleted');
            loadData();
        } catch (err) {
            console.error('Error deleting room:', err);
            toast.error('Failed to delete');
        }
    };

    const deleteTable = async (table: Table) => {
        if (!confirm(`Delete "${table.table_name}"?`)) return;

        try {
            const { error } = await supabase
                .from('restaurant_tables')
                .delete()
                .eq('table_id', table.table_id);

            if (error) throw error;
            toast.success('Table deleted');
            loadData();
        } catch (err) {
            console.error('Error deleting table:', err);
            toast.error('Failed to delete');
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Occupied': return 'bg-red-500';
            case 'Reserved': return 'bg-amber-500';
            case 'Cleaning': return 'bg-purple-500';
            default: return 'bg-green-500';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="text-3xl">🪑</span>
                        Tables & Rooms
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Manage restaurant areas and table assignments
                    </p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={openAddRoomModal}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg shadow-purple-300/40 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
                    >
                        <span>🏠</span>
                        Add Room
                    </button>
                    <button
                        onClick={() => openAddTableModal(selectedRoom || rooms[0]?.room_id)}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-300/40 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
                    >
                        <span>🪑</span>
                        Add Table
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white">
                    <p className="text-blue-100 text-sm">Total Rooms</p>
                    <p className="text-3xl font-bold">{rooms.length}</p>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white">
                    <p className="text-green-100 text-sm">Total Tables</p>
                    <p className="text-3xl font-bold">{tables.length}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white">
                    <p className="text-amber-100 text-sm">Available</p>
                    <p className="text-3xl font-bold">{tables.filter(t => t.status === 'Available').length}</p>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-4 text-white">
                    <p className="text-red-100 text-sm">Occupied</p>
                    <p className="text-3xl font-bold">{tables.filter(t => t.status === 'Occupied').length}</p>
                </div>
            </div>

            {/* Loading */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-4 border-blue-400/30 border-t-blue-500 rounded-full animate-spin"></div>
                        <span className="text-gray-500">Loading...</span>
                    </div>
                </div>
            ) : (
                /* Rooms with Tables */
                <div className="space-y-6">
                    {rooms.map((room) => (
                        <div key={room.room_id} className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                            {/* Room Header */}
                            <div className={`bg-gradient-to-r ${getRoomColor(room.room_name)} p-4 text-white`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-3xl">{getRoomIcon(room.room_name)}</span>
                                        <div>
                                            <h3 className="text-xl font-bold">{room.room_name}</h3>
                                            <p className="text-white/80 text-sm">
                                                {getTablesForRoom(room.room_id).length} tables • Floor {room.floor_number}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => openAddTableModal(room.room_id)}
                                            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-all"
                                        >
                                            + Add Table
                                        </button>
                                        <button
                                            onClick={() => openEditRoomModal(room)}
                                            className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            onClick={() => deleteRoom(room)}
                                            className="p-2 bg-white/20 hover:bg-red-400/50 rounded-lg transition-all"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Tables Grid */}
                            <div className="p-4">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                    {getTablesForRoom(room.room_id).map((table) => (
                                        <div
                                            key={table.table_id}
                                            className={`relative rounded-xl border-2 p-3 text-center transition-all hover:shadow-lg hover:scale-105 cursor-pointer ${table.status === 'Occupied'
                                                    ? 'border-red-300 bg-red-50'
                                                    : table.status === 'Reserved'
                                                        ? 'border-amber-300 bg-amber-50'
                                                        : 'border-green-300 bg-green-50'
                                                } ${!table.active ? 'opacity-50' : ''}`}
                                            onClick={() => openEditTableModal(table)}
                                        >
                                            <span className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${getStatusColor(table.status)}`}></span>
                                            <span className="text-2xl">🪑</span>
                                            <p className="font-bold text-gray-800 mt-1">{table.table_name}</p>
                                            <p className="text-xs text-gray-500">{table.capacity} seats</p>
                                            <p className="text-xs text-gray-400 mt-1">{table.table_code}</p>
                                        </div>
                                    ))}
                                    {getTablesForRoom(room.room_id).length === 0 && (
                                        <div className="col-span-full text-center py-6 text-gray-400">
                                            No tables yet. Click "+ Add Table" to add.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {rooms.length === 0 && (
                        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
                            <span className="text-5xl">🏠</span>
                            <h3 className="text-xl font-bold text-gray-700 mt-4">No Rooms Yet</h3>
                            <p className="text-gray-500 mt-2">Add your first restaurant room to get started</p>
                            <button
                                onClick={openAddRoomModal}
                                className="mt-4 px-6 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors"
                            >
                                Add First Room
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Room Modal */}
            {showRoomModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold">
                                    {editingRoom ? '✏️ Edit Room' : '🏠 Add New Room'}
                                </h2>
                                <button onClick={() => setShowRoomModal(false)} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                            </div>
                        </div>

                        <form onSubmit={handleRoomSubmit} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Room Name *</label>
                                <input
                                    type="text"
                                    value={roomForm.room_name}
                                    onChange={(e) => setRoomForm({ ...roomForm, room_name: e.target.value })}
                                    placeholder="e.g., Main Restaurant, VIP Lounge"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Room Code</label>
                                    <input
                                        type="text"
                                        value={roomForm.room_code}
                                        onChange={(e) => setRoomForm({ ...roomForm, room_code: e.target.value.toUpperCase() })}
                                        placeholder="Auto"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Floor #</label>
                                    <input
                                        type="number"
                                        value={roomForm.floor_number}
                                        onChange={(e) => setRoomForm({ ...roomForm, floor_number: parseInt(e.target.value) || 1 })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500"
                                        min="1"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                                <textarea
                                    value={roomForm.description}
                                    onChange={(e) => setRoomForm({ ...roomForm, description: e.target.value })}
                                    placeholder="Optional description"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500"
                                    rows={2}
                                />
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={roomForm.active}
                                    onChange={(e) => setRoomForm({ ...roomForm, active: e.target.checked })}
                                    className="w-5 h-5 rounded border-gray-300 text-purple-500"
                                />
                                <span className="font-medium text-gray-700">Active</span>
                            </label>

                            <div className="flex gap-4 pt-4 border-t">
                                <button type="button" onClick={() => setShowRoomModal(false)} className="flex-1 px-6 py-3 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
                                <button type="submit" disabled={isSaving} className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-xl shadow-lg disabled:opacity-60">
                                    {isSaving ? 'Saving...' : editingRoom ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Table Modal */}
            {showTableModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold">
                                    {editingTable ? '✏️ Edit Table' : '🪑 Add New Table'}
                                </h2>
                                <button onClick={() => setShowTableModal(false)} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                            </div>
                        </div>

                        <form onSubmit={handleTableSubmit} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Room *</label>
                                <select
                                    value={tableForm.room_id}
                                    onChange={(e) => setTableForm({ ...tableForm, room_id: parseInt(e.target.value) })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 cursor-pointer"
                                    required
                                >
                                    {rooms.map(r => <option key={r.room_id} value={r.room_id}>{r.room_name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Table Name *</label>
                                <input
                                    type="text"
                                    value={tableForm.table_name}
                                    onChange={(e) => setTableForm({ ...tableForm, table_name: e.target.value })}
                                    placeholder="e.g., Table 1, VIP Booth 1"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Capacity (seats)</label>
                                    <input
                                        type="number"
                                        value={tableForm.capacity}
                                        onChange={(e) => setTableForm({ ...tableForm, capacity: parseInt(e.target.value) || 2 })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
                                        min="1"
                                        max="20"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                                    <select
                                        value={tableForm.status}
                                        onChange={(e) => setTableForm({ ...tableForm, status: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 cursor-pointer"
                                    >
                                        <option value="Available">Available</option>
                                        <option value="Occupied">Occupied</option>
                                        <option value="Reserved">Reserved</option>
                                        <option value="Cleaning">Cleaning</option>
                                    </select>
                                </div>
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={tableForm.active}
                                    onChange={(e) => setTableForm({ ...tableForm, active: e.target.checked })}
                                    className="w-5 h-5 rounded border-gray-300 text-blue-500"
                                />
                                <span className="font-medium text-gray-700">Active</span>
                            </label>

                            <div className="flex gap-4 pt-4 border-t">
                                <button type="button" onClick={() => setShowTableModal(false)} className="flex-1 px-6 py-3 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
                                <button type="submit" disabled={isSaving} className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl shadow-lg disabled:opacity-60">
                                    {isSaving ? 'Saving...' : editingTable ? 'Update' : 'Create'}
                                </button>
                            </div>

                            {editingTable && (
                                <button
                                    type="button"
                                    onClick={() => { deleteTable(editingTable); setShowTableModal(false); }}
                                    className="w-full px-6 py-2 text-red-500 hover:bg-red-50 rounded-xl font-medium transition-colors"
                                >
                                    🗑️ Delete This Table
                                </button>
                            )}
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
