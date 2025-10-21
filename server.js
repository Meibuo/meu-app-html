const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações de segurança
const JWT_SECRET = process.env.JWT_SECRET || 'seu_jwt_secret_super_seguro_aqui_mude_em_producao';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware de segurança CORS corrigido
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Headers de segurança
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('.'));

// Rate limiting para prevenir ataques de força bruta
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // aumentado para 10 tentativas por IP
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // aumentado para 200 requisições por IP
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Aplicar rate limiting
app.use('/api/login', authLimiter);
app.use('/api/cadastro', authLimiter);
app.use('/api/', generalLimiter);

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
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
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Apenas imagens JPEG, PNG, GIF e WebP são permitidas!'));
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

// Middleware de autenticação JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ error: 'Token expirado' });
      }
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// Middleware de autorização para administradores
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
};

// Função para gerar token JWT
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      isAdmin: user.isAdmin 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Função para gerar senha aleatória
const generateRandomPassword = (length = 8) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&';
  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
};

// Sanitização básica de dados
const sanitizeUserInput = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&#34;')
    .trim();
};

// Validação de email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validação de telefone
const isValidPhone = (phone) => {
  if (!phone) return true;
  const phoneRegex = /^[\d\s\(\)\-\+]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

// Criar usuário admin padrão
const createAdminUser = async () => {
  const adminExists = users.find(user => user.email === 'admin@admin.com');
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    users.push({
      id: 'admin-' + Date.now().toString(),
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

// Rota pública de status
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'online', 
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    usersCount: users.length,
    pontosCount: pontos.length,
    version: '1.0.0'
  });
});

