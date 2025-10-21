const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// "Database" em memória (para demonstração - em produção use um banco real)
let users = [];
let pontos = [];

// Rotas da API
app.post('/api/cadastro', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        
        // Validação básica
        if (!nome || !email || !senha) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }
        
        if (senha.length < 6) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
        }
        
        const userExists = users.find(user => user.email === email);
        if (userExists) {
            return res.status(400).json({ error: 'E-mail já cadastrado' });
        }
        
        // Hash da senha
        const hashedPassword = await bcrypt.hash(senha, 10);
        
        const newUser = {
            id: Date.now().toString(),
            nome,
            email,
            senha: hashedPassword,
            criadoEm: new Date().toISOString()
        };
        
        users.push(newUser);
        res.json({ 
            success: true, 
            message: 'Conta criada com sucesso!', 
            user: { id: newUser.id, nome: newUser.nome, email: newUser.email } 
        });
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        
        if (!email || !senha) {
            return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
        }
        
        const user = users.find(user => user.email === email);
        if (!user) {
            return res.status(400).json({ error: 'E-mail ou senha incorretos' });
        }
        
        // Verificar senha com bcrypt
        const passwordMatch = await bcrypt.compare(senha, user.senha);
        if (!passwordMatch) {
            return res.status(400).json({ error: 'E-mail ou senha incorretos' });
        }
        
        res.json({ 
            success: true, 
            message: 'Login realizado com sucesso!', 
            user: { id: user.id, nome: user.nome, email: user.email } 
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/registrar-ponto', (req, res) => {
    try {
        const { usuario_id, tipo } = req.body;
        
        if (!usuario_id || !tipo) {
            return res.status(400).json({ error: 'ID do usuário e tipo são obrigatórios' });
        }
        
        // Verificar se usuário existe
        const userExists = users.find(user => user.id === usuario_id);
        if (!userExists) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        const now = new Date();
        const novoPonto = {
            id: Date.now().toString(),
            usuario_id,
            tipo,
            data: now.toISOString().split('T')[0],
            hora: now.toTimeString().split(' ')[0],
            timestamp: now.getTime(),
            diaSemana: now.toLocaleDateString('pt-BR', { weekday: 'long' })
        };
        
        pontos.push(novoPonto);
        res.json({ 
            success: true, 
            message: `Ponto ${tipo} registrado com sucesso!`,
            registro: novoPonto
        });
    } catch (error) {
        console.error('Erro ao registrar ponto:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/registros/:usuario_id', (req, res) => {
    try {
        const { usuario_id } = req.params;
        
        // Verificar se usuário existe
        const userExists = users.find(user => user.id === usuario_id);
        if (!userExists) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        const registrosUsuario = pontos
            .filter(ponto => ponto.usuario_id === usuario_id)
            .sort((a, b) => b.timestamp - a.timestamp);
        
        res.json({ 
            success: true,
            registros: registrosUsuario,
            total: registrosUsuario.length
        });
    } catch (error) {
        console.error('Erro ao buscar registros:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota de status para verificar se o servidor está online
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'online', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        usersCount: users.length,
        pontosCount: pontos.length
    });
});

// Rota para limpar dados (apenas para desenvolvimento)
if (process.env.NODE_ENV === 'development') {
    app.delete('/api/clear-data', (req, res) => {
        users = [];
        pontos = [];
        res.json({ success: true, message: 'Dados limpos com sucesso' });
    });
}

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

// Middleware de tratamento de erro 404
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`👉 Acesse: http://localhost:${PORT}`);
    console.log(`📊 Status: http://localhost:${PORT}/api/status`);
});