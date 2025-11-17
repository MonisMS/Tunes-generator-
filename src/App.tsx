import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { motion } from 'framer-motion';
import { Music, Play, Pause, Settings, Store, Volume2, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const [prompt, setPrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [temperature, setTemperature] = useState(1.0);
  const [bpm, setBpm] = useState(120);
  const [volume, setVolume] = useState(1.0);
  const [isPaused, setIsPaused] = useState(false);

  const marketplaceBeats = [
    { id: 1, name: 'Lo-fi Chill', prompt: 'Relaxing lo-fi hip hop with jazzy piano, soft drums, and vinyl crackle' },
    { id: 2, name: 'Epic Orchestral', prompt: 'Powerful orchestral score with dramatic strings, brass, and epic percussion' },
    { id: 3, name: 'Electronic Dance', prompt: 'High-energy electronic dance music with pulsing synths and driving beats' },
    { id: 4, name: 'Ambient Dreams', prompt: 'Ethereal ambient soundscape with soft pads, gentle melodies, and atmospheric textures' },
    { id: 5, name: 'Rock Energy', prompt: 'Energetic rock music with electric guitars, powerful drums, and bass' },
    { id: 6, name: 'Jazz Vibes', prompt: 'Smooth jazz with saxophone, piano, walking bass, and brushed drums' },
    { id: 7, name: 'Trap Beats', prompt: 'Hard-hitting trap music with 808 bass, hi-hats, and aggressive synths' },
    { id: 8, name: 'Acoustic Folk', prompt: 'Warm acoustic folk music with guitar, soft vocals, and natural instruments' },
  ];
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingAudioRef = useRef(false);
  const nextStartTimeRef = useRef(0);
  const gainNodeRef = useRef<GainNode | null>(null);
  const pauseTimeRef = useRef(0);
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.close?.();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const scheduleAudio = () => {
    if (!audioContextRef.current || !isPlayingAudioRef.current) {
      return;
    }

    const currentTime = audioContextRef.current.currentTime;
    
    if (nextStartTimeRef.current < currentTime) {
      nextStartTimeRef.current = currentTime;
    }

    while (audioQueueRef.current.length > 0) {
      const chunk = audioQueueRef.current.shift();
      if (!chunk) continue;

      const audioBuffer = audioContextRef.current.createBuffer(2, chunk.length / 2, 44100);
      
      const leftChannel = audioBuffer.getChannelData(0);
      const rightChannel = audioBuffer.getChannelData(1);
      
      for (let i = 0; i < chunk.length / 2; i++) {
        leftChannel[i] = chunk[i * 2];
        rightChannel[i] = chunk[i * 2 + 1];
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gainNodeRef.current!);
      
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setStatus('Please enter a music prompt');
      return;
    }

    try {
      setStatus('Connecting to Gemini...');
      
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        setStatus('Error: VITE_GEMINI_API_KEY not found in environment');
        return;
      }

      const client = new GoogleGenAI({
        apiKey: apiKey,
        apiVersion: 'v1alpha',
      });

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = volume;
      gainNodeRef.current.connect(audioContextRef.current.destination);
      nextStartTimeRef.current = audioContextRef.current.currentTime;
      
      setStatus('Generating music...');
      
      const session = await client.live.music.connect({
        model: 'models/lyria-realtime-exp',
        callbacks: {
          onmessage: (message) => {
            if (message.serverContent?.audioChunks) {
              for (const chunk of message.serverContent.audioChunks) {
                if (!chunk.data) continue;
                
                const binaryString = atob(chunk.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                
                const samples = new Int16Array(bytes.buffer);
                const floatSamples = new Float32Array(samples.length);
                for (let i = 0; i < samples.length; i++) {
                  floatSamples[i] = samples[i] / 32768.0;
                }
                
                audioQueueRef.current.push(floatSamples);
                
                if (isPlayingAudioRef.current && audioQueueRef.current.length > 0) {
                  scheduleAudio();
                }
              }
            }
          },
          onerror: (error) => {
            console.error('Music session error:', error);
            setStatus(`Error: ${error.message || 'Unknown error'}`);
            setIsPlaying(false);
          },
          onclose: () => {
            setStatus('');
            setIsPlaying(false);
            isPlayingAudioRef.current = false;
          },
        },
      });

      sessionRef.current = session;

      await session.setWeightedPrompts({
        weightedPrompts: [
          { text: prompt, weight: 1.0 },
        ],
      });

      await session.setMusicGenerationConfig({
        musicGenerationConfig: {
          bpm: 120,
          temperature: 1.0,
        } as any,
      });

      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      isPlayingAudioRef.current = true;
      await session.play();
      
      setIsPlaying(true);
      setStatus('🎵 Generating music...');
    } catch (error) {
      console.error('Generation error:', error);
      const err = error as Error;
      setStatus(`Error: ${err.message || 'Failed to generate music'}`);
      isPlayingAudioRef.current = false;
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = newVolume;
    }
  };

  const handlePause = async () => {
    if (!sessionRef.current || !audioContextRef.current) return;
    
    try {
      // Pause the session
      await sessionRef.current.pause();
      
      // Store the current time
      pauseTimeRef.current = audioContextRef.current.currentTime;
      
      // Update state
      isPlayingAudioRef.current = false;
      setIsPaused(true);
    } catch (error) {
      console.error('Pause error:', error);
    }
  };

  const handleResume = async () => {
    if (!sessionRef.current || !audioContextRef.current) return;
    
    try {
      // Resume from where we paused
      isPlayingAudioRef.current = true;
      await sessionRef.current.play();
      
      setIsPaused(false);
      
      // Schedule any queued audio
      if (audioQueueRef.current.length > 0) {
        scheduleAudio();
      }
    } catch (error) {
      console.error('Resume error:', error);
    }
  };

  const handleStop = async () => {
    if (!sessionRef.current) return;

    try {
      isPlayingAudioRef.current = false;
      
      await sessionRef.current.stop();
      await sessionRef.current.close();
      
      setIsPlaying(false);
      setIsPaused(false);
      audioQueueRef.current = [];
      nextStartTimeRef.current = audioContextRef.current?.currentTime || 0;
      pauseTimeRef.current = 0;
      
      setStatus('');
      sessionRef.current = null;
    } catch (error) {
      console.error('Stop error:', error);
    }
  };


  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ backgroundColor: 'oklch(0.2204 0.0198 275.8439)' }}>
      
      {showMarketplace ? (
        // Marketplace View
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full max-w-5xl"
        >
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold" style={{ color: 'oklch(0.9366 0.0129 266.6974)' }}>
              Beat Marketplace
            </h2>
            <Button
              onClick={() => setShowMarketplace(false)}
              className="px-4 py-2 rounded-lg"
              style={{ 
                backgroundColor: 'oklch(0.3072 0.0287 281.7681)',
                color: 'oklch(0.9366 0.0129 266.6974)'
              }}
            >
              Back
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {marketplaceBeats.map((beat) => (
              <motion.button
                key={beat.id}
                onClick={() => {
                  setPrompt(beat.prompt);
                  setShowMarketplace(false);
                }}
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.95 }}
                className="relative p-8 rounded-2xl flex flex-col items-center gap-4 cursor-pointer transition-all group"
                style={{
                  background: 'linear-gradient(135deg, oklch(0.30 0.08 263) 0%, oklch(0.25 0.06 270) 100%)',
                  boxShadow: '0 10px 40px oklch(0 0 0 / 0.5)',
                  border: '1px solid oklch(0.4 0.10 263 / 0.3)'
                }}
              >
                {/* Glow effect on hover */}
                <div 
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    boxShadow: '0 0 30px oklch(0.4815 0.1178 263.3758 / 0.6), inset 0 0 20px oklch(0.4815 0.1178 263.3758 / 0.2)'
                  }}
                />
                
                {/* Vinyl icon with gradient background */}
                <div 
                  className="relative w-24 h-24 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300"
                >
                  <img 
                    src="/pngimg.com - vinyl_PNG18.png" 
                    alt="Vinyl"
                    className="w-full h-full object-contain group-hover:rotate-45 transition-transform duration-500"
                  />
                </div>
                
                <span className="relative text-base font-semibold text-center" style={{ color: 'oklch(0.95 0.02 263)' }}>
                  {beat.name}
                </span>
                
                {/* Glossy overlay */}
                <div 
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{
                    background: 'linear-gradient(135deg, oklch(1 0 0 / 0.1) 0%, transparent 50%, oklch(0 0 0 / 0.2) 100%)'
                  }}
                />
              </motion.button>
            ))}
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-3xl"
        >
          {/* Vinyl Disc with Album Cover Animation */}
          <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-8"
      >
        <div className="relative w-[320px] h-56 mx-auto flex items-center justify-end">
          {/* Vinyl Disc - Always half visible peeking out */}
          <motion.div
            className="absolute left-0 w-56 h-56 z-0"
            animate={isPlaying ? { 
              rotate: 360
            } : {}}
            transition={{
              rotate: {
                duration: 3,
                repeat: isPlaying ? Infinity : 0,
                ease: "linear"
              }
            }}
            style={{
              right: '-112px' // Half the vinyl is hidden, half visible
            }}
          >
            <img 
              src="/pngimg.com - vinyl_PNG18.png" 
              alt="Vinyl Record"
              className="w-full h-full object-contain"
              style={{
                filter: isPlaying 
                  ? 'drop-shadow(0 0 40px oklch(0.4815 0.1178 263.3758 / 0.6)) brightness(1.1)' 
                  : 'drop-shadow(0 15px 30px oklch(0 0 0 / 0.5))'
              }}
            />
          </motion.div>

          {/* Album Cover Box */}
          <motion.div
            className="relative w-56 h-56 rounded-xl overflow-hidden z-10"
            style={{
              background: 'linear-gradient(135deg, oklch(0.45 0.12 263) 0%, oklch(0.38 0.10 270) 30%, oklch(0.30 0.08 275) 70%, oklch(0.25 0.06 280) 100%)',
              boxShadow: '0 20px 50px -10px oklch(0.4815 0.1178 263.3758 / 0.4), 0 0 0 1px oklch(0.5 0.12 263 / 0.2), inset 0 0 60px oklch(0.4815 0.1178 263.3758 / 0.15)',
              marginLeft: '0'
            }}
          >
            {/* Album Cover Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
              {/* Music Label */}
              <div className="mb-4" style={{ 
                background: 'linear-gradient(135deg, oklch(0.60 0.14 263) 0%, oklch(0.50 0.12 270) 100%)',
                padding: '10px 20px',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '18px',
                color: 'oklch(0.98 0.01 263)',
                letterSpacing: '2px',
                boxShadow: '0 4px 12px oklch(0.4815 0.1178 263.3758 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.2), 0 0 20px oklch(0.4815 0.1178 263.3758 / 0.3)'
              }}>
                MUSIC
              </div>
              
              {/* Music Note Icon */}
              <Music className="w-24 h-24 mb-4" style={{ 
                color: 'oklch(0.85 0.10 263)',
                filter: 'drop-shadow(0 4px 12px oklch(0.4815 0.1178 263.3758 / 0.6)) drop-shadow(0 0 8px oklch(0.4815 0.1178 263.3758 / 0.4))'
              }} />
              
              {/* Animated Sound Bars - Always visible */}
              <div className="flex gap-1.5 mt-2">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-2 rounded-full"
                    style={{ 
                      background: 'linear-gradient(180deg, oklch(0.75 0.14 263) 0%, oklch(0.60 0.12 270) 100%)',
                      boxShadow: '0 0 8px oklch(0.4815 0.1178 263.3758 / 0.5)'
                    }}
                    animate={isPlaying ? {
                      height: ['16px', '32px', '16px'],
                    } : {
                      height: '16px'
                    }}
                    transition={{
                      duration: 0.6,
                      repeat: isPlaying ? Infinity : 0,
                      delay: i * 0.15,
                      ease: "easeInOut"
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Glossy overlay */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, oklch(1 0 0 / 0.15) 0%, transparent 40%, oklch(0 0 0 / 0.3) 100%)'
              }}
            />
            
            {/* Shine effect */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 30% 30%, oklch(0.7 0.15 263 / 0.3) 0%, transparent 50%)'
              }}
            />
            
            {/* Border highlight */}
            <div 
              className="absolute inset-0 rounded-xl pointer-events-none"
              style={{
                boxShadow: 'inset 0 1px 0 oklch(0.6 0.12 263 / 0.4), inset 0 0 30px oklch(0.4815 0.1178 263.3758 / 0.1)'
              }}
            />
          </motion.div>
        </div>
      </motion.div>

      {/* Input Area */}
      <div className="w-full max-w-3xl relative">
        {/* Settings Dropdown - Outside overflow container */}
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-6 bottom-20 p-5 rounded-xl min-w-[280px] z-50"
            style={{
              backgroundColor: 'oklch(0.2533 0.0229 277.4448)',
              boxShadow: '0 10px 40px oklch(0 0 0 / 0.6)',
              border: '1px solid oklch(0.3072 0.0287 281.7681)',
              backdropFilter: 'blur(10px)'
            }}
          >
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'oklch(0.9366 0.0129 266.6974)' }}>
              Generation Settings
            </h3>
            <div className="space-y-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium" style={{ color: 'oklch(0.9366 0.0129 266.6974)' }}>
                    Temperature
                  </label>
                  <span className="text-sm font-semibold px-2 py-0.5 rounded" style={{ 
                    color: 'oklch(0.9366 0.0129 266.6974)',
                    backgroundColor: 'oklch(0.3072 0.0287 281.7681)'
                  }}>
                    {temperature.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    accentColor: 'oklch(0.4815 0.1178 263.3758)',
                    background: `linear-gradient(to right, oklch(0.4815 0.1178 263.3758) 0%, oklch(0.4815 0.1178 263.3758) ${(temperature / 2) * 100}%, oklch(0.3072 0.0287 281.7681) ${(temperature / 2) * 100}%, oklch(0.3072 0.0287 281.7681) 100%)`
                  }}
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium" style={{ color: 'oklch(0.9366 0.0129 266.6974)' }}>
                    BPM
                  </label>
                  <span className="text-sm font-semibold px-2 py-0.5 rounded" style={{ 
                    color: 'oklch(0.9366 0.0129 266.6974)',
                    backgroundColor: 'oklch(0.3072 0.0287 281.7681)'
                  }}>
                    {bpm}
                  </span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="180"
                  step="5"
                  value={bpm}
                  onChange={(e) => setBpm(parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    accentColor: 'oklch(0.4815 0.1178 263.3758)',
                    background: `linear-gradient(to right, oklch(0.4815 0.1178 263.3758) 0%, oklch(0.4815 0.1178 263.3758) ${((bpm - 60) / 120) * 100}%, oklch(0.3072 0.0287 281.7681) ${((bpm - 60) / 120) * 100}%, oklch(0.3072 0.0287 281.7681) 100%)`
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
        
        <div className="relative rounded-2xl overflow-hidden" style={{ 
          backgroundColor: 'oklch(0.2703 0.0407 281.3036)',
          borderWidth: '1px',
          borderColor: 'oklch(0.3072 0.0287 281.7681)'
        }}>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type your message here..."
            rows={3}
            className="w-full border-0 resize-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 px-6 py-4"
            style={{ 
              backgroundColor: 'transparent',
              color: 'oklch(0.9366 0.0129 266.6974)',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isPlaying) {
                  handleGenerate();
                }
              }
            }}
          />
          
          <div className="flex items-center justify-between px-6 pb-4 pt-2" style={{ borderTopWidth: '1px', borderColor: 'oklch(0.3072 0.0287 281.7681)' }}>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-opacity-10" 
                style={{ color: 'oklch(0.6243 0.0412 262.0375)' }}
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>

              <button 
                onClick={() => setShowMarketplace(true)}
                className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-opacity-10" 
                style={{ color: 'oklch(0.6243 0.0412 262.0375)' }}
              >
                <Store className="w-4 h-4" />
                Marketplace
              </button>

              {/* Volume Control */}
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4" style={{ color: 'oklch(0.6243 0.0412 262.0375)' }} />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-20"
                  style={{ accentColor: 'oklch(0.4815 0.1178 263.3758)' }}
                />
                <span className="text-xs" style={{ color: 'oklch(0.6243 0.0412 262.0375)' }}>
                  {Math.round(volume * 100)}%
                </span>
              </div>
            </div>
            
            {!isPlaying ? (
              <Button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="rounded-full p-3 transition-all hover:opacity-90"
                style={{ 
                  backgroundColor: 'oklch(0.4815 0.1178 263.3758)',
                  color: 'oklch(0.9366 0.0129 266.6974)'
                }}
              >
                <Play className="w-5 h-5" />
              </Button>
            ) : isPaused ? (
              <Button
                onClick={handleResume}
                className="rounded-full p-3 transition-all hover:opacity-90"
                style={{ 
                  backgroundColor: 'oklch(0.4815 0.1178 263.3758)',
                  color: 'oklch(0.9366 0.0129 266.6974)'
                }}
              >
                <Play className="w-5 h-5" />
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={handlePause}
                  className="rounded-full p-3 transition-all hover:opacity-90"
                  style={{ 
                    backgroundColor: 'oklch(0.4815 0.1178 263.3758)',
                    color: 'oklch(0.9366 0.0129 266.6974)'
                  }}
                >
                  <Pause className="w-5 h-5" />
                </Button>
                <Button
                  onClick={handleStop}
                  className="rounded-full p-3 transition-all hover:opacity-90"
                  style={{ 
                    backgroundColor: 'oklch(0.5280 0.1200 357.1130)',
                    color: 'oklch(0.9366 0.0129 266.6974)'
                  }}
                >
                  <Square className="w-5 h-5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

        {status && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-center text-sm"
            style={{ color: 'oklch(0.6243 0.0412 262.0375)' }}
          >
            {status}
          </motion.div>
        )}

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-8 text-center text-sm"
          style={{ color: 'oklch(0.6243 0.0412 262.0375)' }}
        >
          Make sure you agree to our{' '}
          <a href="#" className="underline" style={{ color: 'oklch(0.9366 0.0129 266.6974)' }}>Terms</a>
          {' '}and our{' '}
          <a href="#" className="underline" style={{ color: 'oklch(0.9366 0.0129 266.6974)' }}>Privacy Policy</a>
        </motion.div>
        </motion.div>
      )}
    </div>
  );
}

export default App;

