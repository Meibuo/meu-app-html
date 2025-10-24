const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Configuração do Multer para upload de imagens
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/avatars';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const usuario_id = req.body.usuario_id;
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${usuario_id}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas!'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

// Testar conexão com o banco
const testarConexaoBanco = async () => {
  try {
    console.log('🔄 Testando conexão com o banco...');
    const client = await pool.connect();
    console.log('✅ Conexão com PostgreSQL bem-sucedida!');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ ERRO NA CONEXÃO COM O BANCO:', error.message);
    return false;
  }
};

// Inicializar banco de dados COMPLETO
const initializeDatabase = async () => {
  try {
    console.log('🔄 Inicializando banco de dados...');
    
    // Tabela users com todas as colunas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        telefone VARCHAR(20),
        senha VARCHAR(255) NOT NULL,
        avatar VARCHAR(255),
        cargo VARCHAR(50) DEFAULT 'Terceiro',
        perfil_editado BOOLEAN DEFAULT FALSE,
        is_admin BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'ativo',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela users criada/verificada');

    // Tabela de registros de ponto completa
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registros_ponto (
        id VARCHAR(100) PRIMARY KEY,
        usuario_id VARCHAR(100) NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        local VARCHAR(100),
        observacao TEXT,
        horas_extras BOOLEAN DEFAULT FALSE,
        manual BOOLEAN DEFAULT FALSE,
        data_custom DATE,
        hora_custom TIME,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES users(id)
      )
    `);
    console.log('✅ Tabela registros_ponto criada/verificada');

    // Verificar se admin existe
    const adminResult = await pool.query('SELECT * FROM users WHERE email = $1', ['admin@admin.com']);
    
    if (adminResult.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const adminId = 'admin-' + Date.now();
      
      await pool.query(
        `INSERT INTO users (id, nome, email, senha, cargo, is_admin) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [adminId, 'Administrador', 'admin@admin.com', hashedPassword, 'CEO Administrativo', true]
      );
      
      console.log('👑 Usuário administrador criado: admin@admin.com / admin123');
    } else {
      console.log('👑 Usuário administrador já existe');
    }

    console.log('✅ Banco de dados inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
    throw error;
  }
};

// Middleware de autenticação SIMPLIFICADO
const requireAuth = async (req, res, next) => {
  try {
    const usuario_id = req.body.usuario_id || req.query.usuario_id;
    
    if (!usuario_id) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado' });
    }

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Usuário não encontrado' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Erro na autenticação:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
};

// Middleware para admin
const requireAdmin = async (req, res, next) => {
  try {
    const usuario_id = req.body.usuario_id || req.query.usuario_id;
    
    if (!usuario_id) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado' });
    }

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Usuário não encontrado' });
    }

    const user = result.rows[0];
    if (!user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso restrito a administradores' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Erro na verificação de admin:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
};

// ========== ROTAS DA API ==========

