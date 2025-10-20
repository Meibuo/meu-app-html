import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { connectDB, query, healthCheck, pool } from './database.js';

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

// ==================== ROTA FORCE-INIT (ADICIONE ESTA ROTA!) ====================

app.post('/api/force-init', async (req, res) => {
    const client = await pool.connect();
    
    try {
        console.log('🚀 FORÇANDO CRIAÇÃO DO BANCO...');
        
        // 1. Criar schema
        await client.query('CREATE SCHEMA IF NOT EXISTS sistema_ponto');
        console.log('✅ Schema sistema_ponto criado');
        
        // 2. Usar o schema
        await client.query('SET search_path TO sistema_ponto');
        
        // 3. Criar tabela usuarios
        await client.query(`
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
        console.log('✅ Tabela usuarios criada');
        
        // 4. Criar tabela registros_ponto
        await client.query(`
            CREATE TABLE IF NOT EXISTS registros_ponto (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('entrada', 'saida_almoco', 'retorno_almoco', 'saida')),
                data_registro DATE NOT NULL,
                hora_registro TIME NOT NULL,
                timestamp_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela registros_ponto criada');
        
        // 5. Criar índices
        await client.query('CREATE INDEX IF NOT EXISTS idx_registros_usuario_id ON registros_ponto(usuario_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_registros_data ON registros_ponto(data_registro)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email)');
        console.log('✅ Índices criados');
        
        // 6. Verificar se deu certo
        const tables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'sistema_ponto'
        `);
        
        console.log('📊 Tabelas criadas:', tables.rows.map(t => t.table_name));
        
        // 7. Testar inserção
        const testResult = await client.query(`
            INSERT INTO usuarios (nome_completo, email, empresa, cargo, senha_hash) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING id, email
        `, ['Usuario Teste', 'teste@teste.com', 'Empresa Teste', 'Cargo Teste', 'testehash']);
        
        console.log('✅ Teste de inserção:', testResult.rows[0]);
        
        // 8. Limpar teste
        await client.query('DELETE FROM usuarios WHERE email = $1', ['teste@teste.com']);
        
        client.release();
        
        res.json({
            success: true,
            message: '🎉 Banco de dados criado e testado com sucesso!',
            schema: 'sistema_ponto',
            tables: tables.rows,
            test: 'Inserção e exclusão de teste funcionaram'
        });
        
    } catch (error) {
        console.error('❌ ERRO na force-init:', error);
        client.release();
        res.status(500).json({ 
            success: false, 
            error: error.message,
            details: 'Verifique os logs para mais informações'
        });
    }
});

// ==================== ROTAS DE DEBUG ====================

// Rota de health check
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

// Rota de debug
app.get('/api/debug', async (req, res) => {
    const client = await pool.connect();
    
    try {
        console.log('🔍 Iniciando debug...');
        
        // Verificar schema atual
        const schemaResult = await client.query('SELECT current_schema()');
        const currentSchema = schemaResult.rows[0].current_schema;
        
        // Verificar tabelas no schema atual
        const tables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = $1
        `, [currentSchema]);
        
        // Verificar todos os schemas
        const allSchemas = await client.query('SELECT schema_name FROM information_schema.schemata');
        
        // Verificar usuários se a tabela existir
        let usuarios = [];
        if (tables.rows.some(t => t.table_name === 'usuarios')) {
            const usuariosResult = await client.query('SELECT id, nome_completo, email, empresa FROM usuarios');
            usuarios = usuariosResult.rows;
        }
        
        client.release();
        
        res.json({
            current_schema: currentSchema,
            tables_in_current_schema: tables.rows,
            all_schemas: allSchemas.rows,
            usuarios: usuarios,
            total_usuarios: usuarios.length
        });
        
    } catch (error) {
        console.error('❌ Erro no debug:', error);
        client.release();
        res.status(500).json({ 
            error: error.message 
        });
    }
});

// ==================== ROTAS PRINCIPAIS ====================

// Rota de cadastro
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

// Rota de login
app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        console.log(`🔐 Tentativa de login: ${email}`);

        // Buscar usuário
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

app.listen(PORT, () => {
    console.log(`🎯 Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Health check: https://seu-app.onrender.com/api/health`);
    console.log(`🔍 Debug: https://seu-app.onrender.com/api/debug`);
    console.log(`🚀 Force Init: https://seu-app.onrender.com/api/force-init`);
});