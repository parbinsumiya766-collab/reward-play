import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import { Trophy, Play, Info, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { db, auth } from '../firebase';
import { doc, updateDoc, increment, addDoc, collection, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { playSound } from '../lib/audioUtils';

const SEGMENTS = [
  { label: '5', color: '#10b981', value: 5 },
  { label: '10', color: '#3b82f6', value: 10 },
  { label: '20', color: '#8b5cf6', value: 20 },
  { label: '50', color: '#f59e0b', value: 50 },
  { label: '0', color: '#ef4444', value: 0 },
  { label: '100', color: '#ec4899', value: 100 },
  { label: '5', color: '#10b981', value: 5 },
  { label: '10', color: '#3b82f6', value: 10 },
];

export default function SpinWheel() {
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [showHowTo, setShowHowTo] = useState(true);
  const [adminSpinResult, setAdminSpinResult] = useState<number | null>(null);
  const controls = useAnimation();
  const wheelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const adminUnsubscribe = onSnapshot(doc(db, 'admin_settings', 'games'), (doc) => {
      if (doc.exists() && doc.data().spinNextResult !== undefined && doc.data().spinNextResult !== null) {
        setAdminSpinResult(Number(doc.data().spinNextResult));
      } else {
        setAdminSpinResult(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'admin_settings/games');
    });
    return () => adminUnsubscribe();
  }, []);

  const spin = async () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setResult(null);

    // Play spinning sound periodically
    const spinInterval = setInterval(() => playSound('spin'), 200);

    let targetIndex = -1;
    if (adminSpinResult !== null) {
      targetIndex = SEGMENTS.findIndex(s => s.value === adminSpinResult);
    }

    const segmentAngle = 360 / SEGMENTS.length;
    let randomDegree = Math.floor(Math.random() * 360) + 1440; // At least 4 full spins

    if (targetIndex !== -1) {
      // Calculate exact degree to land on targetIndex
      // The winning index is calculated as: Math.floor(((360 - finalDegree + segmentAngle / 2) % 360) / segmentAngle)
      // So we want: ((360 - finalDegree + segmentAngle / 2) % 360) / segmentAngle ≈ targetIndex
      // 360 - finalDegree + segmentAngle / 2 ≈ targetIndex * segmentAngle
      // finalDegree ≈ 360 - targetIndex * segmentAngle + segmentAngle / 2
      const targetDegree = 360 - (targetIndex * segmentAngle) + (segmentAngle / 2);
      randomDegree = 1440 + targetDegree;
    }
    
    await controls.start({
      rotate: randomDegree,
      transition: { duration: 4, ease: "easeOut" }
    });

    clearInterval(spinInterval);

    const finalDegree = randomDegree % 360;
    const winningIndex = Math.floor(((360 - finalDegree + segmentAngle / 2) % 360) / segmentAngle);
    const winValue = SEGMENTS[winningIndex].value;

    setResult(winValue);
    setIsSpinning(false);

    // Update Firestore Stats
    if (auth.currentUser) {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        'gameStats.spin.plays': increment(1),
        'gameStats.spin.totalEarned': increment(winValue),
        // For spin wheel, highScore could be the max value won in a single spin
        // But since we don't have a conditional update for max, we'll skip highScore for now or implement it later
      });
    }

    if (winValue > 0) {
      playSound('win');
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      // Update Firestore Points
      if (auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
          points: increment(winValue)
        });

        await addDoc(collection(db, 'game_sessions'), {
          uid: auth.currentUser.uid,
          gameType: 'spin',
          pointsEarned: winValue,
          timestamp: serverTimestamp()
        });
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl relative overflow-hidden">
      <AnimatePresence>
        {showHowTo && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 z-50 bg-zinc-950/90 backdrop-blur-md flex items-center justify-center p-6"
          >
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-emerald-500/30 rounded-3xl p-8 max-w-sm shadow-2xl relative">
              <button onClick={() => setShowHowTo(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
                <X size={20} />
              </button>
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-6 mx-auto">
                <Info size={32} />
              </div>
              <h3 className="text-2xl font-bold text-white text-center mb-4">কিভাবে খেলবেন?</h3>
              <ul className="space-y-4 text-zinc-300 text-sm mb-8">
                <li className="flex gap-3">
                  <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-xs font-bold shrink-0">১</div>
                  <p>নিচের <span className="text-emerald-500 font-bold">SPIN NOW</span> বাটনে ক্লিক করুন।</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-xs font-bold shrink-0">২</div>
                  <p>চাকাটি ঘুরবে এবং একটি পয়েন্টে থামবে।</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-xs font-bold shrink-0">৩</div>
                  <p>আপনি যত পয়েন্ট পাবেন তা আপনার অ্যাকাউন্টে যোগ হবে।</p>
                </li>
              </ul>
              <button
                onClick={() => setShowHowTo(false)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-900/20"
              >
                শুরু করুন
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
          <Trophy className="text-yellow-500" /> Lucky Spin
        </h2>
        <p className="text-zinc-400">Spin the wheel to win reward points!</p>
      </div>

      <div className="relative w-64 h-64 md:w-80 md:h-80 mb-8">
        {/* Pointer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10 w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[25px] border-t-emerald-500"></div>
        
        <motion.div
          animate={controls}
          className="w-full h-full rounded-full border-8 border-zinc-800 overflow-hidden relative shadow-2xl"
          style={{ transformOrigin: 'center' }}
        >
          {SEGMENTS.map((seg, i) => (
            <div
              key={i}
              className="absolute top-0 left-1/2 w-1/2 h-full origin-left"
              style={{
                transform: `rotate(${i * (360 / SEGMENTS.length)}deg)`,
                backgroundColor: seg.color,
                clipPath: 'polygon(0 0, 100% 0, 100% 45%, 0 50%)'
              }}
            >
              <span className="absolute top-8 left-8 -rotate-90 text-white font-bold text-lg">
                {seg.label}
              </span>
            </div>
          ))}
          {/* Center Hub */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-zinc-900 rounded-full border-4 border-zinc-800 z-10"></div>
        </motion.div>
      </div>

      <div className="flex flex-col items-center gap-4">
        {result !== null && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={`text-2xl font-bold ${result > 0 ? 'text-emerald-500' : 'text-red-500'}`}
          >
            {result > 0 ? `You won ${result} Points!` : 'Better luck next time!'}
          </motion.div>
        )}

        <button
          onClick={spin}
          disabled={isSpinning}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-12 py-4 rounded-2xl font-bold text-xl transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-2"
        >
          <Play className="w-6 h-6" /> {isSpinning ? 'Spinning...' : 'SPIN NOW'}
        </button>
      </div>
    </div>
  );
}
