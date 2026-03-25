import React, { useState } from 'react';
import { Gift, Copy, Check, Share2, Users, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function ReferAndEarn({ referralCode }: { referralCode: string }) {
  const [copied, setCopied] = useState(false);
  
  const referralLink = `${window.location.origin}?ref=${referralCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl overflow-hidden relative">
      {/* Background Glow */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full" />
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full" />

      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-emerald-500/10 rounded-2xl">
            <Gift className="text-emerald-500 w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Refer & Earn</h2>
            <p className="text-zinc-400">Invite friends and earn massive rewards</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-3xl p-8 mb-8 text-center shadow-2xl shadow-emerald-900/20 relative overflow-hidden group">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative z-10"
          >
            <p className="text-emerald-100 font-medium mb-2 uppercase tracking-widest text-sm">You will get</p>
            <div className="flex items-center justify-center gap-3 mb-2">
              <Coins className="w-10 h-10 text-yellow-400" />
              <h3 className="text-5xl font-black text-white tracking-tighter">10,000</h3>
            </div>
            <p className="text-2xl font-bold text-white mb-6">POINTS PER REFERRAL</p>
            <div className="h-1 w-20 bg-white/30 mx-auto rounded-full mb-6" />
            <p className="text-emerald-100 text-sm max-w-xs mx-auto">
              Share your code with friends. When they sign up using your code, you get 10,000 points instantly!
            </p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-zinc-800/50 p-6 rounded-2xl border border-zinc-700">
            <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold mb-3">Your Referral Code</p>
            <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              <span className="text-2xl font-black text-white tracking-widest">{referralCode}</span>
              <button 
                onClick={handleCopy}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-emerald-500"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
          </div>

          <div className="bg-zinc-800/50 p-6 rounded-2xl border border-zinc-700">
            <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold mb-3">Referral Link</p>
            <button 
              onClick={handleCopyLink}
              className="w-full flex items-center justify-between bg-zinc-950 p-4 rounded-xl border border-zinc-800 group hover:border-emerald-500/50 transition-all"
            >
              <span className="text-sm text-zinc-400 truncate mr-2">{referralLink}</span>
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                <Share2 size={18} />
              </div>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-white font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-500" /> How it works
          </h4>
          <div className="grid grid-cols-1 gap-3">
            {[
              { step: '1', text: 'Copy your unique referral code or link.' },
              { step: '2', text: 'Share it with your friends and family.' },
              { step: '3', text: 'They sign up using your code.' },
              { step: '4', text: 'You receive 10,000 points immediately!' }
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 bg-zinc-800/30 p-4 rounded-xl border border-zinc-800/50">
                <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 shadow-lg shadow-emerald-900/20">
                  {item.step}
                </div>
                <p className="text-zinc-300 text-sm">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {copied && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-6 py-2 rounded-full font-bold shadow-xl z-50"
          >
            Copied to clipboard!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
