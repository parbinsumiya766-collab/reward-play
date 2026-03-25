import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, Info, X } from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, updateDoc, increment, addDoc, collection, serverTimestamp, getDoc } from 'firebase/firestore';
import { playSound } from '../lib/audioUtils';

const GRID_SIZE = 20;
const INITIAL_SNAKE = [{ x: 10, y: 10 }];
const INITIAL_DIRECTION = { x: 0, y: -1 };

const FRUITS = ['🍎', '🍌', '🍒', '🍇', '🍓', '🍊', '🍍', '🍉'];

export default function SnakeGame() {
  const [snake, setSnake] = useState(INITIAL_SNAKE);
  const [food, setFood] = useState({ x: 5, y: 5, type: '🍎' });
  const [direction, setDirection] = useState(INITIAL_DIRECTION);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHowTo, setShowHowTo] = useState(true);
  const gameLoopRef = useRef<number | null>(null);

  const generateFood = useCallback(() => {
    const newFood = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
      type: FRUITS[Math.floor(Math.random() * FRUITS.length)]
    };
    setFood(newFood);
  }, []);

  const resetGame = () => {
    setSnake(INITIAL_SNAKE);
    setDirection(INITIAL_DIRECTION);
    setGameOver(false);
    setScore(0);
    setIsPlaying(false);
  };

  const moveSnake = useCallback(async () => {
    if (gameOver || !isPlaying) return;

    const newSnake = [...snake];
    const head = { ...newSnake[0] };
    head.x += direction.x;
    head.y += direction.y;

    // Check collisions
    if (
      head.x < 0 || head.x >= GRID_SIZE ||
      head.y < 0 || head.y >= GRID_SIZE ||
      newSnake.some(segment => segment.x === head.x && segment.y === head.y)
    ) {
      setGameOver(true);
      setIsPlaying(false);
      playSound('fail');
      
      // Save score to points
      if (auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const pointsEarned = score > 0 ? Math.floor(score / 5) : 0;
        
        // Fetch current stats to check high score
        const userDoc = await getDoc(userRef);
        const currentStats = userDoc.data()?.gameStats?.snake;
        const newHighScore = Math.max(currentStats?.highScore || 0, score);

        await updateDoc(userRef, {
          'gameStats.snake.plays': increment(1),
          'gameStats.snake.totalEarned': increment(pointsEarned),
          'gameStats.snake.highScore': newHighScore
        });

        if (pointsEarned > 0) {
          await updateDoc(userRef, { points: increment(pointsEarned) });
          await addDoc(collection(db, 'game_sessions'), {
            uid: auth.currentUser.uid,
            gameType: 'snake',
            pointsEarned,
            timestamp: serverTimestamp()
          });
        }
      }
      return;
    }

    newSnake.unshift(head);

    // Check food
    if (head.x === food.x && head.y === food.y) {
      setScore(s => s + 10);
      playSound('eat');
      generateFood();
    } else {
      newSnake.pop();
    }

    setSnake(newSnake);
  }, [snake, direction, food, gameOver, isPlaying, score, generateFood]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp': if (direction.y === 0) setDirection({ x: 0, y: -1 }); break;
        case 'ArrowDown': if (direction.y === 0) setDirection({ x: 0, y: 1 }); break;
        case 'ArrowLeft': if (direction.x === 0) setDirection({ x: -1, y: 0 }); break;
        case 'ArrowRight': if (direction.x === 0) setDirection({ x: 1, y: 0 }); break;
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [direction]);

  useEffect(() => {
    if (isPlaying && !gameOver) {
      gameLoopRef.current = window.setInterval(moveSnake, 150);
    } else {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    }
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [isPlaying, gameOver, moveSnake]);

  return (
    <div className="flex flex-col items-center p-8 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl relative overflow-hidden">
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
                  <p>কীবোর্ডের <span className="text-emerald-500 font-bold">Arrow Keys</span> ব্যবহার করে সাপটিকে নিয়ন্ত্রণ করুন।</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-xs font-bold shrink-0">২</div>
                  <p>লাল রঙের খাবারগুলো খান। প্রতিটি খাবারের জন্য ১০ স্কোর পাবেন।</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-xs font-bold shrink-0">৩</div>
                  <p>দেয়ালে বা নিজের শরীরে ধাক্কা লাগলে গেম শেষ হয়ে যাবে।</p>
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

      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
          <Trophy className="text-emerald-500" /> Snake Master
        </h2>
        <p className="text-zinc-400">Eat food to earn points! (5 Score = 1 Point)</p>
      </div>

      <div className="mb-4 flex justify-between w-full max-w-[300px] text-white font-bold">
        <span>Score: {score}</span>
        <span className="text-emerald-500">Points: {Math.floor(score / 5)}</span>
      </div>

      <div 
        className="relative bg-[#4d3a2b] border-4 border-[#3d2e22] rounded-xl overflow-hidden shadow-inner"
        style={{ 
          width: '300px', 
          height: '300px',
          backgroundImage: 'radial-gradient(#5d4a3b 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      >
        {snake.map((segment, i) => (
          <div
            key={i}
            className="absolute transition-all duration-150"
            style={{
              width: `${100 / GRID_SIZE}%`,
              height: `${100 / GRID_SIZE}%`,
              left: `${(segment.x * 100) / GRID_SIZE}%`,
              top: `${(segment.y * 100) / GRID_SIZE}%`,
              zIndex: i === 0 ? 20 : 10 - i,
            }}
          >
            {/* Snake Body Segment */}
            <div className={`w-full h-full relative rounded-full ${i === 0 ? 'bg-[#4ade80]' : 'bg-[#22c55e]'} border-b-2 border-[#d97706]/30`}>
              {/* Tan Belly */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-1/3 bg-[#fde68a] rounded-full opacity-60" />
              
              {/* Head Details */}
              {i === 0 && (
                <>
                  {/* Eyes */}
                  <div className="absolute -top-1 -left-1 w-3 h-3 bg-white rounded-full flex items-center justify-center shadow-sm">
                    <div className="w-1.5 h-1.5 bg-black rounded-full" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full flex items-center justify-center shadow-sm">
                    <div className="w-1.5 h-1.5 bg-black rounded-full" />
                  </div>
                  {/* Tongue */}
                  <motion.div 
                    animate={{ scaleY: [1, 1.5, 1] }}
                    transition={{ repeat: Infinity, duration: 0.5 }}
                    className="absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-2 bg-red-500 rounded-full origin-bottom"
                  />
                </>
              )}
            </div>
          </div>
        ))}
        <div
          className="absolute flex items-center justify-center text-lg select-none"
          style={{
            width: `${100 / GRID_SIZE}%`,
            height: `${100 / GRID_SIZE}%`,
            left: `${(food.x * 100) / GRID_SIZE}%`,
            top: `${(food.y * 100) / GRID_SIZE}%`,
          }}
        >
          {food.type}
        </div>

        {(gameOver || !isPlaying) && (
          <div className="absolute inset-0 bg-black/60 flex flex-center items-center justify-center backdrop-blur-sm">
            <div className="text-center p-6">
              {gameOver && <h3 className="text-2xl font-bold text-red-500 mb-4">GAME OVER</h3>}
              <button
                onClick={() => {
                  if (gameOver) resetGame();
                  setIsPlaying(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 mx-auto"
              >
                {gameOver ? <><RotateCcw /> Try Again</> : <><Play /> Start Game</>}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 md:hidden">
        <div />
        <button onClick={() => direction.y === 0 && setDirection({ x: 0, y: -1 })} className="p-4 bg-zinc-800 rounded-xl">↑</button>
        <div />
        <button onClick={() => direction.x === 0 && setDirection({ x: -1, y: 0 })} className="p-4 bg-zinc-800 rounded-xl">←</button>
        <button onClick={() => direction.y === 0 && setDirection({ x: 0, y: 1 })} className="p-4 bg-zinc-800 rounded-xl">↓</button>
        <button onClick={() => direction.x === 0 && setDirection({ x: 1, y: 0 })} className="p-4 bg-zinc-800 rounded-xl">→</button>
      </div>
    </div>
  );
}
