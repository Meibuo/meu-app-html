// NOVO database.js - CORRIGIDO
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const APP_SCHEMA = 'sistema_ponto';

// Função para executar queries - CORRIGIDA
export async function query(text, params) {
    const client = await pool.connect();
    
    try {
        // FORÇAR uso do nosso schema em TODAS as queries
        await client.query(`SET search_path TO ${APP_SCHEMA}`);
        
        console.log(`📝 Executando query: ${text.substring(0, 100)}...`);
        const result = await client.query(text, params);
        
        return result;
        
    } catch (error) {
        console.error('❌ Erro na query:', error.message);
        console.error('Query:', text);
        console.error('Params:', params);
        throw error;
    } finally {
        client.release();
    }
}

export async function connectDB() {
    try {
        const client = await pool.connect();
        console.log('✅ Conectado ao PostgreSQL!');
        
        // Criar schema se não existir
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${APP_SCHEMA}`);
        console.log(`✅ Schema ${APP_SCHEMA} verificado`);
        
        // Criar tabelas
        await client.query(`SET search_path TO ${APP_SCHEMA}`);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome_completo VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                empresa VARCHAR(255) NOT NULL,
                cargo VARCHAR(255) NOT NULL,
                senha_hash VARCHAR(255) NOT NULL,
                data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS registros_ponto (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id),
                tipo VARCHAR(50) NOT NULL,
                data_registro DATE NOT NULL,
                hora_registro TIME NOT NULL,
                timestamp_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ Tabelas criadas/verificadas');
        client.release();
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao conectar:', error.message);
        return false;
    }
}

export async function healthCheck() {
    const client = await pool.connect();
    
    try {
        await client.query(`SET search_path TO ${APP_SCHEMA}`);
        
        const timeResult = await client.query('SELECT NOW() as current_time');
        const userCount = await client.query('SELECT COUNT(*) as count FROM usuarios');
        
        return {
            status: 'healthy',
            schema: APP_SCHEMA,
            current_time: timeResult.rows[0].current_time,
            usuarios: parseInt(userCount.rows[0].count)
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