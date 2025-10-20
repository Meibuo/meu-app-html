// cadastro.js CORRIGIDO
class CadastroSystem {
    constructor() {
        this.init();
    }

    init() {
        this.configurarCadastro();
    }

    configurarCadastro() {
        const cadastroForm = document.getElementById('cadastro-form');
        
        cadastroForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(cadastroForm);
            const usuarioData = {
                nomeCompleto: formData.get('nomeCompleto'),
                email: formData.get('email'),
                empresa: formData.get('empresa'),
                cargo: formData.get('cargo'),
                senha: formData.get('senha')
            };

            const confirmarSenha = formData.get('confirmarSenha');

            // Validações
            if (usuarioData.senha !== confirmarSenha) {
                alert('As senhas não coincidem!');
                return;
            }

            console.log('📤 Enviando cadastro...', usuarioData);

            try {
                // URL ABSOLUTA para garantir
                const response = await fetch('/api/cadastro', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(usuarioData)
                });

                const data = await response.json();
                console.log('📥 Resposta do servidor:', data);

                if (data.success) {
                    alert('✅ Cadastro realizado com sucesso! Redirecionando...');
                    window.location.href = 'index.html';
                } else {
                    alert('❌ Erro: ' + data.message);
                }

            } catch (error) {
                console.error('❌ Erro:', error);
                alert('❌ Erro de conexão com o servidor');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    new CadastroSystem();
});