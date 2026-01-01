'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Room {
    room_id: number;
    room_number: string;
    floor_number: number;
    room_type_name: string;
    status: string;
    housekeeping_status: string;
    current_guest_name: string;
}

interface Task {
    task_id: number;
    task_no: string;
    room_id: number;
    room_number: string;
    floor_number: number;
    task_type: string;
    priority: string;
    assigned_to_name: string;
    status: string;
    notes: string;
    created_at: string;
    completed_at: string;
}

const statusColors: Record<string, { bg: string; text: string; gradient: string }> = {
    'Clean': { bg: 'bg-green-100', text: 'text-green-700', gradient: 'from-green-400 to-emerald-500' },
    'Dirty': { bg: 'bg-red-100', text: 'text-red-700', gradient: 'from-red-400 to-rose-500' },
    'In Progress': { bg: 'bg-yellow-100', text: 'text-yellow-700', gradient: 'from-yellow-400 to-amber-500' },
    'Inspected': { bg: 'bg-blue-100', text: 'text-blue-700', gradient: 'from-blue-400 to-indigo-500' },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
    'Low': { bg: 'bg-gray-100', text: 'text-gray-700' },
    'Normal': { bg: 'bg-blue-100', text: 'text-blue-700' },
    'High': { bg: 'bg-orange-100', text: 'text-orange-700' },
    'Urgent': { bg: 'bg-red-100', text: 'text-red-700' },
};

