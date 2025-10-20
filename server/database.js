import pkg from 'pg';
const { Pool } = pkg;

// Configuração do pool de conexões com sua DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false  // Necessário para Render PostgreSQL
    },
    // Configurações adicionais para melhor performance
    max: 20, // número máximo de clientes no pool
    idleTimeoutMillis: 30000, // tempo que um cliente pode ficar idle antes de ser fechado
    connectionTimeoutMillis: 2000, // tempo máximo para tentar conectar
});

// Variável para verificar se as tabelas já foram criadas
let tabelasCriadas = false;

export async function connectDB() {
    try {
        // Testar a conexão
        const client = await pool.connect();
        console.log('✅ Conectado ao PostgreSQL no Render com sucesso!');
        console.log('📊 Database: sistema_ponto_db');
        
        // Criar tabelas se não existirem
        if (!tabelasCriadas) {
            await criarTabelas();
            tabelasCriadas = true;
        }
        
        client.release();
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao conectar ao banco de dados:', error.message);
        console.log('🔍 Verifique se:');
        console.log('   1. A DATABASE_URL está correta no Render');
        console.log('   2. O PostgreSQL está rodando');
        console.log('   3. As credenciais estão válidas');
        return false;
    }
}

async function criarTabelas() {
    try {
        console.log('🔄 Verificando/Criando tabelas...');
        
        // Tabela de usuários
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
        console.log('✅ Tabela "usuarios" verificada/criada');

        // Tabela de registros de ponto
        await pool.query(`
            CREATE TABLE IF NOT EXISTS registros_ponto (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('entrada', 'saida_almoco', 'retorno_almoco', 'saida')),
                data_registro DATE NOT NULL,
                hora_registro TIME NOT NULL,
                timestamp_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela "registros_ponto" verificada/criada');

        // Índices para melhor performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_registros_usuario_id 
            ON registros_ponto(usuario_id)
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_registros_data 
            ON registros_ponto(data_registro)
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_usuarios_email 
            ON usuarios(email)
        `);

        console.log('✅ Índices criados/verificados');
        console.log('🎉 Banco de dados configurado com sucesso!');

    } catch (error) {
        console.error('❌ Erro ao criar tabelas:', error);
        throw error; // Propaga o erro para quem chamou
    }
}

// Função para executar queries
export async function query(text, params) {
    try {
        const start = Date.now();
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        
        // Log para debug (opcional)
        console.log(`📝 Query executada: ${text} - ${duration}ms`);
        
        return result;
    } catch (error) {
        console.error('❌ Erro na query:', {
            query: text,
            params: params,
            error: error.message
        });
        throw error;
    }
}

// Função para obter um cliente do pool (para transações)
export async function getClient() {
    const client = await pool.connect();
    
    const query = client.query;
    const release = client.release;
    
    // Configurar timeout para o client
    const timeout = setTimeout(() => {
        console.error('⚠️ Client inativo por muito tempo, liberando...');
        client.release();
    }, 30000); // 30 segundos

    client.release = () => {
        clearTimeout(timeout);
        client.release = release;
        return release.apply(client);
    };

    client.query = (...args) => {
        return query.apply(client, args);
    };

    return client;
}

// Função para verificar saúde do banco
export async function healthCheck() {
    try {
        const result = await pool.query('SELECT NOW() as current_time, version() as postgres_version');
        return {
            status: 'healthy',
            database: 'sistema_ponto_db',
            current_time: result.rows[0].current_time,
            postgres_version: result.rows[0].postgres_version.split(',')[0] // pega apenas a primeira parte
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message
        };
    }
}

// Função para fechar o pool (útil para testes)
export async function closePool() {
    await pool.end();
}

// Exportar o pool para uso direto se necessário
export { pool };