import React, { useState } from 'react';
import { auth, googleProvider, db } from '../firebase';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, updateDoc, increment, addDoc } from 'firebase/firestore';
import { LogIn, Mail, Lock, User, Chrome, UserPlus } from 'lucide-react';
import { motion } from 'motion/react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [referralCode, setReferralCode] = useState(localStorage.getItem('referralCode') || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName });
        
        let referredByUid = null;
        if (referralCode) {
          try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('referralCode', '==', referralCode.trim()));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
              const referrerDoc = querySnapshot.docs[0];
              referredByUid = referrerDoc.id;
              
              // Award 10,000 points to referrer
              await updateDoc(doc(db, 'users', referredByUid), {
                points: increment(10000)
              });

              // Log referral transaction
              await addDoc(collection(db, 'transactions'), {
                uid: referredByUid,
                amount: 10000,
                type: 'referral_bonus',
                status: 'completed',
                referredUser: user.uid,
                timestamp: serverTimestamp()
              });
            }
          } catch (err) {
            console.error("Failed to process referral bonus:", err);
          }
        }

        // Create user profile in Firestore
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: displayName || user.email?.split('@')[0],
          points: 0,
          balance: 0,
          role: user.email === 'abirhvjvg72@gmail.com' ? 'admin' : 'user',
          referralCode: user.uid.substring(0, 8).toUpperCase(),
          referredBy: referredByUid,
          createdAt: serverTimestamp(),
          gameStats: {
            spin: { plays: 0, highScore: 0, totalEarned: 0 },
            snake: { plays: 0, highScore: 0, totalEarned: 0 },
            car: { plays: 0, highScore: 0, totalEarned: 0 },
            crash: { plays: 0, highScore: 0, totalEarned: 0 }
          }
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          points: 0,
          balance: 0,
          role: user.email === 'abirhvjvg72@gmail.com' ? 'admin' : 'user',
          referralCode: user.uid.substring(0, 8).toUpperCase(),
          createdAt: serverTimestamp(),
          gameStats: {
            spin: { plays: 0, highScore: 0, totalEarned: 0 },
            snake: { plays: 0, highScore: 0, totalEarned: 0 },
            car: { plays: 0, highScore: 0, totalEarned: 0 },
            crash: { plays: 0, highScore: 0, totalEarned: 0 }
          }
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-emerald-500 mb-2">RewardPlay</h1>
          <p className="text-zinc-400">Play games, earn points, get rewards.</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {!isLogin && (
            <>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Full Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
              </div>
              <div className="relative">
                <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Referral Code (Optional)"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </>
          )}
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isLogin ? <><LogIn className="w-5 h-5" /> Login</> : 'Sign Up')}
          </button>
        </form>

        <div className="mt-6">
          <div className="relative flex items-center justify-center mb-6">
            <div className="border-t border-zinc-800 w-full"></div>
            <span className="bg-zinc-900 px-4 text-zinc-500 text-sm absolute">OR</span>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white hover:bg-zinc-100 text-black font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Chrome className="w-5 h-5" /> Continue with Google
          </button>
        </div>

        <p className="text-center text-zinc-500 mt-8">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-emerald-500 hover:underline font-medium"
          >
            {isLogin ? 'Sign Up' : 'Login'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
