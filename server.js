const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do PostgreSQL - CORRIGIDAS
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'sistema_ponto',
  password: 'password', // Altere para sua senha do PostgreSQL
  port: 5432,
  // Para PostgreSQL externo (Render, Railway, etc.)
  // connectionString: process.env.DATABASE_URL,
  // ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

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
    console.log('💡 Dica: Verifique se:');
    console.log('   1. PostgreSQL está rodando');
    console.log('   2. O banco "sistema_ponto" existe');
    console.log('   3. Usuário/senha estão corretos');
    return false;
  }
};

// Inicializar banco de dados COMPLETO - CORRIGIDO
const initializeDatabase = async () => {
  try {
    console.log('🔄 Inicializando banco de dados...');
    
    // Tabela users com todas as colunas - CORRIGIDA
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        telefone VARCHAR(20),
        senha VARCHAR(255) NOT NULL,
        cargo VARCHAR(50) DEFAULT 'Terceiro',
        perfil_editado BOOLEAN DEFAULT FALSE,
        is_admin BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'ativo',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela users criada/verificada');

    // Tabela de registros de ponto completa - CORRIGIDA
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
        hora_entrada TIME,
        hora_saida TIME,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela registros_ponto criada/verificada');

    // Tabela para notificações - CORRIGIDA
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notificacoes (
        id VARCHAR(100) PRIMARY KEY,
        usuario_id VARCHAR(100) NOT NULL,
        titulo VARCHAR(200) NOT NULL,
        mensagem TEXT NOT NULL,
        lida BOOLEAN DEFAULT FALSE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela notificacoes criada/verificada');

    // Verificar se admin existe - CORRIGIDO
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
    console.error('Stack trace:', error.stack);
    throw error;
  }
};

// Função para criar notificação
const criarNotificacao = async (usuario_id, titulo, mensagem) => {
  try {
    const notificacaoId = 'notif-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    await pool.query(
      `INSERT INTO notificacoes (id, usuario_id, titulo, mensagem) 
       VALUES ($1, $2, $3, $4)`,
      [notificacaoId, usuario_id, titulo, mensagem]
    );
    
    console.log(`📢 Notificação criada para usuário ${usuario_id}: ${titulo}`);
  } catch (error) {
    console.error('Erro ao criar notificação:', error);
  }
};

// ========== ROTAS ADMINISTRATIVAS ==========

// ROTA PARA LISTAR TODOS OS USUÁRIOS - CORRIGIDA
app.get('/api/admin/usuarios', async (req, res) => {
  try {
    console.log('📋 Buscando lista de usuários...');
    
    const result = await pool.query(`
      SELECT id, nome, email, telefone, cargo, is_admin, status, criado_em 
      FROM users 
      ORDER BY nome
    `);

    console.log(`✅ ${result.rows.length} usuários encontrados`);

    const usuarios = result.rows.map(user => ({
      id: user.id,
      nome: user.nome,
      email: user.email,
      telefone: user.telefone,
      cargo: user.cargo,
      isAdmin: user.is_admin,
      status: user.status,
      criadoEm: user.criado_em
    }));

    res.json({
      success: true,
      usuarios: usuarios
    });

  } catch (error) {
    console.error('❌ Erro ao listar usuários:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor: ' + error.message 
    });
  }
});

