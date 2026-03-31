import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wallet, AlertCircle, CheckCircle2, History, Play, StopCircle, Coins, Target, Flame, Trophy, Crosshair } from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, updateDoc, increment, addDoc, collection, serverTimestamp, onSnapshot, getDoc, query, orderBy, limit } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { playSound } from '../lib/audioUtils';

const MULTIPLIERS = [1.2, 1.5, 2.0, 2.8, 4.0, 6.0, 9.0, 15.0, 25.0, 50.0, 100.0];

export default function FireShotGame() {
  const [betAmount, setBetAmount] = useState<string>('100');
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'shooting' | 'won' | 'lost' | 'cashed_out'>('waiting');
  const [multiplierIndex, setMultiplierIndex] = useState(0);
  const [userPoints, setUserPoints] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([]);
  const [adminSettings, setAdminSettings] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isFiring, setIsFiring] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'users'),
      orderBy('gameStats.fireshot.highScore', 'desc'),
      limit(500)
    );
    const leaderboardUnsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLeaderboard(data);
    });

    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setUserPoints(doc.data().points || 0);
      }
    });

    const adminUnsubscribe = onSnapshot(doc(db, 'admin_settings', 'games'), (doc) => {
      if (doc.exists()) {
        setAdminSettings(doc.data());
      }
    });

    return () => {
      unsubscribe();
      adminUnsubscribe();
      leaderboardUnsubscribe();
    };
  }, []);

  const startGame = async () => {
    const amount = Number(betAmount);
    if (isNaN(amount) || amount < 10) {
      setMessage({ text: 'Minimum bet is 10 Taka', type: 'error' });
      return;
    }
    if (amount > userPoints) {
      setMessage({ text: 'Insufficient balance', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser!.uid);
      await updateDoc(userRef, {
        points: increment(-amount),
        'gameStats.fireshot.plays': increment(1)
      });
      
      setMultiplierIndex(0);
      setGameState('playing');
      setMessage(null);
      playSound('spin');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
      setMessage({ text: 'Failed to place bet', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleShoot = async () => {
    if (gameState !== 'playing' || isFiring) return;

    setIsFiring(true);
    setGameState('shooting');
    playSound('shot');

    // Simulate fireball flight
    setTimeout(async () => {
      const currentMultiplier = MULTIPLIERS[multiplierIndex];
      let isHit = Math.random() > 0.3; // 70% chance to hit by default

      // Admin Control
      if (adminSettings?.fireshotNextMultiplier) {
        if (currentMultiplier >= adminSettings.fireshotNextMultiplier) {
          isHit = false;
        }
      }

      if (isHit) {
        playSound('win');
        if (multiplierIndex === MULTIPLIERS.length - 1) {
          // Max multiplier reached
          await cashOut(multiplierIndex);
        } else {
          setMultiplierIndex(prev => prev + 1);
          setGameState('playing');
        }
      } else {
        playSound('fail');
        setGameState('lost');
        setHistory(prev => [{ multiplier: 0, won: false }, ...prev].slice(0, 10));
        setMessage({ text: 'Missed the target!', type: 'error' });
      }
      setIsFiring(false);
    }, 1000);
  };

  const cashOut = async (index = multiplierIndex - 1) => {
    if (gameState !== 'playing' && gameState !== 'shooting' && gameState !== 'won') return;
    if (index < 0) return;

    setLoading(true);
    try {
      const amount = Number(betAmount);
      const currentMultiplier = MULTIPLIERS[index];
      const winAmount = amount * currentMultiplier;

      const userRef = doc(db, 'users', auth.currentUser!.uid);
      await updateDoc(userRef, {
        points: increment(winAmount),
        'gameStats.fireshot.totalEarned': increment(winAmount - amount)
      });

      // Update high score
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const currentHighScore = userDoc.data().gameStats?.fireshot?.highScore || 0;
        if (winAmount > currentHighScore) {
          await updateDoc(userRef, { 'gameStats.fireshot.highScore': winAmount });
        }
      }

      setGameState('cashed_out');
      setHistory(prev => [{ multiplier: currentMultiplier, won: true }, ...prev].slice(0, 10));
      setMessage({ text: `Cashed out ৳${winAmount.toFixed(2)}!`, type: 'success' });
      playSound('win');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
      setMessage({ text: 'Failed to cash out', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const currentMultiplier = multiplierIndex > 0 ? MULTIPLIERS[multiplierIndex - 1] : 1.0;
  const nextMultiplier = MULTIPLIERS[multiplierIndex];
  const potentialWin = Number(betAmount) * currentMultiplier;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8 font-sans selection:bg-orange-500/30">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900 p-6 rounded-3xl border border-zinc-800">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <span className="text-orange-500">Fire</span> Shot
            </h1>
            <p className="text-zinc-400 font-medium mt-1">Shoot the targets, build the multiplier!</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowLeaderboard(!showLeaderboard)}
              className={`p-3 rounded-2xl border transition-all ${showLeaderboard ? 'bg-orange-500 text-black border-orange-500' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}
              title="Leaderboard"
            >
              <Trophy size={24} />
            </button>
            <div className="flex items-center gap-4 bg-zinc-950 px-6 py-3 rounded-2xl border border-zinc-800">
              <Wallet className="text-orange-500" />
              <div>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Balance</p>
                <p className="font-mono font-bold text-lg">৳{userPoints.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showLeaderboard && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Trophy className="text-yellow-500" /> Top 500 Fire Shot Players
                </h2>
                <button onClick={() => setShowLeaderboard(false)} className="text-zinc-500 hover:text-white">Close</button>
              </div>
              <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-zinc-950/50 text-zinc-500 text-xs uppercase sticky top-0 z-10">
                    <tr>
                      <th className="p-4">Rank</th>
                      <th className="p-4">Player</th>
                      <th className="p-4">High Score</th>
                      <th className="p-4">Total Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {leaderboard.map((player, index) => (
                      <tr key={player.id} className={`hover:bg-zinc-800/30 transition-colors ${player.id === auth.currentUser?.uid ? 'bg-orange-500/5' : ''}`}>
                        <td className="p-4">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-yellow-500 text-black' : 
                            index === 1 ? 'bg-zinc-300 text-black' : 
                            index === 2 ? 'bg-orange-400 text-black' : 
                            'bg-zinc-800 text-zinc-400'
                          }`}>
                            {index + 1}
                          </span>
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-white">{player.displayName || 'Anonymous'}</p>
                          <p className="text-xs text-zinc-500">{player.email?.split('@')[0]}</p>
                        </td>
                        <td className="p-4 font-mono font-bold text-orange-500">৳{player.gameStats?.fireshot?.highScore?.toFixed(2) || '0.00'}</td>
                        <td className="p-4 font-mono font-bold text-emerald-500">৳{player.gameStats?.fireshot?.totalEarned?.toFixed(2) || '0.00'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Controls */}
          <div className="space-y-6">
            <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-500">
                  <Coins size={24} />
                </div>
                <h3 className="text-xl font-bold">Bet Configuration</h3>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-500 font-bold uppercase tracking-widest mb-2 block">Amount (৳)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      disabled={gameState === 'playing' || gameState === 'shooting'}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-4 px-6 text-xl font-mono font-bold focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[100, 500, 1000, 5000].map(amt => (
                    <button 
                      key={amt}
                      onClick={() => setBetAmount(amt.toString())}
                      disabled={gameState === 'playing' || gameState === 'shooting'}
                      className="bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl font-bold transition-colors disabled:opacity-50"
                    >
                      ৳{amt}
                    </button>
                  ))}
                </div>

                {gameState === 'waiting' || gameState === 'lost' || gameState === 'cashed_out' ? (
                  <button 
                    onClick={startGame}
                    disabled={loading}
                    className="w-full bg-orange-500 hover:bg-orange-400 text-black font-black py-5 rounded-2xl transition-all flex items-center justify-center gap-3 text-lg shadow-lg shadow-orange-500/20 active:scale-95 disabled:opacity-50"
                  >
                    <Play fill="currentColor" /> START GAME
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={handleShoot}
                      disabled={gameState !== 'playing' || isFiring}
                      className="bg-orange-500 hover:bg-orange-400 text-black font-black py-5 rounded-2xl transition-all flex items-center justify-center gap-3 text-lg shadow-lg shadow-orange-500/20 active:scale-95 disabled:opacity-50"
                    >
                      <Crosshair /> SHOOT
                    </button>
                    <button 
                      onClick={() => cashOut()}
                      disabled={multiplierIndex === 0 || isFiring}
                      className="bg-emerald-500 hover:bg-emerald-400 text-black font-black py-5 rounded-2xl transition-all flex items-center justify-center gap-3 text-lg shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                    >
                      <StopCircle /> CASH OUT
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* History */}
            <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-zinc-800 rounded-2xl text-zinc-400">
                  <History size={24} />
                </div>
                <h3 className="text-xl font-bold">Recent Plays</h3>
              </div>
              <div className="space-y-2">
                {history.length === 0 && <p className="text-zinc-500 text-center py-4">No history yet</p>}
                {history.map((h, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-zinc-950 rounded-xl border border-zinc-800/50">
                    <span className={`font-bold ${h.won ? 'text-emerald-500' : 'text-red-500'}`}>
                      {h.won ? 'WIN' : 'LOSS'}
                    </span>
                    <span className="font-mono font-bold">{h.multiplier.toFixed(2)}x</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Game Board */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-[40px] p-8 h-[600px] relative overflow-hidden flex flex-col items-center justify-between">
              {/* Background effects */}
              <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-orange-500/5 rounded-full blur-[100px]" />
                <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-orange-500/5 rounded-full blur-[100px]" />
              </div>

              {/* Multiplier Display */}
              <div className="text-center relative z-10">
                <motion.div 
                  key={currentMultiplier}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-8xl font-black text-white tracking-tighter"
                >
                  {currentMultiplier.toFixed(2)}<span className="text-orange-500">x</span>
                </motion.div>
                <p className="text-zinc-500 font-bold uppercase tracking-widest mt-2">Current Multiplier</p>
                {gameState === 'playing' && (
                  <motion.div 
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="mt-4 text-emerald-500 font-bold"
                  >
                    Next: {nextMultiplier.toFixed(2)}x
                  </motion.div>
                )}
              </div>

              {/* Game Area */}
              <div className="flex-1 w-full flex items-center justify-center relative">
                {/* Target */}
                <motion.div 
                  animate={gameState === 'shooting' ? { scale: [1, 1.2, 1], opacity: [1, 0.5, 1] } : {}}
                  className="relative"
                >
                  <Target size={160} className={`transition-colors ${gameState === 'lost' ? 'text-red-500' : 'text-zinc-800'}`} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 bg-orange-500 rounded-full animate-pulse blur-sm" />
                    <div className="w-4 h-4 bg-white rounded-full absolute" />
                  </div>
                </motion.div>

                {/* Fireball Animation */}
                <AnimatePresence>
                  {isFiring && (
                    <motion.div 
                      initial={{ y: 200, scale: 0.5, opacity: 0 }}
                      animate={{ y: 0, scale: 1, opacity: 1 }}
                      exit={{ scale: 2, opacity: 0 }}
                      className="absolute bottom-0 z-20"
                    >
                      <Flame size={64} className="text-orange-500 fill-orange-500" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Cannon */}
                <div className="absolute bottom-0 flex flex-col items-center">
                  <div className="w-16 h-24 bg-zinc-800 rounded-t-full border-4 border-zinc-700 relative">
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-zinc-900 rounded-full" />
                  </div>
                  <div className="w-32 h-12 bg-zinc-900 rounded-xl border-b-4 border-zinc-950" />
                </div>
              </div>

              {/* Potential Win */}
              <div className="w-full bg-zinc-950/50 p-6 rounded-3xl border border-zinc-800 flex justify-between items-center relative z-10">
                <div>
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Potential Win</p>
                  <p className="text-2xl font-mono font-bold text-emerald-500">৳{potentialWin.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Next Multiplier</p>
                  <p className="text-2xl font-mono font-bold text-orange-500">{nextMultiplier.toFixed(2)}x</p>
                </div>
              </div>
            </div>

            {/* Status Message */}
            <AnimatePresence>
              {message && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className={`p-6 rounded-3xl border flex items-center gap-4 ${
                    message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
                  }`}
                >
                  {message.type === 'success' ? <CheckCircle2 /> : <AlertCircle />}
                  <span className="font-bold">{message.text}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
