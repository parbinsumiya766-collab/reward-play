import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, Info, X, Car, Megaphone } from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, updateDoc, increment, addDoc, collection, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { playSound, startMusic, stopMusic } from '../lib/audioUtils';

const CANVAS_WIDTH = 300;
const CANVAS_HEIGHT = 400;
const CAR_WIDTH = 40;
const CAR_HEIGHT = 60;
const OBSTACLE_WIDTH = 40;
const OBSTACLE_HEIGHT = 60;
const LANES = 3;

type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_SETTINGS = {
  easy: { baseSpeed: 4, spawnRate: 0.015, label: 'Easy', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  medium: { baseSpeed: 6, spawnRate: 0.025, label: 'Medium', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  hard: { baseSpeed: 8, spawnRate: 0.04, label: 'Hard', color: 'text-red-500', bgColor: 'bg-red-500/10' }
};

interface GameObject {
  x: number;
  y: number;
  color: string;
  type: 'car' | 'anime';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export default function CarRaceGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playerX, setPlayerX] = useState(CANVAS_WIDTH / 2 - CAR_WIDTH / 2);
  const [obstacles, setObstacles] = useState<GameObject[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [roadOffset, setRoadOffset] = useState(0);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHowTo, setShowHowTo] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [shake, setShake] = useState(0);
  const [isHornActive, setIsHornActive] = useState(false);
  const [adminSpeedMultiplier, setAdminSpeedMultiplier] = useState<number>(1);
  const [betAmount, setBetAmount] = useState<string>('100');
  const [isBetting, setIsBetting] = useState(false);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [userPoints, setUserPoints] = useState(0);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [lastWin, setLastWin] = useState<{ points: number; multiplier: number } | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  const scoreRef = useRef(0);
  const multiplierRef = useRef(1.0);
  const playerXRef = useRef(CANVAS_WIDTH / 2 - CAR_WIDTH / 2);
  const obstaclesRef = useRef<GameObject[]>([]);
  const isPlayingRef = useRef(false);
  const gameOverRef = useRef(false);
  const adminSpeedMultiplierRef = useRef(1);

  useEffect(() => {
    playerXRef.current = playerX;
  }, [playerX]);

  useEffect(() => {
    obstaclesRef.current = obstacles;
  }, [obstacles]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  useEffect(() => {
    adminSpeedMultiplierRef.current = adminSpeedMultiplier;
  }, [adminSpeedMultiplier]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setUserPoints(doc.data().points || 0);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const adminUnsubscribe = onSnapshot(doc(db, 'admin_settings', 'games'), (doc) => {
      if (doc.exists() && doc.data().carSpeedMultiplier) {
        setAdminSpeedMultiplier(Number(doc.data().carSpeedMultiplier));
      } else {
        setAdminSpeedMultiplier(1);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'admin_settings/games');
    });
    return () => adminUnsubscribe();
  }, []);

  const resetGame = () => {
    const initialX = CANVAS_WIDTH / 2 - CAR_WIDTH / 2;
    setPlayerX(initialX);
    playerXRef.current = initialX;
    setObstacles([]);
    obstaclesRef.current = [];
    setParticles([]);
    setScore(0);
    scoreRef.current = 0;
    setCurrentMultiplier(1.0);
    multiplierRef.current = 1.0;
    setGameOver(false);
    gameOverRef.current = false;
    setIsPlaying(false);
    isPlayingRef.current = false;
    setShake(0);
    setLastWin(null);
  };

  const createExplosion = (x: number, y: number) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < 40; i++) {
      newParticles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15,
        life: 1.0,
        color: ['#ff4400', '#ffcc00', '#ffffff', '#ff0000'][Math.floor(Math.random() * 4)]
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  const spawnObstacle = useCallback(() => {
    const lane = Math.floor(Math.random() * 3); // 3 lanes
    const x = lane * (CANVAS_WIDTH / 3) + (CANVAS_WIDTH / 6) - (OBSTACLE_WIDTH / 2);
    const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const type = Math.random() > 0.7 ? 'anime' : 'car';
    setObstacles(prev => {
      const next = [...prev, { x, y: -OBSTACLE_HEIGHT, color, type }];
      obstaclesRef.current = next;
      return next;
    });
  }, []);

  const updateGame = useCallback(async () => {
    if (gameOverRef.current || !isPlayingRef.current) return;

    setParticles(prev => 
      prev
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.02 }))
        .filter(p => p.life > 0)
    );

    // Add smoke particles from player car
    if (isPlayingRef.current && !gameOverRef.current && Math.random() < 0.3) {
      setParticles(prev => [...prev, {
        x: playerXRef.current + CAR_WIDTH / 2 + (Math.random() - 0.5) * 10,
        y: CANVAS_HEIGHT - 20,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 2,
        life: 0.5,
        color: 'rgba(255, 255, 255, 0.2)'
      }]);
    }

    setRoadOffset(prev => (prev + 10) % 40);

    if (shake > 0) setShake(s => Math.max(0, s - 1));

    const settings = DIFFICULTY_SETTINGS[difficulty];
    const speed = (settings.baseSpeed + Math.floor(scoreRef.current / 5000)) * adminSpeedMultiplierRef.current;
    
    // Move obstacles and check collision
    let collision = false;
    const nextObstacles = obstaclesRef.current
      .map(obj => ({ ...obj, y: obj.y + speed }))
      .filter(obj => obj.y < CANVAS_HEIGHT);
    
    collision = nextObstacles.some(obj => 
      playerXRef.current < obj.x + OBSTACLE_WIDTH &&
      playerXRef.current + CAR_WIDTH > obj.x &&
      CANVAS_HEIGHT - CAR_HEIGHT - 20 < obj.y + OBSTACLE_HEIGHT &&
      CANVAS_HEIGHT - 20 > obj.y
    );

    setObstacles(nextObstacles);
    obstaclesRef.current = nextObstacles;

    if (collision) {
      setGameOver(true);
      gameOverRef.current = true;
      setIsPlaying(false);
      isPlayingRef.current = false;
      playSound('fail');
      setShake(10);
      createExplosion(playerXRef.current + CAR_WIDTH / 2, CANVAS_HEIGHT - CAR_HEIGHT / 2 - 20);
      
      // Save points
      if (auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const finalScore = scoreRef.current;
        setScore(finalScore);
        
        let pointsEarned = 0;
        if (isBetting) {
          pointsEarned = 0;
          setIsBetting(false);
        } else {
          pointsEarned = Math.floor(finalScore / 1000);
        }
        
        const userDoc = await getDoc(userRef);
        const currentStats = userDoc.data()?.gameStats?.car;
        const newHighScore = Math.max(currentStats?.highScore || 0, finalScore);

        await updateDoc(userRef, {
          'gameStats.car.plays': increment(1),
          'gameStats.car.totalEarned': increment(pointsEarned),
          'gameStats.car.highScore': newHighScore
        });

        if (pointsEarned > 0) {
          await updateDoc(userRef, { points: increment(pointsEarned) });
          await addDoc(collection(db, 'game_sessions'), {
            uid: auth.currentUser.uid,
            gameType: 'car',
            pointsEarned,
            timestamp: serverTimestamp()
          });
        }
      }
      return;
    }

    setScore(s => {
      const newScore = s + 10;
      scoreRef.current = newScore;
      
      const newMultiplier = 1.0 + (newScore / 5000);
      multiplierRef.current = parseFloat(newMultiplier.toFixed(2));
      setCurrentMultiplier(multiplierRef.current);
      
      return newScore;
    });

    if (Math.random() < settings.spawnRate) {
      spawnObstacle();
    }
  }, [spawnObstacle, difficulty, isBetting]);

  useEffect(() => {
    if (isPlaying && !gameOver) {
      startMusic();
    } else {
      stopMusic();
    }
    return () => stopMusic();
  }, [isPlaying, gameOver]);

  useEffect(() => {
    let frameId: number;
    const loop = () => {
      if (isPlayingRef.current && !gameOverRef.current) {
        updateGame();
        frameId = requestAnimationFrame(loop);
      }
    };
    
    if (isPlaying && !gameOver) {
      frameId = requestAnimationFrame(loop);
    }
    
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [isPlaying, gameOver, updateGame]);

  const triggerHorn = useCallback(() => {
    playSound('horn');
    setIsHornActive(true);
    setTimeout(() => setIsHornActive(false), 300);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setPlayerX(prev => Math.max(0, prev - 20));
      if (e.key === 'ArrowRight') setPlayerX(prev => Math.min(CANVAS_WIDTH - CAR_WIDTH, prev + 20));
      if (e.key === ' ' || e.key === 'h' || e.key === 'H') triggerHorn();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerHorn]);

  const drawCar = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, isPlayer: boolean) => {
    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, CAR_WIDTH, CAR_HEIGHT, 8);
    ctx.fill();

    // Roof/Windows
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(x + 5, y + 10, CAR_WIDTH - 10, CAR_HEIGHT - 25, 5);
    ctx.fill();

    // Windshield
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(x + 8, y + 12, CAR_WIDTH - 16, 10);

    // Wheels
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 2, y + 10, 5, 12); // Front Left
    ctx.fillRect(x + CAR_WIDTH - 3, y + 10, 5, 12); // Front Right
    ctx.fillRect(x - 2, y + CAR_HEIGHT - 22, 5, 12); // Back Left
    ctx.fillRect(x + CAR_WIDTH - 3, y + CAR_HEIGHT - 22, 5, 12); // Back Right

    // Headlights
    ctx.fillStyle = isPlayer ? (isHornActive ? '#fff' : '#aaa') : '#ff0';
    if (isPlayer && isHornActive) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#fff';
    }
    ctx.beginPath();
    ctx.arc(x + 8, y + 5, 3, 0, Math.PI * 2);
    ctx.arc(x + CAR_WIDTH - 8, y + 5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Tail lights
    ctx.fillStyle = '#f00';
    ctx.fillRect(x + 5, y + CAR_HEIGHT - 5, 8, 3);
    ctx.fillRect(x + CAR_WIDTH - 13, y + CAR_HEIGHT - 5, 8, 3);
  };

  const drawAnime = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    ctx.save();
    ctx.translate(x + OBSTACLE_WIDTH / 2, y + OBSTACLE_HEIGHT / 2);
    
    // Body/Dress
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-12, 20);
    ctx.lineTo(12, 20);
    ctx.lineTo(8, -5);
    ctx.lineTo(-8, -5);
    ctx.closePath();
    ctx.fill();

    // Head
    ctx.fillStyle = '#ffdbac';
    ctx.beginPath();
    ctx.arc(0, -15, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // Hair (Anime style spikes)
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(-14, -12);
    ctx.lineTo(-10, -32);
    ctx.lineTo(-4, -22);
    ctx.lineTo(0, -38);
    ctx.lineTo(4, -22);
    ctx.lineTo(10, -32);
    ctx.lineTo(14, -12);
    ctx.closePath();
    ctx.fill();
    
    // Eyes (Large anime eyes)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-5, -16, 4, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(5, -16, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = color; // Pupil color matches hair/dress
    ctx.beginPath();
    ctx.arc(-5, -16, 2, 0, Math.PI * 2);
    ctx.arc(5, -16, 2, 0, Math.PI * 2);
    ctx.fill();

    // Blush
    ctx.fillStyle = 'rgba(255, 100, 100, 0.4)';
    ctx.beginPath();
    ctx.arc(-7, -10, 2, 0, Math.PI * 2);
    ctx.arc(7, -10, 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Road lines
    ctx.strokeStyle = '#3f3f46';
    ctx.setLineDash([20, 20]);
    ctx.lineDashOffset = -roadOffset;
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 3, 0);
    ctx.lineTo(CANVAS_WIDTH / 3, CANVAS_HEIGHT);
    ctx.moveTo((CANVAS_WIDTH / 3) * 2, 0);
    ctx.lineTo((CANVAS_WIDTH / 3) * 2, CANVAS_HEIGHT);
    ctx.stroke();
    
    // Speed lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.setLineDash([40, 100]);
    ctx.lineDashOffset = -roadOffset * 2;
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 6, 0);
    ctx.lineTo(CANVAS_WIDTH / 6, CANVAS_HEIGHT);
    ctx.moveTo(CANVAS_WIDTH / 2, 0);
    ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
    ctx.moveTo((CANVAS_WIDTH / 6) * 5, 0);
    ctx.lineTo((CANVAS_WIDTH / 6) * 5, CANVAS_HEIGHT);
    ctx.stroke();
    
    ctx.setLineDash([]); // Reset line dash

    // Player car
    if (!gameOver) {
      const wobble = Math.sin(Date.now() / 100) * 2;
      drawCar(ctx, playerX + wobble, CANVAS_HEIGHT - CAR_HEIGHT - 20, '#10b981', true);
    }

    // Obstacles
    obstacles.forEach(obj => {
      if (obj.type === 'anime') {
        drawAnime(ctx, obj.x, obj.y, obj.color);
      } else {
        drawCar(ctx, obj.x, obj.y, obj.color, false);
      }
    });

    // Particles
    particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 * p.life, 0, Math.PI * 2);
      ctx.fill();
      
      // Add glow to particles
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1.0;
    ctx.restore();
  }, [playerX, obstacles, particles, shake, gameOver, roadOffset]);

  const handleStartRace = async () => {
    const amount = parseInt(betAmount);
    if (amount > 0) {
      if (amount > userPoints) {
        setMessage({ text: 'Insufficient balance!', type: 'error' });
        setTimeout(() => setMessage(null), 3000);
        return;
      }
      
      try {
        await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
          points: increment(-amount)
        });
        setIsBetting(true);
      } catch (err) {
        setMessage({ text: 'Failed to place bet', type: 'error' });
        setTimeout(() => setMessage(null), 3000);
        return;
      }
    } else {
      setIsBetting(false);
    }
    
    if (gameOver) resetGame();
    setIsPlaying(true);
    isPlayingRef.current = true;
    gameOverRef.current = false;
  };

  const handleCashOut = async () => {
    if (!isBetting || !isPlaying || gameOver) return;
    
    const amount = parseInt(betAmount);
    const winAmount = Math.floor(amount * currentMultiplier);
    
    setIsPlaying(false);
    isPlayingRef.current = false;
    setIsBetting(false);
    setLastWin({ points: winAmount, multiplier: currentMultiplier });
    playSound('win');
    
    try {
      await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
        points: increment(winAmount),
        'gameStats.car.totalEarned': increment(winAmount)
      });
      
      await addDoc(collection(db, 'game_sessions'), {
        uid: auth.currentUser!.uid,
        gameType: 'car_bet',
        pointsEarned: winAmount,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col items-center p-4 lg:p-8 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl relative overflow-hidden">
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
                <Car size={32} />
              </div>
              <h3 className="text-2xl font-bold text-white text-center mb-4">কিভাবে খেলবেন?</h3>
              <ul className="space-y-4 text-zinc-300 text-sm mb-8">
                <li className="flex gap-3">
                  <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-xs font-bold shrink-0">১</div>
                  <p>কীবোর্ডের <span className="text-emerald-500 font-bold">Left/Right Arrow</span> বা বাটন ব্যবহার করে গাড়িটি নিয়ন্ত্রণ করুন।</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-xs font-bold shrink-0">২</div>
                  <p>অন্য গাড়ি বা এনিমে (Anime) ক্যারেক্টারের সাথে ধাক্কা লাগলে গেম ওভার হয়ে যাবে!</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-xs font-bold shrink-0">৩</div>
                  <p>বেট ধরলে যত বেশিক্ষণ টিকে থাকবেন তত বেশি মাল্টিপ্লায়ার পাবেন। ক্র্যাশ করার আগে ক্যাশ আউট করুন!</p>
                </li>
              </ul>

              <div className="mb-8">
                <p className="text-zinc-400 text-xs uppercase tracking-widest font-bold mb-3 text-center">Select Difficulty</p>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(DIFFICULTY_SETTINGS) as Difficulty[]).map((level) => (
                    <button
                      key={level}
                      onClick={() => setDifficulty(level)}
                      className={`py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                        difficulty === level 
                          ? `${DIFFICULTY_SETTINGS[level].color} border-current ${DIFFICULTY_SETTINGS[level].bgColor}` 
                          : 'text-zinc-500 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {DIFFICULTY_SETTINGS[level].label}
                    </button>
                  ))}
                </div>
              </div>

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

      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
          <Trophy className="text-emerald-500" /> Turbo Racer
        </h2>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className={`text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full ${DIFFICULTY_SETTINGS[difficulty].bgColor} ${DIFFICULTY_SETTINGS[difficulty].color}`}>
            {DIFFICULTY_SETTINGS[difficulty].label} Mode
          </span>
          <p className="text-zinc-400 text-sm">Avoid crashing into other cars!</p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-bold ${message.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
          {message.text}
        </div>
      )}

      <div className="mb-4 flex justify-between w-full max-w-[300px] text-white font-bold">
        <div className="flex flex-col">
          <span className="text-xs text-zinc-500 uppercase">Score</span>
          <span>{score}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-zinc-500 uppercase">Multiplier</span>
          <span className="text-emerald-500">{currentMultiplier.toFixed(2)}x</span>
        </div>
      </div>

      <div className="relative">
        <canvas 
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="bg-zinc-800 border-4 border-zinc-700 rounded-xl"
        />

        {(gameOver || !isPlaying) && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm p-4">
            <div className="text-center w-full">
              {gameOver && (
                <motion.div
                  initial={{ scale: 0.5, rotate: -10 }}
                  animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 0.5 }}
                  className="flex flex-col items-center mb-6"
                >
                  <h3 className="text-5xl font-black text-red-500 mb-2 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]">GAME OVER</h3>
                  <p className="text-red-400 font-bold bg-red-900/50 px-4 py-2 rounded-full border border-red-500/30">You crashed!</p>
                </motion.div>
              )}

              {lastWin && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="mb-6 bg-emerald-500/20 border border-emerald-500/30 p-4 rounded-2xl"
                >
                  <p className="text-emerald-500 font-black text-2xl">WIN! {lastWin.points} PTS</p>
                  <p className="text-emerald-400 text-xs uppercase font-bold">{lastWin.multiplier}x Multiplier</p>
                </motion.div>
              )}

              {!isPlaying && (
                <div className="mb-6 space-y-4 w-full max-w-[240px] mx-auto">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-black uppercase text-zinc-500 px-1">
                      <span>Bet Amount</span>
                      <span>Bal: {userPoints}</span>
                    </div>
                    <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <button 
                        onClick={() => setBetAmount(prev => Math.max(0, parseInt(prev || '0') - 50).toString())}
                        className="px-3 py-2 text-zinc-400 hover:bg-zinc-800"
                      >
                        -
                      </button>
                      <input 
                        type="text" 
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full bg-transparent text-center text-white font-bold focus:outline-none"
                        placeholder="0"
                      />
                      <button 
                        onClick={() => setBetAmount(prev => (parseInt(prev || '0') + 50).toString())}
                        className="px-3 py-2 text-zinc-400 hover:bg-zinc-800"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[100, 500, 1000].map(amt => (
                      <button 
                        key={amt}
                        onClick={() => setBetAmount(amt.toString())}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 py-1 rounded-lg text-[10px] font-bold border border-zinc-700"
                      >
                        {amt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <button
                onClick={handleStartRace}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-4 rounded-2xl font-black text-xl transition-all flex items-center gap-3 mx-auto shadow-[0_0_30px_rgba(16,185,129,0.4)] active:scale-95"
              >
                {gameOver ? <><RotateCcw className="w-6 h-6" /> Play Again</> : <><Play className="w-6 h-6" /> Start Race</>}
              </button>
              
              {!isPlaying && !gameOver && (
                <div className="mt-6 flex flex-col items-center">
                  <p className="text-zinc-400 text-[10px] uppercase tracking-widest font-bold mb-2">Change Difficulty</p>
                  <div className="flex gap-2">
                    {(Object.keys(DIFFICULTY_SETTINGS) as Difficulty[]).map((level) => (
                      <button
                        key={level}
                        onClick={() => setDifficulty(level)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                          difficulty === level 
                            ? `${DIFFICULTY_SETTINGS[level].color} border-current ${DIFFICULTY_SETTINGS[level].bgColor}` 
                            : 'text-zinc-500 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        {DIFFICULTY_SETTINGS[level].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isPlaying && isBetting && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <button
              onClick={handleCashOut}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-full font-black text-sm shadow-lg animate-pulse"
            >
              CASH OUT ({(parseInt(betAmount) * currentMultiplier).toFixed(0)})
            </button>
          </div>
        )}
      </div>

      <div className="mt-8 flex gap-8 items-center">
        <button 
          onMouseDown={() => setPlayerX(prev => Math.max(0, prev - 20))}
          className="w-24 h-24 bg-zinc-800 hover:bg-zinc-700 active:bg-emerald-600 active:text-white rounded-full flex items-center justify-center text-3xl transition-all shadow-lg border-4 border-zinc-700 active:border-emerald-400 active:scale-90"
        >
          ←
        </button>
        
        <button 
          onClick={triggerHorn}
          className="w-16 h-16 bg-yellow-500 hover:bg-yellow-400 active:bg-yellow-600 text-black rounded-full flex items-center justify-center transition-all shadow-lg border-4 border-yellow-600 active:scale-90"
          title="Horn"
        >
          <Megaphone className="w-8 h-8" />
        </button>

        <button 
          onMouseDown={() => setPlayerX(prev => Math.min(CANVAS_WIDTH - CAR_WIDTH, prev + 20))}
          className="w-24 h-24 bg-zinc-800 hover:bg-zinc-700 active:bg-emerald-600 active:text-white rounded-full flex items-center justify-center text-3xl transition-all shadow-lg border-4 border-zinc-700 active:border-emerald-400 active:scale-90"
        >
          →
        </button>
      </div>
    </div>
  );
}
