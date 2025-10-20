// Sistema de Cadastro
class CadastroSystem {
    constructor() {
        this.authSystem = new AuthSystem();
        this.init();
    }

    init() {
        this.configurarCadastro();
    }

    configurarCadastro() {
        const cadastroForm = document.getElementById('cadastro-form');
        const mensagemSucesso = document.getElementById('mensagem-sucesso');
        const mensagemErro = document.getElementById('mensagem-erro');

        cadastroForm.addEventListener('submit', (e) => {
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
                this.mostrarMensagem(mensagemErro, 'As senhas não coincidem!');
                return;
            }

            if (this.authSystem.usuarioExiste(usuarioData.email)) {
                this.mostrarMensagem(mensagemErro, 'Este e-mail já está cadastrado!');
                return;
            }

            if (usuarioData.senha.length < 6) {
                this.mostrarMensagem(mensagemErro, 'A senha deve ter no mínimo 6 caracteres!');
                return;
            }

            // Cadastrar usuário
            try {
                this.authSystem.cadastrarUsuario(usuarioData);
                this.mostrarMensagem(mensagemSucesso, 'Cadastro realizado com sucesso! Redirecionando...');
                
                // Redirecionar após 2 segundos
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);

            } catch (error) {
                this.mostrarMensagem(mensagemErro, 'Erro ao cadastrar. Tente novamente.');
            }
        });
    }

    mostrarMensagem(elemento, mensagem) {
        elemento.textContent = mensagem;
        setTimeout(() => {
            elemento.textContent = '';
        }, 5000);
    }
}

// Inicializar sistema de cadastro
document.addEventListener('DOMContentLoaded', function() {
    new CadastroSystem();
});