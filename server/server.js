import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { connectDB, query, healthCheck } from './database.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('../public'));

// Conectar ao banco ao iniciar
connectDB().then(success => {
    if (success) {
        console.log('🚀 Servidor pronto para receber requisições');
    } else {
        console.log('⚠️ Servidor iniciado, mas sem conexão com o banco');
    }
});

// Rota de health check
app.get('/api/health', async (req, res) => {
    try {
        const dbHealth = await healthCheck();
        res.json({
            server: 'running',
            timestamp: new Date().toISOString(),
            database: dbHealth
        });
    } catch (error) {
        res.status(500).json({
            server: 'running',
            database: { status: 'error', error: error.message }
        });
    }
});

// Rota de cadastro - CORRIGIDA
app.post('/api/cadastro', async (req, res) => {
    try {
        const { nomeCompleto, email, empresa, cargo, senha } = req.body;

        console.log(`📋 Tentativa de cadastro: ${email}`);

        // Verificar se usuário já existe
        const usuarioExistente = await query(
            'SELECT id FROM usuarios WHERE email = $1',
            [email]
        );

        if (usuarioExistente.rows.length > 0) {
            console.log(`❌ E-mail já cadastrado: ${email}`);
            return res.status(400).json({ 
                success: false, 
                message: 'E-mail já cadastrado' 
            });
        }

        // Criptografar senha
        const senhaHash = await bcrypt.hash(senha, 12);

        // Inserir usuário - CORRIGIDO: usando snake_case
        const result = await query(
            `INSERT INTO usuarios (nome_completo, email, empresa, cargo, senha_hash) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, nome_completo as "nomeCompleto", email, empresa, cargo, data_cadastro as "dataCadastro"`,
            [nomeCompleto, email, empresa, cargo, senhaHash]
        );

        const novoUsuario = result.rows[0];
        console.log(`✅ Usuário cadastrado: ${novoUsuario.email} (ID: ${novoUsuario.id})`);

        res.json({
            success: true,
            message: 'Usuário cadastrado com sucesso',
            usuario: novoUsuario
        });

    } catch (error) {
        console.error('❌ Erro no cadastro:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno do servidor' 
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
    console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
});