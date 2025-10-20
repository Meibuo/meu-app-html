import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

export async function connectDB() {
    try {
        console.log('🔗 Conectando ao PostgreSQL...');
        
        const client = await pool.connect();
        console.log('✅ Conectado ao PostgreSQL no Render!');
        
        // Verificar qual schema estamos usando
        const schemaResult = await pool.query('SELECT current_schema()');
        console.log('📊 Schema atual:', schemaResult.rows[0].current_schema);
        
        await criarTabelas();
        
        client.release();
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao conectar:', error.message);
        return false;
    }
}

async function criarTabelas() {
    try {
        console.log('🔄 Criando tabelas...');
        
        // Tabela de usuários - SEM schema específico (usa o default)
        await pool.query(`
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
        await pool.query(`
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

        console.log('🎉 Todas as tabelas criadas com sucesso!');

    } catch (error) {
        console.error('❌ Erro ao criar tabelas:', error.message);
        
        // Se der erro de permissão, tentar método alternativo
        if (error.message.includes('permission denied')) {
            console.log('🔄 Tentando método alternativo...');
            await criarTabelasAlternativo();
        } else {
            throw error;
        }
    }
}

// Método alternativo se o primeiro falhar
async function criarTabelasAlternativo() {
    try {
        console.log('🔄 Usando método alternativo para criar tabelas...');
        
        // Verificar se as tabelas já existem de alguma forma
        const tablesCheck = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema != 'information_schema' 
            AND table_name IN ('usuarios', 'registros_ponto')
        `);
        
        console.log('📊 Tabelas encontradas:', tablesCheck.rows);
        
        if (tablesCheck.rows.length === 0) {
            console.log('❌ Não foi possível criar tabelas automaticamente.');
            console.log('💡 Execute manualmente: https://seu-app.onrender.com/api/debug/create-tables');
        }
        
    } catch (error) {
        console.error('❌ Erro no método alternativo:', error.message);
    }
}

export async function query(text, params) {
    try {
        const result = await pool.query(text, params);
        return result;
    } catch (error) {
        console.error('❌ Erro na query:', error.message);
        throw error;
    }
}

export async function healthCheck() {
    try {
        const result = await pool.query('SELECT NOW() as current_time');
        return {
            status: 'healthy',
            current_time: result.rows[0].current_time
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message
        };
    }
}

export { pool };