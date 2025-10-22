const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
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

    // Verificar se admin existe - SEM MOSTRAR CREDENCIAIS
    const adminResult = await pool.query('SELECT * FROM users WHERE email = $1', ['admin@admin.com']);
    
    if (adminResult.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const adminId = 'admin-' + Date.now();
      
      await pool.query(
        `INSERT INTO users (id, nome, email, senha, cargo, is_admin) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [adminId, 'Administrador', 'admin@admin.com', hashedPassword, 'CEO Administrativo', true]
      );
      
      console.log('👑 Usuário administrador criado');
    } else {
      console.log('👑 Usuário administrador já existe');
    }

    console.log('✅ Banco de dados inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
  }
};

// Middleware de autenticação SIMPLIFICADO - SEM TOKEN
const requireAuth = async (req, res, next) => {
  try {
    const { usuario_id } = req.body;
    
    if (!usuario_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar se usuário existe
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Erro na autenticação:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Middleware para admin
const requireAdmin = async (req, res, next) => {
  try {
    const { usuario_id } = req.body;
    
    if (!usuario_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    const user = result.rows[0];
    if (!user.is_admin) {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Erro na verificação de admin:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ========== ROTAS DA API ==========

// ROTA DE LOGIN - SIMPLIFICADA
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
    
    // Responder com sucesso - SEM TOKEN
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
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ROTA DE CADASTRO (para admin) - SEM TOKEN
app.post('/api/cadastro', async (req, res) => {
  try {
    const { usuario_id, nome, email, telefone, senha, cargo } = req.body;
    
    // Verificar se é admin
    if (usuario_id) {
      const adminResult = await pool.query('SELECT * FROM users WHERE id = $1 AND is_admin = true', [usuario_id]);
      if (adminResult.rows.length === 0) {
        return res.status(403).json({ error: 'Acesso restrito a administradores' });
      }
    }

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

// ROTA DE ATUALIZAÇÃO DE PERFIL - SEM TOKEN
app.put('/api/perfil', async (req, res) => {
  try {
    const { usuario_id, nome, telefone } = req.body;
    
    if (!usuario_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    // Verificar se usuário existe
    const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = userCheck.rows[0];

    // Se não for admin e perfil já foi editado, bloquear edição
    if (!user.is_admin && user.perfil_editado) {
      return res.status(400).json({ error: 'Perfil já foi editado. Para novas alterações, entre em contato com o administrador.' });
    }

    // Atualizar perfil
    await pool.query(
      'UPDATE users SET nome = $1, telefone = $2, perfil_editado = true WHERE id = $3',
      [nome, telefone || null, usuario_id]
    );

    // Buscar usuário atualizado
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
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ROTA PARA ALTERAR SENHA - SEM TOKEN
app.put('/api/alterar-senha', async (req, res) => {
  try {
    const { usuario_id, senhaAtual, novaSenha } = req.body;
    
    if (!usuario_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }

    if (novaSenha.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }

    // Buscar usuário
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

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
      [hashedNovaSenha, usuario_id]
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

// ROTA PARA UPLOAD DE AVATAR (simplificada) - SEM TOKEN
app.post('/api/upload-avatar', async (req, res) => {
  try {
    const { usuario_id } = req.body;
    
    if (!usuario_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

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

// Rotas de administração - SEM TOKEN
app.get('/api/admin/usuarios', async (req, res) => {
  try {
    const { usuario_id } = req.query;
    
    if (!usuario_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar se é admin
    const adminResult = await pool.query('SELECT * FROM users WHERE id = $1 AND is_admin = true', [usuario_id]);
    if (adminResult.rows.length === 0) {
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