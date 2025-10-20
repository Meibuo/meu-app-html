import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { connectDB, query, healthCheck } from './database.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('../public'));

// Middleware de logging
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.path}`, req.body);
    next();
});

// Conectar ao banco
connectDB().then(success => {
    if (success) {
        console.log('🚀 Servidor pronto para receber requisições');
    } else {
        console.log('⚠️ Servidor iniciado, mas sem conexão com o banco');
    }
});

// ==================== ROTAS DE DEBUG ====================

// Rota de health check MELHORADA
app.get('/api/health', async (req, res) => {
    try {
        const dbHealth = await healthCheck();
        const usuariosCount = await query('SELECT COUNT(*) FROM usuarios');
        const registrosCount = await query('SELECT COUNT(*) FROM registros_ponto');
        
        res.json({
            server: 'running',
            timestamp: new Date().toISOString(),
            database: dbHealth,
            stats: {
                usuarios: parseInt(usuariosCount.rows[0].count),
                registros: parseInt(registrosCount.rows[0].count)
            }
        });
    } catch (error) {
        res.status(500).json({
            server: 'running',
            database: { status: 'error', error: error.message }
        });
    }
});

// Rota de debug COMPLETA (REMOVA EM PRODUÇÃO)
app.get('/api/debug', async (req, res) => {
    try {
        console.log('🔍 Iniciando debug completo...');
        
        // 1. Testar conexão
        const dbHealth = await healthCheck();
        
        // 2. Verificar tabelas
        const tables = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        // 3. Verificar estrutura das tabelas
        const tableDetails = {};
        for (let table of tables.rows) {
            const columns = await query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = $1
                ORDER BY ordinal_position
            `, [table.table_name]);
            tableDetails[table.table_name] = columns.rows;
        }
        
        // 4. Verificar usuários
        const usuarios = await query('SELECT id, nome_completo, email, empresa, data_cadastro FROM usuarios ORDER BY data_cadastro DESC');
        
        // 5. Verificar registros
        const registros = await query('SELECT id, usuario_id, tipo, data_registro, hora_registro FROM registros_ponto ORDER BY timestamp_registro DESC LIMIT 10');
        
        // 6. Testar INSERT simples
        let testInsert = { success: false, error: null };
        try {
            const testEmail = `debug-${Date.now()}@test.com`;
            const insertResult = await query(
                `INSERT INTO usuarios (nome_completo, email, empresa, cargo, senha_hash) 
                 VALUES ($1, $2, $3, $4, $5) 
                 RETURNING id`,
                ['Debug User', testEmail, 'Debug Empresa', 'Debug Cargo', 'debug_hash']
            );
            testInsert.success = true;
            testInsert.id = insertResult.rows[0].id;
            
            // Limpar teste
            await query('DELETE FROM usuarios WHERE id = $1', [testInsert.id]);
        } catch (insertError) {
            testInsert.error = insertError.message;
        }

        console.log('✅ Debug completo finalizado');
        
        res.json({
            status: 'debug_completed',
            timestamp: new Date().toISOString(),
            database: dbHealth,
            tables: tables.rows,
            table_details: tableDetails,
            usuarios: usuarios.rows,
            total_usuarios: usuarios.rows.length,
            registros: registros.rows,
            total_registros: registros.rows.length,
            test_insert: testInsert,
            environment: {
                node_version: process.version,
                database_url_defined: !!process.env.DATABASE_URL,
                port: PORT
            }
        });
        
    } catch (error) {
        console.error('❌ Erro no debug:', error);
        res.status(500).json({ 
            status: 'debug_error',
            error: error.message,
            stack: error.stack
        });
    }
});