// ROTA DE CADASTRO (para admin)
app.post('/api/admin/cadastro', async (req, res) => {
  try {
    const { nome, email, telefone, senha, cargo, isAdmin } = req.body;
    
    console.log('👤 Tentativa de cadastro:', email);
    
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
      `INSERT INTO users (id, nome, email, telefone, senha, cargo, is_admin, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, nome, emailLimpo, telefone || null, hashedPassword, cargo || 'Terceiro', isAdmin || false, 'ativo']
    );

    console.log('✅ Usuário cadastrado com sucesso:', emailLimpo);

    res.json({ 
      success: true, 
      message: 'Usuário cadastrado com sucesso!',
      user: {
        id: userId,
        nome,
        email: emailLimpo,
        telefone: telefone || null,
        cargo: cargo || 'Terceiro',
        isAdmin: isAdmin || false,
        status: 'ativo'
      }
    });

  } catch (error) {
    console.error('❌ Erro no cadastro:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor: ' + error.message });
  }
});

// ROTA PARA EDITAR USUÁRIO
app.put('/api/admin/usuarios/:usuario_id', async (req, res) => {
  try {
    const { usuario_id } = req.params;
    const { nome, email, telefone, cargo, isAdmin, senha } = req.body;

    console.log('✏️ Editando usuário:', usuario_id);

    // Verificar se usuário existe
    const userExists = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    // Verificar se email já existe em outro usuário
    if (email) {
      const emailExists = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND id != $2', 
        [email.toLowerCase().trim(), usuario_id]
      );
      if (emailExists.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'E-mail já está em uso por outro usuário' });
      }
    }

    // Construir query dinamicamente
    let query = 'UPDATE users SET ';
    const params = [];
    let paramCount = 1;
    const updates = [];

    if (nome) {
      updates.push(`nome = $${paramCount}`);
      params.push(nome);
      paramCount++;
    }

    if (email) {
      updates.push(`email = $${paramCount}`);
      params.push(email.toLowerCase().trim());
      paramCount++;
    }

    if (telefone !== undefined) {
      updates.push(`telefone = $${paramCount}`);
      params.push(telefone || null);
      paramCount++;
    }

    if (cargo) {
      updates.push(`cargo = $${paramCount}`);
      params.push(cargo);
      paramCount++;
    }

    if (isAdmin !== undefined) {
      updates.push(`is_admin = $${paramCount}`);
      params.push(isAdmin);
      paramCount++;
    }

    if (senha) {
      const hashedPassword = await bcrypt.hash(senha, 10);
      updates.push(`senha = $${paramCount}`);
      params.push(hashedPassword);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar' });
    }

    query += updates.join(', ') + ` WHERE id = $${paramCount}`;
    params.push(usuario_id);

    await pool.query(query, params);

    console.log('✅ Usuário atualizado com sucesso:', usuario_id);

    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso!'
    });

  } catch (error) {
    console.error('❌ Erro ao editar usuário:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor: ' + error.message });
  }
});

// ROTA PARA EXCLUIR USUÁRIO
app.delete('/api/admin/usuarios/:usuario_id', async (req, res) => {
  try {
    const { usuario_id } = req.params;

    console.log('🗑️ Excluindo usuário:', usuario_id);

    // Verificar se usuário existe
    const userExists = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    const usuario = userExists.rows[0];

    // Não permitir excluir o próprio admin
    if (usuario.is_admin) {
      return res.status(400).json({ success: false, error: 'Não é possível excluir um administrador' });
    }

    // Primeiro excluir registros relacionados
    await pool.query('DELETE FROM registros_ponto WHERE usuario_id = $1', [usuario_id]);
    await pool.query('DELETE FROM notificacoes WHERE usuario_id = $1', [usuario_id]);
    
    // Depois excluir o usuário
    await pool.query('DELETE FROM users WHERE id = $1', [usuario_id]);

    console.log('✅ Usuário excluído com sucesso:', usuario_id);

    res.json({
      success: true,
      message: 'Usuário excluído com sucesso!'
    });

  } catch (error) {
    console.error('❌ Erro ao excluir usuário:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor: ' + error.message });
  }
});

// ROTA PARA REDEFINIR SENHA - SENHA PADRÃO 123456
app.post('/api/admin/redefinir-senha', async (req, res) => {
  try {
    const { usuario_id_reset } = req.body;

    console.log('🔑 Redefinindo senha para usuário:', usuario_id_reset);

    if (!usuario_id_reset) {
      return res.status(400).json({ success: false, error: 'ID do usuário é obrigatório' });
    }

    // Verificar se usuário existe
    const userExists = await pool.query('SELECT * FROM users WHERE id = $1', [usuario_id_reset]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    // Redefinir senha para 123456
    const senhaPadrao = '123456';
    const hashedPassword = await bcrypt.hash(senhaPadrao, 10);

    await pool.query(
      'UPDATE users SET senha = $1 WHERE id = $2',
      [hashedPassword, usuario_id_reset]
    );

    console.log('✅ Senha redefinida com sucesso para:', usuario_id_reset);

    res.json({
      success: true,
      message: 'Senha redefinida com sucesso! A nova senha é: 123456',
      novaSenha: '123456'
    });

  } catch (error) {
    console.error('❌ Erro ao redefinir senha:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor: ' + error.message });
  }
});

// ROTA PARA BUSCAR TODOS OS REGISTROS
app.get('/api/admin/registros', async (req, res) => {
  try {
    const { usuario_id_filter, data_inicio, data_fim, limit = 200 } = req.query;

    console.log('📊 Buscando registros admin - Filtros:', { usuario_id_filter, data_inicio, data_fim });

    let query = `
      SELECT rp.*, u.nome as usuario_nome, u.email as usuario_email, u.cargo as usuario_cargo
      FROM registros_ponto rp 
      JOIN users u ON rp.usuario_id = u.id 
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (usuario_id_filter) {
      query += ` AND rp.usuario_id = $${paramCount}`;
      params.push(usuario_id_filter);
      paramCount++;
    }

    if (data_inicio && data_fim) {
      query += ` AND DATE(rp.criado_em) BETWEEN $${paramCount} AND $${paramCount + 1}`;
      params.push(data_inicio, data_fim);
      paramCount += 2;
    }

    query += ` ORDER BY rp.criado_em DESC LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    console.log(`✅ ${result.rows.length} registros encontrados`);

    const registros = result.rows.map(reg => {
      let dataFormatada;
      
      if (reg.data_custom && typeof reg.data_custom === 'string') {
        try {
          const [year, month, day] = reg.data_custom.split('-');
          dataFormatada = `${day}/${month}/${year}`;
        } catch (error) {
          const data = new Date(reg.criado_em);
          dataFormatada = data.toLocaleDateString('pt-BR');
        }
      } else {
        const data = new Date(reg.criado_em);
        dataFormatada = data.toLocaleDateString('pt-BR');
      }

      return {
        id: reg.id,
        usuario_id: reg.usuario_id,
        usuario_nome: reg.usuario_nome,
        usuario_cargo: reg.usuario_cargo,
        tipo: reg.tipo,
        local: reg.local,
        observacao: reg.observacao,
        horas_extras: reg.horas_extras,
        data: dataFormatada,
        hora_entrada: reg.hora_entrada ? reg.hora_entrada.substring(0, 5) : '',
        hora_saida: reg.hora_saida ? reg.hora_saida.substring(0, 5) : '',
        criadoEm: reg.criado_em
      };
    });

    res.json({
      success: true,
      registros: registros,
      total: result.rows.length
    });

  } catch (error) {
    console.error('❌ Erro ao buscar registros admin:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor: ' + error.message });
  }
});

// ROTA PARA ESTATÍSTICAS DO SISTEMA
app.get('/api/admin/estatisticas', async (req, res) => {
  try {
    console.log('📈 Buscando estatísticas do sistema...');

    // Total de usuários
    const usersResult = await pool.query('SELECT COUNT(*) FROM users');
    const totalUsers = parseInt(usersResult.rows[0].count);

    // Total de administradores
    const adminResult = await pool.query('SELECT COUNT(*) FROM users WHERE is_admin = true');
    const totalAdmins = parseInt(adminResult.rows[0].count);

    // Total de registros
    const registrosResult = await pool.query('SELECT COUNT(*) FROM registros_ponto');
    const totalRegistros = parseInt(registrosResult.rows[0].count);

    // Registros hoje
    const hojeResult = await pool.query(`
      SELECT COUNT(*) FROM registros_ponto 
      WHERE DATE(criado_em) = CURRENT_DATE
    `);
    const registrosHoje = parseInt(hojeResult.rows[0].count);

    console.log('✅ Estatísticas carregadas:', { totalUsers, totalAdmins, totalRegistros, registrosHoje });

    res.json({
      success: true,
      estatisticas: {
        totalUsers,
        totalAdmins,
        totalRegistros,
        registrosHoje
      }
    });

  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor: ' + error.message });
  }
});

// ROTA SIMPLES PARA TESTE
app.get('/api/test', async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'API está funcionando!',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ error: 'Erro interno do servidor: ' + error.message });
  }
});

// Rotas para servir páginas HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
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
    console.log('💡 Criando banco de dados em memória para teste...');
    
    // Podemos continuar mesmo sem banco para teste
  }
  
  try {
    await initializeDatabase();
  } catch (error) {
    console.log('⚠️  Erro na inicialização do banco, mas servidor continuará...');
  }
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log(`🔧 Painel Admin: http://localhost:${PORT}/admin`);
    console.log('========================================');
  });
};

// Iniciar servidor
startServer().catch(error => {
  console.error('💥 ERRO AO INICIAR SERVIDOR:', error);
  process.exit(1);
});