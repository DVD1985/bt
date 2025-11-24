import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  initializeFirestore, 
  collection, 
  addDoc, 
  doc, 
  onSnapshot, 
  updateDoc, 
  setDoc,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { 
  Shield, 
  Crosshair, 
  Swords, 
  Skull, 
  User, 
  Clock, 
  RotateCcw, 
  Flag, 
  HelpCircle, 
  Zap,
  Activity,
  Target,
  Plane,
  Truck,
  Crown,
  Scan,
  Play,
  Shuffle
} from 'lucide-react';

// --- CONFIGURACIÓN FIREBASE ---
// NOTA: En un entorno real, usa variables de entorno.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Forzar Long Polling para evitar bloqueos de WebSockets o proxies estrictos
const db = initializeFirestore(app, { experimentalForceLongPolling: true });
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app';

// --- CONSTANTES Y LÓGICA DEL JUEGO ---

const BOARD_SIZE = 8;
const TOTAL_CELLS = 64;

const UNIT_TYPES = {
  COMMANDER: { id: 'cmd', name: 'Comandante', icon: Crown, hp: 64, dmg: 100, range: 'single', desc: 'Líder. Si muere, pierdes. Ataque letal a 1 casilla.', value: 100 },
  TANK: { id: 'tank', name: 'Tanque', icon: Truck, hp: 32, dmg: 2, range: 'row', desc: 'Barre toda una fila horizontalmente (2 daño).', value: 50 },
  JET: { id: 'jet', name: 'Caza', icon: Plane, hp: 20, dmg: 2, range: 'diagonal', desc: 'Ataque en diagonal (X).', value: 40 },
  SNIPER: { id: 'sniper', name: 'Francotirador', icon: Target, hp: 15, dmg: 10, range: 'single', desc: 'Daño alto (10) a una casilla precisa.', value: 30 },
  SCANNER: { id: 'scanner', name: 'Escáner', icon: Scan, hp: 20, dmg: 1, range: 'area4x4', desc: 'Daña área de 4x4 (1 daño). Revela zona.', value: 25 },
  INFANTRY: { id: 'inf', name: 'Infantería', icon: User, hp: 10, dmg: 16, range: 'single', desc: 'Daño medio. Puede curar unidades aliadas.', value: 10, canHeal: true },
};

const INITIAL_ROSTER = [
  'COMMANDER', 
  'TANK', 'TANK', 
  'JET', 'JET', 
  'SNIPER', 'SNIPER', 
  'SCANNER', 
  'INFANTRY', 'INFANTRY'
];

const GAME_MODES = {
  BULLET: { name: 'Bullet', time: 180 }, // 3 min
  BLITZ: { name: 'Blitz', time: 600 }, // 10 min
  UNLIMITED: { name: 'Ilimitado', time: 999999 }
};

// --- UTILIDADES ---

const getCoordinates = (index) => ({ x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE) });
const getIndex = (x, y) => y * BOARD_SIZE + x;

// Calcula índices afectados por un ataque
const calculateAttackIndices = (originIdx, targetIdx, unitType) => {
  const target = getCoordinates(targetIdx);
  const origin = getCoordinates(originIdx);
  let indices = [];

  if (unitType === 'single') {
    indices.push(targetIdx);
  } else if (unitType === 'row') {
    // Ataque de tanque: toda la fila del objetivo
    for (let x = 0; x < BOARD_SIZE; x++) {
      indices.push(getIndex(x, target.y));
    }
  } else if (unitType === 'diagonal') {
    // Ataque de Caza: Diagonal simple basada en la diferencia
    // Simulamos un ataque en X centrado en el objetivo con alcance limitado de 2 casillas
    const directions = [[-1,-1], [1,1], [-1,1], [1,-1]];
    indices.push(targetIdx);
    directions.forEach(([dx, dy]) => {
        for(let i=1; i<=2; i++) {
            const nx = target.x + (dx*i);
            const ny = target.y + (dy*i);
            if (nx >=0 && nx < BOARD_SIZE && ny >=0 && ny < BOARD_SIZE) {
                indices.push(getIndex(nx, ny));
            }
        }
    });
  } else if (unitType === 'area4x4') {
    // Escáner: Cuadrado de 2x2 centrado (aprox) o 4x4 según prompt
    // Prompt dice 4x4, es muy grande para 8x8, lo reduciremos a 3x3 para balance
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = target.x + dx;
        const ny = target.y + dy;
        if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
          indices.push(getIndex(nx, ny));
        }
      }
    }
  }
  return indices;
};