// Rota para criar tabelas manualmente (EMERGÊNCIA)
app.post('/api/debug/create-tables', async (req, res) => {
    try {
        console.log('🛠️ Criando tabelas manualmente...');
        
        // Tabela de usuários
        await query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome_completo VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                empresa VARCHAR(255) NOT NULL,
                cargo VARCHAR(255) NOT NULL,
                senha_hash VARCHAR(255) NOT NULL,
                data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ativo BOOLEAN DEFAULT TRUE
            )
        `);
        
        // Tabela de registros de ponto
        await query(`
            CREATE TABLE IF NOT EXISTS registros_ponto (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('entrada', 'saida_almoco', 'retorno_almoco', 'saida')),
                data_registro DATE NOT NULL,
                hora_registro TIME NOT NULL,
                timestamp_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Criar índices
        await query('CREATE INDEX IF NOT EXISTS idx_registros_usuario_id ON registros_ponto(usuario_id)');
        await query('CREATE INDEX IF NOT EXISTS idx_registros_data ON registros_ponto(data_registro)');
        await query('CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email)');
        
        console.log('✅ Tabelas criadas com sucesso');
        
        res.json({
            success: true,
            message: 'Tabelas criadas/verificadas com sucesso',
            tables_created: ['usuarios', 'registros_ponto']
        });
        
    } catch (error) {
        console.error('❌ Erro ao criar tabelas:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== ROTAS PRINCIPAIS ====================

// Rota de cadastro - COM MAIS LOGS
app.post('/api/cadastro', async (req, res) => {
    console.log('🎯 INICIANDO CADASTRO...', req.body);
    
    try {
        const { nomeCompleto, email, empresa, cargo, senha } = req.body;

        // Validações básicas
        if (!nomeCompleto || !email || !empresa || !cargo || !senha) {
            console.log('❌ Dados incompletos');
            return res.status(400).json({ 
                success: false, 
                message: 'Todos os campos são obrigatórios' 
            });
        }

        console.log(`📋 Verificando email: ${email}`);
        
        // Verificar se usuário já existe
        const usuarioExistente = await query(
            'SELECT id FROM usuarios WHERE email = $1',
            [email]
        );

        console.log(`📊 Resultado verificação: ${usuarioExistente.rows.length} usuários encontrados`);

        if (usuarioExistente.rows.length > 0) {
            console.log(`❌ E-mail já cadastrado: ${email}`);
            return res.status(400).json({ 
                success: false, 
                message: 'E-mail já cadastrado' 
            });
        }

        console.log('🔐 Criptografando senha...');
        // Criptografar senha
        const senhaHash = await bcrypt.hash(senha, 12);

        console.log('💾 Inserindo usuário no banco...');
        // Inserir usuário
        const result = await query(
            `INSERT INTO usuarios (nome_completo, email, empresa, cargo, senha_hash) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, nome_completo as "nomeCompleto", email, empresa, cargo, data_cadastro as "dataCadastro"`,
            [nomeCompleto, email, empresa, cargo, senhaHash]
        );

        const novoUsuario = result.rows[0];
        console.log(`✅ USUÁRIO CADASTRADO COM SUCESSO:`, novoUsuario);

        res.json({
            success: true,
            message: 'Usuário cadastrado com sucesso',
            usuario: novoUsuario
        });

    } catch (error) {
        console.error('❌ ERRO NO CADASTRO:', error);
        console.error('🔍 Stack trace:', error.stack);
        
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno do servidor: ' + error.message 
        });
    }
});

// Rota de login - CORRIGIDA
app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        console.log(`🔐 Tentativa de login: ${email}`);

        // Buscar usuário - CORRIGIDO: usando snake_case
        const result = await query(
            'SELECT id, nome_completo as "nomeCompleto", email, empresa, cargo, senha_hash as "senhaHash", data_cadastro as "dataCadastro" FROM usuarios WHERE email = $1 AND ativo = true',
            [email]
        );

        if (result.rows.length === 0) {
            console.log(`❌ Usuário não encontrado: ${email}`);
            return res.status(401).json({ 
                success: false, 
                message: 'E-mail ou senha incorretos' 
            });
        }

        const usuario = result.rows[0];
        console.log(`✅ Usuário encontrado: ${usuario.email}`);

        // Verificar senha
        const senhaValida = await bcrypt.compare(senha, usuario.senhaHash);
        if (!senhaValida) {
            console.log(`❌ Senha inválida para: ${email}`);
            return res.status(401).json({ 
                success: false, 
                message: 'E-mail ou senha incorretos' 
            });
        }

        // Remover senha hash da resposta
        const { senhaHash, ...usuarioSemSenha } = usuario;

        console.log(`✅ Login bem-sucedido: ${usuario.email}`);

        res.json({
            success: true,
            message: 'Login realizado com sucesso',
            usuario: usuarioSemSenha
        });

    } catch (error) {
        console.error('❌ Erro no login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno do servidor' 
        });
    }
});

// Rota para registrar ponto
app.post('/api/registro-ponto', async (req, res) => {
    try {
        const { usuarioId, tipo } = req.body;
        const agora = new Date();
        
        const dataRegistro = agora.toISOString().split('T')[0];
        const horaRegistro = agora.toTimeString().split(' ')[0];

        console.log(`⏰ Registrando ponto: usuario ${usuarioId}, tipo ${tipo}`);

        const result = await query(
            `INSERT INTO registros_ponto (usuario_id, tipo, data_registro, hora_registro) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, usuario_id as "usuarioId", tipo, data_registro as "dataRegistro", hora_registro as "horaRegistro", timestamp_registro as "timestampRegistro"`,
            [usuarioId, tipo, dataRegistro, horaRegistro]
        );

        console.log(`✅ Ponto registrado com sucesso: ID ${result.rows[0].id}`);

        res.json({
            success: true,
            message: 'Ponto registrado com sucesso',
            registro: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Erro ao registrar ponto:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao registrar ponto' 
        });
    }
});

// Rota para buscar registros
app.get('/api/registros/:usuarioId', async (req, res) => {
    try {
        const { usuarioId } = req.params;
        const { mes, ano } = req.query;

        console.log(`📊 Buscando registros para usuário: ${usuarioId}`);

        let querySQL = `
            SELECT id, usuario_id as "usuarioId", tipo, data_registro as "dataRegistro", 
                   hora_registro as "horaRegistro", timestamp_registro as "timestampRegistro"
            FROM registros_ponto 
            WHERE usuario_id = $1 
        `;
        let params = [usuarioId];

        if (mes && ano) {
            querySQL += ` AND EXTRACT(MONTH FROM data_registro) = $2 AND EXTRACT(YEAR FROM data_registro) = $3`;
            params.push(parseInt(mes), parseInt(ano));
        }

        querySQL += ` ORDER BY data_registro DESC, hora_registro DESC`;

        const result = await query(querySQL, params);

        console.log(`✅ Encontrados ${result.rows.length} registros`);

        res.json({
            success: true,
            registros: result.rows
        });

    } catch (error) {
        console.error('❌ Erro ao buscar registros:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao buscar registros' 
        });
    }
});

// Rota para verificar se email existe
app.get('/api/verificar-email/:email', async (req, res) => {
    try {
        const { email } = req.params;

        const result = await query(
            'SELECT id FROM usuarios WHERE email = $1',
            [email]
        );

        res.json({
            exists: result.rows.length > 0
        });

    } catch (error) {
        console.error('❌ Erro ao verificar email:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao verificar email' 
        });
    }
});

app.listen(PORT, () => {
    console.log(`🎯 Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Health check: https://seu-app.onrender.com/api/health`);
    console.log(`🔍 Debug: https://seu-app.onrender.com/api/debug`);
    console.log(`🛠️ Criar tabelas: https://seu-app.onrender.com/api/debug/create-tables`);
});