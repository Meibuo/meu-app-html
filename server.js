const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do PostgreSQL CORRIGIDAS
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

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

// Inicializar banco de dados CORRIGIDO
const initializeDatabase = async () => {
  try {
    console.log('🔄 Inicializando banco de dados...');
    
    // Criar tabela users se não existir
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
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela users criada/verificada');

    // Criar tabela de registros de ponto
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registros_ponto (
        id VARCHAR(100) PRIMARY KEY,
        usuario_id VARCHAR(100) NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        local VARCHAR(100),
        observacao TEXT,
        horas_extras BOOLEAN DEFAULT FALSE,
        manual BOOLEAN DEFAULT FALSE,
        data_registro DATE DEFAULT CURRENT_DATE,
        hora_registro TIME DEFAULT CURRENT_TIME,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE
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

// Middleware de autenticação SIMPLIFICADO - CORRIGIDO
const requireAuth = async (req, res, next) => {
  try {
    const usuario_id = req.body.usuario_id || req.query.usuario_id;
    
    if (!usuario_id) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado' });
    }

    // Verificar se usuário existe
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

// ROTA DE LOGIN - CORRIGIDA
app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    console.log('🔐 Tentativa de login:', email);
    
    if (!email || !senha) {
      return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios' });
    }

    const emailLimpo = email.toLowerCase().trim();

    // Buscar usuário no banco
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [emailLimpo]);

    if (result.rows.length === 0) {
      console.log('❌ Usuário não encontrado:', emailLimpo);
      return res.status(400).json({ success: false, error: 'E-mail ou senha incorretos' });
    }

    const user = result.rows[0];
    console.log('👤 Usuário encontrado:', user.nome);

    // Verificar senha
    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
      console.log('❌ Senha incorreta para:', emailLimpo);
      return res.status(400).json({ success: false, error: 'E-mail ou senha incorretos' });
    }
    
    // Responder com sucesso
    console.log('✅ Login bem-sucedido para:', user.nome);
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
        criadoEm: user.criado_em
      } 
    });

  } catch (error) {
    console.error('💥 Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA DE CADASTRO (para admin) - CORRIGIDA
app.post('/api/admin/cadastro', requireAdmin, async (req, res) => {
  try {
    const { nome, email, telefone, senha, cargo } = req.body;
    
    console.log('👥 Tentativa de cadastro por admin:', email);
    
    if (!nome || !email || !senha) {
      return res.status(400).json({ success: false, error: 'Nome, e-mail e senha são obrigatórios' });
    }

    const emailLimpo = email.toLowerCase().trim();

    // Verificar se usuário já existe
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [emailLimpo]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'E-mail já cadastrado' });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(senha, 10);
    const userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    // Inserir usuário
    await pool.query(
      `INSERT INTO users (id, nome, email, telefone, senha, cargo) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, nome, emailLimpo, telefone || null, hashedPassword, cargo || 'Terceiro']
    );

    console.log('✅ Usuário cadastrado com sucesso:', nome);
    
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
    console.error('💥 Erro no cadastro:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA DE ATUALIZAÇÃO DE PERFIL - CORRIGIDA
app.put('/api/perfil', requireAuth, async (req, res) => {
  try {
    const { nome, telefone } = req.body;
    const usuario_id = req.user.id;
    
    if (!nome) {
      return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
    }

    // Se não for admin e perfil já foi editado, bloquear edição
    if (!req.user.is_admin && req.user.perfil_editado) {
      return res.status(400).json({ success: false, error: 'Perfil já foi editado. Para novas alterações, entre em contato com o administrador.' });
    }

    // Atualizar perfil
    await pool.query(
      'UPDATE users SET nome = $1, telefone = $2, perfil_editado = true WHERE id = $3',
      [nome, telefone || null, usuario_id]
    );

    // Buscar usuário atualizado
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id]);
    const updatedUser = result.rows[0];

    console.log('✅ Perfil atualizado:', updatedUser.nome);
    
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
    console.error('💥 Erro ao atualizar perfil:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA PARA ALTERAR SENHA - CORRIGIDA
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

    // Verificar senha atual
    const senhaAtualValida = await bcrypt.compare(senhaAtual, req.user.senha);
    if (!senhaAtualValida) {
      return res.status(400).json({ success: false, error: 'Senha atual incorreta' });
    }

    // Hash da nova senha
    const hashedNovaSenha = await bcrypt.hash(novaSenha, 10);

    // Atualizar senha
    await pool.query(
      'UPDATE users SET senha = $1 WHERE id = $2',
      [hashedNovaSenha, usuario_id]
    );

    console.log('✅ Senha alterada para usuário:', req.user.nome);
    
    res.json({ 
      success: true, 
      message: 'Senha alterada com sucesso!' 
    });

  } catch (error) {
    console.error('💥 Erro ao alterar senha:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA PARA UPLOAD DE AVATAR (simplificada)
app.post('/api/upload-avatar', requireAuth, async (req, res) => {
  try {
    const usuario_id = req.user.id;

    // Em uma implementação real, aqui processaria o upload de imagem
    // Por enquanto, retornamos sucesso sem fazer nada
    res.json({ 
      success: true, 
      message: 'Upload de avatar realizado com sucesso!',
      avatar: null
    });

  } catch (error) {
    console.error('💥 Erro no upload de avatar:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ========== ROTAS DE REGISTRO DE PONTO - CORRIGIDAS ==========

// Registrar ponto - CORRIGIDA
app.post('/api/registrar-ponto', requireAuth, async (req, res) => {
  try {
    const { tipo, local, observacao, horas_extras, manual } = req.body;
    const usuario_id = req.user.id;
    
    console.log('⏰ Registrando ponto para:', req.user.nome, 'Tipo:', tipo);
    
    if (!tipo || !local) {
      return res.status(400).json({ success: false, error: 'Tipo e local são obrigatórios' });
    }

    const registroId = 'reg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const agora = new Date();
    const dataRegistro = agora.toISOString().split('T')[0];
    const horaRegistro = agora.toTimeString().split(' ')[0];

    await pool.query(
      `INSERT INTO registros_ponto (id, usuario_id, tipo, local, observacao, horas_extras, manual, data_registro, hora_registro) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        registroId, 
        usuario_id, 
        tipo, 
        local, 
        observacao || null, 
        horas_extras || false, 
        manual || false, 
        dataRegistro,
        horaRegistro
      ]
    );

    console.log('✅ Ponto registrado com sucesso para:', req.user.nome);
    
    res.json({ 
      success: true, 
      message: 'Ponto registrado com sucesso!' 
    });

  } catch (error) {
    console.error('💥 Erro ao registrar ponto:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Obter registros do usuário - CORRIGIDA
app.get('/api/registros/:usuario_id', requireAuth, async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    
    console.log('📋 Buscando registros para usuário:', usuario_id);
    
    // Verificar se o usuário está acessando seus próprios registros ou é admin
    if (usuario_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso não autorizado' });
    }

    const result = await pool.query(
      `SELECT *, 
              COALESCE(data_registro, DATE(criado_em)) as data_formatada,
              COALESCE(hora_registro, TIME(criado_em)) as hora_formatada
       FROM registros_ponto 
       WHERE usuario_id = $1 
       ORDER BY criado_em DESC`,
      [usuario_id]
    );

    const registros = result.rows.map(reg => ({
      id: reg.id,
      tipo: reg.tipo,
      local: reg.local,
      observacao: reg.observacao,
      horas_extras: reg.horas_extras,
      manual: reg.manual,
      data: reg.data_formatada,
      hora: reg.hora_formatada,
      diaSemana: new Date(reg.data_formatada).toLocaleDateString('pt-BR', { weekday: 'long' }),
      criadoEm: reg.criado_em
    }));

    console.log(`✅ Encontrados ${registros.length} registros`);
    
    res.json({ success: true, registros });

  } catch (error) {
    console.error('💥 Erro ao buscar registros:', error);
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
      criadoEm: user.criado_em
    }));
    
    console.log(`👥 Listando ${usuarios.length} usuários para admin`);
    
    res.json({ success: true, usuarios });
  } catch (error) {
    console.error('💥 Erro ao buscar usuários:', error);
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

    // Verificar se o email já está em uso por outro usuário
    const emailCheck = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND id != $2',
      [email, userId]
    );
    
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'E-mail já está em uso por outro usuário' });
    }

    // Atualizar usuário
    await pool.query(
      'UPDATE users SET nome = $1, email = $2, telefone = $3, cargo = $4 WHERE id = $5',
      [nome, email, telefone || null, cargo || 'Terceiro', userId]
    );

    console.log('✅ Usuário atualizado:', nome);
    
    res.json({ 
      success: true, 
      message: 'Usuário atualizado com sucesso!' 
    });

  } catch (error) {
    console.error('💥 Erro ao atualizar usuário:', error);
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

    // Verificar se é o próprio admin tentando redefinir a própria senha
    if (usuario_id === req.user.id) {
      return res.status(400).json({ success: false, error: 'Administrador não pode redefinir a própria senha por esta rota' });
    }

    // Gerar senha aleatória
    const novaSenha = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(novaSenha, 10);

    // Atualizar senha
    await pool.query(
      'UPDATE users SET senha = $1 WHERE id = $2',
      [hashedPassword, usuario_id]
    );

    console.log('✅ Senha redefinida para usuário ID:', usuario_id);
    
    res.json({ 
      success: true, 
      message: 'Senha redefinida com sucesso!',
      novaSenha: novaSenha
    });

  } catch (error) {
    console.error('💥 Erro ao redefinir senha:', error);
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
      version: '3.1.0'
    });
  } catch (error) {
    console.error('💥 Erro no status:', error);
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
  console.log('📊 Configuração do banco:', process.env.DATABASE_URL ? '✅ Configurado' : '❌ Não configurado');
  
  // Testar conexão com banco primeiro
  const bancoConectado = await testarConexaoBanco();
  
  if (!bancoConectado) {
    console.log('⚠️  Servidor iniciando sem conexão com banco');
  }
  
  // Inicializar banco (mesmo que falhe, o servidor sobe)
  try {
    await initializeDatabase();
  } catch (error) {
    console.log('⚠️  Erro na inicialização do banco, mas servidor continua...');
  }
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log('========================================');
    console.log('👑 Credenciais Admin: admin@admin.com / admin123');
    console.log('========================================');
  });
};

// Iniciar servidor
startServer().catch(error => {
  console.error('💥 ERRO AO INICIAR SERVIDOR:', error);
  process.exit(1);
});