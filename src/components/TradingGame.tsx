import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, TrendingDown, Activity, Clock, Sun, Moon } from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { playSound } from '../lib/audioUtils';

interface Candle {
  id: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Trade {
  id: string;
  type: 'BUY' | 'SELL';
  asset: string;
  entryPrice: number;
  amount: number;
  leverage: number;
}

export default function TradingGame({ profile }: { profile: any }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentPrice, setCurrentPrice] = useState(4563.70);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [investAmount, setInvestAmount] = useState(100);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // Interactive chart state
  const [visibleCount, setVisibleCount] = useState(40);
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);
  const [timeframe, setTimeframe] = useState<number>(60000); // Default 1m
  const [asset, setAsset] = useState<'XAUUSD' | 'BTCUSD'>('XAUUSD');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const priceRef = useRef(4563.70);
  const candlesRef = useRef<Candle[]>([]);

  // Initialize and handle timeframe/asset changes
  useEffect(() => {
    const initialCandles: Candle[] = [];
    let p = asset === 'BTCUSD' ? 65000.00 : 4563.70;
    priceRef.current = p;
    const volatilityScale = Math.max(1, Math.sqrt(timeframe / 60000)) * (asset === 'BTCUSD' ? 20 : 2);
    
    for (let i = 0; i < 100; i++) {
      const close = p;
      const open = p - (Math.random() - 0.5) * 15 * volatilityScale;
      const high = Math.max(open, close) + Math.random() * 8 * volatilityScale;
      const low = Math.min(open, close) - Math.random() * 8 * volatilityScale;
      initialCandles.unshift({ id: Date.now() - i * timeframe, open, high, low, close });
      p = open;
    }
    
    candlesRef.current = initialCandles;
    setCandles(initialCandles);
    setCurrentPrice(priceRef.current);
    setPanOffset(0);
  }, [timeframe, asset]);

  // Price simulation loop
  useEffect(() => {
    const interval = setInterval(() => {
      const volatility = asset === 'BTCUSD' ? 30.5 : 3.5;
      const trend = (Math.random() - 0.5) * (asset === 'BTCUSD' ? 5.0 : 0.5); // Slight trend
      const change = (Math.random() - 0.5) * volatility + trend;
      const newPrice = Number((priceRef.current + change).toFixed(2));
      
      priceRef.current = newPrice;
      setCurrentPrice(newPrice);
    }, 500);

    return () => clearInterval(interval);
  }, [asset]);

  // Candle creation loop
  useEffect(() => {
    const interval = setInterval(() => {
      const p = priceRef.current;
      candlesRef.current = [
        ...candlesRef.current.slice(-200), // Keep last 200 candles for history
        { id: Date.now(), open: p, high: p, low: p, close: p }
      ];
      setCandles(candlesRef.current);
      
      // Auto-scroll logic: if user is not panned back, keep them at the latest
      setPanOffset(prev => {
        if (prev > 0) return prev + 1; // Keep view fixed on historical data
        return 0; // Auto-scroll
      });
    }, timeframe);
    return () => clearInterval(interval);
  }, [timeframe]);

  // Update last candle with current price
  useEffect(() => {
    if (candlesRef.current.length > 0) {
      const currentCandles = [...candlesRef.current];
      const last = currentCandles[currentCandles.length - 1];
      last.close = currentPrice;
      if (currentPrice > last.high) last.high = currentPrice;
      if (currentPrice < last.low) last.low = currentPrice;
      candlesRef.current = currentCandles;
      setCandles(currentCandles);
    }
  }, [currentPrice]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    const bgColor = theme === 'dark' ? '#09090b' : '#ffffff';
    const gridColor = theme === 'dark' ? '#27272a' : '#e4e4e7';
    const textColor = theme === 'dark' ? '#71717a' : '#52525b';
    const crosshairColor = theme === 'dark' ? 'rgba(161, 161, 170, 0.5)' : 'rgba(82, 82, 91, 0.5)';
    const crosshairBg = theme === 'dark' ? '#3f3f46' : '#e4e4e7';
    const crosshairText = theme === 'dark' ? '#fff' : '#000';

    // Clear with background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    if (candles.length === 0) return;

    // Find min and max price to scale
    const startIndex = Math.max(0, candles.length - visibleCount - panOffset);
    const endIndex = candles.length - panOffset;
    const visibleCandles = candles.slice(startIndex, endIndex);
    
    if (visibleCandles.length === 0) return;

    const rawMin = Math.min(...visibleCandles.map(c => c.low));
    const rawMax = Math.max(...visibleCandles.map(c => c.high));
    const pricePadding = (rawMax - rawMin) * 0.1 || 1; // 10% padding top and bottom
    const minPrice = rawMin - pricePadding;
    const maxPrice = rawMax + pricePadding;
    const priceRange = maxPrice - minPrice || 1;

    const candleWidth = width / visibleCandles.length;
    const padding = candleWidth * 0.2;

    // Draw grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = height * (i / 5);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      
      // Price labels
      ctx.fillStyle = textColor;
      ctx.font = '12px Inter, sans-serif';
      const priceLabel = (maxPrice - (priceRange * (i / 5))).toFixed(2);
      ctx.fillText(priceLabel, width - 60, y - 5);
    }

    // Draw candles
    visibleCandles.forEach((candle, index) => {
      const x = index * candleWidth;
      const openY = height - ((candle.open - minPrice) / priceRange) * height;
      const closeY = height - ((candle.close - minPrice) / priceRange) * height;
      const highY = height - ((candle.high - minPrice) / priceRange) * height;
      const lowY = height - ((candle.low - minPrice) / priceRange) * height;

      const isBullish = candle.close >= candle.open;
      const color = isBullish ? '#0d9488' : '#e11d48'; // teal-600, rose-600
      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      // Draw wick
      ctx.beginPath();
      ctx.moveTo(x + candleWidth / 2, highY);
      ctx.lineTo(x + candleWidth / 2, lowY);
      ctx.stroke();

      // Draw body
      const bodyY = Math.min(openY, closeY);
      const bodyHeight = Math.max(Math.abs(closeY - openY), 2); // At least 2px height
      ctx.fillRect(x + padding, bodyY, candleWidth - padding * 2, bodyHeight);
    });

    // Draw current price line
    const currentY = height - ((currentPrice - minPrice) / priceRange) * height;
    ctx.strokeStyle = '#3b82f6'; // blue-500
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, currentY);
    ctx.lineTo(width, currentY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Current price tag
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(width - 70, currentY - 12, 70, 24);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText(currentPrice.toFixed(2), width - 65, currentY + 4);

    // Draw crosshair if hovered
    if (hoveredCandle && mousePos && !isDragging) {
      ctx.strokeStyle = crosshairColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      
      // Vertical line
      const candleIndex = visibleCandles.indexOf(hoveredCandle);
      if (candleIndex !== -1) {
        const candleX = candleIndex * candleWidth + candleWidth / 2;
        ctx.beginPath();
        ctx.moveTo(candleX, 0);
        ctx.lineTo(candleX, height);
        ctx.stroke();
      }
      
      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(width, mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Price label on y-axis for crosshair
      const crosshairPrice = maxPrice - (mousePos.y / height) * priceRange;
      ctx.fillStyle = crosshairBg;
      ctx.fillRect(width - 70, mousePos.y - 12, 70, 24);
      ctx.fillStyle = crosshairText;
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText(crosshairPrice.toFixed(2), width - 65, mousePos.y + 4);
    }

  }, [candles, currentPrice, visibleCount, panOffset, hoveredCandle, mousePos, isDragging, theme]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoveredCandle(null);
    setMousePos(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setMousePos({ x, y });

    if (isDragging) {
      const dx = (e.clientX - dragStartX) * scaleX;
      const candleWidth = canvas.width / visibleCount;
      const candlesMoved = Math.round(dx / candleWidth);
      
      if (Math.abs(candlesMoved) > 0) {
        setPanOffset(prev => {
          const newOffset = Math.max(0, Math.min(candles.length - visibleCount, prev + candlesMoved));
          return newOffset;
        });
        setDragStartX(e.clientX);
      }
    } else {
      const candleWidth = canvas.width / visibleCount;
      const index = Math.floor(x / candleWidth);
      const startIndex = Math.max(0, candles.length - visibleCount - panOffset);
      const endIndex = candles.length - panOffset;
      const visibleCandles = candles.slice(startIndex, endIndex);
      
      if (index >= 0 && index < visibleCandles.length) {
        setHoveredCandle(visibleCandles[index]);
      } else {
        setHoveredCandle(null);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const zoomSpeed = 4;
    if (e.deltaY > 0) {
      setVisibleCount(prev => Math.min(candles.length, prev + zoomSpeed));
    } else {
      setVisibleCount(prev => Math.max(10, prev - zoomSpeed));
    }
  };

  const handleTrade = async (type: 'BUY' | 'SELL') => {
    if (!profile || profile.points < investAmount) {
      setMessage('Not enough points!');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setLoading(true);
    try {
      // Deduct points
      await updateDoc(doc(db, 'users', profile.uid), {
        points: increment(-investAmount)
      });

      const newTrade: Trade = {
        id: Date.now().toString(),
        type,
        asset,
        entryPrice: currentPrice,
        amount: investAmount,
        leverage: 500 // Increased leverage for faster profit/loss
      };

      setTrades(prev => [...prev, newTrade]);
      playSound('spin');
    } catch (error) {
      console.error(error);
      setMessage('Trade failed');
    } finally {
      setLoading(false);
    }
  };

  const closeTrade = async (trade: Trade) => {
    setLoading(true);
    try {
      const priceDiff = currentPrice - trade.entryPrice;
      const percentChange = priceDiff / trade.entryPrice;
      
      let profitLoss = 0;
      if (trade.type === 'BUY') {
        profitLoss = trade.amount * percentChange * trade.leverage;
      } else {
        profitLoss = trade.amount * -percentChange * trade.leverage;
      }

      const finalAmount = Math.max(0, Math.floor(trade.amount + profitLoss));

      if (finalAmount > 0) {
        await updateDoc(doc(db, 'users', profile.uid), {
          points: increment(finalAmount)
        });
        if (finalAmount > trade.amount) {
          playSound('win');
        } else {
          playSound('fail');
        }
      } else {
        playSound('fail');
      }

      setTrades(prev => prev.filter(t => t.id !== trade.id));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const calculateUnrealizedPL = (trade: Trade) => {
    const priceDiff = currentPrice - trade.entryPrice;
    const percentChange = priceDiff / trade.entryPrice;
    let profitLoss = 0;
    if (trade.type === 'BUY') {
      profitLoss = trade.amount * percentChange * trade.leverage;
    } else {
      profitLoss = trade.amount * -percentChange * trade.leverage;
    }
    return profitLoss;
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-2">
            <Activity className="text-blue-500" /> Trading
          </h2>
          <p className="text-zinc-400 mt-1">Buy/Sell assets to multiply your points!</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-xl text-center">
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1">Your Points</p>
            <p className="text-xl font-black text-emerald-500">{profile?.points || 0}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-xl text-center hidden md:block">
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1">In BDT</p>
            <p className="text-xl font-black text-emerald-500">৳{((profile?.points || 0) / 100).toFixed(2)}</p>
          </div>
        </div>
      </div>

      {message && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-2 rounded-lg mb-4 text-center font-bold">
          {message}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mb-6">
        {/* Top Bar like the image */}
        <div className="flex border-b border-zinc-800">
          <button 
            onClick={() => handleTrade('SELL')}
            disabled={loading || profile?.points < investAmount}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white p-4 flex flex-col items-center justify-center transition-colors disabled:opacity-50"
          >
            <span className="text-xs font-bold opacity-80">SELL</span>
            <span className="text-xl font-black">{currentPrice.toFixed(2)}</span>
          </button>
          
          <div className="flex-1 bg-zinc-950 p-4 flex flex-col items-center justify-center border-x border-zinc-800">
            <span className="text-xs text-zinc-500 font-bold mb-1">AMOUNT (PTS)</span>
            <input 
              type="number" 
              value={investAmount}
              onChange={(e) => setInvestAmount(Number(e.target.value))}
              className="w-24 bg-zinc-900 border border-zinc-700 rounded text-center text-white font-bold py-1"
              min="10"
            />
            <span className="text-[10px] text-zinc-500 mt-1">৳{(investAmount / 100).toFixed(2)}</span>
          </div>

          <button 
            onClick={() => handleTrade('BUY')}
            disabled={loading || profile?.points < investAmount}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white p-4 flex flex-col items-center justify-center transition-colors disabled:opacity-50"
          >
            <span className="text-xs font-bold opacity-80">BUY</span>
            <span className="text-xl font-black">{currentPrice.toFixed(2)}</span>
          </button>
        </div>

        {/* Chart Area */}
        <div className={`p-4 relative overflow-hidden group ${theme === 'dark' ? 'bg-zinc-950' : 'bg-white'}`}>
          <div className="absolute top-6 left-6 z-10 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setAsset('XAUUSD')}
                className={`font-bold text-lg px-2 py-1 rounded ${asset === 'XAUUSD' ? 'bg-blue-500 text-white' : 'text-zinc-500 hover:bg-zinc-800/50'}`}
              >
                XAUUSD
              </button>
              <button 
                onClick={() => setAsset('BTCUSD')}
                className={`font-bold text-lg px-2 py-1 rounded ${asset === 'BTCUSD' ? 'bg-orange-500 text-white' : 'text-zinc-500 hover:bg-zinc-800/50'}`}
              >
                BTCUSD
              </button>
            </div>
            <span className={`text-sm font-normal ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'} px-2`}>
              {asset === 'XAUUSD' ? 'Gold vs US Dollar' : 'Bitcoin vs US Dollar'}
            </span>
          </div>
          
          {/* Controls: Theme & Timeframe */}
          <div className="absolute top-6 right-6 z-20 flex flex-col items-end gap-2">
            <button
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              className={`p-2 rounded-lg border backdrop-blur-sm transition-colors ${
                theme === 'dark' 
                  ? 'bg-zinc-900/80 border-zinc-800 text-yellow-500 hover:bg-zinc-800' 
                  : 'bg-white/80 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <div className={`flex gap-1 p-1 rounded-lg border backdrop-blur-sm ${
              theme === 'dark' ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white/80 border-zinc-200'
            }`}>
              {[
                { label: '15s', value: 15000 },
                { label: '1m', value: 60000 },
                { label: '2m', value: 120000 },
                { label: '5m', value: 300000 },
                { label: '1H', value: 3600000 }
              ].map(tf => (
                <button
                  key={tf.label}
                  onClick={() => setTimeframe(tf.value)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                    timeframe === tf.value 
                      ? 'bg-blue-500 text-white' 
                      : (theme === 'dark' ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-zinc-600 hover:text-black hover:bg-zinc-200')
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
          
          {hoveredCandle && mousePos && !isDragging && (
            <div 
              className={`absolute z-20 border text-xs p-3 rounded-lg shadow-xl pointer-events-none flex gap-4 ${
                theme === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'
              }`}
              style={{
                left: Math.min(mousePos.x + 20, 800 - 250),
                top: Math.max(20, mousePos.y - 40),
              }}
            >
              <div>
                <span className="text-zinc-500">O:</span> <span className={hoveredCandle.close >= hoveredCandle.open ? 'text-emerald-500' : 'text-red-500'}>{hoveredCandle.open.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-zinc-500">H:</span> <span className={theme === 'dark' ? 'text-white' : 'text-black'}>{hoveredCandle.high.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-zinc-500">L:</span> <span className={theme === 'dark' ? 'text-white' : 'text-black'}>{hoveredCandle.low.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-zinc-500">C:</span> <span className={hoveredCandle.close >= hoveredCandle.open ? 'text-emerald-500' : 'text-red-500'}>{hoveredCandle.close.toFixed(2)}</span>
              </div>
            </div>
          )}

          <canvas 
            ref={canvasRef} 
            width={1000} 
            height={600} 
            className="w-full h-[400px] md:h-[500px] lg:h-[600px] rounded-lg cursor-crosshair touch-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
          />
        </div>
      </div>

      {/* Active Trades */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Clock className="text-zinc-400" /> Active Trades
        </h3>
        
        {trades.length === 0 ? (
          <p className="text-zinc-500 text-center py-4">No active trades. Click BUY or SELL to start trading!</p>
        ) : (
          <div className="space-y-3">
            {trades.map(trade => {
              const pl = calculateUnrealizedPL(trade);
              const isProfit = pl >= 0;
              
              return (
                <div key={trade.id} className="flex flex-col md:flex-row md:items-center justify-between bg-zinc-950 border border-zinc-800 p-4 rounded-xl gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${trade.type === 'BUY' ? 'bg-blue-500/20 text-blue-500' : 'bg-red-500/20 text-red-500'}`}>
                      {trade.type === 'BUY' ? <TrendingUp /> : <TrendingDown />}
                    </div>
                    <div>
                      <p className="font-bold text-white">{trade.type} {trade.asset}</p>
                      <p className="text-xs text-zinc-500">Entry: {trade.entryPrice.toFixed(2)} • Amount: {trade.amount} pts (৳{(trade.amount/100).toFixed(2)})</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between md:justify-end gap-6">
                    <div className="text-right">
                      <p className="text-xs text-zinc-500 font-bold uppercase">Profit/Loss</p>
                      <p className={`font-black text-lg ${isProfit ? 'text-emerald-500' : 'text-red-500'}`}>
                        {isProfit ? '+' : ''}{pl.toFixed(2)} pts
                      </p>
                      <p className={`text-xs font-bold ${isProfit ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                        {isProfit ? '+' : ''}৳{(pl/100).toFixed(2)}
                      </p>
                    </div>
                    <button 
                      onClick={() => closeTrade(trade)}
                      disabled={loading}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-lg font-bold transition-colors disabled:opacity-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