// Rota de cadastro
app.post('/api/cadastro', async (req, res) => {
  try {
    let { nome, email, senha, telefone } = req.body;
    
    // Sanitização de entrada
    nome = sanitizeUserInput(nome);
    email = sanitizeUserInput(email).toLowerCase();
    telefone = sanitizeUserInput(telefone);
    
    // Validação básica
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    
    if (!isValidPhone(telefone)) {
      return res.status(400).json({ error: 'Telefone inválido' });
    }
    
    if (senha.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }
    
    if (nome.length < 2) {
      return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
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
    
    // Gerar token JWT
    const token = generateToken(newUser);
    
    res.status(201).json({ 
      success: true, 
      message: 'Conta criada com sucesso!', 
      token,
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
app.post('/api/admin/cadastro', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let { nome, email, senha, telefone, cargo } = req.body;
    
    // Sanitização de entrada
    nome = sanitizeUserInput(nome);
    email = sanitizeUserInput(email).toLowerCase();
    telefone = sanitizeUserInput(telefone);
    cargo = sanitizeUserInput(cargo);
    
    // Validação básica
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    
    if (!isValidPhone(telefone)) {
      return res.status(400).json({ error: 'Telefone inválido' });
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
    
    res.status(201).json({ 
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

// Rota de login
app.post('/api/login', async (req, res) => {
  try {
    let { email, senha } = req.body;
    
    // Sanitização
    email = sanitizeUserInput(email).toLowerCase();
    
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
    
    // Gerar token JWT
    const token = generateToken(user);
    
    res.json({ 
      success: true, 
      message: 'Login realizado com sucesso!', 
      token,
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
app.post('/api/upload-avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    const { usuario_id } = req.body;
    
    if (!usuario_id) {
      return res.status(400).json({ error: 'ID do usuário é obrigatório' });
    }
    
    // Verificar se o usuário tem permissão
    if (req.user.id !== usuario_id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para atualizar este avatar' });
    }
    
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
    
    // Deletar arquivo em caso de erro
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Erro ao deletar arquivo temporário:', unlinkError);
      }
    }
    
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Servir arquivos de upload
app.use('/uploads', express.static('uploads'));

// Atualizar perfil do usuário
app.put('/api/perfil', authenticateToken, async (req, res) => {
  try {
    const { usuario_id, nome, telefone } = req.body;
    
    if (!usuario_id) {
      return res.status(400).json({ error: 'ID do usuário é obrigatório' });
    }
    
    // Verificar se o usuário tem permissão
    if (req.user.id !== usuario_id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para atualizar este perfil' });
    }
    
    const userIndex = users.findIndex(user => user.id === usuario_id);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    const user = users[userIndex];
    
    // Verificar se o perfil já foi editado (só permite uma edição para não-admins)
    if (user.perfilEditado && !req.user.isAdmin) {
      return res.status(400).json({ 
        error: 'Perfil já foi editado. Para novas alterações, entre em contato com o administrador.' 
      });
    }
    
    // Sanitizar entradas
    const nomeSanitizado = sanitizeUserInput(nome);
    const telefoneSanitizado = sanitizeUserInput(telefone);
    
    // Validações
    if (nomeSanitizado && nomeSanitizado.length < 2) {
      return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
    }
    
    if (telefoneSanitizado && !isValidPhone(telefoneSanitizado)) {
      return res.status(400).json({ error: 'Telefone inválido' });
    }
    
    // Registrar alteração
    const alteracao = {
      id: Date.now().toString(),
      usuario_id,
      alteracoes: {
        nome: user.nome !== nomeSanitizado ? { de: user.nome, para: nomeSanitizado } : null,
        telefone: user.telefone !== telefoneSanitizado ? { de: user.telefone, para: telefoneSanitizado } : null,
      },
      data: new Date().toISOString(),
      alteradoPor: req.user.id
    };
    
    alteracoesPerfil.push(alteracao);
    
    // Atualizar usuário
    users[userIndex] = {
      ...user,
      nome: nomeSanitizado || user.nome,
      telefone: telefoneSanitizado || user.telefone,
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
app.put('/api/alterar-senha', authenticateToken, async (req, res) => {
  try {
    const { usuario_id, senhaAtual, novaSenha } = req.body;
    
    if (!usuario_id || !novaSenha) {
      return res.status(400).json({ error: 'ID do usuário e nova senha são obrigatórios' });
    }
    
    // Verificar se o usuário tem permissão
    if (req.user.id !== usuario_id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para alterar esta senha' });
    }
    
    if (novaSenha.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres' });
    }
    
    const userIndex = users.findIndex(user => user.id === usuario_id);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    const user = users[userIndex];
    
    // Se não for admin, verificar senha atual
    if (!req.user.isAdmin) {
      if (!senhaAtual) {
        return res.status(400).json({ error: 'Senha atual é obrigatória' });
      }
      const passwordMatch = await bcrypt.compare(senhaAtual, user.senha);
      if (!passwordMatch) {
        return res.status(400).json({ error: 'Senha atual incorreta' });
      }
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

// Redefinir senha pelo administrador
app.post('/api/admin/redefinir-senha', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { usuario_id } = req.body;
    
    if (!usuario_id) {
      return res.status(400).json({ error: 'ID do usuário é obrigatório' });
    }
    
    const userIndex = users.findIndex(user => user.id === usuario_id);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Não permitir que admin redefina sua própria senha por esta rota
    if (usuario_id === req.user.id) {
      return res.status(400).json({ error: 'Use a função de alteração de senha para alterar sua própria senha' });
    }
    
    // Gerar senha aleatória
    const novaSenha = generateRandomPassword(8);
    
    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(novaSenha, 10);
    
    // Atualizar senha do usuário
    users[userIndex].senha = hashedPassword;
    users[userIndex].atualizadoEm = new Date().toISOString();
    
    // Registrar a ação de redefinição
    const redefinicaoSenha = {
      id: Date.now().toString(),
      usuario_id,
      administrador_id: req.user.id,
      data: new Date().toISOString(),
      tipo: 'redefinicao_senha'
    };
    
    alteracoesPerfil.push(redefinicaoSenha);
    
    console.log(`🔑 Senha redefinida para usuário: ${users[userIndex].nome} - Nova senha: ${novaSenha}`);
    
    res.json({ 
      success: true, 
      message: 'Senha redefinida com sucesso!',
      novaSenha: novaSenha, // Enviar a senha em texto claro para o admin poder enviar ao usuário
      usuario: {
        id: users[userIndex].id,
        nome: users[userIndex].nome,
        email: users[userIndex].email
      }
    });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rotas de administração
app.get('/api/admin/usuarios', authenticateToken, requireAdmin, (req, res) => {
  try {
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
app.get('/api/admin/cargos', authenticateToken, requireAdmin, (req, res) => {
  res.json({ success: true, cargos: CARGOS_DISPONIVEIS });
});

// Atualizar usuário (admin)
app.put('/api/admin/usuarios/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let { nome, email, telefone, cargo } = req.body;
    
    // Sanitizar entradas
    nome = sanitizeUserInput(nome);
    email = sanitizeUserInput(email).toLowerCase();
    telefone = sanitizeUserInput(telefone);
    cargo = sanitizeUserInput(cargo);
    
    const userIndex = users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Validar cargo
    if (cargo && !CARGOS_DISPONIVEIS.includes(cargo)) {
      return res.status(400).json({ error: 'Cargo inválido' });
    }
    
    // Validar email
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    
    // Validar telefone
    if (telefone && !isValidPhone(telefone)) {
      return res.status(400).json({ error: 'Telefone inválido' });
    }
    
    // Verificar se email já existe (excluindo o próprio usuário)
    const emailExists = users.find(user => user.email === email && user.id !== id);
    if (emailExists) {
      return res.status(400).json({ error: 'E-mail já está em uso por outro usuário' });
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

// Registrar ponto
app.post('/api/registrar-ponto', authenticateToken, (req, res) => {
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
    
    // Verificar se o usuário tem permissão
    if (req.user.id !== usuario_id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para registrar ponto para este usuário' });
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
      local: local || '',
      horas_extras: horas_extras || false,
      trabalho_sabado: trabalho_sabado || false,
      observacao: observacao || '',
      manual: manual || false,
      registradoPor: req.user.id
    };
    
    pontos.push(novoPonto);
    
    console.log(`📝 Ponto registrado: ${userExists.nome} - ${tipo} - ${local} - ${horas_extras ? 'Horas Extras' : ''}`);
    
    res.status(201).json({ 
      success: true, 
      message: `Ponto ${tipo} registrado com sucesso!`,
      registro: novoPonto
    });
  } catch (error) {
    console.error('Erro ao registrar ponto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Obter registros do usuário
app.get('/api/registros/:usuario_id', authenticateToken, (req, res) => {
  try {
    const { usuario_id } = req.params;
    
    // Verificar se o usuário tem permissão
    if (req.user.id !== usuario_id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para visualizar estes registros' });
    }
    
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

// Middleware de tratamento de erro global
app.use((error, req, res, next) => {
  console.error('Erro global:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande. Tamanho máximo: 5MB.' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Campo de arquivo inesperado' });
    }
  }
  
  // Erro de validação do multer
  if (error.message.includes('Tipo de arquivo não permitido')) {
    return res.status(400).json({ error: error.message });
  }
  
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Inicializar servidor
app.listen(PORT, async () => {
  await createAdminUser();
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
  console.log(`👑 Usuário admin: admin@admin.com / admin123`);
  console.log(`🌍 Ambiente: ${NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Servidor sendo encerrado...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Servidor sendo encerrado...');
  process.exit(0);
});