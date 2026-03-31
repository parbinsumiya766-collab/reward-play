import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wallet, AlertCircle, CheckCircle2, History, Play, StopCircle, Coins, ShieldAlert, ShieldCheck, Skull, Trophy } from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, updateDoc, increment, addDoc, collection, serverTimestamp, onSnapshot, getDoc, query, orderBy, limit } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { playSound } from '../lib/audioUtils';

type Difficulty = 'easy' | 'medium' | 'hard';
type GameState = 'idle' | 'playing' | 'cashed_out' | 'lost';

const MULTIPLIERS = {
  easy: [1.45, 2.18, 3.27, 4.91, 7.36],
  medium: [1.96, 3.92, 7.84, 15.68, 31.36],
  hard: [2.94, 8.82, 26.46, 79.38, 238.14]
};

const GRID_CONFIG = {
  easy: { columns: 3, traps: 1 },
  medium: { columns: 2, traps: 1 },
  hard: { columns: 3, traps: 2 }
};

const STEPS = 5;

const MurgiIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={`w-full h-full drop-shadow-lg ${className}`}>
    <path d="M40 70 L40 90 M40 90 L30 95 M40 90 L50 95" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M60 70 L60 90 M60 90 L50 95 M60 90 L70 95" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M20 50 C20 20, 80 20, 80 50 C80 80, 20 80, 20 50 Z" fill="#FCD34D" />
    <path d="M30 50 C30 40, 60 40, 50 60 C40 70, 30 60, 30 50 Z" fill="#FBBF24" />
    <path d="M20 50 C10 40, 5 50, 15 60 Z" fill="#FCD34D" />
    <path d="M70 40 C70 20, 90 20, 90 40 C90 50, 80 60, 70 40 Z" fill="#FCD34D" />
    <path d="M75 25 C75 10, 85 10, 85 25 Z" fill="#EF4444" />
    <path d="M82 22 C82 12, 92 12, 92 22 Z" fill="#EF4444" />
    <path d="M90 35 L100 40 L90 45 Z" fill="#F59E0B" />
    <path d="M85 45 C85 55, 95 55, 90 45 Z" fill="#EF4444" />
    <circle cx="80" cy="35" r="3" fill="#1F2937" />
  </svg>
);

const BoneIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={`w-full h-full drop-shadow-lg ${className}`}>
    <path d="M20 50 L80 50" stroke="#D1D5DB" strokeWidth="12" strokeLinecap="round" />
    <circle cx="20" cy="40" r="10" fill="#D1D5DB" />
    <circle cx="20" cy="60" r="10" fill="#D1D5DB" />
    <circle cx="80" cy="40" r="10" fill="#D1D5DB" />
    <circle cx="80" cy="60" r="10" fill="#D1D5DB" />
  </svg>
);

