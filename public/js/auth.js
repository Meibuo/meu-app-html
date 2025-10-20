// Sistema de Autenticação
class AuthSystem {
    constructor() {
        this.usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        this.usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;
        this.verificarAutenticacao();
        this.init();
    }

    init() {
        if (document.getElementById('login-form')) {
            this.configurarLogin();
        }
    }

    verificarAutenticacao() {
        const paginaAtual = window.location.pathname.split('/').pop();
        
        // Se estiver na página de sistema e não estiver logado, redireciona para login
        if (paginaAtual === 'sistema.html' && !this.usuarioLogado) {
            window.location.href = 'index.html';
            return;
        }
        
        // Se estiver na página de login/cadastro e já estiver logado, redireciona para sistema
        if ((paginaAtual === 'index.html' || paginaAtual === 'cadastro.html') && this.usuarioLogado) {
            window.location.href = 'sistema.html';
            return;
        }
    }

    configurarLogin() {
        const loginForm = document.getElementById('login-form');
        const mensagemErro = document.getElementById('mensagem-erro');

        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const senha = document.getElementById('senha').value;

            const usuario = this.fazerLogin(email, senha);

            if (usuario) {
                this.usuarioLogado = usuario;
                localStorage.setItem('usuarioLogado', JSON.stringify(usuario));
                window.location.href = 'sistema.html';
            } else {
                mensagemErro.textContent = 'E-mail ou senha incorretos!';
                setTimeout(() => {
                    mensagemErro.textContent = '';
                }, 3000);
            }
        });
    }

    fazerLogin(email, senha) {
        return this.usuarios.find(usuario => 
            usuario.email === email && usuario.senha === senha
        );
    }

    fazerLogout() {
        this.usuarioLogado = null;
        localStorage.removeItem('usuarioLogado');
        window.location.href = 'index.html';
    }

    getUsuarioLogado() {
        return this.usuarioLogado;
    }

    usuarioExiste(email) {
        return this.usuarios.some(usuario => usuario.email === email);
    }

    cadastrarUsuario(usuarioData) {
        const novoUsuario = {
            id: Date.now().toString(),
            ...usuarioData,
            dataCadastro: new Date().toLocaleDateString('pt-BR')
        };

        this.usuarios.push(novoUsuario);
        localStorage.setItem('usuarios', JSON.stringify(this.usuarios));
        return novoUsuario;
    }
}

// Inicializar sistema de autenticação
const authSystem = new AuthSystem();