import express from 'express';
import path from 'path';
import session from 'express-session';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';  // Elimina { ObjectId }

import { Server } from 'socket.io';
import { createServer } from 'http';

dotenv.config();

const port = process.env.PORT ?? 8000;

const app = express();
const server = createServer(app);
const io = new Server(server);

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'A4gQeWBHbrsUnSOaAA3gQeWBHbrsUnSOaAagQeWBHbrsUnSOa', resave: false, saveUninitialized: true }));
app.use(express.static('src'));

const connectToDatabase = async () => {
    try {
        const client = await MongoClient.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        return client.db('chatApp');
    } catch (err) {
        console.error('Error connecting to MongoDB', err);
        throw err;
    }
};

let db;
let usersCollection;
let user;
const obtenerNombreUnico = (socket) => {
    if (user) {
        return user;
    }else{
        const address = socket.handshake.address;
        return `Guest`;
    }
};

const startSocketIO = async () => {
    db = await connectToDatabase();
    usersCollection = db.collection('users');

    io.on('connection', async (socket) => {
        socket.username = obtenerNombreUnico(socket);

        console.log(`User ${socket.username} has connected`);

        socket.on('disconnect', () => {
            console.log(`User ${socket.username} has disconnected`);
            if (socket.handshake.session) {
                socket.handshake.session.destroy((err) => {
                    if (err) {
                        console.error('Error destroying session:', err);
                    }
                });
            }
        });

        socket.on('chat message', async (msg) => {
            try {
                const result = await db.collection('messages').insertOne({ content: msg, sender: socket.username });
                io.emit('chat message', msg, socket.username, result.insertedId.toString());
            } catch (e) {
                console.error(e);
                return;
            }
        });

        const messages = await db.collection('messages').find().toArray();
        messages.forEach((message) => {
            io.to(socket.id).emit('chat message', message.content, message.sender, message._id.toString());
        });
    });
};

app.get('/', (req, res) => {
    if (!req.session.username || req.session.username == 'Guest') {
        return res.redirect('/login');
    }
    res.sendFile(path.resolve('src', 'views', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.resolve('src','views', 'login.html'));
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const passwordAsInt = parseInt(password, 10);
    try {
        const userRecord = await usersCollection.findOne({ username, password: passwordAsInt });

        if (userRecord) {
            req.session.username = username;
            res.json({ success: true });
            user = username;
        } else {
            res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
        }
    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

app.get('/register', (req, res) => {
    res.sendFile(path.resolve('src','views', 'register.html'));
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

startSocketIO();