// ROTA DE LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    console.log('🔐 Tentativa de login:', email);
    
    if (!email || !senha) {
      return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios' });
    }

    const emailLimpo = email.toLowerCase().trim();

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [emailLimpo]);

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'E-mail ou senha incorretos' });
    }

    const user = result.rows[0];

    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
      return res.status(400).json({ success: false, error: 'E-mail ou senha incorretos' });
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
        perfilEditado: user.perfil_editado,
        isAdmin: user.is_admin,
        status: user.status,
        criadoEm: user.criado_em
      } 
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA DE CADASTRO (para admin)
app.post('/api/admin/cadastro', requireAdmin, async (req, res) => {
  try {
    const { nome, email, telefone, senha, cargo } = req.body;
    
    if (!nome || !email || !senha) {
      return res.status(400).json({ success: false, error: 'Nome, e-mail e senha são obrigatórios' });
    }

    const emailLimpo = email.toLowerCase().trim();

    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [emailLimpo]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'E-mail já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(senha, 10);
    const userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    await pool.query(
      `INSERT INTO users (id, nome, email, telefone, senha, cargo) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, nome, emailLimpo, telefone || null, hashedPassword, cargo || 'Terceiro']
    );

    res.json({ 
      success: true, 
      message: 'Usuário cadastrado com sucesso!',
      user: {
        id: userId,
        nome,
        email: emailLimpo,
        telefone: telefone || null,
        cargo: cargo || 'Terceiro'
      }
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA DE ATUALIZAÇÃO DE PERFIL
app.put('/api/perfil', requireAuth, async (req, res) => {
  try {
    const { nome, telefone } = req.body;
    const usuario_id = req.user.id;
    
    if (!nome) {
      return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
    }

    if (!req.user.is_admin && req.user.perfil_editado) {
      return res.status(400).json({ success: false, error: 'Perfil já foi editado. Para novas alterações, entre em contato com o administrador.' });
    }

    await pool.query(
      'UPDATE users SET nome = $1, telefone = $2, perfil_editado = true WHERE id = $3',
      [nome, telefone || null, usuario_id]
    );

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id]);
    const updatedUser = result.rows[0];

    res.json({ 
      success: true, 
      message: 'Perfil atualizado com sucesso!',
      user: {
        id: updatedUser.id,
        nome: updatedUser.nome,
        email: updatedUser.email,
        telefone: updatedUser.telefone,
        avatar: updatedUser.avatar,
        cargo: updatedUser.cargo,
        perfilEditado: updatedUser.perfil_editado,
        isAdmin: updatedUser.is_admin,
        criadoEm: updatedUser.criado_em
      }
    });

  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA PARA UPLOAD DE AVATAR
app.post('/api/upload-avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    const usuario_id = req.body.usuario_id;
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhuma imagem enviada' });
    }

    const avatarPath = `/uploads/avatars/${req.file.filename}`;

    // Atualizar no banco de dados
    await pool.query(
      'UPDATE users SET avatar = $1 WHERE id = $2',
      [avatarPath, usuario_id]
    );

    // Buscar usuário atualizado
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id]);
    const updatedUser = result.rows[0];

    res.json({ 
      success: true, 
      message: 'Avatar atualizado com sucesso!',
      avatar: avatarPath,
      user: {
        id: updatedUser.id,
        nome: updatedUser.nome,
        email: updatedUser.email,
        avatar: updatedUser.avatar
      }
    });

  } catch (error) {
    console.error('Erro no upload de avatar:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor: ' + error.message });
  }
});

// ROTA PARA ALTERAR SENHA
app.put('/api/alterar-senha', requireAuth, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    const usuario_id = req.user.id;
    
    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({ success: false, error: 'Senha atual e nova senha são obrigatórias' });
    }

    if (novaSenha.length < 6) {
      return res.status(400).json({ success: false, error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }

    const senhaAtualValida = await bcrypt.compare(senhaAtual, req.user.senha);
    if (!senhaAtualValida) {
      return res.status(400).json({ success: false, error: 'Senha atual incorreta' });
    }

    const hashedNovaSenha = await bcrypt.hash(novaSenha, 10);

    await pool.query(
      'UPDATE users SET senha = $1 WHERE id = $2',
      [hashedNovaSenha, usuario_id]
    );

    res.json({ 
      success: true, 
      message: 'Senha alterada com sucesso!' 
    });

  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ========== ROTAS DE ADMINISTRAÇÃO ==========

// Listar todos os usuários (apenas admin)
app.get('/api/admin/usuarios', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY criado_em DESC');
    
    const usuarios = result.rows.map(user => ({
      id: user.id,
      nome: user.nome,
      email: user.email,
      telefone: user.telefone,
      cargo: user.cargo,
      avatar: user.avatar,
      perfilEditado: user.perfil_editado,
      isAdmin: user.is_admin,
      status: user.status,
      criadoEm: user.criado_em
    }));
    
    res.json({ success: true, usuarios });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Atualizar usuário (apenas admin)
app.put('/api/admin/usuarios/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { nome, email, telefone, cargo } = req.body;
    
    if (!nome || !email) {
      return res.status(400).json({ success: false, error: 'Nome e e-mail são obrigatórios' });
    }

    const emailCheck = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND id != $2',
      [email, userId]
    );
    
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'E-mail já está em uso por outro usuário' });
    }

    await pool.query(
      'UPDATE users SET nome = $1, email = $2, telefone = $3, cargo = $4 WHERE id = $5',
      [nome, email, telefone || null, cargo || 'Terceiro', userId]
    );

    res.json({ 
      success: true, 
      message: 'Usuário atualizado com sucesso!' 
    });

  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Redefinir senha do usuário (apenas admin)
app.post('/api/admin/redefinir-senha', requireAdmin, async (req, res) => {
  try {
    const { usuario_id } = req.body;
    
    if (!usuario_id) {
      return res.status(400).json({ success: false, error: 'ID do usuário é obrigatório' });
    }

    if (usuario_id === req.user.id) {
      return res.status(400).json({ success: false, error: 'Administrador não pode redefinir a própria senha por esta rota' });
    }

    const novaSenha = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(novaSenha, 10);

    await pool.query(
      'UPDATE users SET senha = $1 WHERE id = $2',
      [hashedPassword, usuario_id]
    );

    res.json({ 
      success: true, 
      message: 'Senha redefinida com sucesso!',
      novaSenha: novaSenha
    });

  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ========== ROTAS DE REGISTRO DE PONTO ==========

// ROTA DE REGISTRO DE PONTO - CORRIGIDA
app.post('/api/registrar-ponto', requireAuth, async (req, res) => {
  try {
    const { tipo, local, observacao, horas_extras, data_custom, hora_custom, manual } = req.body;
    const usuario_id = req.user.id;
    
    console.log('📍 Tentativa de registro de ponto:', { usuario_id, tipo, local, horas_extras });

    if (!tipo || !local) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tipo e local são obrigatórios' 
      });
    }

    const registroId = 'reg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    await pool.query(
      `INSERT INTO registros_ponto (id, usuario_id, tipo, local, observacao, horas_extras, manual, data_custom, hora_custom) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [registroId, usuario_id, tipo, local, observacao || null, horas_extras || false, manual || false, data_custom || null, hora_custom || null]
    );

    console.log('✅ Ponto registrado com sucesso');

    const message = horas_extras ? 'Hora extra registrada com sucesso!' : 'Ponto registrado com sucesso!';

    res.json({ 
      success: true, 
      message: message,
      registro: {
        id: registroId,
        tipo: tipo,
        local: local,
        horas_extras: horas_extras || false
      }
    });

  } catch (error) {
    console.error('❌ Erro ao registrar ponto:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

// OBTER ÚLTIMO REGISTRO DO USUÁRIO
app.get('/api/ultimo-registro/:usuario_id', requireAuth, async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    
    if (usuario_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso não autorizado' });
    }

    const result = await pool.query(
      'SELECT * FROM registros_ponto WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 1',
      [usuario_id]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, ultimoRegistro: null });
    }

    const ultimoRegistro = result.rows[0];
    
    res.json({
      success: true,
      ultimoRegistro: {
        tipo: ultimoRegistro.tipo,
        local: ultimoRegistro.local,
        data: new Date(ultimoRegistro.criado_em).toLocaleDateString('pt-BR'),
        hora: new Date(ultimoRegistro.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        horas_extras: ultimoRegistro.horas_extras
      }
    });

  } catch (error) {
    console.error('Erro ao buscar último registro:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Obter registros do usuário - CORRIGIDA
app.get('/api/registros/:usuario_id', requireAuth, async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    const { limit = 100 } = req.query;
    
    if (usuario_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso não autorizado' });
    }

    const result = await pool.query(
      `SELECT * FROM registros_ponto 
       WHERE usuario_id = $1 
       ORDER BY criado_em DESC 
       LIMIT $2`,
      [usuario_id, parseInt(limit)]
    );

    const registros = result.rows.map(reg => ({
      id: reg.id,
      tipo: reg.tipo,
      local: reg.local,
      observacao: reg.observacao,
      horas_extras: reg.horas_extras,
      manual: reg.manual,
      data: reg.data_custom || new Date(reg.criado_em).toLocaleDateString('pt-BR'),
      hora: reg.hora_custom || new Date(reg.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      diaSemana: new Date(reg.criado_em).toLocaleDateString('pt-BR', { weekday: 'long' }),
      criadoEm: reg.criado_em
    }));

    res.json({ success: true, registros });

  } catch (error) {
    console.error('Erro ao buscar registros:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ESTATÍSTICAS SIMPLES DO USUÁRIO
app.get('/api/estatisticas/:usuario_id', requireAuth, async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    
    if (usuario_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso não autorizado' });
    }

    const totalResult = await pool.query(
      'SELECT COUNT(*) FROM registros_ponto WHERE usuario_id = $1',
      [usuario_id]
    );

    const hojeResult = await pool.query(
      `SELECT COUNT(*) FROM registros_ponto 
       WHERE usuario_id = $1 AND DATE(criado_em) = CURRENT_DATE`,
      [usuario_id]
    );

    const horasExtrasResult = await pool.query(
      `SELECT COUNT(*) FROM registros_ponto 
       WHERE usuario_id = $1 AND horas_extras = true`,
      [usuario_id]
    );

    res.json({
      success: true,
      estatisticas: {
        totalRegistros: parseInt(totalResult.rows[0].count),
        registrosHoje: parseInt(hojeResult.rows[0].count),
        horasExtras: parseInt(horasExtrasResult.rows[0].count)
      }
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA PARA EXPORTAR REGISTROS
app.get('/api/exportar-registros/:usuario_id', requireAuth, async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    const { data_inicio, data_fim } = req.query;
    
    if (usuario_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso não autorizado' });
    }

    let query = `
      SELECT rp.*, u.nome as usuario_nome 
      FROM registros_ponto rp 
      JOIN users u ON rp.usuario_id = u.id 
      WHERE rp.usuario_id = $1 
    `;
    let params = [usuario_id];

    if (data_inicio && data_fim) {
      query += ` AND DATE(rp.criado_em) BETWEEN $2 AND $3`;
      params.push(data_inicio, data_fim);
    }

    query += ` ORDER BY rp.criado_em DESC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      registros: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Erro ao exportar registros:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Rota pública de status
app.get('/api/status', async (req, res) => {
  try {
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const registrosCount = await pool.query('SELECT COUNT(*) FROM registros_ponto');
    
    res.json({ 
      status: 'online', 
      timestamp: new Date().toISOString(),
      usersCount: parseInt(usersCount.rows[0].count),
      registrosCount: parseInt(registrosCount.rows[0].count),
      version: '2.0.0'
    });
  } catch (error) {
    console.error('Erro no status:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rotas para servir páginas HTML
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

// Rota de fallback para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Inicializar servidor
const startServer = async () => {
  console.log('🚀 Iniciando servidor...');
  
  const bancoConectado = await testarConexaoBanco();
  
  if (!bancoConectado) {
    console.log('⚠️  Servidor iniciando sem conexão com banco');
  }
  
  await initializeDatabase();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log('========================================');
  });
};

// Iniciar servidor
startServer().catch(error => {
  console.error('💥 ERRO AO INICIAR SERVIDOR:', error);
  process.exit(1);
});