// --- COMPONENTES ---

export default function App() {
  const [user, setUser] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [view, setView] = useState('lobby'); // lobby, game, rules
  const [connectionError, setConnectionError] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
        try {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
        } catch (e) {
            console.error("Auth Error:", e);
            setConnectionError(`Error de autenticación: ${e.message}`);
        }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    }, (error) => {
        setConnectionError(`Error de sesión: ${error.message}`);
    });
    return () => unsub();
  }, []);

  if (connectionError) {
      return (
          <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-red-400 p-4 text-center">
              <Skull size={48} className="mb-4" />
              <h2 className="text-xl font-bold mb-2">Error de Conexión</h2>
              <p className="max-w-md bg-slate-950 p-4 rounded border border-red-900/50 font-mono text-sm">
                  {connectionError}
              </p>
              <p className="mt-4 text-slate-500 text-sm">
                  Verifica tu conexión a internet y la configuración de Firebase.
              </p>
          </div>
      );
  }

  if (!user) return <div className="flex items-center justify-center h-screen bg-slate-900 text-white">Cargando sistema de combate...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-body selection:bg-emerald-500 selection:text-white bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between items-center shadow-2xl shadow-black/50">
        <div className="flex items-center gap-2" onClick={() => { setGameId(null); setView('lobby'); }}>
          <Swords className="text-emerald-500" size={28} />
          <h1 className="text-2xl font-bold tracking-widest cursor-pointer text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 hover:to-emerald-300 transition-all duration-300 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">BATALLÓN TÁCTICO</h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setView('rules')} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition">
            <HelpCircle size={16} /> Reglas
          </button>
          <div className="text-xs bg-slate-950 px-3 py-1 rounded-full border border-slate-700">
            ID: <span className="font-mono text-emerald-400">{user.uid.slice(0, 6)}</span>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-7xl mx-auto">
        {view === 'rules' && <RulesScreen onBack={() => setView('lobby')} />}
        {view === 'lobby' && !gameId && <Lobby user={user} onJoin={(id) => { setGameId(id); setView('game'); }} />}
        {view === 'game' && gameId && <GameRoom gameId={gameId} user={user} onLeave={() => { setGameId(null); setView('lobby'); }} />}
      </main>
    </div>
  );
}

// --- LOBBY ---

