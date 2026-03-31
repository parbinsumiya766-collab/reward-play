import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Users, Gamepad2, CreditCard, Search, Ban, CheckCircle, XCircle, Plus, Minus, RefreshCw } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, getDocs, doc, updateDoc, setDoc, getDoc, orderBy, limit, where } from 'firebase/firestore';

export default function AdminPanel() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'transactions' | 'games'>('users');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Users State
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [balanceAmount, setBalanceAmount] = useState('');

  // Transactions State
  const [transactions, setTransactions] = useState<any[]>([]);

  // Games State
  const [crashMultiplier, setCrashMultiplier] = useState('');
  const [murgiMultiplier, setMurgiMultiplier] = useState('');
  const [fireshotMultiplier, setFireshotMultiplier] = useState('');
  const [spinResult, setSpinResult] = useState('');
  const [carSpeed, setCarSpeed] = useState('');
  const [musicUrl, setMusicUrl] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'abir124') {
      setIsAuthenticated(true);
      fetchUsers();
    } else {
      setMessage({ text: 'Invalid password', type: 'error' });
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), limit(50));
      const snapshot = await getDocs(q);
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(usersData);
    } catch (err: any) {
      setMessage({ text: 'Error fetching users', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'transactions'), where('status', '==', 'pending'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      const txData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(txData);
    } catch (err: any) {
      setMessage({ text: 'Error fetching transactions', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === 'users') fetchUsers();
      if (activeTab === 'transactions') fetchTransactions();
    }
  }, [activeTab, isAuthenticated]);

  const handleUserSearch = async () => {
    if (!searchQuery) return fetchUsers();
    setLoading(true);
    try {
      // Simple search by exact email or UID
      const qEmail = query(collection(db, 'users'), where('email', '==', searchQuery));
      const snapshot = await getDocs(qEmail);
      let usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (usersData.length === 0) {
        const docRef = doc(db, 'users', searchQuery);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          usersData = [{ id: docSnap.id, ...docSnap.data() }];
        }
      }
      setUsers(usersData);
    } catch (err: any) {
      setMessage({ text: 'Search failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const updateUserBalance = async (type: 'add' | 'minus') => {
    if (!selectedUser || !balanceAmount) return;
    setLoading(true);
    try {
      const amount = Number(balanceAmount);
      const change = type === 'add' ? amount : -amount;
      await updateDoc(doc(db, 'users', selectedUser.id), {
        balance: selectedUser.balance + change
      });
      setMessage({ text: `Successfully ${type === 'add' ? 'added' : 'deducted'} ${amount} Taka`, type: 'success' });
      setBalanceAmount('');
      fetchUsers();
      setSelectedUser(null);
    } catch (err: any) {
      setMessage({ text: 'Failed to update balance', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const toggleUserBan = async (user: any) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.id), {
        isBanned: !user.isBanned
      });
      setMessage({ text: `User ${user.isBanned ? 'unbanned' : 'banned'} successfully`, type: 'success' });
      fetchUsers();
    } catch (err: any) {
      setMessage({ text: 'Failed to update user status', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleTransaction = async (tx: any, action: 'approved' | 'rejected') => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'transactions', tx.id), {
        status: action
      });

      if (action === 'approved') {
        const userRef = doc(db, 'users', tx.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (tx.type === 'deposit') {
            await updateDoc(userRef, { balance: (userData.balance || 0) + tx.amount });
          }
          // For withdraw, balance is already deducted when requested. If rejected, we should refund.
        }
      } else if (action === 'rejected' && tx.type === 'withdraw') {
        // Refund withdrawn amount
        const userRef = doc(db, 'users', tx.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          await updateDoc(userRef, { balance: (userData.balance || 0) + tx.amount });
        }
      }

      setMessage({ text: `Transaction ${action}`, type: 'success' });
      fetchTransactions();
    } catch (err: any) {
      setMessage({ text: 'Failed to process transaction', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const updateGameSettings = async (game: 'crash' | 'spin' | 'car' | 'murgi' | 'music' | 'fireshot') => {
    setLoading(true);
    try {
      const ref = doc(db, 'admin_settings', 'games');
      if (game === 'crash') {
        const val = Number(crashMultiplier);
        if (isNaN(val) || val <= 0) {
          setMessage({ text: 'Invalid crash multiplier', type: 'error' });
          setLoading(false);
          return;
        }
        await setDoc(ref, { crashNextMultiplier: val }, { merge: true });
        setMessage({ text: `Next crash set to ${val}x`, type: 'success' });
        setCrashMultiplier('');
      } else if (game === 'murgi') {
        const val = Number(murgiMultiplier);
        if (isNaN(val) || val <= 0) {
          setMessage({ text: 'Invalid murgi multiplier', type: 'error' });
          setLoading(false);
          return;
        }
        await setDoc(ref, { murgiNextMultiplier: val }, { merge: true });
        setMessage({ text: `Next murgi crash set to ${val}x`, type: 'success' });
        setMurgiMultiplier('');
      } else if (game === 'fireshot') {
        const val = Number(fireshotMultiplier);
        if (isNaN(val) || val <= 0) {
          setMessage({ text: 'Invalid fireshot multiplier', type: 'error' });
          setLoading(false);
          return;
        }
        await setDoc(ref, { fireshotNextMultiplier: val }, { merge: true });
        setMessage({ text: `Next fireshot miss set to ${val}x`, type: 'success' });
        setFireshotMultiplier('');
      } else if (game === 'spin') {
        const val = Number(spinResult);
        if (isNaN(val)) {
          setMessage({ text: 'Invalid spin result', type: 'error' });
          setLoading(false);
          return;
        }
        await setDoc(ref, { spinNextResult: val }, { merge: true });
        setMessage({ text: `Next spin set to ${val}`, type: 'success' });
        setSpinResult('');
      } else if (game === 'car') {
        const val = Number(carSpeed);
        if (isNaN(val) || val <= 0) {
          setMessage({ text: 'Invalid car speed', type: 'error' });
          setLoading(false);
          return;
        }
        await setDoc(ref, { carSpeedMultiplier: val }, { merge: true });
        setMessage({ text: `Car game speed multiplier set to ${val}x`, type: 'success' });
        setCarSpeed('');
      } else if (game === 'music') {
        if (!musicUrl) {
          setMessage({ text: 'Please enter a music URL', type: 'error' });
          setLoading(false);
          return;
        }
        await setDoc(ref, { musicUrl: musicUrl }, { merge: true });
        setMessage({ text: 'Background music updated', type: 'success' });
        setMusicUrl('');
      }
    } catch (err: any) {
      console.error("Failed to update game settings:", err);
      setMessage({ text: 'Failed to update game settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

    const clearGameSetting = async (game: 'crash' | 'spin' | 'car' | 'murgi' | 'music' | 'fireshot') => {
      setLoading(true);
      try {
        const ref = doc(db, 'admin_settings', 'games');
        if (game === 'crash') {
          await setDoc(ref, { crashNextMultiplier: null }, { merge: true });
          setMessage({ text: 'Cleared crash multiplier', type: 'success' });
        } else if (game === 'murgi') {
          await setDoc(ref, { murgiNextMultiplier: null }, { merge: true });
          setMessage({ text: 'Cleared murgi multiplier', type: 'success' });
        } else if (game === 'fireshot') {
          await setDoc(ref, { fireshotNextMultiplier: null }, { merge: true });
          setMessage({ text: 'Cleared fireshot multiplier', type: 'success' });
        } else if (game === 'spin') {
          await setDoc(ref, { spinNextResult: null }, { merge: true });
          setMessage({ text: 'Cleared spin result', type: 'success' });
        } else if (game === 'car') {
          await setDoc(ref, { carSpeedMultiplier: null }, { merge: true });
          setMessage({ text: 'Cleared car game speed', type: 'success' });
        } else if (game === 'music') {
          await setDoc(ref, { musicUrl: null }, { merge: true });
          setMessage({ text: 'Stopped background music', type: 'success' });
        }
      } catch (err: any) {
        console.error("Failed to clear game setting:", err);
        setMessage({ text: 'Failed to clear game setting', type: 'error' });
      } finally {
        setLoading(false);
      }
    };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 w-full max-w-md shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
              <Shield size={32} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white text-center mb-6">Admin Login</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Admin Password"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-emerald-500 text-center tracking-widest"
                required
              />
            </div>
            {message.text && <p className="text-red-500 text-sm text-center">{message.text}</p>}
            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg">
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <Shield className="text-emerald-500 w-8 h-8" />
            <h1 className="text-3xl font-bold">Admin Control Panel</h1>
          </div>
          <div className="flex gap-2 bg-zinc-900 p-1 rounded-xl border border-zinc-800 overflow-x-auto w-full md:w-auto">
            <button onClick={() => setActiveTab('users')} className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 whitespace-nowrap ${activeTab === 'users' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
              <Users size={18} /> Users
            </button>
            <button onClick={() => setActiveTab('transactions')} className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 whitespace-nowrap ${activeTab === 'transactions' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
              <CreditCard size={18} /> Transactions
            </button>
            <button onClick={() => setActiveTab('games')} className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 whitespace-nowrap ${activeTab === 'games' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
              <Gamepad2 size={18} /> Games
            </button>
          </div>
        </header>

        {message.text && (
          <div className={`mb-6 p-4 rounded-xl border ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
            {message.text}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Email or UID..."
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-emerald-500"
              />
              <button onClick={handleUserSearch} className="bg-zinc-800 hover:bg-zinc-700 px-6 rounded-xl transition-all flex items-center justify-center">
                <Search size={20} />
              </button>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-800/50 text-zinc-400">
                  <tr>
                    <th className="p-4 font-medium">User</th>
                    <th className="p-4 font-medium">Balance</th>
                    <th className="p-4 font-medium">Points</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-zinc-800/20">
                      <td className="p-4">
                        <p className="font-bold text-white">{user.displayName || 'Unknown'}</p>
                        <p className="text-xs text-zinc-500">{user.email}</p>
                        <p className="text-[10px] text-zinc-600 font-mono">{user.id}</p>
                      </td>
                      <td className="p-4 font-bold text-emerald-500">৳{user.balance || 0}</td>
                      <td className="p-4 font-bold text-yellow-500">{user.points || 0}</td>
                      <td className="p-4">
                        {user.isBanned ? (
                          <span className="bg-red-500/10 text-red-500 px-2 py-1 rounded-md text-xs font-bold">Banned</span>
                        ) : (
                          <span className="bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-md text-xs font-bold">Active</span>
                        )}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button onClick={() => setSelectedUser(user)} className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all">
                          Manage Balance
                        </button>
                        <button onClick={() => toggleUserBan(user)} className={`${user.isBanned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'} text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all`}>
                          {user.isBanned ? 'Unban' : 'Ban'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedUser && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-md">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold">Manage Balance</h3>
                    <button onClick={() => setSelectedUser(null)} className="text-zinc-500 hover:text-white"><XCircle /></button>
                  </div>
                  <div className="mb-6">
                    <p className="text-zinc-400 text-sm">User: <span className="text-white font-bold">{selectedUser.email}</span></p>
                    <p className="text-zinc-400 text-sm">Current Balance: <span className="text-emerald-500 font-bold">৳{selectedUser.balance || 0}</span></p>
                  </div>
                  <input 
                    type="number" 
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(e.target.value)}
                    placeholder="Amount (Taka)"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-emerald-500 mb-4"
                  />
                  <div className="flex gap-4">
                    <button onClick={() => updateUserBalance('add')} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                      <Plus size={18} /> Add
                    </button>
                    <button onClick={() => updateUserBalance('minus')} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                      <Minus size={18} /> Deduct
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="font-bold text-lg">Pending Requests</h3>
              <button onClick={fetchTransactions} className="text-zinc-400 hover:text-white"><RefreshCw size={20} /></button>
            </div>
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">No pending transactions found.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-800/50 text-zinc-400">
                  <tr>
                    <th className="p-4 font-medium">Type</th>
                    <th className="p-4 font-medium">User ID</th>
                    <th className="p-4 font-medium">Amount</th>
                    <th className="p-4 font-medium">Details</th>
                    <th className="p-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-zinc-800/20">
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase ${tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="p-4 text-xs font-mono text-zinc-400">{tx.uid}</td>
                      <td className="p-4 font-bold text-white">৳{tx.amount}</td>
                      <td className="p-4 text-xs text-zinc-400">
                        <p>Method: <span className="text-white">{tx.method}</span></p>
                        {tx.type === 'deposit' ? (
                          <p>TxnID: <span className="text-white font-mono">{tx.transactionId}</span></p>
                        ) : (
                          <p>Account: <span className="text-white font-mono">{tx.accountNumber}</span></p>
                        )}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button onClick={() => handleTransaction(tx, 'approved')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all">
                          Approve
                        </button>
                        <button onClick={() => handleTransaction(tx, 'rejected')} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all">
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'games' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-red-500/10 rounded-2xl text-red-500">
                  <Gamepad2 size={24} />
                </div>
                <h3 className="text-xl font-bold">Crash Game Control</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-4">Set the exact multiplier where the plane will crash in the next round.</p>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  step="0.01"
                  value={crashMultiplier}
                  onChange={(e) => setCrashMultiplier(e.target.value)}
                  placeholder="e.g. 1.50"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-red-500"
                />
                <button onClick={() => updateGameSettings('crash')} className="bg-red-600 hover:bg-red-500 px-6 rounded-xl font-bold transition-all">
                  Set
                </button>
                <button onClick={() => clearGameSetting('crash')} className="bg-zinc-700 hover:bg-zinc-600 px-4 rounded-xl font-bold transition-all">
                  Clear
                </button>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-yellow-500/10 rounded-2xl text-yellow-500">
                  <Gamepad2 size={24} />
                </div>
                <h3 className="text-xl font-bold">Spin Game Control</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-4">Set the exact points the user will win on their next spin.</p>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  value={spinResult}
                  onChange={(e) => setSpinResult(e.target.value)}
                  placeholder="e.g. 100"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-yellow-500"
                />
                <button onClick={() => updateGameSettings('spin')} className="bg-yellow-600 hover:bg-yellow-500 px-6 rounded-xl font-bold transition-all text-black">
                  Set
                </button>
                <button onClick={() => clearGameSetting('spin')} className="bg-zinc-700 hover:bg-zinc-600 px-4 rounded-xl font-bold transition-all">
                  Clear
                </button>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-500">
                  <Gamepad2 size={24} />
                </div>
                <h3 className="text-xl font-bold">Murgi Game Control</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-4">Set the exact multiplier where the Murgi will run away in the next round.</p>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  step="0.01"
                  value={murgiMultiplier}
                  onChange={(e) => setMurgiMultiplier(e.target.value)}
                  placeholder="e.g. 1.50"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500"
                />
                <button onClick={() => updateGameSettings('murgi')} className="bg-orange-600 hover:bg-orange-500 px-6 rounded-xl font-bold transition-all">
                  Set
                </button>
                <button onClick={() => clearGameSetting('murgi')} className="bg-zinc-700 hover:bg-zinc-600 px-4 rounded-xl font-bold transition-all">
                  Clear
                </button>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-orange-600/10 rounded-2xl text-orange-600">
                  <Gamepad2 size={24} />
                </div>
                <h3 className="text-xl font-bold">Fire Shot Control</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-4">Set the exact multiplier where the shot will miss in the next round.</p>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  step="0.01"
                  value={fireshotMultiplier}
                  onChange={(e) => setFireshotMultiplier(e.target.value)}
                  placeholder="e.g. 1.50"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-600"
                />
                <button onClick={() => updateGameSettings('fireshot')} className="bg-orange-600 hover:bg-orange-500 px-6 rounded-xl font-bold transition-all">
                  Set
                </button>
                <button onClick={() => clearGameSetting('fireshot')} className="bg-zinc-700 hover:bg-zinc-600 px-4 rounded-xl font-bold transition-all">
                  Clear
                </button>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-500">
                  <RefreshCw size={24} />
                </div>
                <h3 className="text-xl font-bold">Music Control</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-4">Play background music for all users. Enter a direct audio URL (mp3).</p>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={musicUrl}
                  onChange={(e) => setMusicUrl(e.target.value)}
                  placeholder="https://example.com/music.mp3"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-purple-500"
                />
                <button onClick={() => updateGameSettings('music')} className="bg-purple-600 hover:bg-purple-500 px-6 rounded-xl font-bold transition-all">
                  Play
                </button>
                <button onClick={() => clearGameSetting('music')} className="bg-zinc-700 hover:bg-zinc-600 px-4 rounded-xl font-bold transition-all">
                  Stop
                </button>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500">
                  <Gamepad2 size={24} />
                </div>
                <h3 className="text-xl font-bold">Car Game Control</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-4">Set the speed multiplier for the Car Race Game (e.g. 1.5 for 50% faster).</p>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  step="0.1"
                  value={carSpeed}
                  onChange={(e) => setCarSpeed(e.target.value)}
                  placeholder="e.g. 1.5"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500"
                />
                <button onClick={() => updateGameSettings('car')} className="bg-blue-600 hover:bg-blue-500 px-6 rounded-xl font-bold transition-all">
                  Set
                </button>
                <button onClick={() => clearGameSetting('car')} className="bg-zinc-700 hover:bg-zinc-600 px-4 rounded-xl font-bold transition-all">
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
