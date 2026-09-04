import React, { useState, useCallback } from 'react';
import { PhoneCall, Mic, Play, Pause } from 'lucide-react';
import { ORCAResponse } from '../types';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

interface TamilVoicePageProps {
  response: ORCAResponse | null;
  onQuerySubmit: (query: string) => void;
  isLoading: boolean;
}

export const TamilVoicePage: React.FC<TamilVoicePageProps> = ({ response, onQuerySubmit, isLoading }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');

  const handleResult = useCallback((text: string) => {
    setLastTranscript(text);
    onQuerySubmit(text);
  }, [onQuerySubmit]);

  const { isListening, transcript, supported, start, stop } = useSpeechRecognition({
    lang: 'ta-IN',
    onResult: handleResult,
  });

  const handleTogglePlay = () => {
    setIsPlaying(!isPlaying);
    if ('speechSynthesis' in window && !isPlaying) {
      window.speechSynthesis.cancel();
      const text = response?.audio_narrative_text || 'நாளை சென்னை கிழக்கு கடல் பகுதியில் மீன்பிடிக்க பரிந்துரைக்கப்படுகிறது. வானிலை பாதுகாப்பானது.';
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const displayTranscript = isListening ? transcript : lastTranscript;

  return (
    <div className="max-w-2xl mx-auto space-y-4 py-2">
      <div className="bg-[#0b172a] border border-[#1b2b45] p-4 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800">
            <PhoneCall className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Tamil Voice Query</h2>
            <p className="text-xs text-slate-400">Live browser speech recognition (ta-IN)</p>
          </div>
        </div>
      </div>

      <div className="bg-[#0b172a] border border-cyan-500/40 p-5 rounded-2xl space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
            TAMIL ASR TRANSCRIPT
          </span>
          {isListening && <span className="text-xs text-emerald-400 font-bold animate-pulse">Listening...</span>}
        </div>

        <div className="bg-[#070f1e] p-4 rounded-xl border border-[#1b2b45] space-y-2 min-h-[64px]">
          <p className="text-sm font-bold text-cyan-300">
            {displayTranscript ? `"${displayTranscript}"` : 'நாளைக்கு சென்னைக்கு அருகில் எங்கு மீன் பிடிக்கலாம்?'}
          </p>
        </div>

        <button
          onClick={isListening ? stop : start}
          disabled={isLoading || !supported}
          title={!supported ? 'Speech recognition not supported in this browser' : undefined}
          className={`w-full py-3 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition disabled:opacity-40 ${
            isListening
              ? 'bg-red-600 text-white animate-pulse'
              : 'bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white'
          }`}
        >
          <Mic className="w-4 h-4" />
          <span>{isListening ? 'நிறுத்து (Stop)' : supported ? 'தமிழ் குரல் கேள்வியை இயக்கவும் (Speak in Tamil)' : 'Voice not supported'}</span>
        </button>
      </div>

      <div className="bg-[#0b172a] border border-[#1b2b45] p-5 rounded-2xl space-y-3 shadow-xl text-center">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200">Audio Broadcast Player</span>
          <span className="text-xs font-mono text-cyan-400">Speed: 0.95x</span>
        </div>

        <div className="h-14 bg-[#070f1e] rounded-xl border border-[#1b2b45] flex items-center justify-center gap-1 px-4">
          {[40, 70, 30, 90, 50, 80, 60, 100, 45, 85, 35, 75, 55, 95, 65, 30, 80, 50].map((h, i) => (
            <div
              key={i}
              className={`w-1 rounded-full transition-all duration-300 ${
                isPlaying ? 'bg-cyan-400 animate-pulse' : 'bg-[#1e3458]'
              }`}
              style={{ height: isPlaying ? `${h}%` : '20%' }}
            ></div>
          ))}
        </div>

        <button
          onClick={handleTogglePlay}
          className="px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 mx-auto transition"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span>{isPlaying ? 'நிறுத்து (Pause Audio)' : 'ஒலிபரப்பை இயக்கு (Play Broadcast)'}</span>
        </button>
      </div>
    </div>
  );
};