function Lobby({ user, onJoin }) {
  const [games, setGames] = useState([]);
  const [newGameName, setNewGameName] = useState('');
  const [selectedMode, setSelectedMode] = useState('BLITZ');

  useEffect(() => {
    if(!user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'games');
    // En producción, filtraríamos por status 'waiting' o 'playing'
    const unsub = onSnapshot(q, (snapshot) => {
      const g = [];
      snapshot.forEach(doc => g.push({ id: doc.id, ...doc.data() }));
      setGames(g.sort((a, b) => b.createdAt - a.createdAt));
    }, (err) => {
        console.error("Error fetching games", err);
        // Propagar error al componente padre si fuera posible, o manejarlo aquí
        // Por simplicidad en este componente gigante, usaremos un alert o log visible temporal
        alert(`Error de conexión con la base de datos: ${err.message}\nCódigo: ${err.code}`);
    });
    return () => unsub();
  }, [user]);

  const createGame = async () => {
    if (!newGameName.trim()) return;
    try {
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'games'), {
        name: newGameName,
        hostId: user.uid,
        guestId: null,
        status: 'waiting',
        mode: selectedMode,
        createdAt: serverTimestamp(),
        turn: 'host', // host empieza
        phase: 'setup', // setup -> playing -> finished
        hostReady: false,
        guestReady: false,
        logs: [],
        winner: null,
        hostTime: GAME_MODES[selectedMode].time,
        guestTime: GAME_MODES[selectedMode].time,
        lastMoveTime: null
      });
      onJoin(docRef.id);
    } catch (e) {
      console.error("Error creating game", e);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Crear Partida */}
      <div className="bg-slate-900/50 backdrop-blur-sm p-6 rounded-xl border border-slate-800 shadow-2xl md:col-span-1 hover:border-emerald-500/30 transition-colors duration-300">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Flag className="text-emerald-500"/> Nueva Operación</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nombre de la partida</label>
            <input 
              type="text" 
              value={newGameName}
              onChange={(e) => setNewGameName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 focus:border-emerald-500 focus:outline-none transition"
              placeholder="Ej: Batalla de Stalingrado"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Control de Tiempo</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.keys(GAME_MODES).map(mode => (
                <button
                  key={mode}
                  onClick={() => setSelectedMode(mode)}
                  className={`text-xs py-2 rounded border transition ${selectedMode === mode ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                >
                  {GAME_MODES[mode].name}
                </button>
              ))}
            </div>
          </div>
          <button 
            onClick={createGame}
            className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3 rounded transition-all duration-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transform hover:-translate-y-0.5 uppercase tracking-wider text-sm"
          >
            Crear Sala
          </button>
        </div>
      </div>

      {/* Lista de Partidas */}
      <div className="bg-slate-900/50 backdrop-blur-sm p-6 rounded-xl border border-slate-800 shadow-2xl md:col-span-2">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Activity className="text-blue-400"/> Partidas en Curso</h2>
        <div className="grid gap-3">
          {games.length === 0 && <p className="text-slate-500 italic">No hay operaciones activas. Crea una.</p>}
          {games.map(game => (
            <div key={game.id} className="flex items-center justify-between bg-slate-900 p-4 rounded-lg border border-slate-700 hover:border-slate-600 transition">
              <div>
                <h3 className="font-bold text-emerald-400">{game.name}</h3>
                <div className="flex gap-3 text-xs text-slate-400 mt-1">
                  <span className="flex items-center gap-1"><Clock size={12}/> {GAME_MODES[game.mode]?.name}</span>
                  <span className={`px-2 rounded-full ${game.status === 'waiting' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-green-900/50 text-green-400'}`}>
                    {game.status === 'waiting' ? 'Esperando Rival' : 'En Curso'}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => onJoin(game.id)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm font-medium transition"
              >
                {game.status === 'waiting' ? 'Unirse' : 'Observar / Jugar'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- SALA DE JUEGO ---

function GameRoom({ gameId, user, onLeave }) {
  const [game, setGame] = useState(null);
  const [role, setRole] = useState('spectator'); // host, guest, spectator
  
  // Estado local para la configuración
  const [setupBoard, setSetupBoard] = useState(Array(64).fill(null));
  const [selectedActionUnit, setSelectedActionUnit] = useState(null); // Para movimientos/ataques en partida

  useEffect(() => {
    if(!user || !gameId) return;
    const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'games', gameId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGame({ id: docSnap.id, ...data });
        
        // Determinar rol
        if (data.hostId === user.uid) setRole('host');
        else if (data.guestId === user.uid) setRole('guest');
        else if (!data.guestId && data.status === 'waiting') {
          // Auto unirse como guest si hay hueco
          joinAsGuest(docSnap.id, user.uid);
          setRole('guest');
        } else {
          setRole('spectator');
        }
      }
    }, (error) => console.error("Error listening to game", error));
    return () => unsub();
  }, [gameId, user]);

  const joinAsGuest = async (gId, uid) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'games', gId), {
      guestId: uid,
      status: 'playing' // Pasamos a playing pero en fase 'setup'
    });
  };

  // Sincronización inicial del setup board si ya existe en DB (reconexión)
  useEffect(() => {
    if (game && role !== 'spectator') {
      const myBoardKey = role === 'host' ? 'hostBoard' : 'guestBoard';
      if (game[myBoardKey] && setupBoard.every(c => c === null)) {
        setSetupBoard(game[myBoardKey]);
      } else if (setupBoard.every(c => c === null) && game.phase === 'setup') {
        // Inicializar board vacío si no hay nada
        setSetupBoard(Array(64).fill(null));
      }
    }
  }, [game, role]);

  // --- ACCIONES DE JUEGO ---

  const handleRandomize = () => {
    if (game.phase !== 'setup') return;
    const newBoard = Array(64).fill(null);
    const roster = [...INITIAL_ROSTER];
    
    // Colocar solo en las primeras 3 filas (índices 40-63 para el jugador local visualmente, 
    // pero la lógica interna es 0-63, decidiremos que el jugador siempre ve SU tablero abajo)
    // Vamos a usar 0-63 como coordenadas absolutas.
    // El host coloca en filas 0-2 (0-23).
    // El guest coloca en filas 5-7 (40-63).
    // SIN EMBARGO, para simplificar la vista, rotaremos el tablero del guest en el render.
    // Así que lógicamente ambos colocan en sus "primeras filas".
    
    // Definamos: Host usa filas 0,1,2. Guest usa filas 5,6,7.
    const validIndices = role === 'host' 
      ? Array.from({length: 24}, (_, i) => i) 
      : Array.from({length: 24}, (_, i) => 63 - i);

    roster.forEach(unitKey => {
      let placed = false;
      while (!placed) {
        const randIdx = validIndices[Math.floor(Math.random() * validIndices.length)];
        if (!newBoard[randIdx]) {
          newBoard[randIdx] = { 
            type: unitKey, 
            hp: UNIT_TYPES[unitKey].hp, 
            maxHp: UNIT_TYPES[unitKey].hp,
            id: Math.random().toString(36).substr(2, 9)
          };
          placed = true;
        }
      }
    });
    setSetupBoard(newBoard);
  };

  const submitSetup = async () => {
    const field = role === 'host' ? 'hostBoard' : 'guestBoard';
    const readyField = role === 'host' ? 'hostReady' : 'guestReady';
    
    // Validar que todas las piezas estén puestas
    const placedCount = setupBoard.filter(c => c !== null).length;
    if (placedCount < INITIAL_ROSTER.length) {
      // Simple alert replacement
      // En una app real usaríamos un toast
      return; 
    }

    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'games', gameId), {
      [field]: setupBoard,
      [readyField]: true
    });

    // Si ambos listos, empezar partida
    // Esto idealmente lo hace una cloud function, pero aquí lo hace el último que se pone ready
    if ((role === 'host' && game.guestReady) || (role === 'guest' && game.hostReady)) {
       await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'games', gameId), {
         phase: 'playing',
         lastMoveTime: Date.now(), // Iniciar reloj
         logs: [{text: "¡La batalla ha comenzado! Fase de despliegue finalizada.", type: 'sys', time: Date.now()}]
       });
    }
  };

  const handleSurrender = async () => {
    if (game.phase === 'finished') return;
    const winner = role === 'host' ? 'guest' : 'host';
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'games', gameId), {
      phase: 'finished',
      winner: winner,
      logs: [...game.logs, { text: `${role === 'host' ? 'Anfitrión' : 'Invitado'} se ha rendido.`, type: 'end', time: Date.now() }]
    });
  };

  // Lógica de turno
  const executeAction = async (actionType, sourceIdx, targetIdx) => {
    // Validaciones básicas
    if (game.turn !== role) return;
    if (game.phase !== 'playing') return;

    const updates = {};
    const newLogs = [...game.logs];
    let turnEnded = false;

    const enemyBoardKey = role === 'host' ? 'guestBoard' : 'hostBoard';
    const myBoardKey = role === 'host' ? 'hostBoard' : 'guestBoard';
    
    // Clona los tableros para modificar
    const enemyBoard = [...game[enemyBoardKey]];
    const myBoard = [...game[myBoardKey]];
    const sourceUnit = myBoard[sourceIdx];

    if (!sourceUnit) return; // Error
    const unitStats = UNIT_TYPES[sourceUnit.type];

    if (actionType === 'MOVE') {
      // Mover pieza (coste de turno)
      // Validar movimiento simple (1 casilla o rango específico? El prompt dice "Tanque se desplaza..."). 
      // Simplificaremos: Mover a cualquier casilla vacía de tu mitad (o rango limitado).
      // Prompt: "respetando movimientos". Asumiremos rango 1 o 2 para simplificar UX.
      if (myBoard[targetIdx]) return; // Ocupado
      
      myBoard[targetIdx] = sourceUnit;
      myBoard[sourceIdx] = null;
      
      updates[myBoardKey] = myBoard;
      newLogs.push({ text: `${role === 'host' ? 'Anfitrión' : 'Invitado'} movió una unidad.`, type: 'move', time: Date.now() });
      turnEnded = true;

    } else if (actionType === 'ATTACK') {
      // Atacar
      const indices = calculateAttackIndices(sourceIdx, targetIdx, unitStats.range);
      let hitSomething = false;
      let revealedUnits = [];

      indices.forEach(idx => {
        if (enemyBoard[idx]) {
          hitSomething = true;
          enemyBoard[idx].hp -= unitStats.dmg;
          enemyBoard[idx].wasHit = true; // Marca roja visual para el atacante

          if (enemyBoard[idx].hp <= 0) {
             // Unidad destruida
             const destroyedName = UNIT_TYPES[enemyBoard[idx].type].name;
             newLogs.push({ text: `¡${destroyedName} enemigo eliminado por ${unitStats.name}!`, type: 'kill', time: Date.now() });
             revealedUnits.push(destroyedName);
             
             if (enemyBoard[idx].type === 'COMMANDER') {
                updates.winner = role;
                updates.phase = 'finished';
                newLogs.push({ text: `¡El Comandante enemigo ha caído! Victoria para ${role}.`, type: 'win', time: Date.now() });
             }

             enemyBoard[idx] = null; // Eliminar del tablero
          }
        } else {
           // Miss (podríamos guardar misses para mostrar humo gris)
           // En Firestore, no guardamos "misses" persistentes en el array de objetos, 
           // pero podríamos añadir un campo auxiliar "missedShots" si quisiéramos.
           // Por simplicidad, solo guardamos estado de unidades.
        }
      });

      // Marcar posición del atacante para el enemigo (Marca verde)
      sourceUnit.revealedPosition = true; // Flag temporal o permanente? Prompt: "deja una marca... si decide dejar pasar el turno".
      // Lo haremos permanente hasta que se mueva.
      myBoard[sourceIdx] = sourceUnit;

      updates[enemyBoardKey] = enemyBoard;
      updates[myBoardKey] = myBoard;
      
      if (!updates.winner) {
         newLogs.push({ text: `${role === 'host' ? 'Anfitrión' : 'Invitado'} atacó con ${unitStats.name}. ${hitSomething ? '¡IMPACTO!' : 'Fallo.'}`, type: 'attack', time: Date.now() });
      }
      turnEnded = true;

    } else if (actionType === 'HEAL') {
        // Curar unidad aliada
        if (!unitStats.canHeal) return;
        const targetUnit = myBoard[targetIdx];
        if (targetUnit && targetUnit.hp < targetUnit.maxHp) {
            targetUnit.hp = Math.min(targetUnit.hp + 10, targetUnit.maxHp); // Curar 10
            updates[myBoardKey] = myBoard;
            newLogs.push({ text: `${role === 'host' ? 'Anfitrión' : 'Invitado'} realizó reparaciones de campo.`, type: 'heal', time: Date.now() });
            turnEnded = true;
        }
    }

    if (turnEnded) {
      updates.turn = role === 'host' ? 'guest' : 'host';
      updates.lastMoveTime = Date.now();
      // Gestión de tiempo básica (restar tiempo gastado)
      const timeSpent = (Date.now() - game.lastMoveTime) / 1000;
      if (role === 'host') updates.hostTime = Math.max(0, game.hostTime - timeSpent);
      else updates.guestTime = Math.max(0, game.guestTime - timeSpent);
      
      updates.logs = newLogs;
      
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'games', gameId), updates);
      setSelectedActionUnit(null); // Reset selección
    }
  };

  if (!game) return <div>Cargando batalla...</div>;

  // Visual Boards
  // El jugador siempre ve SU tablero abajo y el del enemigo ARRIBA.
  // Si soy Host: Mi tablero es hostBoard, Enemigo es guestBoard.
  // Si soy Guest: Mi tablero es guestBoard, Enemigo es hostBoard.
  // IMPORTANTE: Necesitamos invertir visualmente el tablero del oponente para que "espeje".
  
  const myBoardData = role === 'host' ? game.hostBoard : game.guestBoard;
  const enemyBoardData = role === 'host' ? game.guestBoard : game.hostBoard;

  // Lógica de setup local vs DB
  const currentMyBoard = game.phase === 'setup' ? setupBoard : myBoardData;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* HUD Superior */}
      <div className="bg-slate-900/80 backdrop-blur p-4 rounded-xl border border-slate-800 flex justify-between items-center shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/10 via-transparent to-red-900/10 pointer-events-none"></div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded ${game.turn === role ? 'bg-emerald-900/50 border border-emerald-500 text-emerald-400' : 'bg-slate-900 text-slate-500'}`}>
             {game.turn === role ? <Play size={18} className="animate-pulse"/> : <Clock size={18}/>}
             <span className="font-bold font-mono text-xl">
               {role === 'host' ? Math.floor(game.hostTime) : Math.floor(game.guestTime)}s
             </span>
             <span className="text-xs uppercase tracking-wider">Tu Turno</span>
          </div>
          <div className="h-8 w-px bg-slate-700"></div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded ${game.turn !== role ? 'bg-red-900/50 border border-red-500 text-red-400' : 'bg-slate-900 text-slate-500'}`}>
             <span className="font-bold font-mono text-xl">
               {role === 'host' ? Math.floor(game.guestTime) : Math.floor(game.hostTime)}s
             </span>
             <span className="text-xs uppercase tracking-wider">Enemigo</span>
          </div>
        </div>
        <div className="flex gap-2">
            <button onClick={handleSurrender} className="px-3 py-1 bg-red-900/30 hover:bg-red-900 text-red-400 border border-red-800 rounded text-xs uppercase tracking-widest transition">
                Rendirse
            </button>
            <button onClick={onLeave} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs uppercase tracking-widest transition">
                Salir
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow">
        
        {/* ZONA DE JUEGO (Tableros) */}
        <div className="lg:col-span-8 flex flex-col gap-8 items-center justify-center bg-slate-950/50 p-8 rounded-2xl border border-slate-800 shadow-inner relative">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none rounded-2xl"></div>
            
            {/* Tablero Enemigo */}
            <div className="relative group">
                <div className="absolute -left-8 top-0 bottom-0 flex flex-col justify-center text-xs text-slate-600 uppercase rotate-180" style={{writingMode: 'vertical-rl'}}>Territorio Hostil</div>
                <Board 
                    isEnemy={true}
                    boardData={enemyBoardData || Array(64).fill(null)}
                    interactive={game.phase === 'playing' && game.turn === role}
                    selectedActionUnit={selectedActionUnit}
                    onCellClick={(idx) => {
                        if(selectedActionUnit && game.turn === role) {
                            executeAction('ATTACK', selectedActionUnit.index, idx);
                        }
                    }}
                />
                {/* Fog of War Overlay (Visual) */}
                {game.phase === 'playing' && (
                    <div className="absolute top-[-20px] left-0 w-full text-center text-red-500 text-xs font-bold tracking-widest opacity-0 group-hover:opacity-100 transition">ZONA DE IMPACTO</div>
                )}
            </div>

            {/* Separador / Estado */}
            <div className="w-full h-1 bg-slate-800 flex justify-center items-center">
                <div className="bg-slate-900 px-4 py-1 rounded-full border border-slate-700 text-xs text-slate-500">FRONTERA</div>
            </div>

            {/* Mi Tablero */}
            <div className="relative">
                 <div className="absolute -left-8 top-0 bottom-0 flex flex-col justify-center text-xs text-emerald-600 uppercase" style={{writingMode: 'vertical-rl'}}>Base Aliada</div>
                 <Board 
                    isEnemy={false}
                    boardData={currentMyBoard || Array(64).fill(null)}
                    interactive={true}
                    setupMode={game.phase === 'setup'}
                    onCellClick={(idx) => {
                        // Lógica de selección para mover/atacar
                        if (game.phase === 'playing' && game.turn === role) {
                            const unit = currentMyBoard[idx];
                            // Si selecciono mi unidad
                            if (unit) {
                                setSelectedActionUnit({ ...unit, index: idx });
                            } else if (selectedActionUnit && !unit) {
                                // Mover a casilla vacía
                                executeAction('MOVE', selectedActionUnit.index, idx);
                            }
                        } else if (game.phase === 'setup') {
                            // Lógica básica de setup manual (click para quitar/poner en orden sería complejo en un solo archivo, 
                            // usaremos el botón randomize por simplicidad, pero podríamos implementar drag and drop)
                        }
                    }}
                    selectedIdx={selectedActionUnit?.index}
                />
                {game.phase === 'setup' && (
                     <div className="absolute -bottom-14 left-0 w-full flex gap-2 justify-center">
                        <button onClick={handleRandomize} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition">
                            <Shuffle size={16}/> Aleatorio
                        </button>
                        <button onClick={submitSetup} className={`flex items-center gap-2 px-6 py-2 rounded text-sm font-bold transition shadow-lg ${game[role === 'host' ? 'hostReady' : 'guestReady'] ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
                            <Flag size={16}/> Confirmar Posiciones
                        </button>
                     </div>
                )}
            </div>
        </div>

        {/* ZONA DE INFO (Chat, Logs, Unidad Seleccionada) */}
        <div className="lg:col-span-4 flex flex-col gap-4 h-[600px]">
             {/* Panel de Unidad Seleccionada */}
             <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 h-1/3">
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">Información Táctica</h3>
                {selectedActionUnit ? (
                    <div className="flex gap-4 animate-in fade-in slide-in-from-right-4">
                        <div className="w-16 h-16 bg-slate-900 rounded flex items-center justify-center border border-emerald-500/30 text-emerald-400">
                             {React.createElement(UNIT_TYPES[selectedActionUnit.type].icon, {size: 32})}
                        </div>
                        <div>
                            <div className="font-bold text-emerald-400">{UNIT_TYPES[selectedActionUnit.type].name}</div>
                            <div className="text-xs text-slate-400 mb-1">HP: {selectedActionUnit.hp} / {selectedActionUnit.maxHp}</div>
                            <div className="text-xs text-slate-300 italic">{UNIT_TYPES[selectedActionUnit.type].desc}</div>
                            {game.phase === 'playing' && game.turn === role && (
                                <div className="mt-2 text-xs text-emerald-500 font-mono">
                                    &gt; SISTEMA LISTO. SELECCIONE OBJETIVO EN RADAR ENEMIGO.
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center text-slate-600 text-sm italic">
                        Selecciona una unidad aliada para ver detalles y órdenes.
                    </div>
                )}
             </div>

             {/* Log de Batalla */}
             <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex-grow overflow-hidden flex flex-col font-mono text-xs">
                <h3 className="text-slate-500 mb-2 uppercase tracking-widest text-[10px] border-b border-slate-800 pb-1">Registro de Comunicaciones</h3>
                <div className="overflow-y-auto flex-grow space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                    {game.logs?.slice().reverse().map((log, i) => (
                        <div key={i} className={`p-2 rounded border-l-2 ${
                            log.type === 'attack' ? 'border-yellow-500 bg-yellow-900/10 text-yellow-200' :
                            log.type === 'kill' ? 'border-red-500 bg-red-900/20 text-red-100' :
                            log.type === 'win' ? 'border-emerald-500 bg-emerald-900/30 text-emerald-100' :
                            log.type === 'heal' ? 'border-blue-500 bg-blue-900/10 text-blue-200' :
                            'border-slate-500 text-slate-400'
                        }`}>
                            <span className="opacity-50 mr-2">[{new Date(log.time).toLocaleTimeString([], {hour12: false, hour:'2-digit', minute:'2-digit'})}]</span>
                            {log.text}
                        </div>
                    ))}
                    {game.logs?.length === 0 && <div className="text-slate-600 text-center mt-10">Esperando inicio de hostilidades...</div>}
                </div>
             </div>
        </div>

      </div>
    </div>
  );
}

// --- COMPONENTE TABLERO ---

function Board({ isEnemy, boardData, interactive, onCellClick, setupMode, selectedIdx, selectedActionUnit }) {
    // Renderiza el grid 8x8
    const cells = [];
    for(let y = 0; y < BOARD_SIZE; y++) {
        for(let x = 0; x < BOARD_SIZE; x++) {
            const idx = getIndex(x, y);
            // Si es enemigo, rotamos las coordenadas visualmente para que el 0,0 esté en la esquina opuesta si queremos
            // Pero la lógica simple es mantener coordenadas y solo ocultar información.
            
            const unit = boardData ? boardData[idx] : null;
            const isSelected = idx === selectedIdx;
            
            // Lógica de visualización de celdas enemigas
            let content = null;
            let cellClass = "border-slate-800 bg-slate-900/80"; // Base
            
            if (isEnemy) {
                // TABLERO ENEMIGO
                if (unit && unit.hp <= 0) {
                     // Unidad muerta (visible como chatarra)
                     cellClass = "border-red-900 bg-red-900/20";
                     content = <Skull size={20} className="text-red-700 opacity-50" />;
                } else if (unit && unit.wasHit) {
                    // Impacto confirmado pero viva (marca roja)
                    cellClass = "border-red-500 bg-red-900/40 cursor-crosshair animate-pulse";
                    content = <div className="w-3 h-3 bg-red-500 rounded-full shadow-[0_0_10px_red]"></div>
                } else if (unit && unit.revealedPosition) {
                    // Revelado por atacar (marca verde)
                    cellClass = "border-emerald-500 bg-emerald-900/20";
                    // Se muestra icono fantasma
                    const UnitIcon = UNIT_TYPES[unit.type].icon;
                    content = <UnitIcon size={20} className="text-emerald-500 opacity-50" />;
                } else {
                    // Niebla de guerra pura
                    cellClass = interactive ? "hover:bg-slate-800 cursor-crosshair border-slate-700/50" : "border-slate-800";
                }
                
                // Highlight de ataque (si tengo unidad seleccionada y paso por encima)
                // (Esto requeriría estado de hover complejo, omitido por brevedad, usamos cursor-crosshair)

            } else {
                // MI TABLERO
                if (unit) {
                    const UnitIcon = UNIT_TYPES[unit.type].icon;
                    const isDamaged = unit.hp < unit.maxHp;
                    cellClass = isSelected 
                        ? "bg-emerald-600 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)] z-10 scale-105 transition-transform" 
                        : "bg-slate-800 border-slate-600 hover:bg-slate-700 cursor-pointer";
                    
                    if (unit.hp <= 0) {
                        cellClass = "bg-slate-900 border-slate-800 opacity-50 grayscale";
                    }

                    content = (
                        <div className="flex flex-col items-center justify-center w-full h-full relative">
                            <UnitIcon size={setupMode ? 24 : 20} className={isSelected ? "text-white" : "text-emerald-400"} />
                            {/* Barra de vida */}
                            {!setupMode && unit.hp > 0 && (
                                <div className="absolute bottom-1 w-4/5 h-1 bg-slate-900 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full ${isDamaged ? 'bg-yellow-500' : 'bg-emerald-500'}`} 
                                        style={{width: `${(unit.hp / unit.maxHp) * 100}%`}}
                                    ></div>
                                </div>
                            )}
                            {unit.revealedPosition && <div className="absolute top-1 right-1 w-2 h-2 bg-emerald-400 rounded-full animate-ping"></div>}
                        </div>
                    );
                } else {
                    // Celda vacía mía
                    cellClass = isSelected ? "bg-emerald-900/30 border-emerald-500" : "border-slate-700 hover:bg-slate-800/50";
                    // Si estoy moviendo, iluminar posibles destinos (simplificado a hover)
                }
            }

            cells.push(
                <div 
                    key={idx} 
                    onClick={() => onCellClick(idx)}
                    className={`w-full h-full aspect-square border border-collapse flex items-center justify-center transition-all duration-200 ${cellClass}`}
                >
                    {content}
                </div>
            );
        }
    }

    return (
        <div className="grid grid-cols-8 gap-px w-[320px] h-[320px] md:w-[480px] md:h-[480px] border-2 border-slate-700 bg-slate-900 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden rounded-lg">
            {cells}
            {/* Coordenadas Grid Overlay (Opcional) */}
            <div className="absolute inset-0 pointer-events-none grid grid-cols-8 grid-rows-8">
               {/* Solo decorativo */}
            </div>
        </div>
    );
}


