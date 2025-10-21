const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// "Database" em memória
let users = [];
let pontos = [];

// Rotas da API
app.post('/api/cadastro', (req, res) => {
    const { nome, email, senha } = req.body;
    
    const userExists = users.find(user => user.email === email);
    if (userExists) {
        return res.status(400).json({ error: 'E-mail já cadastrado' });
    }
    
    const newUser = {
        id: Date.now().toString(),
        nome,
        email,
        senha,
        criadoEm: new Date().toISOString()
    };
    
    users.push(newUser);
    res.json({ 
        success: true, 
        message: 'Conta criada com sucesso!', 
        user: { id: newUser.id, nome: newUser.nome, email: newUser.email } 
    });
});

app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;
    
    const user = users.find(user => user.email === email && user.senha === senha);
    if (!user) {
        return res.status(400).json({ error: 'E-mail ou senha incorretos' });
    }
    
    res.json({ 
        success: true, 
        message: 'Login realizado com sucesso!', 
        user: { id: user.id, nome: user.nome, email: user.email } 
    });
});

app.post('/api/registrar-ponto', (req, res) => {
    const { usuario_id, tipo } = req.body;
    
    const novoPonto = {
        id: Date.now().toString(),
        usuario_id,
        tipo,
        data: new Date().toISOString().split('T')[0],
        hora: new Date().toTimeString().split(' ')[0],
        timestamp: new Date().getTime()
    };
    
    pontos.push(novoPonto);
    res.json({ 
        success: true, 
        message: `Ponto de ${tipo} registrado com sucesso!`,
        registro: novoPonto
    });
});

app.get('/api/registros/:usuario_id', (req, res) => {
    const { usuario_id } = req.params;
    const registrosUsuario = pontos.filter(ponto => ponto.usuario_id === usuario_id);
    
    res.json({ registros: registrosUsuario });
});

// Servir arquivos HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/cadastro', (req, res) => {
    res.sendFile(path.join(__dirname, 'cadastro.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`👉 Acesse: http://localhost:${PORT}`);
});