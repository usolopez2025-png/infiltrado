
export enum GameState {
  ANIMATION = 'ANIMATION',
  LOBBY = 'LOBBY',
  MENU_CHOICE = 'MENU_CHOICE',
  SETUP_CATEGORY = 'SETUP_CATEGORY',
  ONLINE_MENU = 'ONLINE_MENU',
  ONLINE_LOBBY = 'ONLINE_LOBBY',
  WAITING_ROOM = 'WAITING_ROOM',
  SETUP_PLAYERS = 'SETUP_PLAYERS',
  REVEAL = 'REVEAL',
  PLAYING = 'PLAYING',
  VOTING = 'VOTING',
  COUNTDOWN = 'COUNTDOWN',
  RESULTS = 'RESULTS'
}

export enum Role {
  FIEL = 'FIEL',
  IMPOSTOR = 'IMPOSTOR'
}

export interface Player {
  id: number;
  name: string;
  role: Role | null;
  isRevealed: boolean;
  votes: number;
  voterNames: string[];
  votedForId: number | null;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  itemCount: number;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

export interface RoomSettings {
  giveHint: boolean;
  timerDuration: number;
  voiceChat: boolean;
  textChat: boolean;
  reactions: boolean;
}

export const CATEGORIES: Category[] = [
  { id: 'libros_at', name: 'Libros Antiguo Testamento', description: 'Génesis, Éxodo...', icon: '📜', itemCount: 39 },
  { id: 'libros_nt', name: 'Libros Nuevo Testamento', description: 'Mateo, Marcos...', icon: '📖', itemCount: 27 },
  { id: 'salmos', name: 'Libro De Los Salmos', description: 'Poesía y alabanza.', icon: '🎻', itemCount: 150 },
  { id: 'textos_famosos', name: 'Textos Famosos', description: 'Juan 3:16...', icon: '🖋️', itemCount: 50 },
  { id: 'lugares', name: 'Lugares Bíblicos', description: 'Jerusalén...', icon: '🏜️', itemCount: 40 },
  { id: 'objetos', name: 'Objetos Sagrados', description: 'Arca...', icon: '🏺', itemCount: 30 }
];