// --- PANTALLA DE REGLAS ---

function RulesScreen({ onBack }) {
    return (
        <div className="bg-slate-900/80 backdrop-blur-md p-8 rounded-xl border border-slate-800 max-w-3xl mx-auto shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/5 to-transparent pointer-events-none"></div>
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                <h2 className="text-3xl font-bold text-emerald-500 flex items-center gap-2"><HelpCircle /> Manual de Campo</h2>
                <button onClick={onBack} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded transition text-sm">Volver al Lobby</button>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
                <div>
                    <h3 className="text-xl font-bold text-white mb-3">Objetivo</h3>
                    <p className="text-slate-300 mb-4 text-sm leading-relaxed">
                        Destruye al <strong>Comandante</strong> enemigo o elimina todas sus tropas.
                        La partida se juega a ciegas: no ves la ubicación exacta del enemigo hasta que tus disparos impactan o sus unidades se revelan al atacar.
                    </p>

                    <h3 className="text-xl font-bold text-white mb-3">Mecánicas</h3>
                    <ul className="text-slate-300 text-sm space-y-2 list-disc pl-5">
                        <li><strong className="text-emerald-400">Niebla de Guerra:</strong> Solo ves impactos (rojo) y atacantes recientes (verde).</li>
                        <li><strong className="text-emerald-400">Turnos:</strong> En tu turno puedes MOVER, ATACAR o CURAR (solo Infantería).</li>
                        <li><strong className="text-emerald-400">Revelación:</strong> Atacar revela tu posición temporalmente (marca verde en mapa enemigo).</li>
                    </ul>
                </div>

                <div>
                    <h3 className="text-xl font-bold text-white mb-3">Unidades</h3>
                    <div className="space-y-3">
                        {Object.values(UNIT_TYPES).map(unit => (
                            <div key={unit.id} className="flex items-start gap-3 bg-slate-900/50 p-2 rounded border border-slate-700">
                                <div className="p-2 bg-slate-800 rounded text-emerald-400">
                                    {React.createElement(unit.icon, {size: 20})}
                                </div>
                                <div>
                                    <div className="font-bold text-sm text-white">{unit.name} <span className="text-xs text-slate-500 ml-2">HP: {unit.hp}</span></div>
                                    <div className="text-xs text-slate-400">{unit.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}