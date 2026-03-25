import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plane, TrendingUp, Wallet, AlertCircle, CheckCircle2, History, Play, StopCircle, Coins, Users as UsersIcon, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../firebase';
import { doc, updateDoc, increment, addDoc, collection, serverTimestamp, onSnapshot, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { playSound, startPlaneSound, stopPlaneSound, updatePlanePitch } from '../lib/audioUtils';

const CRASH_SPEED = 60;

interface LiveBet {
  user: string;
  amount: number;
  multiplier?: number;
  status: 'betting' | 'cashed' | 'crashed';
}

const NAMES = ['Abir', 'Sabbir', 'Rahat', 'Mim', 'Sumaiya', 'Arif', 'Joy', 'Nabil', 'Riya', 'Tania', 'Sakib', 'Tamim'];

const Rocket = ({ className }: { className?: string }) => (
  <div className={`relative ${className}`}>
    {/* Fire Effect */}
    <motion.div
      animate={{ 
        scale: [1, 1.2, 1],
        opacity: [0.7, 1, 0.7],
        x: [0, -2, 0]
      }}
      transition={{ duration: 0.2, repeat: Infinity }}
      className="absolute -left-8 top-1/2 -translate-y-1/2 flex items-center"
    >
      <div className="w-8 h-4 bg-gradient-to-r from-transparent via-orange-500 to-yellow-400 rounded-full blur-sm" />
      <div className="w-4 h-2 bg-white rounded-full blur-[2px] absolute right-0" />
    </motion.div>
    
    {/* Rocket Body */}
    <div className="relative w-16 h-10">
      {/* Fins */}
      <div className="absolute -top-2 left-2 w-4 h-4 bg-emerald-800 rounded-sm rotate-45" />
      <div className="absolute -bottom-2 left-2 w-4 h-4 bg-emerald-800 rounded-sm rotate-45" />
      
      {/* Main Body */}
      <div className="absolute inset-0 bg-emerald-500 rounded-l-lg rounded-r-[20px] border-r-4 border-emerald-600 shadow-lg" />
      
      {/* Character/Window */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-yellow-100 rounded-full border-2 border-emerald-700 overflow-hidden flex items-center justify-center">
        <div className="w-4 h-4 bg-orange-300 rounded-full relative">
          {/* Hat */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-2 bg-emerald-700 rounded-t-sm" />
          {/* Eyes */}
          <div className="absolute top-1 left-1 w-0.5 h-0.5 bg-black rounded-full" />
          <div className="absolute top-1 right-1 w-0.5 h-0.5 bg-black rounded-full" />
          {/* Smile */}
          <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-2 h-1 border-b border-black rounded-full" />
        </div>
      </div>
    </div>
  </div>
);

const Grid = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden">
    {/* Vertical Lines */}
    <div className="absolute inset-0 flex justify-between px-12 opacity-10">
      {[0, 5, 10, 15].map(s => (
        <div key={s} className="h-full w-px bg-zinc-500 relative">
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400 font-bold">{s}s</span>
        </div>
      ))}
    </div>
    {/* Horizontal Lines */}
    <div className="absolute inset-0 flex flex-col justify-between py-12 opacity-10">
      {[3.5, 3, 2.5, 2, 1.5, 1].map(m => (
        <div key={m} className="w-full h-px bg-zinc-500 relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 font-bold">{m}x</span>
        </div>
      ))}
    </div>
    {/* Planets/Stars */}
    <div className="absolute top-10 left-20 opacity-20"><Star size={20} className="text-zinc-500" /></div>
    <div className="absolute bottom-20 right-40 opacity-10 w-20 h-20 bg-zinc-700 rounded-full blur-xl" />
    <div className="absolute top-40 right-20 opacity-10 w-12 h-12 bg-zinc-600 rounded-full blur-lg" />
  </div>
);

export default function CrashGame() {
  const [betAmount, setBetAmount] = useState<string>('100');
  const [activeBet, setActiveBet] = useState<number>(0);
  const [nextRoundBet, setNextRoundBet] = useState<number>(0);
  const [gameState, setGameState] = useState<'waiting' | 'flying' | 'crashed'>('waiting');
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [crashPoint, setCrashPoint] = useState<number>(0);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveBets, setLiveBets] = useState<LiveBet[]>([]);
  const [userPoints, setUserPoints] = useState<number>(0);
  const [winDetails, setWinDetails] = useState<{ points: number; taka: string; multiplier: number } | null>(null);
  const [waitingTime, setWaitingTime] = useState<number>(10);
  const [controlTab, setControlTab] = useState<'manual' | 'auto'>('manual');
  const [isBetPlacedTemp, setIsBetPlacedTemp] = useState(false);
  const [adminCrashPoint, setAdminCrashPoint] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState<{ points: number; multiplier: number } | null>(null);
  
  const [autoCashOutEnabled, setAutoCashOutEnabled] = useState(false);
  const [autoCashOutMultiplier, setAutoCashOutMultiplier] = useState<string>('2.00');
  
  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const [autoBetRounds, setAutoBetRounds] = useState<string>('10');
  const [autoBetRoundsRemaining, setAutoBetRoundsRemaining] = useState<number>(0);
  
  const timerRef = useRef<number | null>(null);
  const multiplierRef = useRef<number>(1.0);
  const waitingTimerRef = useRef<number | null>(null);
  const nextRoundBetRef = useRef<number>(0);
  const activeBetRef = useRef<number>(0);
  const autoCashOutEnabledRef = useRef<boolean>(false);
  const autoCashOutMultiplierRef = useRef<number>(2.0);

  useEffect(() => {
    autoCashOutEnabledRef.current = autoCashOutEnabled;
  }, [autoCashOutEnabled]);

  useEffect(() => {
    const val = parseFloat(autoCashOutMultiplier);
    if (!isNaN(val) && val > 1) {
      autoCashOutMultiplierRef.current = val;
    }
  }, [autoCashOutMultiplier]);

  useEffect(() => {
    nextRoundBetRef.current = nextRoundBet;
  }, [nextRoundBet]);

  useEffect(() => {
    activeBetRef.current = activeBet;
  }, [activeBet]);

  // Auto Bet Logic
  useEffect(() => {
    if (gameState === 'waiting' && autoBetEnabled && autoBetRoundsRemaining > 0 && nextRoundBet === 0) {
      const timer = setTimeout(() => {
        placeBet();
        setAutoBetRoundsRemaining(prev => {
          const next = prev - 1;
          if (next <= 0) setAutoBetEnabled(false);
          return next;
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState, autoBetEnabled, autoBetRoundsRemaining, nextRoundBet]);

  // Fetch user points
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setUserPoints(doc.data().points || 0);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}`);
    });
    
    const adminUnsubscribe = onSnapshot(doc(db, 'admin_settings', 'games'), (doc) => {
      if (doc.exists() && doc.data().crashNextMultiplier) {
        setAdminCrashPoint(Number(doc.data().crashNextMultiplier));
      } else {
        setAdminCrashPoint(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'admin_settings/games');
    });

    return () => {
      unsubscribe();
      adminUnsubscribe();
    };
  }, []);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waitingTimerRef.current) clearInterval(waitingTimerRef.current);
      stopPlaneSound();
    };
  }, []);

  // Main Game Loop Controller
  useEffect(() => {
    if (gameState === 'waiting') {
      setMultiplier(1.0);
      multiplierRef.current = 1.0;
      setWaitingTime(10);
      generateLiveBets();
      setLastWin(null);
      
      if (waitingTimerRef.current) clearInterval(waitingTimerRef.current);
      waitingTimerRef.current = window.setInterval(() => {
        setWaitingTime(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (waitingTimerRef.current) clearInterval(waitingTimerRef.current);
    };
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'waiting' && waitingTime <= 0) {
      if (waitingTimerRef.current) clearInterval(waitingTimerRef.current);
      startFlyingPhase();
    }
  }, [waitingTime, gameState]);

  const startFlyingPhase = async () => {
    const point = await generateCrashPoint();
    setCrashPoint(point);
    setGameState('flying');
    
    // Lock in the bet for this round IMMEDIATELY
    const currentBet = nextRoundBetRef.current;
    setActiveBet(currentBet);
    activeBetRef.current = currentBet;
    setNextRoundBet(0);
    nextRoundBetRef.current = 0;
    
    startPlaneSound();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      // Multiplier growth logic
      const current = multiplierRef.current;
      let growth = 0.01;
      if (current > 100) growth = 1.0;
      else if (current > 50) growth = 0.5;
      else if (current > 10) growth = 0.1;
      else if (current > 2) growth = 0.02;

      multiplierRef.current = parseFloat((current + growth).toFixed(2));
      setMultiplier(multiplierRef.current);
      updatePlanePitch(multiplierRef.current);
      
      // Auto Cash Out Logic
      if (
        activeBetRef.current > 0 && 
        autoCashOutEnabledRef.current && 
        multiplierRef.current >= autoCashOutMultiplierRef.current
      ) {
        handleCashOut(autoCashOutMultiplierRef.current);
      } else if (multiplierRef.current >= point) {
        handleCrash(point);
      }
    }, CRASH_SPEED);

    // Update plays count in background
    if (auth.currentUser) {
      updateDoc(doc(db, 'users', auth.currentUser.uid), {
        'gameStats.crash.plays': increment(1)
      }).catch(console.error);
    }
  };

  const handleCrash = (point: number) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setGameState('crashed');
    stopPlaneSound();
    setLiveBets(prev => prev.map(b => b.status === 'betting' ? { ...b, status: 'crashed' } : b));
    playSound('fail');
    setHistory(prev => [point, ...prev].slice(0, 15));
    setActiveBet(0);
    activeBetRef.current = 0;
    
    setTimeout(() => {
      setGameState('waiting');
    }, 2000);
  };

  const placeBet = async () => {
    const amount = parseInt(betAmount);
    if (isNaN(amount) || amount < 10) {
      setMessage({ text: 'Minimum bet is 10 points', type: 'error' });
      return;
    }

    if (amount > userPoints) {
      setMessage({ text: 'Insufficient balance!', type: 'error' });
      return;
    }

    if (nextRoundBet > 0) {
      setMessage({ text: 'Bet already placed!', type: 'error' });
      return;
    }

    setLoading(true);
    
    // Optimistically set the bet so it's included even if the round starts while the network request is pending
    setNextRoundBet(amount);
    nextRoundBetRef.current = amount;
    
    try {
      await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
        points: increment(-amount)
      });
      setIsBetPlacedTemp(true);
      setTimeout(() => setIsBetPlacedTemp(false), 2000);
      setMessage({ text: 'Bet placed! Good luck!', type: 'success' });
      playSound('spin');
    } catch (err) {
      // Revert if failed
      setNextRoundBet(0);
      nextRoundBetRef.current = 0;
      if (activeBetRef.current === amount) {
        setActiveBet(0);
        activeBetRef.current = 0;
      }
      setMessage({ text: 'Failed to place bet', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const cancelBet = async () => {
    if (nextRoundBet === 0) return;
    
    // Prevent cancelling at the last second to avoid race conditions
    if (gameState === 'waiting' && waitingTime <= 1) return;

    setLoading(true);
    const amountToRefund = nextRoundBet;
    
    // Optimistically cancel
    setNextRoundBet(0);
    nextRoundBetRef.current = 0;

    try {
      await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
        points: increment(amountToRefund)
      });
      setMessage({ text: 'Bet cancelled', type: 'success' });
    } catch (err) {
      // Revert if failed
      setNextRoundBet(amountToRefund);
      nextRoundBetRef.current = amountToRefund;
      setMessage({ text: 'Failed to cancel bet', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCashOut = async (forcedMultiplier?: number | any) => {
    // Check if we are flying and have an active bet
    if (gameState !== 'flying' || activeBetRef.current <= 0) return;

    const finalMultiplier = typeof forcedMultiplier === 'number' ? forcedMultiplier : multiplierRef.current;
    const winAmount = Math.floor(activeBetRef.current * finalMultiplier);
    const winTaka = (winAmount / 100).toFixed(2);
    
    // Clear active bet immediately to prevent double cash out
    const currentBet = activeBetRef.current;
    setActiveBet(0);
    activeBetRef.current = 0;
    
    // Set lastWin immediately so the UI doesn't flicker to "Flying"
    setLastWin({ points: winAmount, multiplier: finalMultiplier });

    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
        points: increment(winAmount),
        'gameStats.crash.totalEarned': increment(winAmount)
      });

      // Update high score if current multiplier is higher
      const userRef = doc(db, 'users', auth.currentUser!.uid);
      const userDoc = await getDoc(userRef);
      const currentStats = userDoc.data()?.gameStats?.crash;
      const currentHighScore = currentStats?.highScore || 0;
      if (finalMultiplier * 100 > currentHighScore) {
        await updateDoc(userRef, {
          'gameStats.crash.highScore': Math.floor(finalMultiplier * 100)
        });
      }

      setWinDetails({
        points: winAmount,
        taka: winTaka,
        multiplier: finalMultiplier
      });
      
      playSound('win');
    } catch (err: any) {
      setMessage({ text: 'Error processing win', type: 'error' });
      setLastWin(null); // Revert if failed
    } finally {
      setLoading(false);
    }
  };

  // Simulated live bets update - Optimized to not depend on high-freq multiplier state
  useEffect(() => {
    if (gameState === 'flying') {
      const interval = setInterval(() => {
        setLiveBets(prev => prev.map(bet => {
          if (bet.status === 'betting' && Math.random() < 0.1 && multiplierRef.current > 1.2) {
            return { ...bet, status: 'cashed', multiplier: multiplierRef.current };
          }
          return bet;
        }));
      }, 600);
      return () => clearInterval(interval);
    }
  }, [gameState]);

  const generateLiveBets = () => {
    const count = Math.floor(Math.random() * 10) + 10;
    const bets: LiveBet[] = [];
    for (let i = 0; i < count; i++) {
      bets.push({
        user: NAMES[Math.floor(Math.random() * NAMES.length)] + ' ' + Math.floor(Math.random() * 99),
        amount: [10, 20, 50, 100, 200, 500, 1000, 2000][Math.floor(Math.random() * 8)],
        status: 'betting'
      });
    }
    setLiveBets(bets);
  };

  const generateCrashPoint = async () => {
    if (adminCrashPoint !== null) {
      return adminCrashPoint;
    }
    const rand = Math.random();
    if (rand < 0.12) return 1.0; // 12% instant crash
    const point = parseFloat((1 / (1 - Math.random() * 0.998)).toFixed(2));
    return Math.min(500, Math.max(1.01, point));
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 relative">
      {/* Top History Bar */}
      <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-2xl p-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 px-2 border-r border-zinc-800 mr-2">
          <History className="w-4 h-4 text-zinc-500" />
          <span className="text-[10px] font-bold text-zinc-500 uppercase">History</span>
        </div>
        {history.map((h, i) => (
          <motion.span 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            key={i} 
            className={`px-3 py-1 rounded-full text-[10px] font-black border flex-shrink-0 ${
              h >= 10.0 ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
              h >= 2.0 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 
              'bg-zinc-800/50 text-zinc-500 border-zinc-700/50'
            }`}
          >
            {h.toFixed(2)}x
          </motion.span>
        ))}
      </div>

      {/* Win Modal */}
      <AnimatePresence>
        {winDetails && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.5, y: 50, rotate: -5 }}
              animate={{ scale: 1, y: 0, rotate: 0 }}
              exit={{ scale: 0.5, y: 50, rotate: 5 }}
              className="bg-zinc-900 border-2 border-emerald-500 rounded-[40px] p-10 text-center max-w-sm w-full shadow-[0_0_100px_rgba(16,185,129,0.4)] relative overflow-hidden"
            >
              {/* Decorative background circles */}
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl" />

              <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20 relative z-10">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter relative z-10">Bet Successful!</h2>
              <div className="bg-zinc-950 rounded-3xl p-6 mb-6 border border-zinc-800 relative z-10">
                <div className="text-emerald-500 text-6xl font-black mb-2 tracking-tighter">{winDetails.multiplier.toFixed(2)}x</div>
                <div className="text-zinc-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-4">Multiplier Reached</div>
                <div className="h-px bg-zinc-800 w-full mb-4" />
                <div className="text-white text-4xl font-black mb-1">৳{winDetails.taka}</div>
                <div className="text-zinc-500 text-xs font-bold">{winDetails.points} Points Won</div>
              </div>
              <button 
                onClick={() => setWinDetails(null)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-2xl transition-all uppercase tracking-widest shadow-lg shadow-emerald-900/40 relative z-10 active:scale-95"
              >
                Collect Winnings
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-6">
        {/* Live Bets Sidebar */}
        <div className="hidden lg:flex bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden flex-col h-[600px]">
          <div className="p-4 border-b border-zinc-800 bg-zinc-950/50 flex items-center justify-between">
            <h3 className="text-white font-bold flex items-center gap-2 text-sm">
              <UsersIcon className="w-4 h-4 text-emerald-500" /> Live Bets
            </h3>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-zinc-500 uppercase font-bold">{liveBets.length} Online</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {liveBets.map((bet, i) => (
              <div key={i} className={`flex items-center justify-between p-2 rounded-lg text-[11px] transition-colors ${
                bet.status === 'cashed' ? 'bg-emerald-500/10 border border-emerald-500/20' : 
                bet.status === 'crashed' ? 'bg-red-500/5 border border-red-500/10 opacity-50' : 'bg-zinc-800/30'
              }`}>
                <span className="text-zinc-300 font-medium truncate w-20">{bet.user}</span>
                <span className="text-zinc-500">{bet.amount} pts</span>
                <span className={`font-bold w-12 text-right ${
                  bet.status === 'cashed' ? 'text-emerald-500' : 
                  bet.status === 'crashed' ? 'text-red-500' : 'text-zinc-600'
                }`}>
                  {bet.status === 'cashed' ? `${bet.multiplier?.toFixed(2)}x` : 
                   bet.status === 'crashed' ? '0.00x' : '-'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Main Game Area */}
        <div className="lg:col-span-3 flex flex-col gap-4 lg:gap-6">
          <div className="bg-[#1a1b23] rounded-3xl border border-zinc-800 p-4 lg:p-8 relative overflow-hidden h-[300px] sm:h-[400px] lg:h-[500px] flex flex-col items-center justify-center shrink-0">
            <Grid />

            
            {/* Flight Path SVG */}
            {gameState === 'flying' && (
              <svg className="absolute inset-0 pointer-events-none w-full h-full" viewBox="0 0 1000 500">
                <motion.path
                  d={`M 50 450 Q ${50 + (multiplier - 1) * 100} 450, ${Math.min(950, 50 + (multiplier - 1) * 200)} ${Math.max(50, 450 - (multiplier - 1) * 100)}`}
                  stroke="#28e13e"
                  strokeWidth="4"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.1 }}
                />
              </svg>
            )}

            {/* Status Indicator */}
            <div className="absolute top-6 right-6 flex items-center gap-2 bg-zinc-950/50 px-4 py-2 rounded-full border border-zinc-800 z-20">
              <span className={`w-2 h-2 rounded-full ${gameState === 'flying' ? 'bg-emerald-500 animate-pulse' : gameState === 'waiting' ? 'bg-yellow-500 animate-bounce' : 'bg-red-500'}`} />
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                {gameState === 'flying' ? 'Game in Progress' : gameState === 'waiting' ? `Next Round in ${waitingTime}s` : 'Plane Crashed'}
              </span>
            </div>

            {/* Active Bet Badge */}
            <AnimatePresence>
              {(activeBet > 0 || nextRoundBet > 0) && (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="absolute top-6 left-6 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl flex items-center gap-2 z-20"
                >
                  <Coins className="text-emerald-500 w-4 h-4" />
                  <span className="text-xs font-black text-white uppercase tracking-tight">
                    {activeBet > 0 ? `Active: ${activeBet} pts` : `Queued: ${nextRoundBet} pts`}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {gameState === 'waiting' && (
                <motion.div 
                  key="waiting"
                  initial={{ opacity: 0, scale: 0.9 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  exit={{ opacity: 0, scale: 1.1 }}
                  className="text-center space-y-4 relative z-10"
                >
                  <div className="relative inline-block">
                    <Rocket className="w-24 h-24 mx-auto mb-4 opacity-20" />
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 border-2 border-dashed border-emerald-500/20 rounded-full"
                    />
                  </div>
                  <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Waiting for Next Round</h2>
                  <div className="text-7xl font-black text-emerald-500 tracking-tighter">{waitingTime}s</div>
                  <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Place your bets now!</p>
                </motion.div>
              )}

              {(gameState === 'flying' || gameState === 'crashed') && (
                <motion.div 
                  key="multiplier"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center relative z-10"
                >
                  <h1 className={`text-9xl font-black tracking-tighter mb-4 transition-colors duration-300 ${gameState === 'crashed' ? 'text-red-500' : 'text-[#28e13e] drop-shadow-[0_0_20px_rgba(40,225,62,0.4)]'}`}>
                    {multiplier.toFixed(2)}x
                  </h1>
                  {gameState === 'crashed' && (
                    <motion.div 
                      initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                      className="text-red-500 font-black text-3xl uppercase tracking-[0.3em]"
                    >
                      CRASHED!
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Rocket Animation */}
            {gameState === 'flying' && (
              <motion.div 
                style={{
                  left: `${Math.min(85, 10 + (multiplier - 1) * 15)}%`,
                  bottom: `${Math.min(85, 20 + (multiplier - 1) * 10)}%`,
                }}
                className="absolute z-30"
              >
                <Rocket className="rotate-[-20deg]" />
              </motion.div>
            )}

            {/* Crash Explosion Effect */}
            <AnimatePresence>
              {gameState === 'crashed' && (
                <motion.div 
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 2, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-1/4 left-1/4 w-32 h-32 bg-red-500/20 rounded-full blur-3xl pointer-events-none"
                />
              )}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="bg-[#242631] rounded-3xl border border-zinc-800 p-4 lg:p-6 shadow-2xl shrink-0">
            {/* Manual/Auto Tabs */}
            <div className="flex bg-[#1a1b23] p-1 rounded-2xl mb-4 lg:mb-6 w-full max-w-xs mx-auto">
              <button 
                onClick={() => setControlTab('manual')}
                className={`flex-1 py-2 lg:py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${controlTab === 'manual' ? 'bg-[#28e13e] text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Manual
              </button>
              <button 
                onClick={() => setControlTab('auto')}
                className={`flex-1 py-2 lg:py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${controlTab === 'auto' ? 'bg-[#28e13e] text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Auto
              </button>
            </div>

            <div className="flex gap-3 lg:gap-6 items-stretch">
              <div className="flex-1 space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-zinc-500 text-[10px] uppercase tracking-widest font-black">Bet Amount</label>
                  <span className="text-zinc-500 text-[10px] font-black uppercase">Bal: {userPoints}</span>
                </div>
                <div className="flex items-center bg-[#1a1b23] border border-zinc-800 rounded-xl overflow-hidden">
                  <button 
                    onClick={() => setBetAmount(prev => Math.max(10, parseInt(prev || '0') - 10).toString())}
                    disabled={gameState === 'flying' && activeBet > 0}
                    className="px-3 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors font-black"
                  >
                    -
                  </button>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    value={betAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setBetAmount(val);
                    }}
                    disabled={gameState === 'flying' && activeBet > 0}
                    className="w-full bg-transparent text-center text-white font-black text-lg lg:text-xl focus:outline-none"
                    placeholder="0"
                  />
                  <button 
                    onClick={() => setBetAmount(prev => (parseInt(prev || '0') + 10).toString())}
                    disabled={gameState === 'flying' && activeBet > 0}
                    className="px-3 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors font-black"
                  >
                    +
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[50, 100, 200, 500].map(amt => (
                    <button 
                      key={amt}
                      onClick={() => setBetAmount(amt.toString())}
                      disabled={gameState === 'flying' && activeBet > 0}
                      className="bg-[#1a1b23] hover:bg-zinc-800 text-zinc-400 py-1.5 lg:py-2 rounded-lg font-black text-[10px] lg:text-xs transition-all border border-zinc-800"
                    >
                      {amt}
                    </button>
                  ))}
                </div>
                
                {controlTab === 'auto' && (
                  <div className="space-y-3 pt-2 border-t border-zinc-800/50">
                    {/* Auto Cash Out */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={autoCashOutEnabled}
                            onChange={(e) => setAutoCashOutEnabled(e.target.checked)}
                          />
                          <div className={`block w-10 h-6 rounded-full transition-colors ${autoCashOutEnabled ? 'bg-[#28e13e]' : 'bg-zinc-700'}`}></div>
                          <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${autoCashOutEnabled ? 'translate-x-4' : ''}`}></div>
                        </div>
                        <span className="text-zinc-400 text-[10px] uppercase font-black tracking-widest">Auto Cash Out</span>
                      </label>
                      
                      <div className="flex items-center bg-[#1a1b23] border border-zinc-800 rounded-xl overflow-hidden w-24">
                        <input 
                          type="text" 
                          inputMode="decimal"
                          value={autoCashOutMultiplier}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            if (val.split('.').length > 2) return; // Prevent multiple decimals
                            setAutoCashOutMultiplier(val);
                          }}
                          onBlur={() => {
                            const val = parseFloat(autoCashOutMultiplier);
                            if (isNaN(val) || val < 1.01) setAutoCashOutMultiplier('1.01');
                          }}
                          className="w-full bg-transparent text-center text-white font-black text-sm py-2 focus:outline-none"
                          placeholder="2.00"
                        />
                        <span className="text-zinc-500 text-xs font-black pr-2">x</span>
                      </div>
                    </div>

                    {/* Auto Bet */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={autoBetEnabled}
                            onChange={(e) => {
                              const enabled = e.target.checked;
                              setAutoBetEnabled(enabled);
                              if (enabled) {
                                setAutoBetRoundsRemaining(parseInt(autoBetRounds) || 10);
                              } else {
                                setAutoBetRoundsRemaining(0);
                              }
                            }}
                          />
                          <div className={`block w-10 h-6 rounded-full transition-colors ${autoBetEnabled ? 'bg-[#28e13e]' : 'bg-zinc-700'}`}></div>
                          <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${autoBetEnabled ? 'translate-x-4' : ''}`}></div>
                        </div>
                        <span className="text-zinc-400 text-[10px] uppercase font-black tracking-widest">Auto Bet</span>
                      </label>
                      
                      <div className="flex items-center bg-[#1a1b23] border border-zinc-800 rounded-xl overflow-hidden w-24">
                        <input 
                          type="text" 
                          inputMode="numeric"
                          value={autoBetEnabled ? autoBetRoundsRemaining.toString() : autoBetRounds}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            if (!autoBetEnabled) {
                              setAutoBetRounds(val);
                            }
                          }}
                          disabled={autoBetEnabled}
                          className={`w-full bg-transparent text-center font-black text-sm py-2 focus:outline-none ${autoBetEnabled ? 'text-[#28e13e]' : 'text-white'}`}
                          placeholder="10"
                        />
                        <span className="text-zinc-500 text-[10px] font-black pr-2 uppercase">Rds</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="w-32 sm:w-48 lg:w-64 flex">
                {activeBet > 0 && gameState === 'flying' ? (
                  <button 
                    onClick={handleCashOut}
                    disabled={loading}
                    className="w-full h-full bg-[#ff9900] hover:bg-[#ffaa33] text-black font-black rounded-2xl transition-all shadow-[0_0_30px_rgba(255,153,0,0.4)] flex flex-col items-center justify-center leading-tight active:scale-95 animate-pulse"
                  >
                    <span className="text-xl lg:text-3xl font-black tracking-tighter uppercase">Cash Out</span>
                    <div className="flex flex-col items-center mt-1">
                      <span className="text-sm font-bold opacity-80">{Math.floor(activeBet * multiplier)} pts</span>
                    </div>
                  </button>
                ) : lastWin && gameState === 'flying' ? (
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full h-full bg-emerald-500/10 border-2 border-emerald-500/50 text-emerald-500 font-black rounded-2xl flex flex-col items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.2)]"
                  >
                    <span className="text-[10px] uppercase tracking-[0.3em] mb-1 opacity-70">Cashed Out</span>
                    <span className="text-xl lg:text-3xl font-black tracking-tighter">{lastWin.points} pts</span>
                    <span className="text-xs font-bold opacity-60">{lastWin.multiplier.toFixed(2)}x</span>
                  </motion.div>
                ) : nextRoundBet > 0 ? (
                  <button 
                    onClick={cancelBet}
                    disabled={loading || (gameState === 'waiting' && waitingTime <= 1)}
                    className="w-full h-full bg-red-500 hover:bg-red-600 text-white font-black rounded-2xl transition-all shadow-[0_0_30px_rgba(239,68,68,0.3)] flex flex-col items-center justify-center gap-1 disabled:opacity-50 active:scale-95"
                  >
                    <span className="text-lg lg:text-2xl uppercase tracking-tighter">Cancel</span>
                    <span className="text-[10px] uppercase opacity-80 font-black tracking-widest">
                      {gameState === 'waiting' ? 'Round Starting' : 'Next Round'}
                    </span>
                  </button>
                ) : (
                  <button 
                    onClick={placeBet}
                    disabled={loading || parseInt(betAmount) > userPoints}
                    className="w-full h-full bg-[#28e13e] hover:bg-[#22c536] text-black font-black rounded-2xl transition-all shadow-[0_0_30px_rgba(40,225,62,0.3)] flex flex-col items-center justify-center gap-1 disabled:opacity-50 active:scale-95"
                  >
                    <span className="text-xl lg:text-3xl uppercase tracking-tighter">Bet</span>
                    <span className="text-[10px] uppercase opacity-60 font-black tracking-widest">
                      {gameState === 'waiting' ? 'Next Round' : 'For Next Round'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Info Cards */}
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-4 lg:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-yellow-500/10 rounded-2xl flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 lg:w-6 lg:h-6 text-yellow-500" />
              </div>
              <div>
                <h4 className="text-white font-black text-xs lg:text-sm uppercase tracking-tight">Max Multiplier</h4>
                <p className="text-zinc-500 text-[10px] lg:text-xs">Win up to 500x your bet amount!</p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-emerald-500 font-black text-lg lg:text-xl">৳1.00 = 100 Pts</div>
              <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Exchange Rate</div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {message && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-24 right-8 p-4 rounded-2xl flex items-center gap-3 border shadow-2xl z-50 ${
              message.type === 'success' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-red-500 text-white border-red-400'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <p className="text-sm font-bold">{message.text}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
