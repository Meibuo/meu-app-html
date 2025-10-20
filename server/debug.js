import { query, connectDB } from './database.js';

async function debugDatabase() {
    console.log('🔍 INICIANDO DEBUG DO BANCO DE DADOS...');
    
    try {
        // 1. Testar conexão
        console.log('1. Testando conexão...');
        const connected = await connectDB();
        if (!connected) {
            console.log('❌ Falha na conexão');
            return;
        }
        console.log('✅ Conexão OK');

        // 2. Verificar se tabelas existem
        console.log('2. Verificando tabelas...');
        const tables = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        console.log('📊 Tabelas encontradas:');
        tables.rows.forEach(table => {
            console.log(`   - ${table.table_name}`);
        });

        // 3. Verificar estrutura da tabela usuarios
        console.log('3. Verificando estrutura da tabela usuarios...');
        const usuarioColumns = await query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'usuarios'
            ORDER BY ordinal_position
        `);
        
        console.log('📋 Colunas da tabela usuarios:');
        usuarioColumns.rows.forEach(col => {
            console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });

        // 4. Verificar usuários cadastrados
        console.log('4. Verificando usuários cadastrados...');
        const usuarios = await query('SELECT id, nome_completo, email, empresa FROM usuarios');
        
        console.log('👥 Usuários no banco:');
        if (usuarios.rows.length === 0) {
            console.log('   - Nenhum usuário cadastrado');
        } else {
            usuarios.rows.forEach(user => {
                console.log(`   - ID: ${user.id}, Nome: ${user.nome_completo}, Email: ${user.email}`);
            });
        }

        // 5. Testar INSERT manual
        console.log('5. Testando INSERT manual...');
        const testEmail = `test-${Date.now()}@test.com`;
        
        const insertResult = await query(
            `INSERT INTO usuarios (nome_completo, email, empresa, cargo, senha_hash) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, email`,
            ['Test User', testEmail, 'Test Empresa', 'Test Cargo', 'senhatest123']
        );
        
        console.log(`✅ INSERT teste realizado: ${insertResult.rows[0].email}`);

        // 6. Limpar teste
        await query('DELETE FROM usuarios WHERE email = $1', [testEmail]);
        console.log('🧹 Teste limpo');

    } catch (error) {
        console.error('❌ ERRO NO DEBUG:', error);
    }
}

// Executar debug
debugDatabase();