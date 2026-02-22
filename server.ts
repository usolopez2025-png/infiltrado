
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import os from "os";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // In-memory store for rooms
  // roomCode -> { players: [{ id, name, isAdmin }], settings: {} }
  const rooms = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join_room", ({ roomCode, userName, isAdmin }) => {
      socket.join(roomCode);
      
      if (!rooms.has(roomCode)) {
        rooms.set(roomCode, { 
          players: [], 
          settings: { 
            giveHint: true, 
            timerDuration: 180, 
            voiceChat: true, 
            textChat: true, 
            reactions: true 
          } 
        });
      }

      const room = rooms.get(roomCode);
      
      // Check if player already in room (reconnection or same name)
      const existingPlayerIndex = room.players.findIndex((p: any) => p.name === userName);
      if (existingPlayerIndex !== -1) {
        room.players[existingPlayerIndex].id = socket.id;
      } else {
        room.players.push({ id: socket.id, name: userName, isAdmin });
      }

      console.log(`User ${userName} joined room ${roomCode}`);
      
      // Broadcast updated player list to everyone in the room
      io.to(roomCode).emit("room_data", {
        players: room.players,
        settings: room.settings
      });
    });

    socket.on("update_settings", ({ roomCode, settings }) => {
      if (rooms.has(roomCode)) {
        rooms.get(roomCode).settings = settings;
        socket.to(roomCode).emit("settings_updated", settings);
      }
    });

    socket.on("send_message", ({ roomCode, message }) => {
      io.to(roomCode).emit("new_message", message);
    });

    socket.on("start_game", ({ roomCode, gameData, players }) => {
      io.to(roomCode).emit("game_started", { gameData, players });
    });

    socket.on("vote", ({ roomCode, targetId, voterName }) => {
      io.to(roomCode).emit("player_voted", { targetId, voterName });
    });

    socket.on("reveal_results", ({ roomCode }) => {
      io.to(roomCode).emit("results_revealed");
    });

    socket.on("sync_timer", ({ roomCode, time }) => {
      socket.to(roomCode).emit("timer_synced", time);
    });

    socket.on("audio_data", ({ roomCode, audioData }) => {
      socket.to(roomCode).emit("audio_received", { sender: socket.id, audioData });
    });

    socket.on("leave_room", ({ roomCode }) => {
      socket.leave(roomCode);
      if (rooms.has(roomCode)) {
        const room = rooms.get(roomCode);
        const leavingPlayer = room.players.find((p: any) => p.id === socket.id);
        
        // If admin leaves, close the room for everyone
        if (leavingPlayer && leavingPlayer.isAdmin) {
          io.to(roomCode).emit("room_closed");
          rooms.delete(roomCode);
        } else {
          room.players = room.players.filter((p: any) => p.id !== socket.id);
          if (room.players.length === 0) {
            rooms.delete(roomCode);
          } else {
            io.to(roomCode).emit("room_data", {
              players: room.players,
              settings: room.settings
            });
          }
        }
      }
    });

    socket.on("disconnecting", () => {
      for (const roomCode of socket.rooms) {
        if (rooms.has(roomCode)) {
          const room = rooms.get(roomCode);
          const leavingPlayer = room.players.find((p: any) => p.id === socket.id);
          
          if (leavingPlayer && leavingPlayer.isAdmin) {
            io.to(roomCode).emit("room_closed");
            rooms.delete(roomCode);
          } else {
            room.players = room.players.filter((p: any) => p.id !== socket.id);
            if (room.players.length === 0) {
              rooms.delete(roomCode);
            } else {
              io.to(roomCode).emit("room_data", {
                players: room.players,
                settings: room.settings
              });
            }
          }
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    const networkInterfaces = os.networkInterfaces();
    let networkUrl = "";
    
    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      if (interfaces) {
        for (const iface of interfaces) {
          if (iface.family === 'IPv4' && !iface.internal) {
            networkUrl = `http://${iface.address}:${PORT}`;
            break;
          }
        }
      }
      if (networkUrl) break;
    }

    console.log(`\n  ➜  Local:   http://localhost:${PORT}/`);
    if (networkUrl) {
      console.log(`  ➜  Network: ${networkUrl}/`);
    }
    console.log(`\n  Servidor listo y funcionando.\n`);
  });
}

startServer();
