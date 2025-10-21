const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do PostgreSQL - CONEXÃO SIMPLIFICADA
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sistema_ponto_db_user:PhJDSEgZ9jVyq9S0FzxgFF1fguQbVIaG@dpg-d3rao6umcj7s73egt7hg-a.oregon-postgres.render.com/sistema_ponto_db',
  ssl: {
    rejectUnauthorized: false
  }
});

// Configurações
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_super_seguro_mudar_em_producao_2024';

// Middleware BÁSICO - sem CORS complexo
app.use(cors());
app.use(express.json());
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

// Inicializar banco de dados SIMPLIFICADO
const initializeDatabase = async () => {
  try {
    console.log('🔄 Inicializando banco de dados...');
    
    // Apenas criar tabela de usuários (básica)
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
      
      console.log('👑 Usuário admin criado: admin@admin.com / admin123');
    } else {
      console.log('👑 Usuário admin já existe');
    }

    console.log('✅ Banco de dados inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
  }
};

// Middleware de autenticação SIMPLIFICADO
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

// ROTA DE LOGIN - CORRIGIDA E TESTADA
app.post('/api/login', async (req, res) => {
  console.log('=== INICIANDO LOGIN ===');
  
  try {
    const { email, senha } = req.body;
    console.log('📧 Email recebido:', email);
    
    // Validação básica
    if (!email || !senha) {
      console.log('❌ Dados incompletos');
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }

    const emailLimpo = email.toLowerCase().trim();
    console.log('🔍 Buscando usuário:', emailLimpo);

    // Buscar usuário no banco
    let result;
    try {
      result = await pool.query('SELECT * FROM users WHERE email = $1', [emailLimpo]);
      console.log('📊 Resultado da busca:', result.rows.length ? 'Usuário encontrado' : 'Usuário não encontrado');
    } catch (dbError) {
      console.error('❌ Erro no banco de dados:', dbError);
      return res.status(500).json({ error: 'Erro no servidor de banco de dados' });
    }

    if (result.rows.length === 0) {
      console.log('❌ Usuário não encontrado');
      return res.status(400).json({ error: 'E-mail ou senha incorretos' });
    }

    const user = result.rows[0];
    console.log('👤 Usuário encontrado:', user.nome, '- Admin:', user.is_admin);

    // Verificar senha
    console.log('🔐 Verificando senha...');
    let senhaValida;
    try {
      senhaValida = await bcrypt.compare(senha, user.senha);
    } catch (bcryptError) {
      console.error('❌ Erro ao comparar senhas:', bcryptError);
      return res.status(500).json({ error: 'Erro ao verificar senha' });
    }

    if (!senhaValida) {
      console.log('❌ Senha incorreta');
      return res.status(400).json({ error: 'E-mail ou senha incorretos' });
    }

    // Gerar token
    console.log('🎫 Gerando token JWT...');
    const token = generateToken(user);

    console.log('✅ LOGIN BEM-SUCEDIDO:', user.email);
    
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
    console.error('💥 ERRO GRAVE NO LOGIN:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Erro interno do servidor: ' + error.message });
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
        isAdmin: user.is_admin
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
    console.log(`🔐 Login: http://localhost:${PORT}/login`);
    console.log(`👑 Admin: admin@admin.com / admin123`);
    console.log('========================================');
  });
};

// Iniciar servidor
startServer().catch(error => {
  console.error('💥 ERRO AO INICIAR SERVIDOR:', error);
  process.exit(1);
});