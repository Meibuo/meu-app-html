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
                this.mostrarMensagemErro('As senhas não coincidem!');
                return;
            }

            if (this.authSystem.usuarioExiste(usuarioData.email)) {
                this.mostrarMensagemErro('Este e-mail já está cadastrado!');
                return;
            }

            if (usuarioData.senha.length < 6) {
                this.mostrarMensagemErro('A senha deve ter no mínimo 6 caracteres!');
                return;
            }

            // Cadastrar usuário
            try {
                this.authSystem.cadastrarUsuario(usuarioData);
                this.mostrarConfirmacaoSucesso(usuarioData);
                
            } catch (error) {
                this.mostrarMensagemErro('Erro ao cadastrar. Tente novamente.');
            }
        });
    }

    mostrarConfirmacaoSucesso(usuarioData) {
        // Esconder o formulário
        const cadastroForm = document.getElementById('cadastro-form');
        const mensagemSucesso = document.getElementById('mensagem-sucesso');
        const authCard = document.querySelector('.auth-card');
        
        // Criar conteúdo de confirmação
        mensagemSucesso.innerHTML = `
            <div class="confirmacao-sucesso">
                <div class="icone-sucesso">✅</div>
                <h3>Cadastro Criado com Sucesso!</h3>
                <div class="dados-cadastro">
                    <p><strong>Nome:</strong> ${usuarioData.nomeCompleto}</p>
                    <p><strong>E-mail:</strong> ${usuarioData.email}</p>
                    <p><strong>Empresa:</strong> ${usuarioData.empresa}</p>
                    <p><strong>Cargo:</strong> ${usuarioData.cargo}</p>
                </div>
                <p class="instrucao">Você será redirecionado para a página de login em <span id="contador">5</span> segundos...</p>
                <div class="botoes-confirmacao">
                    <button onclick="window.location.href='index.html'" class="btn-confirmacao primario">
                        🚀 Ir para Login Agora
                    </button>
                    <button onclick="this.reiniciarCadastro()" class="btn-confirmacao secundario">
                        📝 Fazer Novo Cadastro
                    </button>
                </div>
            </div>
        `;

        // Esconder formulário
        cadastroForm.style.display = 'none';
        mensagemSucesso.style.display = 'block';

        // Contador regressivo
        this.iniciarContador();
    }

    iniciarContador() {
        let segundos = 5;
        const contadorElement = document.getElementById('contador');
        const intervalo = setInterval(() => {
            segundos--;
            contadorElement.textContent = segundos;
            
            if (segundos <= 0) {
                clearInterval(intervalo);
                window.location.href = 'index.html';
            }
        }, 1000);
    }

    reiniciarCadastro() {
        const cadastroForm = document.getElementById('cadastro-form');
        const mensagemSucesso = document.getElementById('mensagem-sucesso');
        
        // Mostrar formulário novamente
        cadastroForm.style.display = 'block';
        mensagemSucesso.style.display = 'none';
        mensagemSucesso.innerHTML = '';
        
        // Limpar formulário
        cadastroForm.reset();
    }

    mostrarMensagemErro(mensagem) {
        const mensagemErro = document.getElementById('mensagem-erro');
        mensagemErro.innerHTML = `
            <div class="erro-container">
                <span>⚠️ ${mensagem}</span>
            </div>
        `;
        setTimeout(() => {
            mensagemErro.innerHTML = '';
        }, 5000);
    }
}

// Inicializar sistema de cadastro
document.addEventListener('DOMContentLoaded', function() {
    new CadastroSystem();
});