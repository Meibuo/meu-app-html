const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
        hora_entrada TIME,
        hora_saida TIME,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES users(id)
      )
    `);
    console.log('✅ Tabela registros_ponto criada/verificada');

    // Verificar se as colunas hora_entrada e hora_saida existem, se não, adicionar
    try {
      await pool.query('SELECT hora_entrada FROM registros_ponto LIMIT 1');
      console.log('✅ Coluna hora_entrada já existe');
    } catch (error) {
      console.log('🔄 Adicionando coluna hora_entrada...');
      await pool.query('ALTER TABLE registros_ponto ADD COLUMN hora_entrada TIME');
      console.log('✅ Coluna hora_entrada adicionada');
    }

    try {
      await pool.query('SELECT hora_saida FROM registros_ponto LIMIT 1');
      console.log('✅ Coluna hora_saida já existe');
    } catch (error) {
      console.log('🔄 Adicionando coluna hora_saida...');
      await pool.query('ALTER TABLE registros_ponto ADD COLUMN hora_saida TIME');
      console.log('✅ Coluna hora_saida adicionada');
    }

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

// Middleware de autenticação SIMPLIFICADO (apenas para rotas que realmente precisam)
const requireAuth = async (req, res, next) => {
  try {
    // Tentar obter usuario_id de diferentes lugares
    let usuario_id = req.body.usuario_id || req.query.usuario_id;
    
    // Se não encontrou no body ou query, tentar na URL para rotas GET
    if (!usuario_id && req.params.usuario_id) {
      usuario_id = req.params.usuario_id;
    }
    
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

// Função para obter horários fixos baseado no dia da semana
function getHorariosFixos(data) {
  try {
    let dataObj;
    
    if (typeof data === 'string') {
      if (data.includes('-')) {
        // Formato YYYY-MM-DD
        const [year, month, day] = data.split('-');
        dataObj = new Date(year, month - 1, day);
      } else if (data.includes('/')) {
        // Formato DD/MM/YYYY
        const [day, month, year] = data.split('/');
        dataObj = new Date(year, month - 1, day);
      } else {
        dataObj = new Date(data);
      }
    } else {
      dataObj = new Date(data);
    }
    
    const diaSemana = dataObj.getDay(); // 0=Domingo, 1=Segunda, ..., 6=Sábado
    
    if (diaSemana === 5) { // Sexta-feira
      return {
        entrada: '07:00',
        intervalo: '12:00', 
        retorno: '13:00',
        saida: '16:00',
        texto: '07:00 | 12:00 | 13:00 | 16:00'
      };
    } else if (diaSemana >= 1 && diaSemana <= 4) { // Segunda a Quinta
      return {
        entrada: '07:00',
        intervalo: '12:00',
        retorno: '13:00', 
        saida: '17:00',
        texto: '07:00 | 12:00 | 13:00 | 17:00'
      };
    } else { // Sábado, Domingo ou Feriado
      return {
        entrada: '--:--',
        intervalo: '--:--',
        retorno: '--:--',
        saida: '--:--',
        texto: 'Folga'
      };
    }
  } catch (error) {
    console.error('Erro ao obter horários fixos:', error);
    return {
      entrada: '--:--',
      intervalo: '--:--',
      retorno: '--:--',
      saida: '--:--',
      texto: 'Horário não definido'
    };
  }
}

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

// ========== ROTAS ADMINISTRATIVAS CORRIGIDAS ==========

// ROTA PARA LISTAR TODOS OS USUÁRIOS (APENAS ADMIN)
app.get('/api/admin/usuarios', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, nome, email, telefone, cargo, is_admin, status, criado_em 
      FROM users 
      ORDER BY nome
    `);

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
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA DE CADASTRO (para admin)
app.post('/api/admin/cadastro', requireAdmin, async (req, res) => {
  try {
    const { nome, email, telefone, senha, cargo, isAdmin } = req.body;
    
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
    console.error('Erro no cadastro:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA PARA EDITAR USUÁRIO (APENAS ADMIN)
app.put('/api/admin/usuarios/:usuario_id', requireAdmin, async (req, res) => {
  try {
    const { usuario_id } = req.params;
    const { nome, email, telefone, cargo, isAdmin, senha } = req.body;

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

    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso!'
    });

  } catch (error) {
    console.error('Erro ao editar usuário:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA PARA REDEFINIR SENHA (APENAS ADMIN) - SENHA PADRÃO 123456
app.post('/api/admin/redefinir-senha', requireAdmin, async (req, res) => {
  try {
    const { usuario_id_reset } = req.body;

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

    res.json({
      success: true,
      message: 'Senha redefinida com sucesso! A nova senha é: 123456',
      novaSenha: '123456'
    });

  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA PARA BUSCAR TODOS OS REGISTROS (APENAS ADMIN) - CORRIGIDA
app.get('/api/admin/registros', requireAdmin, async (req, res) => {
  try {
    const { usuario_id_filter, data_inicio, data_fim, limit = 200 } = req.query;

    let query = `
      SELECT rp.*, u.nome as usuario_nome, u.email as usuario_email 
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

      const hora = new Date(reg.criado_em).toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      return {
        id: reg.id,
        usuario_id: reg.usuario_id,
        usuario_nome: reg.usuario_nome,
        tipo: reg.tipo,
        local: reg.local,
        observacao: reg.observacao,
        horas_extras: reg.horas_extras,
        data: dataFormatada,
        hora: hora,
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
    console.error('Erro ao buscar registros admin:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ROTA PARA ESTATÍSTICAS DO SISTEMA (APENAS ADMIN)
app.get('/api/admin/estatisticas', requireAdmin, async (req, res) => {
  try {
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
    console.error('Erro ao buscar estatísticas:', error);
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
        cargo: updatedUser.cargo,
        perfilEditado: updatedUser.perfil_editado,
        isAdmin: updatedUser.is_admin,
        status: updatedUser.status,
        criadoEm: updatedUser.criado_em
      }
    });

  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
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

// ========== ROTAS DE REGISTRO DE PONTO ==========

// ROTA DE REGISTRO DE PONTO - CORRIGIDA
app.post('/api/registrar-ponto', requireAuth, async (req, res) => {
  try {
    const { local, observacao, horas_extras, data_custom, hora_entrada, hora_saida } = req.body;
    const usuario_id = req.user.id;
    
    console.log('📍 Tentativa de registro de ponto:', { 
      usuario_id, 
      local, 
      horas_extras,
      data_custom,
      hora_entrada,
      hora_saida
    });

    if (!local) {
      return res.status(400).json({ 
        success: false, 
        error: 'Local é obrigatório' 
      });
    }

    let registros = [];

    if (horas_extras && hora_entrada && hora_saida) {
      // Registrar HORA EXTRA - APENAS UM REGISTRO
      const registroId = 'reg-he-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      await pool.query(
        `INSERT INTO registros_ponto (id, usuario_id, tipo, local, observacao, horas_extras, data_custom, hora_entrada, hora_saida) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          registroId, 
          usuario_id, 
          'hora_extra', 
          local, 
          observacao || null, 
          true,
          data_custom,
          hora_entrada,
          hora_saida
        ]
      );

      registros = [{ 
        id: registroId, 
        tipo: 'hora_extra', 
        hora_entrada: hora_entrada,
        hora_saida: hora_saida
      }];

      console.log('✅ Hora extra registrada com sucesso:', hora_entrada, 'às', hora_saida);

    } else {
      // Ponto normal - detecção automática
      const agora = new Date();
      const dataAtual = agora.toISOString().split('T')[0]; // YYYY-MM-DD
      const diaSemana = agora.getDay(); // 0=Domingo, 1=Segunda, ..., 6=Sábado
      const hora = agora.getHours();

      // Definir tipo baseado no dia e hora
      let tipo = '';
      
      if (hora < 12) {
        tipo = 'entrada';
      } else if (hora >= 12 && hora < 13) {
        tipo = 'intervalo';
      } else if (hora >= 13 && hora < (diaSemana === 5 ? 16 : 17)) {
        tipo = 'retorno';
      } else {
        tipo = 'saida';
      }

      const registroId = 'reg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      await pool.query(
        `INSERT INTO registros_ponto (id, usuario_id, tipo, local, observacao, horas_extras) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          registroId, 
          usuario_id, 
          tipo, 
          local, 
          observacao || null, 
          false
        ]
      );

      // Obter horário fixo para exibição
      const horariosFixos = getHorariosFixos(dataAtual);

      registros = [{ 
        id: registroId, 
        tipo: tipo, 
        horariosDia: horariosFixos
      }];
      console.log('✅ Ponto registrado com sucesso - Tipo:', tipo);
    }

    const message = horas_extras ? 'Hora extra registrada com sucesso!' : 'Ponto registrado com sucesso!';

    res.json({ 
      success: true, 
      message: message,
      registros: registros
    });

  } catch (error) {
    console.error('❌ Erro ao registrar ponto:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor: ' + error.message 
    });
  }
});

// Obter registros do usuário - VERSÃO CORRIGIDA
app.get('/api/registros/:usuario_id', async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    const { limit = 50 } = req.query;

    console.log(`📊 Buscando registros para usuário ${usuario_id}. Limite: ${limit}`);

    const result = await pool.query(
      `SELECT * FROM registros_ponto 
       WHERE usuario_id = $1 
       ORDER BY criado_em DESC 
       LIMIT $2`,
      [usuario_id, parseInt(limit)]
    );

    console.log(`✅ Encontrados ${result.rows.length} registros para usuário ${usuario_id}`);

    const registros = result.rows.map(reg => {
      let dataFormatada;
      
      // CORREÇÃO: Verificar se data_custom existe e é válido
      if (reg.data_custom && typeof reg.data_custom === 'string') {
        try {
          // data_custom já vem no formato YYYY-MM-DD
          const [year, month, day] = reg.data_custom.split('-');
          dataFormatada = `${day}/${month}/${year}`;
        } catch (error) {
          console.warn('❌ Erro ao formatar data_custom:', reg.data_custom);
          // Se der erro, usar criado_em
          const data = new Date(reg.criado_em);
          dataFormatada = data.toLocaleDateString('pt-BR');
        }
      } else {
        // Formatar criado_em
        const data = new Date(reg.criado_em);
        dataFormatada = data.toLocaleDateString('pt-BR');
      }
      
      // Obter horários fixos para o dia - CORREÇÃO
      let dataParaHorarios;
      if (reg.data_custom && typeof reg.data_custom === 'string') {
        dataParaHorarios = reg.data_custom;
      } else {
        const data = new Date(reg.criado_em);
        dataParaHorarios = data.toISOString().split('T')[0];
      }
      
      const horariosFixos = getHorariosFixos(dataParaHorarios);

      return {
        id: reg.id,
        tipo: reg.tipo,
        local: reg.local,
        observacao: reg.observacao,
        horas_extras: reg.horas_extras,
        data: dataFormatada,
        hora_entrada: reg.hora_entrada ? reg.hora_entrada.substring(0, 5) : '',
        hora_saida: reg.hora_saida ? reg.hora_saida.substring(0, 5) : '',
        horariosDia: horariosFixos,
        diaSemana: new Date(dataParaHorarios + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long' }),
        criadoEm: reg.criado_em
      };
    });

    console.log('📋 Primeiros registros formatados:', registros.slice(0, 3));

    res.json({ 
      success: true, 
      registros,
      total: result.rows.length
    });

  } catch (error) {
    console.error('❌ Erro ao buscar registros:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor: ' + error.message 
    });
  }
});

// ESTATÍSTICAS SIMPLES DO USUÁRIO - AGORA COM HORAS EXTRAS
app.get('/api/estatisticas/:usuario_id', async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;

    const horasExtrasResult = await pool.query(
      `SELECT COUNT(*) FROM registros_ponto 
       WHERE usuario_id = $1 AND horas_extras = true`,
      [usuario_id]
    );

    // Cada hora extra é um único registro agora
    const totalHorasExtras = parseInt(horasExtrasResult.rows[0].count);

    res.json({
      success: true,
      estatisticas: {
        horasExtras: totalHorasExtras
      }
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ========== NOVAS ROTAS ADICIONADAS ==========

// ROTA PARA EXCLUIR REGISTRO - SEM AUTENTICAÇÃO DESNECESSÁRIA
app.delete('/api/registros/:registro_id', async (req, res) => {
  try {
    const { registro_id } = req.params;

    console.log('🗑️ Tentativa de excluir registro:', registro_id);

    // Verificar se o registro existe
    const registroResult = await pool.query(
      'SELECT * FROM registros_ponto WHERE id = $1',
      [registro_id]
    );

    if (registroResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    }

    // Excluir o registro (qualquer usuário pode excluir seus próprios registros)
    await pool.query('DELETE FROM registros_ponto WHERE id = $1', [registro_id]);

    console.log('✅ Registro excluído com sucesso:', registro_id);

    res.json({
      success: true,
      message: 'Registro excluído com sucesso!'
    });

  } catch (error) {
    console.error('❌ Erro ao excluir registro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor: ' + error.message
    });
  }
});

// ROTA PARA EXPORTAR PARA EXCEL - SIMPLIFICADA
app.get('/api/exportar/excel/:usuario_id', async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    const { data_inicio, data_fim } = req.query;

    // Construir query com filtro de datas se fornecido
    let query = `
      SELECT rp.*, u.nome as usuario_nome, u.email as usuario_email 
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
    const registros = result.rows;

    // Criar workbook do Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Registros de Ponto');

    // Definir cabeçalhos
    worksheet.columns = [
      { header: 'Data', key: 'data', width: 15 },
      { header: 'Hora', key: 'hora', width: 10 },
      { header: 'Tipo', key: 'tipo', width: 15 },
      { header: 'Local', key: 'local', width: 20 },
      { header: 'Horas Extras', key: 'horas_extras', width: 12 },
      { header: 'Hora Entrada', key: 'hora_entrada', width: 12 },
      { header: 'Hora Saída', key: 'hora_saida', width: 12 },
      { header: 'Observação', key: 'observacao', width: 30 },
      { header: 'Usuário', key: 'usuario_nome', width: 20 },
      { header: 'E-mail', key: 'usuario_email', width: 25 }
    ];

    // Estilizar cabeçalhos
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4472C4' }
    };

    // Adicionar dados
    registros.forEach(registro => {
      const data = new Date(registro.criado_em);
      const dataFormatada = data.toLocaleDateString('pt-BR');
      const horaFormatada = data.toLocaleTimeString('pt-BR');

      worksheet.addRow({
        data: dataFormatada,
        hora: horaFormatada,
        tipo: registro.tipo,
        local: registro.local || '',
        horas_extras: registro.horas_extras ? 'Sim' : 'Não',
        hora_entrada: registro.hora_entrada || '',
        hora_saida: registro.hora_saida || '',
        observacao: registro.observacao || '',
        usuario_nome: registro.usuario_nome,
        usuario_email: registro.usuario_email
      });
    });

    // Configurar resposta
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=registros-ponto-${usuario_id}-${Date.now()}.xlsx`);

    // Enviar arquivo
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('❌ Erro ao exportar Excel:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor: ' + error.message
    });
  }
});

// ROTA PARA EXPORTAR PARA PDF - SIMPLIFICADA
app.get('/api/exportar/pdf/:usuario_id', async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    const { data_inicio, data_fim } = req.query;

    // Buscar registros
    let query = `
      SELECT rp.*, u.nome as usuario_nome, u.email as usuario_email 
      FROM registros_ponto rp 
      JOIN users u ON rp.usuario_id = u.id 
      WHERE rp.usuario_id = $1
    `;
    let params = [usuario_id];

    if (data_inicio && data_fim) {
      query += ` AND DATE(rp.criado_em) BETWEEN $2 AND $3`;
      params.push(data_inicio, data_fim);
    }

    query += ` ORDER BY rp.criado_em DESC LIMIT 100`;

    const result = await pool.query(query, params);
    const registros = result.rows;

    // Criar PDF
    const doc = new PDFDocument({ margin: 50 });
    
    // Configurar cabeçalho do response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=registros-ponto-${usuario_id}-${Date.now()}.pdf`);

    doc.pipe(res);

    // Cabeçalho do PDF
    doc.fontSize(20).font('Helvetica-Bold').text('RELATÓRIO DE PONTOS', 50, 50);
    doc.fontSize(12).font('Helvetica').text(`Usuário: ${registros[0]?.usuario_nome || 'N/A'}`, 50, 80);
    doc.text(`E-mail: ${registros[0]?.usuario_email || 'N/A'}`, 50, 95);
    doc.text(`Data de emissão: ${new Date().toLocaleDateString('pt-BR')}`, 50, 110);
    doc.text(`Total de registros: ${registros.length}`, 50, 125);

    // Linha divisória
    doc.moveTo(50, 140).lineTo(550, 140).stroke();

    let yPosition = 160;

    // Adicionar registros
    registros.forEach((registro, index) => {
      if (yPosition > 700) { // Nova página se necessário
        doc.addPage();
        yPosition = 50;
      }

      const data = new Date(registro.criado_em);
      
      doc.fontSize(10).font('Helvetica-Bold')
         .text(`Registro ${index + 1}`, 50, yPosition);
      
      yPosition += 15;
      
      doc.font('Helvetica')
         .text(`Data: ${data.toLocaleDateString('pt-BR')}`, 50, yPosition);
      
      yPosition += 12;
      
      doc.text(`Hora: ${data.toLocaleTimeString('pt-BR')}`, 50, yPosition);
      
      yPosition += 12;
      
      doc.text(`Tipo: ${registro.tipo}`, 50, yPosition);
      
      yPosition += 12;
      
      doc.text(`Local: ${registro.local || 'N/A'}`, 50, yPosition);
      
      yPosition += 12;
      
      doc.text(`Horas Extras: ${registro.horas_extras ? 'Sim' : 'Não'}`, 50, yPosition);
      
      if (registro.hora_entrada && registro.hora_saida) {
        yPosition += 12;
        doc.text(`Horário: ${registro.hora_entrada} - ${registro.hora_saida}`, 50, yPosition);
      }
      
      if (registro.observacao) {
        yPosition += 12;
        doc.text(`Observação: ${registro.observacao}`, 50, yPosition);
      }

      yPosition += 20; // Espaço entre registros
    });

    doc.end();

  } catch (error) {
    console.error('❌ Erro ao exportar PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor: ' + error.message
    });
  }
});

// ROTA DE DEBUG - Verificar registros no banco
app.get('/api/debug/registros/:usuario_id', async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    
    console.log('🔍 DEBUG: Buscando registros para usuário:', usuario_id);
    
    const result = await pool.query(
      `SELECT id, tipo, local, observacao, horas_extras, data_custom, hora_entrada, hora_saida, criado_em 
       FROM registros_ponto 
       WHERE usuario_id = $1 
       ORDER BY criado_em DESC 
       LIMIT 20`,
      [usuario_id]
    );

    console.log('📋 DEBUG - Registros encontrados:', result.rows.length);
    result.rows.forEach((reg, index) => {
      console.log(`📝 Registro ${index + 1}:`, {
        id: reg.id,
        tipo: reg.tipo,
        local: reg.local,
        horas_extras: reg.horas_extras,
        data_custom: reg.data_custom,
        hora_entrada: reg.hora_entrada,
        hora_saida: reg.hora_saida,
        criado_em: reg.criado_em
      });
    });

    res.json({
      success: true,
      total: result.rows.length,
      registros: result.rows
    });

  } catch (error) {
    console.error('❌ DEBUG - Erro:', error);
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