
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Player, Role, CATEGORIES, Category, RoomSettings, ChatMessage } from './types';
import BibleAnimation from './components/BibleAnimation';
import PlayerCard from './components/PlayerCard';
import { getGameData, GameData } from './services/geminiService';
import { GoogleGenAI } from "@google/genai";
import { io, Socket } from "socket.io-client";

const socket: Socket = io();

const CURIOSIDADES = [
  "Matusalén fue el hombre más viejo con 969 años.",
  "La Biblia es el libro más traducido del mundo.",
  "El Salmo 117 es el capítulo más corto.",
  "Génesis significa 'Principio'.",
  "La palabra 'Biblia' viene del griego 'Biblos'.",
  "El Arca de Noé tenía tres pisos.",
  "David era el menor de ocho hermanos.",
  "Pablo escribió gran parte del Nuevo Testamento.",
  "Ester es un libro donde no se menciona a Dios.",
  "Apocalipsis significa 'Revelación'.",
  "Sansón perdió su fuerza al cortarse el cabello.",
  "Gedeón venció a los madianitas con solo 300 hombres.",
  "Elías subió al cielo en un torbellino.",
  "Jonás estuvo 3 días en el gran pez.",
  "Jesús nació en Belén.",
  "Moisés escribió el Pentateuco.",
  "Salomón escribió el libro de Proverbios.",
  "La Biblia se divide en 66 libros.",
  "El Antiguo Testamento tiene 39 libros.",
  "El Nuevo Testamento tiene 27 libros."
];

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.ANIMATION);
  const [curiosidad, setCuriosidad] = useState<string>('');
  const [userName, setUserName] = useState<string>(localStorage.getItem('user_name') || '');
  const [roomCode, setRoomCode] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  
  const [settings, setSettings] = useState<RoomSettings>({ 
    giveHint: true, 
    timerDuration: 180, 
    voiceChat: true, 
    textChat: true, 
    reactions: true 
  });

  const [setupPlayers, setSetupPlayers] = useState<string[]>([]);
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(['libros_at']);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);

  const [gameData, setGameData] = useState<GameData>({ word: '', hint: '' });
  const [loading, setLoading] = useState<boolean>(false);
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);
  const [timer, setTimer] = useState<number>(180); 
  const [gameActive, setGameActive] = useState<boolean>(false);
  const [winner, setWinner] = useState<'DISCIPLES' | 'IMPOSTOR' | null>(null);
  const [countdown, setCountdown] = useState<number>(3);
  
  const [revealIndex, setRevealIndex] = useState<number>(0);
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState<boolean>(false);
  const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(true);
  const [newPlayerName, setNewPlayerName] = useState<string>('');
  const [voterModalPlayerId, setVoterModalPlayerId] = useState<number | null>(null);
  const [isEditingFromRoom, setIsEditingFromRoom] = useState<boolean>(false);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = socket;

    socket.on("room_data", ({ players: roomPlayers, settings: roomSettings }) => {
      setSetupPlayers(roomPlayers.map((p: any) => p.name));
      setSettings(roomSettings);
      // Check if I am admin (server might have reassigned it)
      const me = roomPlayers.find((p: any) => p.name === userName);
      if (me) setIsAdmin(me.isAdmin);
    });

    socket.on("settings_updated", (newSettings) => {
      setSettings(newSettings);
    });

    socket.on("new_message", (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on("game_started", ({ gameData: remoteGameData, players: remotePlayers }) => {
      setGameData(remoteGameData);
      setPlayers(remotePlayers);
      setRevealIndex(0);
      setGameState(GameState.REVEAL);
      setLoading(false);
    });

    socket.on("player_voted", ({ targetId, voterName }) => {
      setPlayers(prev => {
        const voter = prev.find(p => p.name === voterName);
        const previousTargetId = voter ? voter.votedForId : null;
        if (previousTargetId === targetId) return prev;
        return prev.map(p => {
          if (p.id === previousTargetId) {
            return { ...p, votes: Math.max(0, p.votes - 1), voterNames: p.voterNames.filter(n => n !== voterName) };
          }
          if (p.id === targetId) {
            return { ...p, votes: p.votes + 1, voterNames: [...p.voterNames, voterName] };
          }
          if (p.name === voterName) {
            return { ...p, votedForId: targetId };
          }
          return p;
        });
      });
    });

    socket.on("results_revealed", () => {
      setCountdown(3);
      setGameState(GameState.COUNTDOWN);
    });

    socket.on("room_closed", () => {
      alert("El administrador ha cerrado la sala.");
      handleLeaveRoom();
    });

    socket.on("timer_synced", (time) => {
      setTimer(time);
    });

    socket.on("audio_received", ({ sender, audioData }) => {
      if (sender !== socket.id) {
        const audio = new Audio(audioData);
        audio.play().catch(e => console.error("Error playing received audio:", e));
      }
    });

    return () => {
      socket.off("room_data");
      socket.off("settings_updated");
      socket.off("new_message");
      socket.off("game_started");
      socket.off("player_voted");
      socket.off("results_revealed");
    };
  }, [userName]);

  // States for custom category modal
  const [newCatName, setNewCatName] = useState('');
  const [newCatImage, setNewCatImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat/Voice logic states
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessageText, setCurrentMessageText] = useState('');
  const [isMuted, setIsMuted] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const currentPlayer = players[revealIndex];
  const infiltrator = players.find(p => p.role === Role.IMPOSTOR);
  const allCategories = [...CATEGORIES, ...customCategories];

  useEffect(() => {
    setCuriosidad(CURIOSIDADES[Math.floor(Math.random() * CURIOSIDADES.length)]);
    loadLocalPlayers();
    
    const initPermissions = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        // Si falla audio, no mostramos error en consola para no molestar al usuario
        // pero el navegador ya habrá mostrado el prompt o el bloqueo
      }
    };
    
    initPermissions();
  }, []);

  const loadLocalPlayers = () => {
    const savedLocalPlayers = localStorage.getItem('local_players');
    if (savedLocalPlayers) {
      setSetupPlayers(JSON.parse(savedLocalPlayers));
    } else {
      setSetupPlayers([]);
    }
  };

  useEffect(() => {
    if (userName) localStorage.setItem('user_name', userName);
  }, [userName]);

  useEffect(() => {
    if (!isOnlineMode && setupPlayers.length > 0) {
      localStorage.setItem('local_players', JSON.stringify(setupPlayers));
    }
  }, [setupPlayers, isOnlineMode]);

  useEffect(() => {
    let interval: any;
    if (gameActive && timer > 0 && gameState === GameState.PLAYING) {
      interval = setInterval(() => {
        setTimer((prev) => {
          const next = prev - 1;
          // Admin syncs the timer to everyone
          if (isOnlineMode && isAdmin && next % 5 === 0) {
            socket.emit("sync_timer", { roomCode, time: next });
          }
          return next;
        });
      }, 1000);
    } else if (timer === 0 && gameActive && gameState === GameState.PLAYING) {
      // When timer hits 0, everyone goes to voting
      setGameState(GameState.VOTING);
      setGameActive(false);
    }
    return () => clearInterval(interval);
  }, [gameActive, timer, gameState, isAdmin, isOnlineMode, roomCode]);

  useEffect(() => {
    if (gameState === GameState.COUNTDOWN) {
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            const sorted = [...players].sort((a, b) => b.votes - a.votes);
            const accused = sorted[0];
            setWinner(accused.role === Role.IMPOSTOR ? 'DISCIPLES' : 'IMPOSTOR');
            setGameState(GameState.RESULTS);
            setGameActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameState, players]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const analyzeImageForCategory = async (base64: string) => {
    setIsProcessingImage(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key no configurada. Por favor, revisa tu archivo .env");
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [
              { inlineData: { data: base64.split(',')[1], mimeType: 'image/jpeg' } },
              { text: "Analiza esta imagen y sugiere un nombre muy corto (1-3 palabras) para una categoría de juego de mesa bíblico. Solo responde con el nombre, sin puntos ni texto extra." }
            ]
          }
        ]
      });
      const suggestedName = response.text || "Categoría Importada";
      setNewCatName(suggestedName.trim().replace(/[".]/g, ''));
    } catch (e) {
      console.error("Error analizando imagen:", e);
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleStartReveal = async () => {
    if (setupPlayers.length < 3) return;
    if (isOnlineMode) {
      setLoading(true);
      try {
        const randomCatId = selectedCategoryIds[Math.floor(Math.random() * selectedCategoryIds.length)];
        const cat = allCategories.find(c => c.id === randomCatId) || allCategories[0];
        const data = await getGameData(cat.name);
        
        const impostorIndex = Math.floor(Math.random() * setupPlayers.length);
        const initialPlayers = setupPlayers.map((name, i) => ({
          id: i, name, role: i === impostorIndex ? Role.IMPOSTOR : Role.FIEL,
          isRevealed: false, votes: 0, voterNames: [], votedForId: null
        }));

        socket.emit("start_game", { roomCode, gameData: data, players: initialPlayers });
      } catch (e) { 
        alert("Error de conexión"); 
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      const randomCatId = selectedCategoryIds[Math.floor(Math.random() * selectedCategoryIds.length)];
      const cat = allCategories.find(c => c.id === randomCatId) || allCategories[0];
      const data = await getGameData(cat.name);
      setGameData(data);
      
      const impostorIndex = Math.floor(Math.random() * setupPlayers.length);
      setPlayers(setupPlayers.map((name, i) => ({
        id: i, name, role: i === impostorIndex ? Role.IMPOSTOR : Role.FIEL,
        isRevealed: false, votes: 0, voterNames: [], votedForId: null
      })));
      setRevealIndex(0);
      setGameState(GameState.REVEAL);
    } catch (e) { alert("Error de conexión"); }
    finally { setLoading(false); }
  };

  const isRoomCodeValid = (code: string) => {
    return /^RM\d{4}$/.test(code);
  };

  const handleJoinRoom = () => {
    if (!roomCode || !userName.trim()) return;
    if (!isRoomCodeValid(roomCode)) return;
    setIsAdmin(false);
    socket.emit("join_room", { roomCode, userName, isAdmin: false });
    setGameState(GameState.ONLINE_LOBBY);
  };

  const handleCreateRoom = () => {
    if (!userName.trim()) return;
    setIsAdmin(true);
    const newCode = 'RM' + Math.floor(1000 + Math.random() * 9000);
    setRoomCode(newCode);
    socket.emit("join_room", { roomCode: newCode, userName, isAdmin: true });
    setGameState(GameState.ONLINE_LOBBY);
  };

  const handleLeaveRoom = () => {
    if (isOnlineMode && roomCode) {
      socket.emit("leave_room", { roomCode });
    }
    // Eliminado window.confirm para evitar bloqueos del navegador
    // Realizamos un reseteo total e inmediato
    setGameState(GameState.ONLINE_MENU);
    setIsOnlineMode(true);
    setRoomCode('');
    setPlayers([]);
    loadLocalPlayers(); // Restauramos los jugadores locales para que no quede vacío
    setMessages([]);
    setNewPlayerName('');
    setRevealIndex(0);
    setIsHolding(false);
    setGameActive(false);
    setWinner(null);
    setCountdown(3);
    setIsAdmin(true); // Reset admin flag for next room
  };

  const updateSettings = (newSettings: RoomSettings) => {
    setSettings(newSettings);
    if (isOnlineMode) {
      socket.emit("update_settings", { roomCode, settings: newSettings });
    }
  };

  const handleVote = (targetId: number) => {
    if (isOnlineMode) {
      socket.emit("vote", { roomCode, targetId, voterName: userName });
      return;
    }
    setPlayers(prev => {
      const currentPlayerIndex = prev.findIndex(p => p.name === userName);
      const voter = prev[currentPlayerIndex];
      const previousTargetId = voter ? voter.votedForId : null;
      if (previousTargetId === targetId) return prev;
      return prev.map(p => {
        if (p.id === previousTargetId) {
          return { ...p, votes: Math.max(0, p.votes - 1), voterNames: p.voterNames.filter(n => n !== userName) };
        }
        if (p.id === targetId) {
          return { ...p, votes: p.votes + 1, voterNames: [...p.voterNames, userName] };
        }
        if (p.name === userName) {
          return { ...p, votedForId: targetId };
        }
        return p;
      });
    });
  };

  const toggleCategory = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedCategoryIds(prev => {
      if (prev.length <= 1 && !prev.includes(id)) return [id];
      if (prev.includes(id)) return prev.length > 1 ? prev.filter(i => i !== id) : prev;
      return [...prev, id];
    });
  };

  const handleSelectAll = () => {
    const allIds = allCategories.map(c => c.id);
    if (selectedCategoryIds.length === allIds.length) {
      setSelectedCategoryIds([allIds[0]]);
    } else {
      setSelectedCategoryIds(allIds);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setNewCatImage(base64);
        await analyzeImageForCategory(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveCustomCategory = () => {
    if (!newCatName.trim() && !newCatImage) return;
    const finalName = newCatName.trim() || "Nueva Categoría";
    const newCat = { 
      id: `custom_${Date.now()}`, 
      name: finalName, 
      description: 'Personalizada', 
      icon: newCatImage || '✨', 
      itemCount: 0 
    };
    setCustomCategories([...customCategories, newCat]);
    setSelectedCategoryIds([newCat.id]);
    setNewCatName('');
    setNewCatImage(null);
    setShowAddCategoryModal(false);
  };

  const handleSendMessage = () => {
    if (!currentMessageText.trim()) return;
    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender: userName,
      text: currentMessageText,
      timestamp: Date.now()
    };
    if (isOnlineMode) {
      socket.emit("send_message", { roomCode, message: msg });
    } else {
      setMessages(prev => [...prev, msg]);
    }
    setCurrentMessageText('');
  };

  const sendReaction = (emoji: string) => {
    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender: userName,
      text: emoji,
      timestamp: Date.now()
    };
    if (isOnlineMode) {
      socket.emit("send_message", { roomCode, message: msg });
    } else {
      setMessages(prev => [...prev, msg]);
    }
    setShowEmojiPicker(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCategoryDisplay = () => {
    if (selectedCategoryIds.length === allCategories.length) {
      return { name: 'Todas las categorías', icon: '🌟' };
    }
    if (selectedCategoryIds.length > 1) {
      return { name: 'Múltiples categorías', icon: '📂' };
    }
    const cat = allCategories.find(c => c.id === selectedCategoryIds[0]);
    return { name: cat?.name || 'Seleccionar', icon: cat?.icon || '❓' };
  };

  const categoryDisplay = getCategoryDisplay();
  const maxVotes = Math.max(...players.map(p => p.votes));
  const canViewResults = maxVotes >= 3;

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    if (!settings.voiceChat) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          socket.emit("audio_data", { roomCode, audioData: base64Audio });
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error starting recording:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black overflow-hidden text-white">
      {gameState === GameState.ANIMATION && <BibleAnimation onComplete={() => setGameState(GameState.LOBBY)} />}

      <header className="px-6 py-4 flex justify-between items-center z-40 min-h-[70px]">
        {![GameState.LOBBY, GameState.ANIMATION, GameState.REVEAL, GameState.PLAYING, GameState.VOTING, GameState.COUNTDOWN, GameState.RESULTS].includes(gameState) && (
          <div className="flex items-center gap-4">
            {((!isEditingFromRoom || !isOnlineMode) && (gameState !== GameState.ONLINE_LOBBY)) && (
              <button 
                type="button"
                onClick={() => {
                  if (gameState === GameState.SETUP_CATEGORY && isEditingFromRoom) {
                    setIsEditingFromRoom(false);
                    setGameState(GameState.ONLINE_LOBBY);
                  } else if (isOnlineMode && gameState === GameState.ONLINE_LOBBY) {
                    setGameState(GameState.ONLINE_MENU);
                  } else {
                    setGameState(GameState.LOBBY);
                  }
                }} 
                className="text-white/40 active:scale-95 transition-transform"
              >
                <i className="fas fa-arrow-left text-2xl"></i>
              </button>
            )}
            {(gameState === GameState.ONLINE_MENU || (gameState === GameState.ONLINE_LOBBY && isAdmin)) && !gameState.includes('ONLINE_LOBBY') && <h2 className="text-2xl font-black uppercase tracking-widest">SALA</h2>}
          </div>
        )}
        <div className="flex-1"></div>
        
        {gameState === GameState.SETUP_CATEGORY && (
          <div className="flex items-center gap-4">
            <button 
              type="button" 
              onClick={() => setShowAddCategoryModal(true)} 
              className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xl text-white/60 active:scale-90 transition-transform"
            >
              <i className="fas fa-plus"></i>
            </button>
          </div>
        )}

        {(gameState === GameState.SETUP_PLAYERS || (gameState === GameState.ONLINE_LOBBY && isAdmin)) && (
          <button type="button" onClick={() => setShowSettingsModal(true)} className="text-white/40 active:scale-95 transition-transform"><i className="fas fa-cog text-2xl"></i></button>
        )}
      </header>

      <main className="flex-1 overflow-hidden flex flex-col px-6">
        
        {gameState === GameState.LOBBY && (
          <div className="flex-1 flex flex-col items-center justify-center animate-slideUp">
            <h1 className="text-7xl font-black tracking-tight mb-8">Infiltrado</h1>
            <button onClick={() => setGameState(GameState.MENU_CHOICE)} className="dark-button w-full max-w-xs py-6 text-xl uppercase tracking-widest font-black">Comenzar</button>
          </div>
        )}

        {gameState === GameState.MENU_CHOICE && (
          <div className="flex-1 flex flex-col justify-between py-10 animate-slideUp max-w-sm mx-auto w-full">
            <div className="text-center space-y-6 pt-10">
              <div className="text-5xl opacity-80">📖</div>
              <div className="space-y-2">
                <span className="text-sm font-black opacity-30 uppercase tracking-[4px]">¿Sabías que?</span>
                <p className="text-lg font-medium italic opacity-80 px-6 leading-relaxed">{curiosidad}</p>
              </div>
            </div>
            <div className="space-y-4 pb-10">
              <button onClick={() => { setIsOnlineMode(false); setGameState(GameState.SETUP_CATEGORY); }} className="dark-button w-full py-7 text-xl font-bold gap-4">
                <i className="fas fa-play text-white/40"></i> Jugar
              </button>
              <button onClick={() => { setIsOnlineMode(true); setGameState(GameState.ONLINE_MENU); }} className="dark-button w-full py-7 text-xl font-bold gap-4">
                <i className="fas fa-users text-white/40"></i> Amigos
              </button>
            </div>
          </div>
        )}

        {gameState === GameState.ONLINE_MENU && (
          <div className="flex-1 flex flex-col justify-start pt-4 space-y-6 animate-slideUp max-w-sm mx-auto w-full">
            <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Tu nombre..." className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 font-bold text-center outline-none" />
            <div className="flex gap-2">
              <input type="text" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="CÓDIGO DE SALA" className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-5 px-6 font-bold text-center outline-none tracking-widest" />
              <button 
                disabled={!isRoomCodeValid(roomCode) || !userName.trim()} 
                onClick={handleJoinRoom} 
                className="dark-button px-7 disabled:opacity-10 transition-opacity"
              >
                <i className="fas fa-arrow-right"></i>
              </button>
            </div>
            <button disabled={!userName.trim()} onClick={handleCreateRoom} className="dark-button w-full py-5 font-black uppercase text-xs tracking-[2px] disabled:opacity-20">Crear Sala</button>
          </div>
        )}

        {gameState === GameState.SETUP_CATEGORY && (
          <div className="flex-1 flex flex-col space-y-4 animate-slideUp max-md mx-auto w-full overflow-hidden">
            <div className="flex justify-between items-end px-2">
              <h2 className="text-xl font-black uppercase tracking-widest opacity-40">Categoría</h2>
              <button onClick={handleSelectAll} className="text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/10 px-4 py-2 rounded-xl active:bg-white/10">
                {selectedCategoryIds.length === allCategories.length ? 'Desmarcar Todo' : 'Seleccionar Todo'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 overflow-y-auto pb-4 pr-1">
              {allCategories.map(cat => (
                <button 
                  key={cat.id} 
                  type="button"
                  onClick={(e) => toggleCategory(e, cat.id)} 
                  className={`glass-card p-6 flex flex-col items-center gap-4 category-grid-item transition-all duration-300 ${selectedCategoryIds.includes(cat.id) ? 'category-selected border-white/20 bg-white/10' : 'border-white/5 opacity-60'}`}
                >
                  {cat.icon.startsWith('data:image') || cat.icon.startsWith('http') ? (
                    <img src={cat.icon} alt={cat.name} className="w-16 h-16 object-cover rounded-2xl" />
                  ) : (
                    <span className="text-5xl">{cat.icon}</span>
                  )}
                  <span className="font-bold text-[10px] uppercase tracking-widest text-center">{cat.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { if (isEditingFromRoom) { setIsEditingFromRoom(false); setGameState(GameState.ONLINE_LOBBY); } else { setGameState(GameState.SETUP_PLAYERS); } }} className="dark-button w-full py-6 text-xl font-black uppercase mb-10">Continuar</button>
          </div>
        )}

        {(gameState === GameState.ONLINE_LOBBY || gameState === GameState.SETUP_PLAYERS) && (
          <div className="flex-1 flex flex-col animate-slideUp max-w-md mx-auto w-full overflow-hidden">
            <div className="flex flex-col gap-4 mb-4">
                {isOnlineMode && (
                  <div className="glass-card p-5 space-y-4 border-white/10">
                    <div className="flex justify-between items-center">
                      <h2 className="text-3xl font-black tracking-[4px]">{roomCode}</h2>
                      <button 
                        onClick={handleCopyCode} 
                        className={`text-[10px] px-4 py-2 rounded-xl font-bold transition-all duration-300 flex items-center gap-2 ${isCopied ? 'bg-green-500 text-white' : 'bg-white/5 text-white'}`}
                      >
                        {isCopied ? (
                          <>
                            <i className="fas fa-check"></i>
                            COPIADO
                          </>
                        ) : (
                          'COPIAR'
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <div className="flex items-center gap-3">
                         {categoryDisplay.icon.length > 4 ? (
                            <img src={categoryDisplay.icon} className="w-8 h-8 rounded-lg object-cover" />
                         ) : <span className="text-2xl">{categoryDisplay.icon}</span>}
                        <span className="text-[11px] font-black uppercase opacity-60 tracking-widest">{categoryDisplay.name}</span>
                      </div>
                      <div className="text-[11px] font-bold opacity-30 tracking-widest">{formatTime(settings.timerDuration)}</div>
                    </div>
                  </div>
                )}

                {isAdmin && !isOnlineMode && (
                  <div className="flex gap-2">
                    <input type="text" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (newPlayerName.trim() && setSetupPlayers([...setupPlayers, newPlayerName.trim()]), setNewPlayerName(''))} placeholder="Añadir nombre..." className="flex-1 bg-white/5 border border-white/10 px-6 py-4 rounded-3xl outline-none font-bold" />
                    <button onClick={() => { if(newPlayerName.trim()) { setSetupPlayers([...setupPlayers, newPlayerName.trim()]); setNewPlayerName(''); } }} className="dark-button px-6"><i className="fas fa-plus"></i></button>
                  </div>
                )}

                <h3 className="text-sm font-black opacity-30 uppercase tracking-[4px] text-center pt-2">Jugadores</h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-4 pr-1">
              {setupPlayers.map((name, i) => (
                <div key={i} className="glass-card p-5 flex justify-between items-center">
                  <div className="flex items-center gap-5">
                    <div className={`w-3.5 h-3.5 rounded-full ${i === 0 ? 'bg-amber-500' : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]'}`}></div>
                    <span className="font-bold text-xl">{name}</span>
                  </div>
                  {isAdmin && !isOnlineMode && i !== 0 && <button onClick={() => setSetupPlayers(setupPlayers.filter((_, idx) => idx !== i))} className="text-white/10 hover:text-white"><i className="fas fa-times"></i></button>}
                </div>
              ))}
            </div>

            <div className="p-6 flex flex-col gap-3">
              {isOnlineMode && setupPlayers.length < 3 && (
                <div className="flex flex-col items-center py-2 animate-pulse">
                   <h2 className="text-[10px] font-black uppercase tracking-[4px] opacity-40">Esperando jugadores...</h2>
                </div>
              )}

              {isAdmin && setupPlayers.length >= 3 && (
                <button onClick={handleStartReveal} disabled={loading} className="dark-button w-full py-5 text-2xl font-black uppercase tracking-[6px]">
                  {loading ? (
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-white rounded-full loading-dot"></div>
                      <div className="w-2 h-2 bg-white rounded-full loading-dot"></div>
                      <div className="w-2 h-2 bg-white rounded-full loading-dot"></div>
                    </div>
                  ) : 'Comenzar'}
                </button>
              )}
            </div>

            {isOnlineMode && (
              <button 
                type="button"
                onClick={handleLeaveRoom} 
                className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all z-[100] shadow-2xl"
                title="Salir de la sala"
              >
                <i className="fas fa-sign-out-alt text-xl"></i>
              </button>
            )}
          </div>
        )}

        {gameState === GameState.REVEAL && currentPlayer && (
          <div className="flex-1 flex flex-col items-center justify-between py-12 animate-slideUp max-w-md mx-auto w-full">
            <div className="text-center space-y-2 mt-4">
                <span className="text-[11px] font-black opacity-30 uppercase tracking-[4px]">Identidad de</span>
                <h2 className="text-5xl font-black">{currentPlayer.name}</h2>
            </div>
            
            <div 
              className={`w-full max-w-[280px] aspect-square glass-card flex flex-col items-center justify-center p-10 transition-all border-2 border-white/5 cursor-pointer ${isHolding ? 'scale-105 bg-white/5 border-white/20' : ''}`}
              onMouseDown={() => setIsHolding(true)} onMouseUp={() => setIsHolding(false)}
              onTouchStart={() => setIsHolding(true)} onTouchEnd={() => setIsHolding(false)}
            >
              {isHolding ? (
                <div className="text-center space-y-6">
                  {(!isOnlineMode || currentPlayer.name === userName) ? (
                    <>
                      <div className="text-7xl">{currentPlayer.role === Role.IMPOSTOR ? '🐺' : '🐑'}</div>
                      <h3 className="text-xl font-black uppercase tracking-widest">{currentPlayer.role === Role.IMPOSTOR ? 'Infiltrado' : 'Fiel'}</h3>
                      <div className="pt-6 border-t border-white/10 w-full flex flex-col items-center">
                        <p className="text-[10px] font-black opacity-30 uppercase tracking-widest mb-1">{currentPlayer.role === Role.IMPOSTOR ? 'Pista Sugerida' : 'Palabra Sagrada'}</p>
                        <p className="text-lg font-black text-center max-w-[200px] leading-tight opacity-90">{currentPlayer.role === Role.IMPOSTOR ? (settings.giveHint ? gameData.hint : "Sin pista") : gameData.word}</p>
                      </div>
                    </>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="text-5xl opacity-20"><i className="fas fa-user-secret"></i></div>
                      <p className="text-[11px] font-black uppercase tracking-widest opacity-40 leading-relaxed">Solo {currentPlayer.name} puede ver su identidad</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center opacity-20"><i className="fas fa-fingerprint text-[110px] mb-8"></i><p className="text-[11px] font-bold uppercase tracking-[8px]">Mantén pulsado</p></div>
              )}
            </div>

            <button onClick={() => { if (revealIndex < players.length - 1) { setRevealIndex(revealIndex + 1); setIsHolding(false); } else { setGameState(GameState.PLAYING); setTimer(settings.timerDuration); setGameActive(true); } }} className="dark-button w-full py-6 font-black uppercase tracking-widest text-xl">
              {revealIndex === players.length - 1 ? 'Iniciar Debate' : 'Siguiente'}
            </button>
          </div>
        )}

        {gameState === GameState.PLAYING && (
          <div className="flex-1 flex flex-col py-6 animate-slideUp max-w-md mx-auto w-full relative">
             <div className="flex flex-col items-center w-full">
                <h2 className="text-2xl font-black uppercase tracking-tighter opacity-40 mb-3">DEBATE</h2>
                {!isOnlineMode && (
                  <div className="flex flex-col items-center space-y-4 mb-4">
                    <div className="bg-white/5 px-8 py-3 rounded-3xl flex items-center gap-4">
                       {categoryDisplay.icon.length > 4 ? (
                          <img src={categoryDisplay.icon} className="w-10 h-10 rounded-xl object-cover" />
                       ) : <span className="text-3xl">{categoryDisplay.icon}</span>}
                      <span className="text-lg font-black uppercase tracking-widest">{categoryDisplay.name}</span>
                    </div>
                    <div className="text-[100px] font-black tabular-nums leading-none opacity-90">{formatTime(timer)}</div>
                  </div>
                )}
             </div>

             {isOnlineMode && (
               <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
                 <div className="flex justify-between items-center px-2">
                    <div className="text-3xl font-black tabular-nums">{formatTime(timer)}</div>
                    <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-2xl">
                        {categoryDisplay.icon.length > 4 ? (
                          <img src={categoryDisplay.icon} className="w-5 h-5 rounded object-cover" />
                        ) : <span className="text-xl">{categoryDisplay.icon}</span>}
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{categoryDisplay.name}</span>
                    </div>
                 </div>
                 <div className="flex-1 chat-container p-4 overflow-y-auto space-y-3">
                   {settings.textChat ? (
                     messages.map(m => (
                       <div key={m.id} className={`flex flex-col ${m.sender === userName ? 'items-end' : 'items-start'}`}>
                         <span className="text-[10px] opacity-40 mb-1">{m.sender}</span>
                         <div className={`px-4 py-2 rounded-2xl text-sm ${m.sender === userName ? 'bg-white/10 text-white' : 'bg-white/5 text-white/80'}`}>{m.text}</div>
                       </div>
                     ))
                   ) : <div className="h-full flex items-center justify-center opacity-10 uppercase tracking-widest text-xs">Chat desactivado</div>}
                 </div>
                 {settings.reactions && (
                    <div className="relative">
                      {showEmojiPicker && (
                        <div className="absolute bottom-full mb-3 left-0 right-0 bg-black border border-white/10 rounded-2xl p-4 grid grid-cols-6 gap-2 z-[60] shadow-2xl">
                          {['🙏','🔥','🤔','⚔️','⛪','🌟','🕊️','🍇','🦁','🐟','🍞','🍷'].map(emoji => (
                            <button key={emoji} onClick={() => sendReaction(emoji)} className="text-2xl hover:bg-white/10 p-2 rounded-xl"> {emoji} </button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 justify-center py-2 border-t border-white/5 bg-black">
                          {['🙏','🔥','🤔','⚔️','⛪'].map(emoji => (
                              <button key={emoji} onClick={() => sendReaction(emoji)} className="text-2xl hover:scale-125 transition-transform"> {emoji} </button>
                          ))}
                          <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xs opacity-60 hover:opacity-100 transition-all"><i className="fas fa-plus"></i></button>
                      </div>
                    </div>
                 )}
                 <div className="flex gap-2 items-center">
                    <button 
                      onMouseDown={startRecording} 
                      onMouseUp={stopRecording}
                      onTouchStart={startRecording}
                      onTouchEnd={stopRecording}
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${settings.voiceChat ? (isRecording ? 'bg-red-600 animate-pulse text-white' : 'bg-white/5 text-white/40') : 'bg-white/5 text-white/10'}`}
                    >
                        <i className={`fas ${isRecording ? 'fa-microphone' : 'fa-microphone-slash'}`}></i>
                    </button>
                    <div className="flex-1 flex gap-2">
                        <input disabled={!settings.textChat} type="text" value={currentMessageText} onChange={e => setCurrentMessageText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="Escribe..." className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 outline-none text-sm" />
                        <button disabled={!settings.textChat || !currentMessageText.trim()} onClick={handleSendMessage} className="w-14 h-14 rounded-2xl bg-white text-black flex items-center justify-center active:scale-95 transition-transform"><i className="fas fa-paper-plane"></i></button>
                    </div>
                 </div>
               </div>
             )}
             <button onClick={() => setGameState(GameState.VOTING)} className="dark-button w-full py-6 font-black uppercase tracking-widest text-xl mt-6">Votar</button>
          </div>
        )}

        {gameState === GameState.VOTING && (
          <div className="flex-1 flex flex-col space-y-8 animate-slideUp max-md mx-auto w-full overflow-hidden">
            <h2 className="text-2xl font-black text-center uppercase tracking-[10px] opacity-40">Votación</h2>
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1 pb-32">
              {players.map(p => (
                <div key={p.id} className="relative">
                  <PlayerCard 
                    player={p} 
                    canVote={isAdmin && userName !== p.name} 
                    onVote={handleVote} 
                    isSelected={players.find(v => v.name === userName)?.votedForId === p.id} 
                  />
                  {p.votes > 0 && (
                    <button onClick={() => setVoterModalPlayerId(p.id)} className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white/40 z-50"><i className="fas fa-ellipsis-h text-xl"></i></button>
                  )}
                </div>
              ))}
            </div>
            {canViewResults && (
              <div className="fixed bottom-12 left-6 right-6 max-w-md mx-auto animate-slideUp">
                  <button onClick={() => { 
                    if (isOnlineMode) {
                      socket.emit("reveal_results", { roomCode });
                    } else {
                      setCountdown(3); 
                      setGameState(GameState.COUNTDOWN); 
                    }
                  }} className="dark-button w-full py-6 font-black uppercase tracking-widest text-xl shadow-2xl">Revelar Resultados</button>
              </div>
            )}
          </div>
        )}

        {gameState === GameState.COUNTDOWN && (
          <div className="flex-1 flex flex-col items-center justify-center animate-slideUp">
             <h2 className="text-[18rem] font-black tabular-nums">{countdown}</h2>
          </div>
        )}

        {gameState === GameState.RESULTS && (
          <div className="flex-1 flex flex-col justify-start pt-6 space-y-4 animate-slideUp max-w-md mx-auto w-full overflow-y-auto pb-10">
            <div className="glass-card p-5 text-center space-y-4 border-white/10 relative">
              <div className="text-5xl">{winner === 'DISCIPLES' ? '🐑' : '🐺'}</div>
              <h3 className="text-2xl font-black uppercase tracking-tight leading-none">{winner === 'DISCIPLES' ? 'Fieles Triunfan' : 'Infiltrado Ganó'}</h3>
              <div className="space-y-4 pt-4 border-t border-white/5">
                <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">El Infiltrado era: <span className="text-white opacity-100">{infiltrator?.name}</span></p>
                <div className="bg-white/5 p-4 rounded-[28px] border border-white/5 max-w-full overflow-hidden">
                  <p className="text-[9px] font-black opacity-50 uppercase mb-1 tracking-widest">Palabra Sagrada</p>
                  <p className="text-xl font-black uppercase tracking-[2px] break-words">{gameData.word}</p>
                </div>
              </div>
            </div>
            <div className="space-y-3 pt-2">
              <button onClick={() => { setGameState(GameState.SETUP_CATEGORY); setWinner(null); }} className="dark-button w-full py-5 font-black uppercase tracking-widest text-lg shadow-xl">Jugar de nuevo</button>
              <button onClick={() => { setGameState(GameState.MENU_CHOICE); setWinner(null); }} className="dark-button w-full py-4 font-black uppercase tracking-widest text-sm bg-white/5 border-white/10">Menú</button>
              <button onClick={() => { setGameState(GameState.LOBBY); setWinner(null); }} className="dark-button w-full py-2 font-black opacity-10 uppercase tracking-widest text-[10px] border-none bg-transparent hover:opacity-100 transition-opacity">Principal</button>
            </div>
          </div>
        )}

      </main>

      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] modal-overlay flex items-center justify-center p-6">
          <div className="glass-card w-full max-w-sm p-10 space-y-10 animate-slideUp">
            <h3 className="text-3xl font-black uppercase tracking-widest border-b border-white/5 pb-6">Ajustes</h3>
            <div className="space-y-8">
              {isAdmin && isOnlineMode && (
                <button onClick={() => { setIsEditingFromRoom(true); setGameState(GameState.SETUP_CATEGORY); setShowSettingsModal(false); }} className="w-full py-5 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10">Editar Categorías</button>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold opacity-60 uppercase tracking-widest">Tiempo</span>
                <div className="flex items-center gap-5">
                  <button onClick={() => updateSettings({...settings, timerDuration: Math.max(60, settings.timerDuration - 60)})} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center font-black text-xl">-</button>
                  <span className="font-black w-12 text-center text-xl">{settings.timerDuration / 60}m</span>
                  <button onClick={() => updateSettings({...settings, timerDuration: settings.timerDuration + 60})} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center font-black text-xl">+</button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold opacity-60 uppercase tracking-widest">Pista</span>
                <label className="switch">
                  <input type="checkbox" checked={settings.giveHint} onChange={(e) => updateSettings({...settings, giveHint: e.target.checked})} />
                  <span className="slider"></span>
                </label>
              </div>
              {isOnlineMode && (
                 <>
                   <div className="flex justify-between items-center">
                     <span className="text-sm font-bold opacity-60 uppercase tracking-widest">Reacciones</span>
                     <label className="switch">
                       <input type="checkbox" checked={settings.reactions} onChange={(e) => updateSettings({...settings, reactions: e.target.checked})} />
                       <span className="slider"></span>
                     </label>
                   </div>
                   <div className="flex justify-between items-center">
                     <span className="text-sm font-bold opacity-60 uppercase tracking-widest">Voz</span>
                     <label className="switch">
                       <input type="checkbox" checked={settings.voiceChat} onChange={(e) => updateSettings({...settings, voiceChat: e.target.checked})} />
                       <span className="slider"></span>
                     </label>
                   </div>
                   <div className="flex justify-between items-center">
                     <span className="text-sm font-bold opacity-60 uppercase tracking-widest">Chat Texto</span>
                     <label className="switch">
                       <input type="checkbox" checked={settings.textChat} onChange={(e) => updateSettings({...settings, textChat: e.target.checked})} />
                       <span className="slider"></span>
                     </label>
                   </div>
                 </>
              )}
            </div>
            <button onClick={() => setShowSettingsModal(false)} className="dark-button w-full py-6 uppercase font-black tracking-[5px] bg-white/10 border-none">Guardar</button>
          </div>
        </div>
      )}

      {showAddCategoryModal && (
        <div className="fixed inset-0 z-[110] modal-overlay flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="glass-card w-full max-w-sm p-8 space-y-6 animate-slideUp">
            <div className="flex justify-between items-center">
               <h3 className="text-xl font-black uppercase tracking-widest">NUEVA CATEGORÍA</h3>
               <button onClick={() => setShowAddCategoryModal(false)} className="text-white/40"><i className="fas fa-times"></i></button>
            </div>
            
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-4 py-4">
                 <div 
                   onClick={() => !isProcessingImage && fileInputRef.current?.click()}
                   className="w-24 h-24 rounded-3xl bg-white/5 border-2 border-dashed border-white/10 flex items-center justify-center cursor-pointer overflow-hidden group relative"
                 >
                   {newCatImage ? (
                      <img src={newCatImage} alt="Preview" className="w-full h-full object-cover" />
                   ) : (
                      <div className="text-center opacity-40 group-hover:opacity-100 transition-opacity">
                         <i className="fas fa-camera text-2xl mb-1"></i>
                         <p className="text-[8px] font-black uppercase">FOTOS</p>
                      </div>
                   )}
                   {isProcessingImage && (
                     <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                     </div>
                   )}
                 </div>
                 <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                 <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">
                   {isProcessingImage ? 'Analizando imagen...' : 'Seleccionar de la galería'}
                 </span>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black opacity-30 uppercase tracking-widest ml-2">Nombre o Lista (Pegar aquí)</p>
                <textarea 
                  value={newCatName} 
                  onChange={(e) => setNewCatName(e.target.value)} 
                  placeholder="Ej: Personajes, Milagros..." 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 outline-none font-bold text-sm min-h-[100px] resize-none"
                />
              </div>
            </div>

            <button 
              onClick={saveCustomCategory} 
              disabled={(!newCatName.trim() && !newCatImage) || isProcessingImage}
              className="dark-button w-full py-5 text-xl font-black uppercase tracking-[4px] disabled:opacity-20"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {voterModalPlayerId !== null && (
        <div className="fixed inset-0 z-[101] modal-overlay flex items-center justify-center p-6" onClick={() => setVoterModalPlayerId(null)}>
          <div className="glass-card w-full max-w-xs p-10 space-y-8 animate-slideUp" onClick={e => e.stopPropagation()}>
            <h4 className="text-[11px] font-black uppercase tracking-widest opacity-40 text-center">Votos registrados</h4>
            <div className="space-y-4">
              {players.find(p => p.id === voterModalPlayerId)?.voterNames.map((name, i) => (
                <div key={i} className="flex items-center gap-5 text-2xl font-bold bg-white/5 p-5 rounded-[24px]">
                  <span>👤</span> <span>{name}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setVoterModalPlayerId(null)} className="dark-button w-full py-5 text-xs uppercase font-black border-none bg-white/5 mt-6">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
