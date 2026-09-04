import React, { useState } from 'react';
import { Mic, Volume2, ShieldCheck, AlertTriangle, MapPin, Compass, Navigation, Send } from 'lucide-react';
import { ORCAResponse } from '../types';

interface FishermanViewProps {
  response: ORCAResponse | null;
  onQuerySubmit: (query: string) => void;
  isLoading: boolean;
}

export const FishermanView: React.FC<FishermanViewProps> = ({
  response,
  onQuerySubmit,
  isLoading
}) => {
  const [inputQuery, setInputQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputQuery.trim()) {
      onQuerySubmit(inputQuery.trim());
    }
  };

  const handleVoiceSim = () => {
    setIsListening(true);
    setInputQuery('Where should I fish tomorrow near Chennai?');
    setTimeout(() => {
      setIsListening(false);
      onQuerySubmit('Where should I fish tomorrow near Chennai?');
    }, 1500);
  };

  const handlePlayAudio = () => {
    if (!response?.audio_narrative_text) return;
    setIsPlayingAudio(true);
    // Use Web Speech API if supported
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = response.audio_narrative_text;
      const isTamil = response.intent?.detected_language === 'ta' || /[\u0B80-\u0BFF]/.test(text);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.lang = isTamil ? 'ta-IN' : 'en-IN';

      try {
        const voices = window.speechSynthesis.getVoices() || [];
        if (isTamil) {
          const taVoice = voices.find((v) => {
            const langLower = (v.lang || '').toLowerCase().replace('_', '-');
            const nameLower = (v.name || '').toLowerCase();
            return (
              langLower.startsWith('ta') ||
              langLower.includes('ta-in') ||
              nameLower.includes('tamil') ||
              nameLower.includes('valluvar') ||
              nameLower.includes('kani')
            );
          });
          if (taVoice) {
            utterance.voice = taVoice;
          }
        } else {
          const enVoice =
            voices.find((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith('en-in')) ||
            voices.find((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith('en'));
          if (enVoice) {
            utterance.voice = enVoice;
          }
        }
      } catch (err) {
        console.warn('Error selecting TTS voice:', err);
      }

      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setIsPlayingAudio(false), 4000);
    }
  };

  const safety = response?.safety;
  const isVeto = safety?.veto_triggered;
  const rec = response?.top_recommendation;

  return (
    <div className="space-y-6">
      
      {/* Search & Voice Input Box */}
      <div className="bg-slate-900 border border-cyan-800 p-4 rounded-2xl shadow-xl">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          
          <div className="relative flex-1">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask in your language e.g. 'Where should I fish tomorrow near Chennai?'..."
              disabled={isLoading}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-4 py-3.5 pl-11 text-sm outline-none focus:ring-2 focus:ring-cyan-500 transition"
            />
            <Compass className="w-5 h-5 text-cyan-500 absolute left-3.5 top-3.5" />
          </div>

          {/* Voice Input Button */}
          <button
            type="button"
            onClick={handleVoiceSim}
            disabled={isLoading || isListening}
            className={`px-5 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition ${
              isListening
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white shadow-lg shadow-cyan-600/30'
            }`}
          >
            <Mic className="w-5 h-5" />
            {isListening ? 'Listening...' : 'Voice Query'}
          </button>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !inputQuery.trim()}
            className="px-6 py-3.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition"
          >
            <Send className="w-4 h-4" />
            Submit
          </button>
        </form>
      </div>

      {/* Primary Status Banner */}
      {response && (
        <div
          className={`p-6 rounded-2xl border-2 shadow-2xl transition flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
            isVeto
              ? 'bg-red-950/40 border-red-500 text-red-200'
              : 'bg-emerald-950/40 border-emerald-500 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`p-4 rounded-2xl ${
                isVeto ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
              }`}
            >
              {isVeto ? (
                <AlertTriangle className="w-8 h-8 animate-bounce" />
              ) : (
                <ShieldCheck className="w-8 h-8" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-mono tracking-widest font-bold opacity-80">
                  {safety?.risk_level} SAFETY RISK
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                  Freshness: OK
                </span>
              </div>
              <h2 className="text-xl font-extrabold mt-0.5">
                {isVeto ? 'SAFETY VETO ACTIVE — DO NOT FISH' : 'CONDITIONS SAFE FOR FISHING'}
              </h2>
              <p className="text-xs mt-1 text-slate-300 max-w-2xl">{safety?.safety_summary}</p>
            </div>
          </div>

          {/* Audio Player Button */}
          <button
            onClick={handlePlayAudio}
            disabled={isPlayingAudio}
            className="w-full md:w-auto px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-bold flex items-center justify-center gap-2 transition"
          >
            <Volume2 className={`w-4 h-4 ${isPlayingAudio ? 'animate-bounce text-cyan-400' : ''}`} />
            {isPlayingAudio ? 'Playing Voice Broadcast...' : 'Listen in Tamil / Local Language'}
          </button>
        </div>
      )}

      {/* Main Fisherman Zone Action Card */}
      {rec && !isVeto && (
        <div className="bg-slate-900 border border-cyan-800 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <span className="text-xs text-cyan-400 font-bold uppercase tracking-wider">
                TOP RECOMMENDED ZONE
              </span>
              <h3 className="text-2xl font-bold text-slate-100">{rec.sector_name}</h3>
            </div>
            <div className="text-right">
              <span className="text-3xl font-extrabold text-emerald-400">
                {response.suitability_breakdown?.total_score}%
              </span>
              <p className="text-[11px] text-slate-400 font-medium">Suitability Score</p>
            </div>
          </div>

          {/* Core Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
              <p className="text-xs text-slate-400 font-semibold">Distance</p>
              <p className="text-lg font-bold text-cyan-300 mt-1">{rec.distance_km} km</p>
            </div>
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
              <p className="text-xs text-slate-400 font-semibold">Bearing</p>
              <p className="text-lg font-bold text-cyan-300 mt-1">{rec.bearing_deg}°</p>
            </div>
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
              <p className="text-xs text-slate-400 font-semibold">Water Depth</p>
              <p className="text-lg font-bold text-cyan-300 mt-1">{rec.depth_m} m</p>
            </div>
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
              <p className="text-xs text-slate-400 font-semibold">Harbour Port</p>
              <p className="text-xs font-bold text-emerald-400 mt-2 truncate">
                {rec.nearest_landing_centre}
              </p>
            </div>
          </div>

          {/* Simple Grounded Guidance */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
            <p className="font-semibold text-cyan-400 mb-1">Fisherman Action Summary:</p>
            <p>{response.synthesized_answer.replace(/[*#]/g, '')}</p>
          </div>
        </div>
      )}

    </div>
  );
};
