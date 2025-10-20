import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Nome do schema específico para nossa aplicação
const APP_SCHEMA = 'sistema_ponto';

export async function connectDB() {
    try {
        console.log('🔗 Conectando ao PostgreSQL...');
        
        const client = await pool.connect();
        console.log('✅ Conectado ao PostgreSQL no Render!');
        
        // 1. Criar schema específico para nossa app
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${APP_SCHEMA}`);
        console.log(`✅ Schema "${APP_SCHEMA}" criado/verificado`);
        
        // 2. Definir este schema como padrão para a conexão
        await client.query(`SET search_path TO ${APP_SCHEMA}`);
        
        // 3. Verificar em qual schema estamos
        const schemaCheck = await client.query('SELECT current_schema()');
        console.log('📊 Schema atual:', schemaCheck.rows[0].current_schema);
        
        // 4. Criar tabelas no nosso schema
        await criarTabelas(client);
        
        client.release();
        console.log('🎉 Banco de dados inicializado com sucesso!');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao conectar/criar banco:', error.message);
        return false;
    }
}

async function criarTabelas(client) {
    try {
        console.log('🔄 Criando tabelas no schema específico...');
        
        // Tabela de usuários
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
        console.log('✅ Tabela "usuarios" criada/verificada');

        // Tabela de registros de ponto
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
        console.log('✅ Tabela "registros_ponto" criada/verificada');

        // Criar índices para performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_registros_usuario_id 
            ON registros_ponto(usuario_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_registros_data 
            ON registros_ponto(data_registro)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_usuarios_email 
            ON usuarios(email)
        `);
        console.log('✅ Índices criados/verificados');

    } catch (error) {
        console.error('❌ Erro ao criar tabelas:', error.message);
        throw error;
    }
}

// Função para executar queries - SEMPRE usar nosso schema
export async function query(text, params) {
    const client = await pool.connect();
    
    try {
        // Garantir que estamos usando nosso schema
        await client.query(`SET search_path TO ${APP_SCHEMA}`);
        
        const result = await client.query(text, params);
        return result;
        
    } catch (error) {
        console.error('❌ Erro na query:', error.message);
        console.error('Query:', text);
        throw error;
    } finally {
        client.release();
    }
}

// Função para verificar saúde do banco
export async function healthCheck() {
    const client = await pool.connect();
    
    try {
        await client.query(`SET search_path TO ${APP_SCHEMA}`);
        
        const [timeResult, userCount, registroCount] = await Promise.all([
            client.query('SELECT NOW() as current_time'),
            client.query('SELECT COUNT(*) as count FROM usuarios'),
            client.query('SELECT COUNT(*) as count FROM registros_ponto')
        ]);
        
        return {
            status: 'healthy',
            schema: APP_SCHEMA,
            current_time: timeResult.rows[0].current_time,
            stats: {
                usuarios: parseInt(userCount.rows[0].count),
                registros: parseInt(registroCount.rows[0].count)
            }
        };
        
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message
        };
    } finally {
        client.release();
    }
}

export { pool };