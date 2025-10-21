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

// Rotas da API
app.post('/api/cadastro', async (req, res) => {
    try {
        const { nome, email, senha, telefone } = req.body;
        
        // Validação básica
        if (!nome || !email || !senha) {
            return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
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
            telefone: telefone || '',
            senha: hashedPassword,
            avatar: '',
            cargo: 'Terceiro', // Cargo padrão para novos usuários
            perfilEditado: false,
            isAdmin: false,
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString()
        };
        
        users.push(newUser);
        res.json({ 
            success: true, 
            message: 'Conta criada com sucesso!', 
            user: { 
                id: newUser.id, 
                nome: newUser.nome, 
                email: newUser.email,
                telefone: newUser.telefone,
                avatar: newUser.avatar,
                cargo: newUser.cargo,
                perfilEditado: newUser.perfilEditado,
                isAdmin: newUser.isAdmin
            } 
        });
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Cadastro por administrador
app.post('/api/admin/cadastro', async (req, res) => {
    try {
        const { nome, email, senha, telefone, cargo } = req.body;
        
        // Validação básica
        if (!nome || !email || !senha) {
            return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
        }
        
        if (senha.length < 6) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
        }
        
        // Validar cargo
        if (cargo && !CARGOS_DISPONIVEIS.includes(cargo)) {
            return res.status(400).json({ error: 'Cargo inválido' });
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
            telefone: telefone || '',
            senha: hashedPassword,
            avatar: '',
            cargo: cargo || 'Terceiro',
            perfilEditado: false,
            isAdmin: false,
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString()
        };
        
        users.push(newUser);
        res.json({ 
            success: true, 
            message: 'Usuário criado com sucesso!', 
            user: { 
                id: newUser.id, 
                nome: newUser.nome, 
                email: newUser.email,
                telefone: newUser.telefone,
                avatar: newUser.avatar,
                cargo: newUser.cargo,
                perfilEditado: newUser.perfilEditado,
                isAdmin: newUser.isAdmin
            } 
        });
    } catch (error) {
        console.error('Erro no cadastro admin:', error);
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
            user: { 
                id: user.id, 
                nome: user.nome, 
                email: user.email,
                telefone: user.telefone,
                avatar: user.avatar,
                cargo: user.cargo,
                perfilEditado: user.perfilEditado,
                isAdmin: user.isAdmin,
                criadoEm: user.criadoEm
            } 
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Upload de avatar
app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
    try {
        const { usuario_id } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhuma imagem foi enviada' });
        }
        
        const userIndex = users.findIndex(user => user.id === usuario_id);
        if (userIndex === -1) {
            // Deletar arquivo se usuário não existe
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        // Deletar avatar anterior se existir
        if (users[userIndex].avatar && users[userIndex].avatar.startsWith('uploads/')) {
            try {
                fs.unlinkSync(users[userIndex].avatar);
            } catch (error) {
                console.log('Avatar anterior não encontrado para deletar');
            }
        }
        
        const avatarPath = req.file.path;
        users[userIndex].avatar = avatarPath;
        users[userIndex].atualizadoEm = new Date().toISOString();
        
        res.json({ 
            success: true, 
            message: 'Avatar atualizado com sucesso!',
            avatar: avatarPath
        });
    } catch (error) {
        console.error('Erro ao fazer upload do avatar:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Servir arquivos de upload
app.use('/uploads', express.static('uploads'));

// Atualizar perfil do usuário
app.put('/api/perfil', async (req, res) => {
    try {
        const { usuario_id, nome, telefone } = req.body;
        
        const userIndex = users.findIndex(user => user.id === usuario_id);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        const user = users[userIndex];
        
        // Verificar se o perfil já foi editado (só permite uma edição)
        if (user.perfilEditado && !user.isAdmin) {
            return res.status(400).json({ 
                error: 'Perfil já foi editado. Para novas alterações, entre em contato com o administrador.' 
            });
        }
        
        // Registrar alteração
        const alteracao = {
            id: Date.now().toString(),
            usuario_id,
            alteracoes: {
                nome: user.nome !== nome ? { de: user.nome, para: nome } : null,
                telefone: user.telefone !== telefone ? { de: user.telefone, para: telefone } : null,
            },
            data: new Date().toISOString()
        };
        
        alteracoesPerfil.push(alteracao);
        
        // Atualizar usuário
        users[userIndex] = {
            ...user,
            nome: nome || user.nome,
            telefone: telefone || user.telefone,
            perfilEditado: true,
            atualizadoEm: new Date().toISOString()
        };
        
        res.json({ 
            success: true, 
            message: 'Perfil atualizado com sucesso!',
            user: {
                id: users[userIndex].id,
                nome: users[userIndex].nome,
                email: users[userIndex].email,
                telefone: users[userIndex].telefone,
                avatar: users[userIndex].avatar,
                cargo: users[userIndex].cargo,
                perfilEditado: users[userIndex].perfilEditado,
                isAdmin: users[userIndex].isAdmin
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Alterar senha
app.put('/api/alterar-senha', async (req, res) => {
    try {
        const { usuario_id, senhaAtual, novaSenha } = req.body;
        
        if (!senhaAtual || !novaSenha) {
            return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
        }
        
        if (novaSenha.length < 6) {
            return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres' });
        }
        
        const userIndex = users.findIndex(user => user.id === usuario_id);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        const user = users[userIndex];
        
        // Verificar senha atual
        const passwordMatch = await bcrypt.compare(senhaAtual, user.senha);
        if (!passwordMatch) {
            return res.status(400).json({ error: 'Senha atual incorreta' });
        }
        
        // Hash da nova senha
        const hashedPassword = await bcrypt.hash(novaSenha, 10);
        
        users[userIndex].senha = hashedPassword;
        users[userIndex].atualizadoEm = new Date().toISOString();
        
        res.json({ 
            success: true, 
            message: 'Senha alterada com sucesso!' 
        });
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rotas de administração
app.get('/api/admin/usuarios', (req, res) => {
    try {
        // Em produção, verificar se o usuário é admin
        const usuarios = users.map(user => ({
            id: user.id,
            nome: user.nome,
            email: user.email,
            telefone: user.telefone,
            cargo: user.cargo,
            avatar: user.avatar,
            perfilEditado: user.perfilEditado,
            isAdmin: user.isAdmin,
            criadoEm: user.criadoEm,
            atualizadoEm: user.atualizadoEm
        }));
        
        res.json({ success: true, usuarios });
    } catch (error) {
        console.error('Erro ao buscar usuários:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para obter cargos disponíveis
app.get('/api/admin/cargos', (req, res) => {
    res.json({ success: true, cargos: CARGOS_DISPONIVEIS });
});

app.put('/api/admin/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, email, telefone, cargo } = req.body;
        
        const userIndex = users.findIndex(user => user.id === id);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        // Validar cargo
        if (cargo && !CARGOS_DISPONIVEIS.includes(cargo)) {
            return res.status(400).json({ error: 'Cargo inválido' });
        }
        
        users[userIndex] = {
            ...users[userIndex],
            nome: nome || users[userIndex].nome,
            email: email || users[userIndex].email,
            telefone: telefone || users[userIndex].telefone,
            cargo: cargo || users[userIndex].cargo,
            atualizadoEm: new Date().toISOString()
        };
        
        res.json({ 
            success: true, 
            message: 'Usuário atualizado com sucesso!',
            user: {
                id: users[userIndex].id,
                nome: users[userIndex].nome,
                email: users[userIndex].email,
                telefone: users[userIndex].telefone,
                cargo: users[userIndex].cargo,
                avatar: users[userIndex].avatar,
                perfilEditado: users[userIndex].perfilEditado,
                isAdmin: users[userIndex].isAdmin
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
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
        alteracoesPerfil = [];
        createAdminUser();
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
});