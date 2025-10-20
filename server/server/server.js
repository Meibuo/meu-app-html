// ... (código anterior mantido) ...

// Rota de debug MELHORADA
app.get('/api/debug', async (req, res) => {
    try {
        const client = await pool.connect();
        
        // Verificar schema e tabelas
        const schemaResult = await client.query('SELECT current_schema()');
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'sistema_ponto'
        `);
        
        const usuarios = await client.query('SELECT * FROM usuarios');
        
        client.release();
        
        res.json({
            schema: schemaResult.rows[0].current_schema,
            tables: tablesResult.rows,
            usuarios: usuarios.rows,
            total_usuarios: usuarios.rows.length
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rota para forçar criação das tabelas
app.post('/api/init-database', async (req, res) => {
    try {
        const success = await connectDB();
        
        if (success) {
            res.json({ 
                success: true, 
                message: 'Banco de dados inicializado com sucesso!',
                schema: 'sistema_ponto'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Falha ao inicializar banco de dados' 
            });
        }
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ... (restante do código mantido) ...