export default function MurgiGame() {
  const [betAmount, setBetAmount] = useState<string>('10');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [gameState, setGameState] = useState<GameState>('idle');
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [grid, setGrid] = useState<boolean[][]>([]); // true = safe, false = trap
  const [path, setPath] = useState<number[]>([]); // chosen column index per step
  
  const [userPoints, setUserPoints] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([]);
  const [adminSettings, setAdminSettings] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      orderBy('gameStats.murgi.highScore', 'desc'),
      limit(500)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLeaderboard(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setUserPoints(doc.data().points || 0);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });
    return () => unsubscribe();
  }, []);

  const generateGrid = (diff: Difficulty) => {
    const config = GRID_CONFIG[diff];
    const newGrid: boolean[][] = [];
    for (let i = 0; i < STEPS; i++) {
      const row = Array(config.columns).fill(true);
      let trapsPlaced = 0;
      while (trapsPlaced < config.traps) {
        const randIdx = Math.floor(Math.random() * config.columns);
        if (row[randIdx]) {
          row[randIdx] = false;
          trapsPlaced++;
        }
      }
      newGrid.push(row);
    }
    return newGrid;
  };

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
        'gameStats.murgi.plays': increment(1)
      });
      
      setGrid(generateGrid(difficulty));
      setPath([]);
      setCurrentStep(0);
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

  const handleTileClick = async (colIndex: number) => {
    if (gameState !== 'playing') return;

    let isSafe = grid[currentStep][colIndex];
    
    // Admin Control: Force trap if next multiplier exceeds admin setting
    if (adminSettings?.murgiNextMultiplier) {
      const nextMult = MULTIPLIERS[difficulty][currentStep];
      if (nextMult >= adminSettings.murgiNextMultiplier) {
        isSafe = false;
      }
    }

    const newPath = [...path, colIndex];
    setPath(newPath);

    if (isSafe) {
      playSound('win');
      if (currentStep === STEPS - 1) {
        // Won the whole game
        await cashOut(newPath);
      } else {
        setCurrentStep(prev => prev + 1);
      }
    } else {
      // Hit a trap
      playSound('fail');
      setGameState('lost');
      setHistory(prev => [{ multiplier: 0, won: false }, ...prev].slice(0, 10));
      setMessage({ text: 'You hit a trap!', type: 'error' });
    }
  };

  const cashOut = async (currentPath = path) => {
    if (gameState !== 'playing' || currentPath.length === 0) return;

    setLoading(true);
    try {
      const amount = Number(betAmount);
      const currentMultiplier = MULTIPLIERS[difficulty][currentPath.length - 1];
      const winAmount = amount * currentMultiplier;

      const userRef = doc(db, 'users', auth.currentUser!.uid);
      await updateDoc(userRef, {
        points: increment(winAmount),
        'gameStats.murgi.totalEarned': increment(winAmount - amount)
      });

      // Update high score
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const currentHighScore = userDoc.data().gameStats?.murgi?.highScore || 0;
        if (winAmount > currentHighScore) {
          await updateDoc(userRef, { 'gameStats.murgi.highScore': winAmount });
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

  const currentMultiplier = path.length > 0 ? MULTIPLIERS[difficulty][path.length - 1] : 1.0;
  const nextMultiplier = MULTIPLIERS[difficulty][currentStep];
  const potentialWin = Number(betAmount) * currentMultiplier;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8 font-sans selection:bg-orange-500/30">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900 p-6 rounded-3xl border border-zinc-800">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <span className="text-orange-500">Murgi</span> Game
            </h1>
            <p className="text-zinc-400 font-medium mt-1">Cross the road, avoid the traps!</p>
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
                  <Trophy className="text-yellow-500" /> Top 500 Murgi Players
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
                        <td className="p-4 font-mono font-bold text-orange-500">৳{player.gameStats?.murgi?.highScore?.toFixed(2) || '0.00'}</td>
                        <td className="p-4 font-mono font-bold text-emerald-500">৳{player.gameStats?.murgi?.totalEarned?.toFixed(2) || '0.00'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {message && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl flex items-center gap-3 font-bold ${
              message.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 /> : <AlertCircle />}
            {message.text}
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Controls Panel */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Coins className="text-orange-500" /> Place Bet
              </h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Bet Amount (Taka)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">৳</span>
                    <input
                      type="number"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      disabled={gameState === 'playing' || loading}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-4 pl-8 pr-4 text-white font-mono font-bold focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-50"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[10, 20, 50].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setBetAmount(amt.toString())}
                        disabled={gameState === 'playing' || loading}
                        className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 py-2 rounded-lg text-sm font-bold transition-colors"
                      >
                        +{amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Difficulty</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['easy', 'medium', 'hard'] as Difficulty[]).map(diff => (
                      <button
                        key={diff}
                        onClick={() => setDifficulty(diff)}
                        disabled={gameState === 'playing' || loading}
                        className={`py-3 rounded-xl text-sm font-bold capitalize transition-all ${
                          difficulty === diff 
                            ? 'bg-orange-500 text-black shadow-[0_0_15px_rgba(249,115,22,0.3)]' 
                            : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:border-zinc-600'
                        } disabled:opacity-50`}
                      >
                        {diff === 'easy' ? 'সহজ' : diff === 'medium' ? 'গড়' : 'কঠিন'}
                      </button>
                    ))}
                  </div>
                </div>

                {gameState === 'playing' ? (
                  <button
                    onClick={() => cashOut()}
                    disabled={loading || path.length === 0}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black text-lg py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <StopCircle />
                    Cash Out (৳{potentialWin.toFixed(2)})
                  </button>
                ) : (
                  <button
                    onClick={startGame}
                    disabled={loading}
                    className="w-full bg-orange-500 hover:bg-orange-400 text-black font-black text-lg py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(249,115,22,0.2)] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Play />
                    {gameState === 'cashed_out' || gameState === 'lost' ? 'Play Again' : 'Start Game'}
                  </button>
                )}
              </div>
            </div>

            {/* History */}
            <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <History className="text-zinc-500" size={20} /> Recent Plays
              </h2>
              <div className="flex flex-wrap gap-2">
                {history.map((h, i) => (
                  <div 
                    key={i} 
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold font-mono ${
                      h.won ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                    }`}
                  >
                    {h.multiplier.toFixed(2)}x
                  </div>
                ))}
                {history.length === 0 && <p className="text-zinc-500 text-sm">No recent plays</p>}
              </div>
            </div>
          </div>

          {/* Game Area */}
          <div className="lg:col-span-2 bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden relative min-h-[500px] flex flex-col">
            
            {/* Top Bar */}
            <div className="bg-zinc-950/50 p-4 border-b border-zinc-800 flex justify-between items-center z-10">
              <div className="flex items-center gap-4">
                <div className="bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800">
                  <span className="text-zinc-500 text-xs font-bold uppercase mr-2">Current</span>
                  <span className="text-white font-mono font-bold">{currentMultiplier.toFixed(2)}x</span>
                </div>
                {gameState === 'playing' && currentStep < STEPS && (
                  <div className="bg-orange-500/10 px-4 py-2 rounded-xl border border-orange-500/20">
                    <span className="text-orange-500/70 text-xs font-bold uppercase mr-2">Next</span>
                    <span className="text-orange-500 font-mono font-bold">{nextMultiplier.toFixed(2)}x</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-emerald-500" size={20} />
                <span className="text-sm font-bold text-zinc-400 capitalize">{difficulty} Mode</span>
              </div>
            </div>

            {/* Grid Area */}
            <div className="flex-1 p-6 flex flex-col justify-end gap-4 relative">
              {/* Background Decoration */}
              <div className="absolute inset-0 pointer-events-none opacity-5 flex flex-col justify-between py-10">
                {[...Array(STEPS)].map((_, i) => (
                  <div key={i} className="w-full h-px bg-white" />
                ))}
              </div>

              {gameState === 'idle' && (
                <div className="absolute inset-0 flex items-center justify-center z-20 bg-zinc-950/80 backdrop-blur-sm">
                  <div className="text-center">
                    <MurgiIcon className="w-32 h-32 mx-auto mb-6 opacity-50" />
                    <h2 className="text-2xl font-bold text-zinc-400">Place a bet to start</h2>
                  </div>
                </div>
              )}

              {/* Render Rows (Reverse order so step 0 is at bottom) */}
              {[...Array(STEPS)].map((_, stepIndexRaw) => {
                const stepIndex = STEPS - 1 - stepIndexRaw;
                const isCurrentRow = gameState === 'playing' && currentStep === stepIndex;
                const isPastRow = path.length > stepIndex;
                const rowMultiplier = MULTIPLIERS[difficulty][stepIndex];
                const cols = GRID_CONFIG[difficulty].columns;

                return (
                  <div key={stepIndex} className="flex items-center gap-4 relative z-10">
                    {/* Multiplier Label */}
                    <div className="w-16 text-right">
                      <span className={`font-mono font-bold text-sm ${
                        isPastRow ? 'text-emerald-500' : isCurrentRow ? 'text-orange-500' : 'text-zinc-600'
                      }`}>
                        {rowMultiplier.toFixed(2)}x
                      </span>
                    </div>

                    {/* Tiles */}
                    <div className="flex-1 grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                      {[...Array(cols)].map((_, colIndex) => {
                        const isChosen = path[stepIndex] === colIndex;
                        const isRevealed = isPastRow || gameState === 'lost' || gameState === 'cashed_out';
                        const isSafe = grid.length > 0 ? grid[stepIndex][colIndex] : true;
                        
                        let tileContent = null;
                        let tileClass = "bg-zinc-800/50 border-zinc-700";

                        if (isRevealed) {
                          if (isSafe) {
                            tileContent = <MurgiIcon className="w-12 h-12" />;
                            tileClass = isChosen ? "bg-emerald-500/20 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "bg-zinc-800/50 border-zinc-700 opacity-50";
                          } else {
                            tileContent = <BoneIcon className="w-12 h-12" />;
                            tileClass = (isChosen && gameState === 'lost') ? "bg-red-500/20 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]" : "bg-zinc-800/50 border-zinc-700 opacity-50";
                          }
                        } else if (isCurrentRow) {
                          tileClass = "bg-zinc-800 border-orange-500/50 hover:border-orange-500 hover:bg-zinc-700 cursor-pointer transition-all shadow-[0_0_10px_rgba(249,115,22,0.1)]";
                        }

                        return (
                          <button
                            key={colIndex}
                            disabled={!isCurrentRow}
                            onClick={() => handleTileClick(colIndex)}
                            className={`h-24 rounded-2xl border-2 flex items-center justify-center relative overflow-hidden ${tileClass}`}
                          >
                            {/* Arch/Gate styling */}
                            <div className="absolute inset-x-2 bottom-0 top-2 border-2 border-zinc-700/50 rounded-t-full pointer-events-none" />
                            
                            <AnimatePresence>
                              {tileContent && (
                                <motion.div
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  className="z-10"
                                >
                                  {tileContent}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
