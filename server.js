const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// VERIFICAR VARIÁVEIS DE AMBIENTE ANTES DE TUDO
console.log('🔧 Verificando configurações...');
console.log('📊 DATABASE_URL:', process.env.DATABASE_URL ? '✅ Configurada' : '❌ NÃO CONFIGURADA');

if (!process.env.DATABASE_URL) {
  console.error('💥 ERRO CRÍTICO: DATABASE_URL não está configurada!');
  console.error('📝 Configure a variável DATABASE_URL no Render:');
  console.error('   postgresql://usuario:senha@host:porta/database');
  process.exit(1);
}

// Configurações do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { 
    rejectUnauthorized: false 
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Testar conexão com o banco - AGORA CRÍTICO
const testarConexaoBanco = async () => {
  try {
    console.log('🔄 Testando conexão com o banco...');
    console.log('🔗 Database URL:', process.env.DATABASE_URL);
    
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    console.log('✅ Conexão com PostgreSQL bem-sucedida!', result.rows[0].current_time);
    
    // Verificar tabelas
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('📊 Tabelas encontradas:', tables.rows.map(t => t.table_name));
    
    client.release();
    return true;
  } catch (error) {
    console.error('❌ ERRO NA CONEXÃO COM O BANCO:', error.message);
    console.error('🔧 Problema possíveis:');
    console.error('   1. URL do banco incorreta');
    console.error('   2. Banco não existe ou foi deletado');
    console.error('   3. Credenciais inválidas');
    console.error('   4. Banco não está aceitando conexões');
    return false;
  }
};

// Inicializar banco de dados
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
        cargo VARCHAR(50) DEFAULT 'Terceiro',
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
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela registros_ponto criada/verificada');

    // Verificar se existe algum usuário
    const usersResult = await pool.query('SELECT COUNT(*) FROM users');
    const userCount = parseInt(usersResult.rows[0].count);

    if (userCount === 0) {
      // Criar usuário admin padrão
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const adminId = 'admin-' + Date.now();
      
      await pool.query(
        `INSERT INTO users (id, nome, email, senha, cargo) 
         VALUES ($1, $2, $3, $4, $5)`,
        [adminId, 'Administrador', 'admin@admin.com', hashedPassword, 'CEO Administrativo']
      );
      
      console.log('👑 Usuário administrador criado: admin@admin.com / admin123');
    } else {
      console.log(`👥 ${userCount} usuário(s) encontrado(s) no banco`);
    }

    console.log('✅ Banco de dados inicializado com sucesso!');
    return true;
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
    throw error;
  }
};

// ========== ROTAS DA API ==========

// Rota simples de status
app.get('/api/status', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'online', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'online',
      database: 'disconnected',
      error: 'Database connection failed'
    });
  }
});

// ROTA DE LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    if (!email || !senha) {
      return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'E-mail ou senha incorretos' });
    }

    const user = result.rows[0];

    // Verificar senha
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
        cargo: user.cargo
      } 
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA DE CADASTRO
app.post('/api/cadastro', async (req, res) => {
  try {
    const { nome, email, telefone, senha } = req.body;
    
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
    const userId = 'user-' + Date.now();

    // Inserir usuário
    await pool.query(
      `INSERT INTO users (id, nome, email, telefone, senha) 
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, nome, emailLimpo, telefone || null, hashedPassword]
    );
    
    res.json({ 
      success: true, 
      message: 'Conta criada com sucesso!',
      user: {
        id: userId,
        nome,
        email: emailLimpo,
        telefone: telefone || null,
        cargo: 'Terceiro'
      }
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Registrar ponto
app.post('/api/registrar-ponto', async (req, res) => {
  try {
    const { usuario_id, tipo, local, observacao, horas_extras, manual } = req.body;
    
    if (!usuario_id || !tipo || !local) {
      return res.status(400).json({ success: false, error: 'Usuário, tipo e local são obrigatórios' });
    }

    // Verificar se usuário existe
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [usuario_id]);
    if (userCheck.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Usuário não encontrado' });
    }

    const registroId = 'reg-' + Date.now();
    const agora = new Date();
    const dataRegistro = agora.toISOString().split('T')[0];
    const horaRegistro = agora.toTimeString().split(' ')[0];

    await pool.query(
      `INSERT INTO registros_ponto (id, usuario_id, tipo, local, observacao, horas_extras, manual, data_registro, hora_registro) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [registroId, usuario_id, tipo, local, observacao || null, horas_extras || false, manual || false, dataRegistro, horaRegistro]
    );
    
    res.json({ 
      success: true, 
      message: 'Ponto registrado com sucesso!' 
    });

  } catch (error) {
    console.error('Erro ao registrar ponto:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Obter registros do usuário
app.get('/api/registros/:usuario_id', async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;

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
      data: new Date(reg.data_formatada).toLocaleDateString('pt-BR'),
      hora: reg.hora_formatada,
      diaSemana: new Date(reg.data_formatada).toLocaleDateString('pt-BR', { weekday: 'long' }),
      criadoEm: reg.criado_em
    }));
    
    res.json({ success: true, registros });

  } catch (error) {
    console.error('Erro ao buscar registros:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
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

// Rota de fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Inicializar servidor - AGORA PARA SE HOUVER ERRO
const startServer = async () => {
  console.log('🚀 Iniciando servidor...');
  
  // Testar conexão com banco PRIMEIRO
  const bancoConectado = await testarConexaoBanco();
  
  if (!bancoConectado) {
    console.error('💥 ERRO CRÍTICO: Não foi possível conectar ao banco de dados!');
    console.error('🛑 Servidor NÃO será iniciado.');
    console.error('📝 Verifique:');
    console.error('   1. Se o banco PostgreSQL existe no Render');
    console.error('   2. Se a DATABASE_URL está correta');
    console.error('   3. Se as credenciais estão válidas');
    process.exit(1);
  }
  
  // Inicializar banco
  try {
    await initializeDatabase();
    console.log('✅ Sistema inicializado com sucesso!');
  } catch (error) {
    console.error('💥 Erro na inicialização do banco:', error);
    process.exit(1);
  }
  
  // Iniciar servidor APENAS se tudo estiver ok
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Acesse: https://seu-app.onrender.com`);
    console.log('========================================');
  });
};

// Iniciar servidor
startServer().catch(error => {
  console.error('💥 ERRO AO INICIAR SERVIDOR:', error);
  process.exit(1);
});