import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function forceInit() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 FORÇANDO INICIALIZAÇÃO DO BANCO...');
        
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
        
        // 5. Verificar se deu certo
        const tables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'sistema_ponto'
        `);
        
        console.log('📊 Tabelas criadas:', tables.rows);
        
        console.log('🎉 BANCO INICIALIZADO COM SUCESSO!');
        
    } catch (error) {
        console.error('❌ ERRO:', error);
    } finally {
        client.release();
        process.exit();
    }
}

forceInit();