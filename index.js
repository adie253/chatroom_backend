require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { db, saveMessage, getMessages, clearMessages, markMessagesAsSeen } = require('./db');
const { login, authenticateToken } = require('./auth');

const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins for dev simplicity
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

// Serve Static Files (Frontend)
app.use(express.static(path.join(__dirname, '../client/dist')));

// Routes
app.post('/api/login', login);

app.get('/api/messages', authenticateToken, async (req, res) => {
    try {
        const messages = await getMessages();
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/messages', authenticateToken, async (req, res) => {
    try {
        await clearMessages();
        io.emit('messagesCleared');
        res.sendStatus(200);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/messages', authenticateToken, async (req, res) => {
    // Only used if sending via REST, but we will primarily use Socket.io
    // But good for fallback or history sync if needed.
    const { content } = req.body;
    const sender = req.user.username;
    try {
        const saved = await saveMessage(sender, content);
        io.emit('receiveMessage', saved); // Broadcast
        res.json(saved);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Catch-all handler for React
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Socket.io
let moods = {}; // { username: 'Happy' }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', (user) => {
        // Could handle online status here
        console.log(`${user} joined chat`);
        // Send current moods to the joining user
        socket.emit('moodUpdate', moods);

        // Default mood if not set
        if (!moods[user]) {
            moods[user] = 'Happy';
            io.emit('moodUpdate', moods);
        }
    });

    socket.on('setMood', ({ username, mood }) => {
        moods[username] = mood;
        io.emit('moodUpdate', moods);
    });

    socket.on('sendReaction', ({ sender, type }) => {
        // type: 'hug' | 'kiss'
        socket.broadcast.emit('receiveReaction', { sender, type });
    });

    socket.on('typing', ({ sender }) => {
        socket.broadcast.emit('typing', { sender });
    });

    socket.on('stopTyping', ({ sender }) => {
        socket.broadcast.emit('stopTyping', { sender });
    });

    socket.on('markSeen', async ({ viewer, sender }) => {
        // 'viewer' has seen messages from 'sender'
        try {
            await markMessagesAsSeen(sender);
            // Notify 'sender' that their messages were seen by 'viewer'
            io.emit('messagesSeen', { viewer, sender });
        } catch (err) {
            console.error('Error marking seen:', err);
        }
    });

    socket.on('sendMessage', async (data) => {
        // data: { sender, content, token } - verify token if strictly needed, 
        // or just trust client for this simple app (since they logged in).
        // Better: verify token from handshake or data.
        try {
            const saved = await saveMessage(data.sender, data.content);
            io.emit('receiveMessage', saved);
        } catch (err) {
            console.error('Error saving message:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
