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

// ... (mantenha todas as outras rotas que mostrei anteriormente) ...

// Rota de cadastro (exemplo atualizado)
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

        // Inserir usuário
        const result = await query(
            `INSERT INTO usuarios (nome_completo, email, empresa, cargo, senha_hash) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, nome_completo, email, empresa, cargo, data_cadastro`,
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

app.listen(PORT, () => {
    console.log(`🎯 Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Health check disponível em: http://localhost:${PORT}/api/health`);
});