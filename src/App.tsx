import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firestoreErrorHandler';
import { 
  LayoutDashboard, 
  Gamepad2, 
  Wallet as WalletIcon, 
  LogOut, 
  User as UserIcon,
  Trophy,
  Coins,
  ChevronRight,
  HelpCircle,
  Car,
  Gift,
  Plane,
  Shield,
  LineChart,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Auth from './components/Auth';
import SpinWheel from './components/SpinWheel';
import SnakeGame from './components/SnakeGame';
import CarRaceGame from './components/CarRaceGame';
import CrashGame from './components/CrashGame';
import MurgiGame from './components/MurgiGame';
import FireShotGame from './components/FireShotGame';
import Wallet from './components/Wallet';
import ReferAndEarn from './components/ReferAndEarn';
import AIChat from './components/AIChat';
import AdminPanel from './components/AdminPanel';
import TradingGame from './components/TradingGame';
import { speak } from './services/voiceService';

interface GameStat {
  plays: number;
  highScore: number;
  totalEarned: number;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  points: number;
  balance: number;
  role: string;
  referralCode: string;
  isBanned?: boolean;
  gameStats?: {
    spin: GameStat;
    snake: GameStat;
    car: GameStat;
    crash: GameStat;
    murgi: GameStat;
    fireshot: GameStat;
  };
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'games' | 'wallet' | 'refer' | 'admin' | 'trading'>('dashboard');
  const [activeGame, setActiveGame] = useState<'spin' | 'snake' | 'car' | 'crash' | 'murgi' | 'fireshot' | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'admin_settings', 'games'), (doc) => {
      if (doc.exists()) {
        setMusicUrl(doc.data().musicUrl || null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  useEffect(() => {
    // Handle referral code from URL
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
      localStorage.setItem('referralCode', ref);
    }

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const unsubscribe = onSnapshot(doc(db, 'users', user.uid), async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          // Auto-upgrade admin email to admin role and unban
          if (user.email === 'abirhvjvg72@gmail.com' && (data.role !== 'admin' || data.isBanned)) {
            await updateDoc(doc(db, 'users', user.uid), { role: 'admin', isBanned: false });
            data.role = 'admin';
            data.isBanned = false;
          }
          setProfile(data);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      });
      return () => unsubscribe();
    } else {
      setProfile(null);
    }
  }, [user]);

  const handleLogout = () => signOut(auth);

  const handleHelp = () => {
    const message = "Welcome to RewardPlay. This app is made by Abir. You can play Lucky Spin and Snake Master to earn points. 100 points equal 1 Taka. You can withdraw your earnings via Bkash, Nagad, or Rocket. Good luck!";
    speak(message);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (profile?.isBanned) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-6">
          <Shield size={40} />
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">Account Suspended</h1>
        <p className="text-zinc-400 max-w-md mb-8">
          Your account has been banned by the administrator. If you believe this is a mistake, please contact support.
        </p>
        <button 
          onClick={handleLogout}
          className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-xl font-medium transition-all"
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-24 md:pb-0 md:pl-64">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-zinc-900 border-r border-zinc-800 p-6">
        <div className="mb-12">
          <h1 className="text-2xl font-bold text-emerald-500 tracking-tight">RewardPlay</h1>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mt-1">Earn & Play</p>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem 
            active={activeTab === 'dashboard'} 
            onClick={() => { setActiveTab('dashboard'); setActiveGame(null); }}
            icon={<LayoutDashboard />}
            label="Dashboard"
          />
          <NavItem 
            active={activeTab === 'games'} 
            onClick={() => setActiveTab('games')}
            icon={<Gamepad2 />}
            label="Games"
          />
          <NavItem 
            active={activeTab === 'trading'} 
            onClick={() => { setActiveTab('trading'); setActiveGame(null); }}
            icon={<LineChart />}
            label="Trading"
          />
          <NavItem 
            active={activeTab === 'wallet'} 
            onClick={() => { setActiveTab('wallet'); setActiveGame(null); }}
            icon={<WalletIcon />}
            label="Wallet"
          />
          <NavItem 
            active={activeTab === 'refer'} 
            onClick={() => { setActiveTab('refer'); setActiveGame(null); }}
            icon={<Gift />}
            label="Refer & Earn"
          />
          {(profile?.role === 'admin' || user?.email === 'abirhvjvg72@gmail.com') && (
            <NavItem 
              active={activeTab === 'admin'} 
              onClick={() => { setActiveTab('admin'); setActiveGame(null); }}
              icon={<Shield />}
              label="Admin Panel"
            />
          )}
        </nav>

        <div className="pt-6 border-t border-zinc-800">
          <div className="flex items-center gap-3 mb-6 p-2">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">
              <UserIcon size={20} />
            </div>
            <div className="overflow-hidden">
              <p className="font-medium truncate">{profile?.displayName || 'User'}</p>
              <p className="text-xs text-zinc-500 truncate">{profile?.email}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
          >
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 flex justify-around p-4 z-50">
        <MobileNavItem active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setActiveGame(null); }} icon={<LayoutDashboard />} />
        <MobileNavItem active={activeTab === 'games'} onClick={() => setActiveTab('games')} icon={<Gamepad2 />} />
        <MobileNavItem active={activeTab === 'trading'} onClick={() => { setActiveTab('trading'); setActiveGame(null); }} icon={<LineChart />} />
        <MobileNavItem active={activeTab === 'wallet'} onClick={() => { setActiveTab('wallet'); setActiveGame(null); }} icon={<WalletIcon />} />
        {(profile?.role === 'admin' || user?.email === 'abirhvjvg72@gmail.com') && (
          <MobileNavItem active={activeTab === 'admin'} onClick={() => { setActiveTab('admin'); setActiveGame(null); }} icon={<Shield />} />
        )}
        <button onClick={handleLogout} className="p-2 text-zinc-500"><LogOut /></button>
      </nav>

      {/* Main Content */}
      <main className="p-4 md:p-8 max-w-6xl mx-auto">
        {musicUrl && (
          <audio src={musicUrl} autoPlay loop className="hidden" />
        )}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white capitalize">{activeTab}</h2>
            <p className="text-zinc-500">Welcome back, {profile?.displayName?.split(' ')[0]}</p>
          </div>
          <div className="flex gap-3">
            {deferredPrompt && (
              <button 
                onClick={handleInstallClick}
                className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-2xl flex items-center gap-2 font-bold transition-colors shadow-lg shadow-orange-900/20"
                title="Install App"
              >
                <Download size={20} />
                <span className="hidden sm:inline">Install App</span>
              </button>
            )}
            <button 
              onClick={handleHelp}
              className="bg-zinc-900 border border-zinc-800 p-2 rounded-2xl text-zinc-400 hover:text-emerald-500 transition-colors"
              title="Help"
            >
              <HelpCircle size={24} />
            </button>
            <div className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-2xl flex items-center gap-2">
              <Trophy className="text-yellow-500 w-4 h-4" />
              <span className="font-bold text-white">{profile?.points || 0}</span>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl flex items-center gap-2">
              <Coins className="text-emerald-500 w-4 h-4" />
              <span className="font-bold text-emerald-500">৳{profile?.balance || 0}</span>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 p-8 rounded-3xl shadow-xl relative overflow-hidden group">
                  <div className="relative z-10">
                    <p className="text-emerald-100 text-sm font-medium uppercase tracking-wider mb-2">Total Balance</p>
                    <h3 className="text-4xl font-bold text-white mb-6">৳{profile?.balance || 0}.00</h3>
                    <button 
                      onClick={() => setActiveTab('wallet')}
                      className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white px-6 py-2 rounded-xl font-medium transition-all"
                    >
                      Withdraw Now
                    </button>
                  </div>
                  <WalletIcon className="absolute -right-8 -bottom-8 w-48 h-48 text-white/10 rotate-12 group-hover:rotate-0 transition-transform duration-500" />
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl shadow-xl relative overflow-hidden group">
                  <div className="relative z-10">
                    <p className="text-zinc-500 text-sm font-medium uppercase tracking-wider mb-2">Reward Points</p>
                    <h3 className="text-4xl font-bold text-white mb-6">{profile?.points || 0}</h3>
                    <button 
                      onClick={() => setActiveTab('wallet')}
                      className="text-emerald-500 font-medium flex items-center gap-1 hover:gap-2 transition-all"
                    >
                      Convert to Cash <ChevronRight size={18} />
                    </button>
                  </div>
                  <Trophy className="absolute -right-8 -bottom-8 w-48 h-48 text-zinc-800/50 rotate-12 group-hover:rotate-0 transition-transform duration-500" />
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl shadow-xl flex flex-col justify-center items-center text-center">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-4">
                    <Gamepad2 size={32} />
                  </div>
                  <h4 className="text-xl font-bold text-white mb-2">Ready to Play?</h4>
                  <p className="text-zinc-500 text-sm mb-6">Earn more points by playing our featured games.</p>
                  <button 
                    onClick={() => setActiveTab('games')}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl font-medium transition-all"
                  >
                    Go to Games
                  </button>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 text-center md:text-left">Game Statistics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <GameStatCard 
                    title="Lucky Spin" 
                    icon={<Trophy className="text-yellow-500" />}
                    stats={profile?.gameStats?.spin}
                  />
                  <GameStatCard 
                    title="Snake Master" 
                    icon={<Gamepad2 className="text-emerald-500" />}
                    stats={profile?.gameStats?.snake}
                  />
                  <GameStatCard 
                    title="Turbo Racer" 
                    icon={<Car className="text-blue-500" />}
                    stats={profile?.gameStats?.car}
                  />
                  <GameStatCard 
                    title="Aviator Crash" 
                    icon={<Plane className="text-red-500" />}
                    stats={profile?.gameStats?.crash}
                  />
                  <GameStatCard 
                    title="Murgi Game" 
                    icon={<Gamepad2 className="text-orange-500" />}
                    stats={profile?.gameStats?.murgi}
                  />
                  <GameStatCard 
                    title="Fire Shot" 
                    icon={<Gamepad2 className="text-orange-600" />}
                    stats={profile?.gameStats?.fireshot}
                  />
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Quick Stats</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Total Plays" value={
                    Object.values(profile?.gameStats || {}).reduce((acc: number, curr) => acc + ((curr as GameStat).plays || 0), 0).toString()
                  } />
                  <StatCard label="Total Earned" value={`${profile?.points || 0} pts`} />
                  <StatCard label="Withdrawals" value="3" />
                  <StatCard label="Referrals" value="12" />
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'games' && (
            <motion.div 
              key="games"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {!activeGame ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  <GameCard 
                    title="Lucky Spin" 
                    desc="Spin the wheel of fortune and win up to 100 points instantly!"
                    icon={<Trophy className="w-12 h-12 text-yellow-500" />}
                    onClick={() => setActiveGame('spin')}
                    color="from-yellow-500/20 to-yellow-600/5"
                  />
                  <GameCard 
                    title="Snake Master" 
                    desc="Classic snake game. Eat food, grow longer, and earn points based on your score."
                    icon={<Gamepad2 className="w-12 h-12 text-emerald-500" />}
                    onClick={() => setActiveGame('snake')}
                    color="from-emerald-500/20 to-emerald-600/5"
                  />
                  <GameCard 
                    title="Turbo Racer" 
                    desc="High-speed car racing. Avoid obstacles to earn points based on distance."
                    icon={<Car className="w-12 h-12 text-blue-500" />}
                    onClick={() => setActiveGame('car')}
                    color="from-blue-500/20 to-blue-600/5"
                  />
                  <GameCard 
                    title="Aviator Crash" 
                    desc="Bet your points and cash out before the plane crashes! High risk, high reward."
                    icon={<Plane className="w-12 h-12 text-red-500" />}
                    onClick={() => setActiveGame('crash')}
                    color="from-red-500/20 to-red-600/5"
                  />
                  <GameCard 
                    title="Murgi Game" 
                    desc="Bet your points and cash out before the Murgi runs away! High risk, high reward."
                    icon={<Gamepad2 className="w-12 h-12 text-orange-500" />}
                    onClick={() => setActiveGame('murgi')}
                    color="from-orange-500/20 to-orange-600/5"
                  />
                  <GameCard 
                    title="Fire Shot" 
                    desc="Shoot the targets to increase your multiplier! Don't miss or you'll lose your bet."
                    icon={<Gamepad2 className="w-12 h-12 text-orange-600" />}
                    onClick={() => setActiveGame('fireshot')}
                    color="from-orange-600/20 to-orange-700/5"
                  />
                </div>
              ) : (
                <div className="relative">
                  <button 
                    onClick={() => setActiveGame(null)}
                    className="mb-6 text-zinc-400 hover:text-white flex items-center gap-2 transition-colors"
                  >
                    <ChevronRight className="rotate-180" /> Back to Games
                  </button>
                  {activeGame === 'spin' ? <SpinWheel /> : activeGame === 'snake' ? <SnakeGame /> : activeGame === 'car' ? <CarRaceGame /> : activeGame === 'crash' ? <CrashGame /> : activeGame === 'murgi' ? <MurgiGame /> : <FireShotGame />}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'trading' && (
            <motion.div 
              key="trading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <TradingGame profile={profile} />
            </motion.div>
          )}

          {activeTab === 'wallet' && (
            <motion.div 
              key="wallet"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Wallet balance={profile?.balance || 0} points={profile?.points || 0} />
            </motion.div>
          )}

          {activeTab === 'refer' && (
            <motion.div 
              key="refer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ReferAndEarn referralCode={profile?.referralCode || ''} />
            </motion.div>
          )}

          {activeTab === 'admin' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute inset-0 z-50 bg-zinc-950 overflow-y-auto"
            >
              <div className="p-4 flex justify-end">
                <button onClick={() => setActiveTab('dashboard')} className="text-zinc-400 hover:text-white flex items-center gap-2">
                  <ChevronRight className="rotate-180" /> Back to App
                </button>
              </div>
              <AdminPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <AIChat />
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        active 
          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' 
          : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
      }`}
    >
      {React.cloneElement(icon as React.ReactElement, { size: 20 })}
      <span className="font-medium">{label}</span>
    </button>
  );
}

function MobileNavItem({ active, onClick, icon }: { active: boolean, onClick: () => void, icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={`p-2 rounded-xl transition-all ${active ? 'text-emerald-500' : 'text-zinc-500'}`}
    >
      {React.cloneElement(icon as React.ReactElement, { size: 28 })}
    </button>
  );
}

function StatCard({ label, value }: { label: string, value: string }) {
  return (
    <div className="bg-zinc-800/50 p-4 rounded-2xl border border-zinc-800/50">
      <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function GameStatCard({ title, icon, stats }: { title: string, icon: React.ReactNode, stats?: GameStat }) {
  return (
    <div className="bg-zinc-800/50 p-6 rounded-3xl border border-zinc-800/50 hover:border-zinc-700 transition-all group">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-zinc-900 rounded-xl group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <h4 className="font-bold text-white text-sm">{title}</h4>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-zinc-500 text-xs">Plays</span>
          <span className="text-white font-bold text-sm">{stats?.plays || 0}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-zinc-500 text-xs">Highest Score</span>
          <span className="text-white font-bold text-sm">{stats?.highScore || 0}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-zinc-500 text-xs">Total Earned</span>
          <span className="text-emerald-500 font-bold text-sm">{stats?.totalEarned || 0} pts</span>
        </div>
      </div>
    </div>
  );
}

function GameCard({ title, desc, icon, onClick, color }: { title: string, desc: string, icon: React.ReactNode, onClick: () => void, color: string }) {
  return (
    <button 
      onClick={onClick}
      className={`group relative p-8 rounded-3xl border border-zinc-800 bg-zinc-900 overflow-hidden transition-all hover:border-zinc-700 text-left`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-100 transition-opacity`} />
      <div className="relative z-10">
        <div className="mb-6 p-4 bg-zinc-800 rounded-2xl w-fit group-hover:scale-110 transition-transform duration-500">
          {icon}
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
        <p className="text-zinc-400 mb-6 line-clamp-2">{desc}</p>
        <div className="flex items-center gap-2 text-emerald-500 font-bold">
          Play Now <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </button>
  );
}
