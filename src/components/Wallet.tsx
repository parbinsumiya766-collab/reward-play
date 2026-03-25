import React, { useState, useEffect } from 'react';
import { Wallet as WalletIcon, ArrowUpCircle, ArrowDownCircle, Info, CheckCircle2, Coins, Sparkles, History } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../firebase';
import { addDoc, collection, serverTimestamp, doc, updateDoc, increment, query, where, orderBy, getDocs } from 'firebase/firestore';

export default function Wallet({ balance, points }: { balance: number, points: number }) {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'convert' | 'history'>('convert');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Bkash');
  const [accountNumber, setAccountNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (activeTab === 'history' && auth.currentUser) {
      fetchHistory();
    }
  }, [activeTab]);

  const fetchHistory = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'transactions'),
        where('uid', '==', auth.currentUser.uid),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(data);
    } catch (err) {
      console.error("Failed to fetch history", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!auth.currentUser || points < 100) return;
    setLoading(true);
    try {
      const conversionAmount = Math.floor(points / 100); // 100 points = 1 Taka
      const pointsToDeduct = conversionAmount * 100;

      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        points: increment(-pointsToDeduct),
        balance: increment(conversionAmount)
      });

      await addDoc(collection(db, 'transactions'), {
        uid: auth.currentUser.uid,
        amount: conversionAmount,
        type: 'conversion',
        status: 'completed',
        timestamp: serverTimestamp()
      });

      setMessage({ text: `Successfully converted ${pointsToDeduct} points to ${conversionAmount} Taka!`, type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !amount || !transactionId) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        uid: auth.currentUser.uid,
        amount: Number(amount),
        type: 'deposit',
        status: 'pending',
        method,
        transactionId,
        timestamp: serverTimestamp()
      });
      setMessage({ text: 'Deposit request submitted! Please wait for admin approval.', type: 'success' });
      setAmount('');
      setTransactionId('');
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !amount || Number(amount) > balance) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        uid: auth.currentUser.uid,
        amount: Number(amount),
        type: 'withdraw',
        status: 'pending',
        method,
        accountNumber,
        timestamp: serverTimestamp()
      });
      
      // Deduct balance immediately for withdrawal
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        balance: increment(-Number(amount))
      });

      setMessage({ text: 'Withdrawal request submitted! Funds will be sent soon.', type: 'success' });
      setAmount('');
      setAccountNumber('');
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-emerald-500/10 rounded-2xl">
          <WalletIcon className="text-emerald-500 w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Wallet System</h2>
          <p className="text-zinc-400">Manage your earnings and deposits</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-zinc-800 p-4 rounded-2xl border border-zinc-700">
          <p className="text-zinc-500 text-sm mb-1">Total Points</p>
          <p className="text-2xl font-bold text-emerald-500">{points}</p>
        </div>
        <div className="bg-zinc-800 p-4 rounded-2xl border border-zinc-700">
          <p className="text-zinc-500 text-sm mb-1">Real Balance</p>
          <p className="text-2xl font-bold text-white">৳{balance}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-8 bg-zinc-800 p-1 rounded-xl overflow-x-auto no-scrollbar">
        {['convert', 'deposit', 'withdraw', 'history'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`flex-1 min-w-[80px] py-2 px-2 rounded-lg font-medium transition-all capitalize text-sm ${
              activeTab === tab ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {message.text && (
          <motion.div 
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={`mb-6 p-4 rounded-2xl flex items-center gap-3 border shadow-lg ${
              message.type === 'success' 
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                : 'bg-red-500/10 text-red-500 border-red-500/20'
            }`}
          >
            <div className={`p-2 rounded-full ${message.type === 'success' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <Info className="w-5 h-5" />}
            </div>
            <p className="text-sm font-semibold">{message.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {activeTab === 'convert' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 p-6 rounded-3xl border border-dashed border-zinc-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Coins size={80} />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" /> Points to Cash
            </h3>
            <p className="text-zinc-400 text-sm mb-4">Rate: 100 Points = ৳1.00</p>
            <div className="flex items-center justify-between p-5 bg-zinc-950/50 rounded-2xl border border-zinc-800 backdrop-blur-sm">
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold mb-1">Available Points</p>
                <p className="text-2xl font-black text-white">{Math.floor(points / 100) * 100}</p>
              </div>
              <div className="text-right">
                <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold mb-1">Cash Value</p>
                <p className="text-2xl font-black text-emerald-500">৳{Math.floor(points / 100)}</p>
              </div>
            </div>
          </div>
          
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleConvert}
            disabled={loading || points < 100}
            className="w-full relative group overflow-hidden bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-2xl transition-all disabled:opacity-50 shadow-xl shadow-emerald-900/20"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
            <span className="relative flex items-center justify-center gap-2 text-lg">
              {loading ? 'Processing...' : (
                <>
                  <Coins className="w-6 h-6" />
                  CONVERT POINTS NOW
                </>
              )}
            </span>
          </motion.button>
        </div>
      )}

      {activeTab === 'deposit' && (
        <form onSubmit={handleDeposit} className="space-y-4">
          <div className="bg-zinc-800 p-4 rounded-2xl border border-zinc-700 mb-4">
            <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-emerald-500" /> Instructions
            </h4>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Send money to our official numbers below. After sending, provide the amount and Transaction ID.
              <br /><br />
              <span className="text-emerald-500 font-bold">Bkash/Nagad/Rocket:</span> 01892975455 (Personal)
            </p>
          </div>
          
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Select Method</label>
            <select 
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-emerald-500"
            >
              <option>Bkash</option>
              <option>Nagad</option>
              <option>Rocket</option>
            </select>
          </div>

          <div>
            <label className="block text-zinc-400 text-sm mb-2">Amount (Taka)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Min ৳100"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-zinc-400 text-sm mb-2">Transaction ID</label>
            <input
              type="text"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="Enter TxnID from SMS"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            <ArrowUpCircle className="w-5 h-5" /> {loading ? 'Submitting...' : 'Submit Deposit Request'}
          </button>
        </form>
      )}

      {activeTab === 'withdraw' && (
        <form onSubmit={handleWithdraw} className="space-y-4">
          <div className="bg-zinc-800 p-4 rounded-2xl border border-zinc-700 mb-4">
            <p className="text-zinc-400 text-sm">
              Minimum withdrawal: <span className="text-white font-bold">৳500</span>
              <br />
              Processing time: <span className="text-white font-bold">12-24 Hours</span>
            </p>
          </div>

          <div>
            <label className="block text-zinc-400 text-sm mb-2">Select Method</label>
            <select 
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-emerald-500"
            >
              <option>Bkash</option>
              <option>Nagad</option>
              <option>Rocket</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-zinc-400 text-sm">Withdraw Amount</label>
              <span className="bg-emerald-500/10 text-emerald-500 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-tighter">
                Min ৳500
              </span>
            </div>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount (Min ৳500)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-emerald-500 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-zinc-400 text-sm mb-2">Your Account Number</label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="01XXXXXXXXX"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || Number(amount) > balance || Number(amount) < 500}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ArrowDownCircle className="w-5 h-5" /> {loading ? 'Processing...' : 'Request Payout'}
          </button>
        </form>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          {loading && history.length === 0 ? (
            <div className="text-center text-zinc-500 py-8">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-center text-zinc-500 py-8">No transactions found.</div>
          ) : (
            history.map((tx) => (
              <div key={tx.id} className="bg-zinc-800/50 border border-zinc-700/50 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${
                    tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-500' : 
                    tx.type === 'withdraw' ? 'bg-red-500/10 text-red-500' : 
                    'bg-blue-500/10 text-blue-500'
                  }`}>
                    {tx.type === 'deposit' ? <ArrowUpCircle size={20} /> : 
                     tx.type === 'withdraw' ? <ArrowDownCircle size={20} /> : 
                     <Coins size={20} />}
                  </div>
                  <div>
                    <p className="text-white font-bold capitalize">{tx.type}</p>
                    <p className="text-xs text-zinc-500">
                      {tx.timestamp ? new Date(tx.timestamp.toDate()).toLocaleDateString() : 'Just now'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${
                    tx.type === 'deposit' ? 'text-emerald-500' : 
                    tx.type === 'withdraw' ? 'text-white' : 
                    'text-blue-500'
                  }`}>
                    {tx.type === 'withdraw' ? '-' : '+'}৳{tx.amount}
                  </p>
                  <p className={`text-[10px] font-bold uppercase ${
                    tx.status === 'completed' || tx.status === 'approved' ? 'text-emerald-500' : 
                    tx.status === 'rejected' ? 'text-red-500' : 
                    'text-yellow-500'
                  }`}>
                    {tx.status}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
