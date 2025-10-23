const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do PostgreSQL
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

    console.log('✅ Banco de dados inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
    throw error;
  }
};

// ========== ROTAS DA API ==========

// ROTA DE LOGIN - SIMPLIFICADA
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
        cargo: user.cargo,
        criadoEm: user.criado_em
      } 
    });

  } catch (error) {
    console.error('💥 Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA DE CADASTRO - SIMPLIFICADA
app.post('/api/cadastro', async (req, res) => {
  try {
    const { nome, email, telefone, senha } = req.body;
    
    console.log('👥 Tentativa de cadastro:', email);
    
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

    console.log('✅ Usuário cadastrado com sucesso:', nome);
    
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
    console.error('💥 Erro no cadastro:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ========== ROTAS DE REGISTRO DE PONTO ==========

// Registrar ponto - SEM AUTENTICAÇÃO
app.post('/api/registrar-ponto', async (req, res) => {
  try {
    const { usuario_id, tipo, local, observacao, horas_extras, manual } = req.body;
    
    console.log('⏰ Registrando ponto para usuário:', usuario_id, 'Tipo:', tipo);
    
    if (!usuario_id || !tipo || !local) {
      return res.status(400).json({ success: false, error: 'Usuário, tipo e local são obrigatórios' });
    }

    // Verificar se usuário existe
    const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id]);
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

    console.log('✅ Ponto registrado com sucesso para usuário:', usuario_id);
    
    res.json({ 
      success: true, 
      message: 'Ponto registrado com sucesso!' 
    });

  } catch (error) {
    console.error('💥 Erro ao registrar ponto:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Obter registros do usuário - SEM AUTENTICAÇÃO
app.get('/api/registros/:usuario_id', async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    
    console.log('📋 Buscando registros para usuário:', usuario_id);

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
      version: '4.0.0'
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
  
  // Inicializar banco
  try {
    await initializeDatabase();
  } catch (error) {
    console.log('⚠️  Erro na inicialização do banco, mas servidor continua...');
  }
  
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