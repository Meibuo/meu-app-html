const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sistema_ponto_db_user:PhJDSEgZ9jVyq9S0FzxgFF1fguQbVIaG@dpg-d3rao6umcj7s73egt7hg-a.oregon-postgres.render.com/sistema_ponto_db',
  ssl: {
    rejectUnauthorized: false
  }
});

// Configurações
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_super_seguro_mudar_em_producao_2024';

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

// Inicializar banco de dados
const initializeDatabase = async () => {
  try {
    console.log('🔄 Inicializando banco de dados...');
    
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
      
      console.log('👑 Usuário admin criado');
    } else {
      console.log('👑 Usuário admin já existe');
    }

    console.log('✅ Banco de dados inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
  }
};

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// Gerar token JWT
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      isAdmin: user.is_admin 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// ========== ROTAS DA API ==========

// ROTA DE LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }

    const emailLimpo = email.toLowerCase().trim();

    // Buscar usuário no banco
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [emailLimpo]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'E-mail ou senha incorretos' });
    }

    const user = result.rows[0];

    // Verificar senha
    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
      return res.status(400).json({ error: 'E-mail ou senha incorretos' });
    }

    // Gerar token
    const token = generateToken(user);
    
    // Responder com sucesso
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
        perfilEditado: user.perfil_editado,
        isAdmin: user.is_admin,
        criadoEm: user.criado_em
      } 
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ROTA DE CADASTRO (para admin)
app.post('/api/cadastro', authenticateToken, async (req, res) => {
  try {
    // Verificar se é admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }

    const { nome, email, telefone, senha, cargo } = req.body;
    
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    }

    const emailLimpo = email.toLowerCase().trim();

    // Verificar se usuário já existe
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [emailLimpo]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'E-mail já cadastrado' });
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
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ROTA DE ATUALIZAÇÃO DE PERFIL
app.put('/api/perfil', authenticateToken, async (req, res) => {
  try {
    const { nome, telefone } = req.body;
    
    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    // Atualizar perfil
    await pool.query(
      'UPDATE users SET nome = $1, telefone = $2, perfil_editado = true WHERE id = $3',
      [nome, telefone || null, req.user.id]
    );

    // Buscar usuário atualizado
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];

    res.json({ 
      success: true, 
      message: 'Perfil atualizado com sucesso!',
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
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ROTA PARA ALTERAR SENHA
app.put('/api/alterar-senha', authenticateToken, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    
    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }

    if (novaSenha.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }

    // Buscar usuário
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];

    // Verificar senha atual
    const senhaAtualValida = await bcrypt.compare(senhaAtual, user.senha);
    if (!senhaAtualValida) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    // Hash da nova senha
    const hashedNovaSenha = await bcrypt.hash(novaSenha, 10);

    // Atualizar senha
    await pool.query(
      'UPDATE users SET senha = $1 WHERE id = $2',
      [hashedNovaSenha, req.user.id]
    );

    res.json({ 
      success: true, 
      message: 'Senha alterada com sucesso!' 
    });

  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ROTA PARA UPLOAD DE AVATAR (simplificada)
app.post('/api/upload-avatar', authenticateToken, async (req, res) => {
  try {
    // Em uma implementação real, aqui processaria o upload de imagem
    // Por enquanto, retornamos sucesso sem fazer nada
    res.json({ 
      success: true, 
      message: 'Upload de avatar realizado com sucesso!',
      avatar: null
    });

  } catch (error) {
    console.error('Erro no upload de avatar:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota pública de status
app.get('/api/status', async (req, res) => {
  try {
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    
    res.json({ 
      status: 'online', 
      timestamp: new Date().toISOString(),
      usersCount: parseInt(usersCount.rows[0].count),
      version: '3.0.0'
    });
  } catch (error) {
    console.error('Erro no status:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para verificar token
app.get('/api/verify-token', authenticateToken, (req, res) => {
  res.json({ 
    success: true, 
    message: 'Token válido',
    user: req.user 
  });
});

// Rota para obter dados do usuário atual
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    const user = result.rows[0];
    
    res.json({
      success: true,
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
    console.error('Erro ao obter dados do usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rotas de administração
app.get('/api/admin/usuarios', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    
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
    
    res.json({ success: true, usuarios });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
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
  
  // Testar conexão com banco primeiro
  const bancoConectado = await testarConexaoBanco();
  
  if (!bancoConectado) {
    console.log('⚠️  Servidor iniciando sem conexão com banco');
  }
  
  // Inicializar banco (mesmo que falhe, o servidor sobe)
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`📧 Acesse: http://localhost:${PORT}`);
    console.log('========================================');
  });
};

// Iniciar servidor
startServer().catch(error => {
  console.error('💥 ERRO AO INICIAR SERVIDOR:', error);
  process.exit(1);
});