export default function HousekeepingPage() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('All');
    const [filterFloor, setFilterFloor] = useState('All');
    const [viewMode, setViewMode] = useState<'grid' | 'tasks'>('grid');
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
    const [taskForm, setTaskForm] = useState({ task_type: 'Daily Cleaning', priority: 'Normal', assigned_to_name: '', notes: '' });

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [roomData, taskData] = await Promise.all([
                supabase.from('hotel_rooms').select('room_id, room_number, floor_number, room_type_name, status, housekeeping_status, current_guest_name').eq('active', true).order('room_number'),
                supabase.from('housekeeping_tasks').select('*').order('created_at', { ascending: false }).limit(100),
            ]);
            setRooms(roomData.data || []);
            setTasks(taskData.data || []);
        } catch (err) {
            console.error('Error loading data:', err);
            toast.error('Failed to load data');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const updateRoomHousekeeping = async (room: Room, newStatus: string) => {
        try {
            const { error } = await supabase.from('hotel_rooms').update({ housekeeping_status: newStatus, updated_at: new Date().toISOString() }).eq('room_id', room.room_id);
            if (error) throw error;
            toast.success(`Room ${room.room_number} marked as ${newStatus}`);
            loadData();
        } catch (err) {
            console.error('Error updating room:', err);
            toast.error('Failed to update');
        }
    };

    const createTask = async () => {
        if (!selectedRoom) return;
        try {
            const taskNo = `HK-${Date.now().toString().slice(-8)}`;
            const { error } = await supabase.from('housekeeping_tasks').insert({
                task_no: taskNo,
                room_id: selectedRoom.room_id,
                room_number: selectedRoom.room_number,
                floor_number: selectedRoom.floor_number,
                task_type: taskForm.task_type,
                priority: taskForm.priority,
                assigned_to_name: taskForm.assigned_to_name,
                notes: taskForm.notes,
                status: 'Pending',
            });
            if (error) throw error;
            await supabase.from('hotel_rooms').update({ housekeeping_status: 'In Progress' }).eq('room_id', selectedRoom.room_id);
            toast.success(`Task ${taskNo} created`);
            setShowTaskModal(false);
            setSelectedRoom(null);
            loadData();
        } catch (err) {
            console.error('Error creating task:', err);
            toast.error('Failed to create task');
        }
    };

    const updateTaskStatus = async (task: Task, newStatus: string) => {
        try {
            const updates: Record<string, unknown> = { status: newStatus };
            if (newStatus === 'Completed') updates.completed_at = new Date().toISOString();
            const { error } = await supabase.from('housekeeping_tasks').update(updates).eq('task_id', task.task_id);
            if (error) throw error;
            if (newStatus === 'Completed' || newStatus === 'Inspected') {
                await supabase.from('hotel_rooms').update({ housekeeping_status: newStatus === 'Inspected' ? 'Inspected' : 'Clean' }).eq('room_id', task.room_id);
            }
            toast.success(`Task ${newStatus}`);
            loadData();
        } catch (err) {
            console.error('Error updating task:', err);
            toast.error('Failed to update task');
        }
    };

    const filteredRooms = rooms.filter(r => {
        if (filterStatus !== 'All' && r.housekeeping_status !== filterStatus) return false;
        if (filterFloor !== 'All' && r.floor_number !== parseInt(filterFloor)) return false;
        return true;
    });

    const floors = Array.from(new Set(rooms.map(r => r.floor_number))).sort();
    const stats = {
        total: rooms.length,
        clean: rooms.filter(r => r.housekeeping_status === 'Clean').length,
        dirty: rooms.filter(r => r.housekeeping_status === 'Dirty').length,
        inProgress: rooms.filter(r => r.housekeeping_status === 'In Progress').length,
        inspected: rooms.filter(r => r.housekeeping_status === 'Inspected').length,
        pendingTasks: tasks.filter(t => t.status === 'Pending').length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">🧹</span>
                        Housekeeping
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Room cleaning status & task management</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-gray-100 rounded-xl p-1">
                        <button onClick={() => setViewMode('grid')} className={`px-4 py-2 rounded-lg font-medium transition-all ${viewMode === 'grid' ? 'bg-white shadow text-cyan-600' : 'text-gray-600'}`}>🏨 Rooms</button>
                        <button onClick={() => setViewMode('tasks')} className={`px-4 py-2 rounded-lg font-medium transition-all ${viewMode === 'tasks' ? 'bg-white shadow text-cyan-600' : 'text-gray-600'}`}>📋 Tasks</button>
                    </div>
                    <button onClick={loadData} className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">🔄 Refresh</button>
                </div>
            </div>

            {/* Stats - Dashboard Glassmorphic Style */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">🏨</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Total Rooms</p>
                    <p className="text-3xl font-bold mt-1">{stats.total}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">✨</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Clean</p>
                    <p className="text-3xl font-bold mt-1">{stats.clean}</p>
                </div>
                <div className="bg-gradient-to-br from-red-400 via-red-500 to-rose-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">🧹</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Dirty</p>
                    <p className="text-3xl font-bold mt-1">{stats.dirty}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">⏳</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">In Progress</p>
                    <p className="text-3xl font-bold mt-1">{stats.inProgress}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">✅</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Inspected</p>
                    <p className="text-3xl font-bold mt-1">{stats.inspected}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-400 via-orange-500 to-red-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">📋</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Pending Tasks</p>
                    <p className="text-3xl font-bold mt-1">{stats.pendingTasks}</p>
                </div>
            </div>

            {/* Status Legend */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                    <span className="text-sm font-semibold text-gray-700">🎨 Status:</span>
                    {Object.entries(statusColors).map(([status, colors]) => (
                        <div key={status} className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-full bg-gradient-to-r ${colors.gradient}`} />
                            <span className="text-sm text-gray-600">{status}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-wrap gap-4">
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-cyan-500">
                        <option value="All">🧹 All Status</option>
                        <option value="Clean">✨ Clean</option>
                        <option value="Dirty">🧹 Dirty</option>
                        <option value="In Progress">⏳ In Progress</option>
                        <option value="Inspected">✅ Inspected</option>
                    </select>
                    <select value={filterFloor} onChange={(e) => setFilterFloor(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-cyan-500">
                        <option value="All">🏢 All Floors</option>
                        {floors.map(f => <option key={f} value={f}>Floor {f}</option>)}
                    </select>
                </div>
            </div>

            {/* Grid View */}
            {viewMode === 'grid' && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                    {isLoading ? (
                        Array(16).fill(0).map((_, i) => <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse h-32" />)
                    ) : filteredRooms.length === 0 ? (
                        <div className="col-span-full text-center py-12"><span className="text-6xl">🧹</span><p className="text-gray-500 mt-4">No rooms found</p></div>
                    ) : (
                        filteredRooms.map(room => {
                            const sColor = statusColors[room.housekeeping_status] || statusColors['Clean'];
                            return (
                                <div key={room.room_id} className="bg-white rounded-xl border-2 overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer group" style={{ borderColor: `${sColor.bg.replace('bg-', '').replace('-100', '-300')}` }}>
                                    <div className={`h-1.5 bg-gradient-to-r ${sColor.gradient}`} />
                                    <div className="p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-lg font-bold text-gray-800">🚪 {room.room_number}</span>
                                            <span className="text-xs text-gray-500">F{room.floor_number}</span>
                                        </div>
                                        <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${sColor.bg} ${sColor.text}`}>{room.housekeeping_status}</span>
                                        {room.status === 'Occupied' && <p className="text-xs text-blue-600 mt-2 truncate">👤 {room.current_guest_name || 'Guest'}</p>}
                                        <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-all">
                                            <button onClick={() => updateRoomHousekeeping(room, 'Clean')} className="flex-1 p-1.5 bg-green-100 hover:bg-green-200 text-green-600 rounded-lg text-xs" title="Mark Clean">✨</button>
                                            <button onClick={() => updateRoomHousekeeping(room, 'Dirty')} className="flex-1 p-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-xs" title="Mark Dirty">🧹</button>
                                            <button onClick={() => { setSelectedRoom(room); setShowTaskModal(true); }} className="flex-1 p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg text-xs" title="Create Task">📋</button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Tasks View */}
            {viewMode === 'tasks' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gradient-to-r from-cyan-500 to-teal-600 text-white">
                                    <th className="px-4 py-4 text-left text-sm font-semibold">Task #</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold">Room</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold">Type</th>
                                    <th className="px-4 py-4 text-center text-sm font-semibold">Priority</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold">Assigned To</th>
                                    <th className="px-4 py-4 text-center text-sm font-semibold">Status</th>
                                    <th className="px-4 py-4 text-center text-sm font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tasks.length === 0 ? (
                                    <tr><td colSpan={7} className="px-4 py-12 text-center"><span className="text-5xl">📋</span><p className="text-gray-500 mt-2">No tasks found</p></td></tr>
                                ) : (
                                    tasks.map(task => {
                                        const pColor = priorityColors[task.priority] || priorityColors['Normal'];
                                        return (
                                            <tr key={task.task_id} className="border-t border-gray-50 hover:bg-cyan-50/50 transition-colors">
                                                <td className="px-4 py-4"><span className="px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-sm font-semibold">{task.task_no}</span></td>
                                                <td className="px-4 py-4"><span className="font-semibold text-gray-800">🚪 {task.room_number}</span><span className="text-xs text-gray-500 ml-2">F{task.floor_number}</span></td>
                                                <td className="px-4 py-4"><span className="text-gray-700">{task.task_type}</span></td>
                                                <td className="px-4 py-4 text-center"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${pColor.bg} ${pColor.text}`}>{task.priority}</span></td>
                                                <td className="px-4 py-4"><span className="text-gray-700">{task.assigned_to_name || 'Unassigned'}</span></td>
                                                <td className="px-4 py-4 text-center"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${task.status === 'Completed' ? 'bg-green-100 text-green-700' : task.status === 'In Progress' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>{task.status}</span></td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {task.status === 'Pending' && <button onClick={() => updateTaskStatus(task, 'In Progress')} className="p-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-600 rounded-xl text-sm" title="Start">▶️</button>}
                                                        {task.status === 'In Progress' && <button onClick={() => updateTaskStatus(task, 'Completed')} className="p-2 bg-green-100 hover:bg-green-200 text-green-600 rounded-xl text-sm" title="Complete">✅</button>}
                                                        {task.status === 'Completed' && <button onClick={() => updateTaskStatus(task, 'Inspected')} className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-xl text-sm" title="Inspect">🔍</button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Task Modal */}
            {showTaskModal && selectedRoom && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
                        <div className="bg-gradient-to-r from-cyan-500 to-teal-600 px-6 py-5 text-white rounded-t-3xl">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold">📋 Create Task</h2>
                                <button onClick={() => { setShowTaskModal(false); setSelectedRoom(null); }} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                            </div>
                            <p className="text-cyan-100 mt-1">Room {selectedRoom.room_number}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Task Type</label>
                                <select value={taskForm.task_type} onChange={(e) => setTaskForm({ ...taskForm, task_type: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-500">
                                    <option>Daily Cleaning</option>
                                    <option>Deep Cleaning</option>
                                    <option>Checkout Clean</option>
                                    <option>Turndown Service</option>
                                    <option>Maintenance</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Priority</label>
                                <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-500">
                                    <option>Low</option>
                                    <option>Normal</option>
                                    <option>High</option>
                                    <option>Urgent</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Assign To</label>
                                <input type="text" value={taskForm.assigned_to_name} onChange={(e) => setTaskForm({ ...taskForm, assigned_to_name: e.target.value })} placeholder="Staff name" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                                <textarea value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} rows={2} placeholder="Special instructions..." className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-500" />
                            </div>
                            <div className="flex gap-4">
                                <button type="button" onClick={() => { setShowTaskModal(false); setSelectedRoom(null); }} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200">Cancel</button>
                                <button onClick={createTask} className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-xl font-semibold hover:shadow-lg">Create Task</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
