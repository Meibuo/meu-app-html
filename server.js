const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas!'));
    }
  }
});

// Lista de cargos disponíveis
const CARGOS_DISPONIVEIS = [
  'CEO Administrativo',
  'CEO Operações',
  'Engenharia',
  'Topógrafo',
  'Nivelador',
  'Aux. Topografia',
  'Terceiro'
];

// "Database" em memória (para demonstração - em produção use um banco real)
let users = [];
let pontos = [];
let alteracoesPerfil = []; // Registrar alterações de perfil

// Criar usuário admin padrão
const createAdminUser = async () => {
  const adminExists = users.find(user => user.email === 'admin@admin.com');
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    users.push({
      id: 'admin',
      nome: 'Administrador',
      email: 'admin@admin.com',
      telefone: '',
      senha: hashedPassword,
      avatar: '',
      cargo: 'CEO Administrativo',
      perfilEditado: false,
      isAdmin: true,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    });
    console.log('👑 Usuário admin criado: admin@admin.com / admin123');
  }
};

// Rotas da API (mantenha as rotas existentes de cadastro, login, etc.)

// ... (mantenha todas as rotas existentes de cadastro, login, perfil, admin, etc.)

// Rota atualizada para registrar ponto
app.post('/api/registrar-ponto', (req, res) => {
    try {
        const { 
            usuario_id, 
            tipo, 
            local, 
            horas_extras, 
            trabalho_sabado, 
            observacao, 
            manual,
            data_custom,
            hora_custom
        } = req.body;
        
        if (!usuario_id || !tipo) {
            return res.status(400).json({ error: 'ID do usuário e tipo são obrigatórios' });
        }
        
        // Verificar se usuário existe
        const userExists = users.find(user => user.id === usuario_id);
        if (!userExists) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        let now;
        if (data_custom && hora_custom) {
            // Usar data e hora customizadas para horas extras manuais
            const [year, month, day] = data_custom.split('-');
            const [hours, minutes] = hora_custom.split(':');
            now = new Date(year, month - 1, day, hours, minutes);
        } else {
            now = new Date();
        }
        
        const novoPonto = {
            id: Date.now().toString(),
            usuario_id,
            tipo,
            data: now.toISOString().split('T')[0],
            hora: now.toTimeString().split(' ')[0],
            timestamp: now.getTime(),
            diaSemana: now.toLocaleDateString('pt-BR', { weekday: 'long' }),
            // Novos campos
            local: local || '',
            horas_extras: horas_extras || false,
            trabalho_sabado: trabalho_sabado || false,
            observacao: observacao || '',
            manual: manual || false
        };
        
        pontos.push(novoPonto);
        
        console.log(`📝 Ponto registrado: ${userExists.nome} - ${tipo} - ${local} - ${horas_extras ? 'Horas Extras' : ''}`);
        
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

// Rota para obter registros do usuário
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

// ... (mantenha o resto do servidor igual)

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

app.get('/perfil', (req, res) => {
    res.sendFile(path.join(__dirname, 'perfil.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Middleware de tratamento de erro 404
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

// Inicializar servidor
app.listen(PORT, async () => {
    await createAdminUser();
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`👉 Acesse: http://localhost:${PORT}`);
    console.log(`📊 Status: http://localhost:${PORT}/api/status`);
    console.log(`👑 Admin: admin@admin.com / admin123`);
    console.log(`📋 Cargos disponíveis: ${CARGOS_DISPONIVEIS.join(', ')}`);
    console.log(`⏰ Sistema de ponto atualizado!`);
});